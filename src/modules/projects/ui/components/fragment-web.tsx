import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Fragment } from "@/generated/prisma";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";

interface Props {
  data: Fragment;
}

export function FragmentWeb({ data }: Props) {
  const [fragmentKey, setFragmentKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const onRefresh = () => {
    setFragmentKey((prev) => prev + 1);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(data.sandboxUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [loading, setLoading] = useState(true);

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="relative flex-1 w-full h-full bg-background">
         {loading && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 text-muted-foreground gap-2">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                 <p className="text-sm">Connecting to sandbox...</p>
                 <p className="text-xs text-muted-foreground/50">If this takes too long, click Refresh or Restore.</p>
             </div>
         )}
         <iframe
            key={fragmentKey}
            className="h-full w-full"
            sandbox="allow-forms allow-scripts allow-same-origin"
            loading="lazy"
            src={data.sandboxUrl}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
        />
      </div>
    </div>
  );
}
