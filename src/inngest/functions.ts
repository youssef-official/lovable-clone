import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";

import { inngest } from "./client";
import { getSandbox, lastAssistantTextMessageContent } from "./utils";
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
    // 1. Get or Create Sandbox ID
    // We use a longer timeout.
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("base", {
        timeoutMs: 3600_000, // 1 hour
      });
      return sandbox.sandboxId;
    });

    // 2. Fetch History
    const history = await step.run("fetch-history", async () => {
      const messages = await prisma.message.findMany({
        where: {
            projectId: event.data.projectId
        },
        orderBy: {
            createdAt: 'asc'
        },
        take: 20
      });

      return messages.map(m => {
          return `${m.role}: ${m.content}`;
      }).join("\n");
    });

    const fullPrompt = `
History of this project:
${history}

Current Request:
${event.data.value}
`;

    // 3. Define Tools
    // Helper to safely run sandbox commands
    const runSandboxCommand = async (cmd: string) => {
        try {
            const sandbox = await getSandbox(sandboxId);
            const result = await sandbox.commands.run(cmd);
            return result;
        } catch (e: any) {
             // If sandbox is dead, we can't recover easily in the middle of a run.
             // We throw so Inngest can potentially retry the whole function from scratch (if configured)
             // or just fail.
             console.error(`Sandbox command failed: ${e.message}`);
             throw e;
        }
    };

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
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };
              try {
                // Use the helper which uses getSandbox wrapper
                const sandbox = await getSandbox(sandboxId);
                const result = sandbox.commands.run(command, {
                   onStdout: (data: string) => { buffers.stdout += data; },
                   onStderr: (data: string) => { buffers.stderr += data; },
                });
                return (await result).stdout;
              } catch (e) {
                const msg = `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`;
                console.error(msg);
                return msg;
              }
            });
          },
        }),
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",
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
                try {
                  const updatedFiles = network.state.data.files || {};
                  const sandbox = await getSandbox(sandboxId);
                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);
                    updatedFiles[file.path] = file.content;
                  }
                  return updatedFiles;
                } catch (e) {
                  return "Error: " + e;
                }
              },
            );

            if (typeof newFiles === "object") {
              network.state.data.files = newFiles;
            }
          },
        }),
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                for (const file of files) {
                  const content = await sandbox.files.read(file);
                  contents.push({ path: file, content });
                }
                return JSON.stringify(contents);
              } catch (e) {
                return "Error: " + e;
              }
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
      router: async ({ network }) => {
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
    } catch (e) {
        console.error("Network run failed:", e);
        // If network run fails (e.g. LLM error, sandbox death), we try to return a graceful failure.
        // We set isError = true manually.
        result = { state: { data: { summary: "", files: {} } } };
    }

    // Attempt to keep server running
    await step.run("ensure-server-running", async () => {
        try {
            const sandbox = await getSandbox(sandboxId);
            const exists = await sandbox.files.exists("package.json");
            if (exists) {
                console.log("Ensuring server is running...");
                await sandbox.commands.run("npm run dev > /dev/null 2>&1 &");
            }
        } catch (e) {
            console.warn("Failed to ensure server running:", e);
        }
    });

    let isError =
      !result.state.data.summary ||
      Object.keys(result.state.data.files || {}).length === 0;

    if (
      !result.state.data.summary &&
      Object.keys(result.state.data.files || {}).length > 0
    ) {
      result.state.data.summary =
        "Code generation completed successfully, but no summary was provided.";
      isError = false;
    }

    // Get URL, but fail gracefully if sandbox is dead
    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      try {
          const sandbox = await getSandbox(sandboxId);
          const host = sandbox.getHost(3000);
          return `https://${host}`;
      } catch (e) {
          console.warn("Could not get sandbox URL (sandbox dead?)", e);
          return "";
      }
    });

    // Save to db
    await step.run("save-result", async () => {
      if (isError) {
        // Log the actual error if available in context, or generic
        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.", // Localize if possible
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
              sandboxUrl: sandboxUrl,
              title: "Fragment",
              files: result.state.data.files,
            },
          },
        },
      });
    });

    return {
      url: sandboxUrl,
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary,
    };
  },
);
