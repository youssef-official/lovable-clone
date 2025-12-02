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
    const sandboxId = await step.run("get-sandbox-id", async () => {
      // Using 'base' template which is available to all E2B users by default
      // If you have a custom template, replace 'base' with your template name
      const sandbox = await Sandbox.create("base", {
        timeoutMs: 3600_000,
      });
      return sandbox.sandboxId;
    });

    // e.g. transcript step
    // await step.sleep("wait-a-moment", "5s");

    // Create a new agent with a system prompt (you can add optional tools, too)
    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: openai({
        model: "MiniMax-M2",
        apiKey: process.env.MINIMAX_API_KEY,
        baseUrl: "https://api.minimax.io/v1",
        defaultParameters: {
          temperature: 0.1, // Randomness (higher = more random)
        },
      }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }) => {
            return await step.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };

              try {
                const sandbox = await getSandbox(sandboxId);
                const result = sandbox.commands.run(command, {
                  onStdout: (data: string) => {
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    buffers.stderr += data;
                  },
                });
                return (await result).stdout;
              } catch (e) {
                console.error(
                  `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`,
                );
                return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`;
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
          handler: async ({ files }, context: Tool.Options<AgentState>) => {
            /**
             * {
             *   /app.tsx: "<p>hi</p>",
             * }
             */

            const network = context?.network;

            const newFiles = await step.run("createOrUpdateFiles", async () => {
              try {
                const updatedFiles = network?.state?.data?.files || {};
                const sandbox = await getSandbox(sandboxId);
                for (const file of files) {
                  await sandbox.files.write(file.path, file.content);
                  updatedFiles[file.path] = file.content;
                }

                return updatedFiles;
              } catch (e) {
                return "Error: " + e;
              }
            });

            if (typeof newFiles === "object" && network) {
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
          handler: async ({ files }) => {
            return await step.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                for (const file of files) {
                  // Prevent hallucination to ensure file exists
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

    const result = await network.run(event.data.value);

    // Fallback: Ensure server is running if the agent didn't start it
    // The "base" sandbox might not have a running process.
    // We check if port 3000 is open, if not, we try to start 'npm run dev'
    // This is a safety net.
    await step.run("ensure-server-running", async () => {
        try {
            const sandbox = await getSandbox(sandboxId);
            // We can't easily check port status via SDK directly without making a request.
            // But we can blindly run the start command in background if package.json exists.
            const exists = await sandbox.files.exists("package.json");
            if (exists) {
                console.log("Ensuring server is running...");
                // Run in background
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

    // const { output } = await codeAgent.run(
    //   `Write the following snippet: ${event.data.value}`,
    // );

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    // Save to db
    await step.run("save-result", async () => {
      if (isError) {
        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
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
