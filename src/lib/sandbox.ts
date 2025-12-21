import { Sandbox } from "@e2b/code-interpreter";

export function getBoilerplateFiles() {
  return {
    "package.json": JSON.stringify(
      {
        name: "vibe-react-app",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite --port 3000 --host",
          build: "tsc -b && vite build",
          lint: "eslint .",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "lucide-react": "^0.469.0",
          clsx: "^2.1.1",
          "tailwind-merge": "^2.6.0",
        },
        devDependencies: {
          "@types/react": "^18.3.18",
          "@types/react-dom": "^18.3.5",
          "@vitejs/plugin-react": "^4.3.4",
          autoprefixer: "^10.4.20",
          postcss: "^8.4.49",
          tailwindcss: "^3.4.17",
          typescript: "~5.6.2",
          vite: "^6.0.5",
          globals: "^15.14.0",
        },
      },
      null,
      2,
    ),
    "vite.config.ts": `
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
`.trim(),
    "tsconfig.json": `
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
`.trim(),
    "tsconfig.app.json": `
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
`.trim(),
    "tsconfig.node.json": `
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
`.trim(),
    "index.html": `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="https://youssef.ymoo.site/logo.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vibe - Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim(),
    "src/main.tsx": `
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import React from 'react'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 p-4 font-mono text-sm text-red-800 whitespace-pre-wrap">
          <h1 className="text-xl font-bold mb-4">Runtime Error</h1>
          {this.state.error?.message}
          <div className="mt-4 text-xs text-red-600">
             Check the console for more details.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
`.trim(),
    "src/App.tsx": `
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
`.trim(),
    "src/index.css": `
@tailwind base;
@tailwind components;
@tailwind utilities;
`.trim(),
    "tailwind.config.js": `
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
`.trim(),
    "postcss.config.js": `
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`.trim(),
  };
}

export async function initializeSandbox(
  sandbox: Sandbox,
  files?: Record<string, string>
) {
  let finalFiles: Record<string, string> | undefined = files;

  // Normalize file paths to remove leading ./ if files are provided
  if (files) {
    finalFiles = {};
    for (const [path, content] of Object.entries(files)) {
      const normalizedPath = path.startsWith("./") ? path.slice(2) : path;
      finalFiles[normalizedPath] = content;
    }
  }

  // If files are provided (restoring/updating project)
  if (finalFiles) {
    // If the fragment doesn't have package.json, we assume it needs the boilerplate
    if (!finalFiles["package.json"]) {
      const boilerplate = getBoilerplateFiles();
      for (const [path, content] of Object.entries(boilerplate)) {
        await sandbox.files.write(path, content);
      }
    }

    // Write provided files (overwriting boilerplate if necessary)
    for (const [path, content] of Object.entries(finalFiles)) {
      await sandbox.files.write(path, content);
    }

    // Patch vite.config.ts to allow all hosts
    try {
      const viteConfigPath = Object.keys(finalFiles).find((f) =>
        f.endsWith("vite.config.ts")
      );
      if (viteConfigPath) {
        const viteConfig = await sandbox.files.read(viteConfigPath);
        if (!viteConfig.includes("allowedHosts: true")) {
          const patchedConfig = viteConfig.replace(
            "server: {",
            "server: {\\n    allowedHosts: true,"
          );
          await sandbox.files.write(viteConfigPath, patchedConfig);
        }
      }
    } catch (error) {
      console.warn("Failed to patch vite.config.ts:", error);
    }
  } else {
    // New project: Check if package.json exists (in case template provided it)
    const hasPackageJson = await sandbox.files.exists("package.json");
    if (!hasPackageJson) {
      // Create standard Vite + React file structure
      await sandbox.commands.run("mkdir -p src/components");
      const boilerplate = getBoilerplateFiles();
      for (const [path, content] of Object.entries(boilerplate)) {
        await sandbox.files.write(path, content);
      }
    }
  }

  const hasNodeModules = await sandbox.files.exists("node_modules");
  if (!hasNodeModules) {
    console.log("Installing dependencies...");
    await sandbox.commands.run("npm install", {
      timeoutMs: 300000, // 5 minutes
    });
  } else {
    console.log("Skipping dependency installation (node_modules exists).");
  }

  console.log("Starting dev server...");
  await sandbox.commands.run(
    "npm run dev > /home/user/npm_output.log 2>&1 &"
  );
}
