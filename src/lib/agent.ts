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
        await sandbox.files.write(
          "package.json",
          JSON.stringify(
            {
              name: "vibe-react-app",
              private: true,
              version: "0.0.0",
              type: "module",
              scripts: {
                dev: "vite --port 3000 --host", // Force port 3000
                build: "tsc -b && vite build",
                lint: "eslint .",
                preview: "vite preview"
              },
              dependencies: {
                react: "^18.3.1",
                "react-dom": "^18.3.1",
                "lucide-react": "^0.469.0",
                "clsx": "^2.1.1",
                "tailwind-merge": "^2.6.0"
              },
              devDependencies: {
                "@types/react": "^18.3.18",
                "@types/react-dom": "^18.3.5",
                "@vitejs/plugin-react": "^4.3.4",
                "autoprefixer": "^10.4.20",
                "postcss": "^8.4.49",
                "tailwindcss": "^3.4.17",
                "typescript": "~5.6.2",
                "vite": "^6.0.5",
                "globals": "^15.14.0"
              }
            },
            null,
            2
          )
        );

        await sandbox.files.write("vite.config.ts", `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: true,
    host: true,
    port: 3000
  }
})
        `.trim());

        await sandbox.files.write("tsconfig.json", `
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
        `.trim());

        await sandbox.files.write("tsconfig.app.json", `
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
        `.trim());

         await sandbox.files.write("tsconfig.node.json", `
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "customConditions": ["module"]
  },
  "include": ["vite.config.ts"]
}
        `.trim());

        await sandbox.files.write("index.html", `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
        `.trim());

        // Create src structure
        await sandbox.commands.run("mkdir -p src/components");

        await sandbox.files.write("src/main.tsx", `
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
        `.trim());

        await sandbox.files.write("src/App.tsx", `
import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-lg shadow-xl">
         <h1 className="text-4xl font-bold text-blue-600 mb-4">Hello Vite + React!</h1>
         <button
           className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
           onClick={() => setCount((count) => count + 1)}
          >
            count is {count}
          </button>
      </div>
    </div>
  )
}

export default App
        `.trim());

        await sandbox.files.write("src/index.css", `
@tailwind base;
@tailwind components;
@tailwind utilities;
        `.trim());

        await sandbox.files.write("tailwind.config.js", `
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
        `.trim());

        await sandbox.files.write("postcss.config.js", `
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
        `.trim());

        console.log("Installing dependencies...");
        await sandbox.commands.run("npm install", {
          timeoutMs: 300000, // 5 minutes
        });

        console.log("Starting dev server...");
        // Vite uses 5173 by default, but we configured it to 3000 in package.json
        await sandbox.commands.run("npm run dev > /dev/null 2>&1 &");
      }
    }

    // Ensure the server is running on port 3000
    console.log("Ensuring server is running...");
    await sandbox.commands.run("if ! curl -s http://localhost:3000 > /dev/null; then npm run dev > /dev/null 2>&1 & fi");

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

  if (isError) {
    console.error(
      `Agent failed to produce a valid result. Has Summary: ${hasSummary}, Has Files: ${hasFiles}. Retrying with error feedback...`
    );

    // Auto-correction retry
    const retryPrompt = `The previous attempt failed to generate a valid result (Summary: ${hasSummary}, Files: ${hasFiles}). Please ensure you generate files using createOrUpdateFiles and provide a <task_summary>. Try again.`;
    const retryResult = await network.run(retryPrompt);

    // Update result with retry data
    if (retryResult.state.data.summary) {
        result.state.data.summary = retryResult.state.data.summary;
    }
    if (retryResult.state.data.files && Object.keys(retryResult.state.data.files).length > 0) {
        result.state.data.files = retryResult.state.data.files;
    }

    // Re-evaluate error state
    const retryHasSummary = !!result.state.data.summary;
    const retryHasFiles = Object.keys(result.state.data.files || {}).length > 0;
    isError = !retryHasSummary || !retryHasFiles;
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
