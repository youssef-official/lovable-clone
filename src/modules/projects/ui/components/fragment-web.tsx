import { Fragment } from "@/generated/prisma";
import { SandpackProvider, SandpackPreview, SandpackLayout } from "@codesandbox/sandpack-react";
import { useTheme } from "next-themes";

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
    <div className="w-full h-full relative isolate flex flex-col">
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
                }
            }}
            options={{
                externalResources: ["https://cdn.tailwindcss.com"],
                classes: {
                  "sp-wrapper": "h-full",
                  "sp-layout": "h-full",
                  "sp-preview": "h-full",
                }
            }}
            style={{ height: "100%", width: "100%" }}
        >
            <SandpackLayout className="!h-full !w-full !rounded-none !border-0 flex-1">
                <SandpackPreview
                    className="!h-full w-full"
                    showOpenInCodeSandbox={false}
                    showRefreshButton={true}
                    style={{ height: "100%" }}
                />
            </SandpackLayout>
        </SandpackProvider>
    </div>
  );
}
