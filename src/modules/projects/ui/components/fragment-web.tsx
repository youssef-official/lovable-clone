import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Fragment } from "@/generated/prisma";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";
import { useState, useMemo } from "react";

interface Props {
  data: Fragment;
}

export function FragmentWeb({ data }: Props) {
  const [fragmentKey, setFragmentKey] = useState(0);

  const onRefresh = () => {
    setFragmentKey((prev) => prev + 1);
  };

  const srcDoc = useMemo(() => {
    const files = data.files as Record<string, string>;
    if (!files) return "";

    let html = files["project/pages/index.html"] || files["index.html"] || "<h1>No index.html found</h1>";

    // Inject CSS
    const cssPath = "project/assets/css/style.css";
    const cssContent = files[cssPath];
    if (cssContent) {
        // Replace external link with inline style
        html = html.replace(/<link[^>]*href=["'].*style\.css["'][^>]*>/i, `<style>${cssContent}</style>`);
        // Fallback: if not replaced (maybe different path), just append to head
        if (!html.includes(`<style>${cssContent}</style>`)) {
            html = html.replace("</head>", `<style>${cssContent}</style></head>`);
        }
    }

    // Inject JS
    const jsPath = "project/assets/js/main.js";
    const jsContent = files[jsPath];
    if (jsContent) {
         // Replace external script with inline script
        html = html.replace(/<script[^>]*src=["'].*main\.js["'][^>]*><\/script>/i, `<script>${jsContent}</script>`);
         // Fallback
        if (!html.includes(`<script>${jsContent}</script>`)) {
            html = html.replace("</body>", `<script>${jsContent}</script></body>`);
        }
    }

    return html;
  }, [data.files]);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom">
          <Button size="sm" variant={"outline"} onClick={onRefresh}>
            <RefreshCcwIcon />
          </Button>
        </Hint>
      </div>
      <iframe
        key={fragmentKey}
        className="h-full w-full bg-white"
        sandbox="allow-forms allow-scripts allow-modals"
        loading="lazy"
        srcDoc={srcDoc}
      />
    </div>
  );
}
