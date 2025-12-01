import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
} from "@inngest/agent-kit";

import { inngest } from "./client";
import { lastAssistantTextMessageContent } from "./utils";
import z from "zod";
import { PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" },
  async ({ event, step }) => {
    // 1. Fetch History and Current Files
    const { history, files: initialFiles } = await step.run("fetch-context", async () => {
      // Fetch messages history
      const messages = await prisma.message.findMany({
        where: {
            projectId: event.data.projectId
        },
        orderBy: {
            createdAt: 'asc'
        },
        take: 20
      });

      const historyStr = messages.map(m => {
          return `${m.role}: ${m.content}`;
      }).join("\n");

      // Fetch latest files state
      const lastMessageWithFragment = await prisma.message.findFirst({
        where: {
            projectId: event.data.projectId,
            fragment: {
                isNot: null
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        include: {
            fragment: true
        }
      });

      let files: { [path: string]: string } = {};
      if (lastMessageWithFragment?.fragment?.files) {
        // Safe cast as we expect the files to be a string-string map
        files = lastMessageWithFragment.fragment.files as { [path: string]: string };
      }

      return { history: historyStr, files };
    });

    const fullPrompt = `
History of this project:
${history}

Current Request:
${event.data.value}
`;

    // 2. Define Tools
    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: openai({
        model: "MiniMax-M2",
        apiKey: process.env.MINIMAX_API_KEY,
        baseUrl: "https://api.minimax.io/v1",
        defaultParameters: {
          temperature: 0.1,
        },
      }),
      tools: [
        createTool({
          name: "terminal",
          description: "Simulate terminal command execution",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
                // Return a simulated success message
                return `Command "${command}" execution simulated successfully. Environment is updated.`;
            });
          },
        }),
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the project",
          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              }),
            ),
          }),
          handler: async (
            { files },
            { step, network }: Tool.Options<AgentState>,
          ) => {
            const newFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                  const updatedFiles = { ...(network.state.data.files || {}) };
                  for (const file of files) {
                    updatedFiles[file.path] = file.content;
                  }
                  return updatedFiles;
              },
            );

            if (typeof newFiles === "object") {
              network.state.data.files = newFiles;
            }

            return "Files updated successfully.";
          },
        }),
        createTool({
          name: "readFiles",
          description: "Read files from the project",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step, network }) => {
            return await step?.run("readFiles", async () => {
                const currentFiles = network.state.data.files || {};
                const contents = [];
                for (const file of files) {
                  const content = currentFiles[file] || `// File ${file} not found`;
                  contents.push({ path: file, content });
                }
                return JSON.stringify(contents);
            });
          },
        }),
      ],
      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText && network) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork<AgentState>({
      name: "coding-agent-network",
      agents: [codeAgent],
      maxIter: 15,
      // Removed defaultState to avoid type error
      router: async ({ network }) => {
        // Initialize state if empty and we have initial files
        if (!network.state.data.files && Object.keys(initialFiles).length > 0) {
            network.state.data.files = initialFiles;
        }

        const summary = network.state.data.summary;
        if (summary) {
          return;
        }
        return codeAgent;
      },
    });

    let result;
    try {
        result = await network.run(fullPrompt);
    } catch (e: any) {
        console.error("Network run failed:", e);
        // If network run fails (e.g. LLM error), we try to return a graceful failure.
        // We set isError = true manually with the specific error message.
        result = {
            state: {
                data: {
                    summary: `Internal Error: ${e.message || "Unknown error occurred during execution."}`,
                    files: initialFiles // Preserve existing files on error if possible
                }
            },
            isFatal: true // Marker for our logic below
        };
    }

    // Check for success or error
    // If result was marked fatal, we force error.
    const isError = (result as any).isFatal ||
      (!result.state.data.summary ||
      Object.keys(result.state.data.files || {}).length === 0);

    // Specific check: If we have files but no summary, it's partially successful.
    if (
      !isError &&
      !result.state.data.summary &&
      Object.keys(result.state.data.files || {}).length > 0
    ) {
      result.state.data.summary =
        "Code generation completed successfully, but no summary was provided.";
    }

    // Save to db
    await step.run("save-result", async () => {
      if (isError) {
        // Log the actual error if available in context, or generic
        const errorContent = (result as any).isFatal
             ? result.state.data.summary // We stuffed the error here above
             : "Something went wrong. Please try again.";

        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: errorContent,
            role: "ASSISTANT",
            type: "ERROR",
          },
        });
      }

      return await prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: result.state.data.summary,
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create: {
              sandboxUrl: "", // No real sandbox URL in simulated mode
              title: "Fragment",
              files: result.state.data.files,
            },
          },
        },
      });
    });

    return {
      url: "",
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary,
    };
  },
);
