
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
import { getBoilerplateFiles, initializeSandbox } from "./sandbox";

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
        in: ["RESULT", "ERROR"], // Only load final results or errors
      },
      role: {
        in: ["USER", "ASSISTANT"],
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  const history = previousMessages.reverse().map((msg) => ({
    role: msg.role.toLowerCase() as "user" | "assistant",
    content: msg.content,
  }));

  const latestFragment = await prisma.fragment.findFirst({
    where: { message: { projectId: input.projectId } },
    orderBy: { createdAt: "desc" },
  });

  const sandboxId = await (async () => {
    const templateId = process.env.E2B_TEMPLATE_ID || "vibe-nextjs-test-4";
    const sandbox = await Sandbox.create(templateId, {
        timeoutMs: 30 * 60 * 1000, // 30 minutes
    });

    await initializeSandbox(sandbox, latestFragment?.files as Record<string, string> | undefined);

    console.log("Ensuring server is running...");
    await sandbox.commands.run("if ! curl -s http://localhost:3000 > /dev/null; then npm run dev > /home/user/npm_output.log 2>&1 & fi");

    return sandbox.id;
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
          const sandbox = await getSandbox(sandboxId);
          const { stdout, stderr, exitCode } = await sandbox.commands.run(command);
          if (exitCode !== 0) {
            return `Command failed with exit code ${exitCode}.\nStderr: ${stderr}`;
          }
          return stdout;
        },
      }),
      createTool({
        name: "createOrUpdateFiles",
        description: "Create or update files in the sandbox. The agent should use this to write code.",
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
          try {
            const updatedFiles = network.state.data.files || {};
            const sandbox = await getSandbox(sandboxId);
            for (const file of files) {
              await sandbox.files.write(file.path, file.content);
              updatedFiles[file.path] = file.content;
            }
            network.state.data.files = updatedFiles;
            return "Files updated successfully.";
          } catch (e) {
            return "Error: " + (e as Error).message;
          }
        },
      }),
      createTool({
        name: "readFiles",
        description: "Read files from the sandbox to understand the current state of the project.",
        parameters: z.object({
          files: z.array(z.string()),
        }),
        handler: async ({ files }) => {
          try {
            const sandbox = await getSandbox(sandboxId);
            const contents = [];
            for (const file of files) {
              const content = await sandbox.files.read(file);
              contents.push({ path: file, content });
            }
            return JSON.stringify(contents);
          } catch (e) {
            return "Error: " + (e as Error).message;
          }
        },
      }),
    ],
    lifecycle: {
      onResponse: async ({ result, network }) => {
        const lastAssistantMessageText = lastAssistantTextMessageContent(result);
        if (lastAssistantMessageText?.includes("<task_summary>")) {
          network.state.data.summary = lastAssistantMessageText;
        }
        return result;
      },
    },
  });

  const network = createNetwork<AgentState>({
    name: "coding-agent-network",
    agents: [codeAgent],
    maxIter: 8, // Reduced from 15 to 8
    router: async ({ network }) => {
      // Pre-populate state with the latest files if they exist
      if (!network.state.data.files) {
        network.state.data.files = (latestFragment?.files as Record<string, string>) || getBoilerplateFiles();
      }
      // If we have a summary, we're done.
      if (network.state.data.summary) {
        return;
      }
      return codeAgent;
    },
  });
  
  // Construct the prompt with history
  let fullPrompt = input.value;
  if (history.length > 0) {
    const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    fullPrompt = `Previous conversation history:\n${historyText}\n\nCurrent Request:\n${input.value}`;
  }

  const result = await network.run(fullPrompt);

  const hasSummary = !!result.state.data.summary;
  const hasFiles = Object.keys(result.state.data.files || {}).length > 0;
  const isError = !hasSummary || !hasFiles;

  const sandboxUrl = `https://${await (await getSandbox(sandboxId)).getHostname(3000)}`;

  try {
    if (isError) {
      // If the agent fails, save an error message
      return await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: "Sorry, I wasn't able to complete the task. Please try again with a more specific request.",
          role: "ASSISTANT",
          type: "ERROR",
        },
      });
    }

    // Save the successful result
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
