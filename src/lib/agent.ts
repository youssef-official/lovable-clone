import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type AgentResult,
  type TextMessage,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import z from "zod";
import { PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";
import { getBoilerplateFiles } from "./sandbox";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  return sandbox;
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
        in: ["RESULT", "ERROR"], // Only load final results or errors, not intermediate logs
      },
      role: {
        in: ["USER", "ASSISTANT"],
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10, // Limit context window
  });

  // Fetch the latest fragment to ensure we have the current file state
  const latestFragment = await prisma.fragment.findFirst({
    where: { message: { projectId: input.projectId } },
    orderBy: { createdAt: "desc" },
  });

  const history = previousMessages.reverse().map((msg) => ({
    role: msg.role.toLowerCase() as "user" | "assistant",
    content: msg.content,
  }));

  const sandboxId = await (async () => {
    let sandbox;
    const templateId = process.env.E2B_TEMPLATE_ID || "vibe-nextjs-test-4";

    try {
      sandbox = await Sandbox.create(templateId, {
        timeoutMs: 30 * 60 * 1000, // 30 minutes
      });
    } catch (e) {
      console.warn(
        `Failed to load custom template "${templateId}". Falling back to base sandbox. Note: This may lack pre-installed dependencies. Error: ${e}`
      );
      sandbox = await Sandbox.create("base", {
        timeoutMs: 30 * 60 * 1000, // 30 minutes
      });

      // React + Vite Fallback Skeleton
      const hasPackageJson = await sandbox.files.exists("package.json");
      if (!hasPackageJson) {
        // Create standard Vite + React file structure
        await sandbox.commands.run("mkdir -p src/components");
        const boilerplate = getBoilerplateFiles();
        for (const [path, content] of Object.entries(boilerplate)) {
          await sandbox.files.write(path, content);
        }

        console.log("Installing dependencies...");
        await sandbox.commands.run("npm install", {
          timeoutMs: 300000, // 5 minutes
        });

        console.log("Starting dev server...");
        // Vite uses 5173 by default, but we configured it to 3000 in package.json
        await sandbox.commands.run("npm run dev > /home/user/npm_output.log 2>&1 &");
      }
    }

    // Ensure the server is running on port 3000
    console.log("Ensuring server is running...");
    await sandbox.commands.run("if ! curl -s http://localhost:3000 > /dev/null; then npm run dev > /home/user/npm_output.log 2>&1 & fi");

    return sandbox.sandboxId;
  })();

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
        name: "terminal",
        description: "Use the terminal to run commands",
        parameters: z.object({
          command: z.string(),
        }),
        handler: async ({ command }) => {
           // Log activity
           await prisma.message.create({
             data: {
               projectId: input.projectId,
               content: command,
               role: "ASSISTANT",
               type: "LOG", // Log type for commands
             },
           });

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
              `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`
            );
            return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderror: ${buffers.stderr}`;
          }
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
          { network }: Tool.Options<AgentState>,
        ) => {
           // Log activity for each file
           for (const file of files) {
             await prisma.message.create({
               data: {
                 projectId: input.projectId,
                 content: file.path,
                 role: "ASSISTANT",
                 type: "LOG", // Log type for file edits
               },
             });
           }

          try {
            const updatedFiles = network.state.data.files || {};
            const sandbox = await getSandbox(sandboxId);
            for (const file of files) {
              await sandbox.files.write(file.path, file.content);
              updatedFiles[file.path] = file.content;
            }

            if (typeof updatedFiles === "object") {
              network.state.data.files = updatedFiles;
            }

            return updatedFiles;
          } catch (e) {
            return "Error: " + e;
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
          // Log activity
          await prisma.message.create({
             data: {
               projectId: input.projectId,
               content: `Reading ${files.join(", ")}`,
               role: "ASSISTANT",
               type: "LOG",
             },
           });

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
      // Pre-populate state if empty, using the latest fragment files if available, otherwise boilerplate
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

  // Manually prepend history to the input since createNetwork doesn't support it directly
  let fullPrompt = input.value;
  if (history.length > 0) {
    const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    fullPrompt = `Previous conversation history:\n${historyText}\n\nCurrent Request:\n${input.value}`;
  }

  const result = await network.run(fullPrompt);

  const hasSummary = !!result.state.data.summary;
  const hasFiles = Object.keys(result.state.data.files || {}).length > 0;
  let isError = !hasSummary || !hasFiles;

  // Auto-correction retry (for missing summary/files)
  if (isError) {
    console.error(
      `Agent failed to produce a valid result. Has Summary: ${hasSummary}, Has Files: ${hasFiles}. Retrying with error feedback...`
    );
    const retryPrompt = `The previous attempt failed to generate a valid result (Summary: ${hasSummary}, Files: ${hasFiles}). Please ensure you generate files using createOrUpdateFiles and provide a <task_summary>. Try again.`;
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

  // Automatic Health Check & Self-Healing (Log Analysis)
  if (!isError) {
    try {
      const sandbox = await getSandbox(sandboxId);
      // Wait a moment for server to potentially settle
      await new Promise(resolve => setTimeout(resolve, 3000));

      const healthCheck = await sandbox.commands.run("curl -s http://localhost:3000 > /dev/null");
      if (healthCheck.exitCode !== 0) {
        console.warn("Health check failed. Attempting to read logs and auto-repair...");

        const logContent = await sandbox.files.read("/home/user/npm_output.log").catch(() => "No logs found.");

        // Feed the logs back to the agent
        await prisma.message.create({
            data: {
                projectId: input.projectId,
                content: "Detected application startup failure. Analyzing logs...",
                role: "ASSISTANT",
                type: "LOG",
            }
        });

        const repairPrompt = `The application failed to start (health check failed). Here are the logs from npm run dev:\n\n${logContent}\n\nPlease analyze these logs and fix the application code (e.g., syntax errors, missing dependencies, build failures).`;
        const repairResult = await network.run(repairPrompt);

        // Update result if repair generated new output
        if (repairResult.state.data.summary) {
            result.state.data.summary += "\n\n(Auto-Repair applied)";
            result.state.data.files = repairResult.state.data.files;
        }
      }
    } catch (e) {
      console.error("Self-healing check failed:", e);
      // We don't fail the whole request if self-healing monitoring fails,
      // but we should probably let the user know if we couldn't verify it.
    }
  }

  const sandboxUrl = await (async () => {
    const sandbox = await getSandbox(sandboxId);
    const host = sandbox.getHost(3000);
    return `https://${host}`;
  })();

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
            sandboxUrl: sandboxUrl,
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
