import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type AgentResult,
  type TextMessage,
} from "@inngest/agent-kit";
import z from "zod";
import { PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";
import { getBoilerplateFiles } from "./sandbox";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant",
  );

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("")
    : undefined;
}

export async function generateProject(input: {
  value: string;
  projectId: string;
}) {
  // Load conversation history
  const previousMessages = await prisma.message.findMany({
    where: {
      projectId: input.projectId,
      type: {
        in: ["RESULT", "ERROR"],
      },
      role: {
        in: ["USER", "ASSISTANT"],
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5, // Reduced from 10 to speed up context loading
  });

  const latestFragment = await prisma.fragment.findFirst({
    where: { message: { projectId: input.projectId } },
    orderBy: { createdAt: "desc" },
  });

  const history = previousMessages.reverse().map((msg) => ({
    role: msg.role.toLowerCase() as "user" | "assistant",
    content: msg.content,
  }));

  const codeAgent = createAgent<AgentState>({
    name: "code-agent",
    description: "An expert coding agent",
    system: PROMPT,
    model: openai({
      model: "mistralai/devstral-2512:free",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
    }),
    tools: [
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
          { network }: Tool.Options<AgentState>,
        ) => {
           for (const file of files) {
             await prisma.message.create({
               data: {
                 projectId: input.projectId,
                 content: file.path,
                 role: "ASSISTANT",
                 type: "LOG",
               },
             });
           }

          try {
            const updatedFiles = network.state.data.files || {};
            for (const file of files) {
              updatedFiles[file.path] = file.content;
            }

            if (typeof updatedFiles === "object") {
              network.state.data.files = updatedFiles;
            }

            return "Files updated successfully.";
          } catch (e) {
            return "Error: " + e;
          }
        },
      }),
      createTool({
        name: "readFiles",
        description: "Read specific files from the project. Use this only when you need to modify existing files.",
        parameters: z.object({
          files: z.array(z.string()),
        }),
        handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
          await prisma.message.create({
             data: {
               projectId: input.projectId,
               content: `Reading ${files.join(", ")}`,
               role: "ASSISTANT",
               type: "LOG",
             },
           });

          try {
            const sessionFiles = network.state.data.files || {};
            const existingFiles = (latestFragment?.files as Record<string, string>) || getBoilerplateFiles();

            const contents = [];
            for (const file of files) {
              const content = sessionFiles[file] || existingFiles[file] || "File not found";
              contents.push({ path: file, content });
            }
            return JSON.stringify(contents);
          } catch (e) {
            return "Error: " + e;
          }
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
    maxIter: 10, // Reduced from 15 to prevent long loops
    router: async ({ network }) => {
      if (!network.state.data.files) {
        network.state.data.files = (latestFragment?.files as Record<string, string>) || getBoilerplateFiles();
      }

      const summary = network.state.data.summary;
      if (summary) {
        return;
      }
      return codeAgent;
    },
  });

  let fullPrompt = "";
  const isInitialGeneration = history.length === 0;

  if (isInitialGeneration) {
    // For initial generation, don't send file list to speed up
    fullPrompt = `Initial Request: ${input.value}\n\nPlease generate the project structure and files immediately.`;
  } else {
    // For edits, send only the file list (not content) to help the agent decide what to read
    const existingFiles = (latestFragment?.files as Record<string, string>) || getBoilerplateFiles();
    const fileList = Object.keys(existingFiles).join("\n");
    const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    
    fullPrompt = `Project File List:\n${fileList}\n\nPrevious conversation history:\n${historyText}\n\nCurrent Request for modification: ${input.value}\n\nOnly read files you need to modify using readFiles tool.`;
  }

  const result = await network.run(fullPrompt);

  const hasSummary = !!result.state.data.summary;
  const hasFiles = Object.keys(result.state.data.files || {}).length > 0;
  let isError = !hasSummary || !hasFiles;

  if (isError) {
    const retryPrompt = `The previous attempt failed. Please ensure you generate files using createOrUpdateFiles and provide a <task_summary>. Try again.`;
    const retryResult = await network.run(retryPrompt);

    if (retryResult.state.data.summary) {
        result.state.data.summary = retryResult.state.data.summary;
    }
    if (retryResult.state.data.files && Object.keys(retryResult.state.data.files).length > 0) {
        result.state.data.files = retryResult.state.data.files;
    }

    const retryHasSummary = !!result.state.data.summary;
    const retryHasFiles = Object.keys(result.state.data.files || {}).length > 0;
    isError = !retryHasSummary || !retryHasFiles;
  }

  try {
    if (isError) {
      return await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: "Something went wrong. Please try again.",
          role: "ASSISTANT",
          type: "ERROR",
        },
      });
    }

    return await prisma.message.create({
      data: {
        projectId: input.projectId,
        content: result.state.data.summary,
        role: "ASSISTANT",
        type: "RESULT",
        fragment: {
          create: {
            sandboxUrl: "",
            title: "Fragment",
            files: result.state.data.files,
          },
        },
      },
    });
  } catch (e) {
    console.error("Database save failed:", e);
    throw e;
  }
}
