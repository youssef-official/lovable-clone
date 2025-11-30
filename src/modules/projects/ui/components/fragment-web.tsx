import { Fragment } from "@/generated/prisma";
import { SandpackProvider, SandpackPreview, SandpackLayout } from "@codesandbox/sandpack-react";
import { useTheme } from "next-themes";
import { Loader2Icon } from "lucide-react";

interface Props {
  data: Fragment;
}

export function FragmentWeb({ data }: Props) {
  const { theme } = useTheme();
  const files = data.files as Record<string, string>;

  const sandpackFiles: Record<string, string> = {};
  Object.entries(files).forEach(([key, value]) => {
      const cleanKey = key.startsWith('/') ? key.slice(1) : key;
      sandpackFiles[cleanKey] = value;
  });

  return (
    <div className="w-full h-full relative isolate">
        <SandpackProvider
            template="nextjs"
            theme={theme === 'dark' ? 'dark' : 'light'}
            files={sandpackFiles}
            customSetup={{
                dependencies: {
                    "lucide-react": "latest",
                    "clsx": "latest",
                    "tailwind-merge": "latest",
                    "date-fns": "latest",
                    "react-day-picker": "latest",
                    "@radix-ui/react-slot": "latest",
                    "class-variance-authority": "latest",
                    // Common UI libs
                }
            }}
            options={{
                externalResources: ["https://cdn.tailwindcss.com"] // Try to support tailwind via CDN if not built? Sandpack Nextjs template usually handles it?
                // Actually Sandpack's Next.js template runs a real build process in browser? No, it uses a simplified bundler.
                // If the code uses Tailwind directives (@tailwind base...), it needs postcss.
                // Sandpack supports Tailwind.
            }}
        >
            <SandpackLayout className="!h-full !w-full !rounded-none !border-0">
                <SandpackPreview
                    className="!h-full"
                    showOpenInCodeSandbox={false}
                    showRefreshButton={true}
                />
            </SandpackLayout>
        </SandpackProvider>
    </div>
  );
}
