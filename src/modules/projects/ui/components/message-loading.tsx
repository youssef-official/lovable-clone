import Image from "next/image";
import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";

const ShimmerMessages = () => {
  const messages = [
    "Thinking about your request...",
    "Reviewing project files...",
    "Now I Will Editing In index.html...",
    "Adding new components...",
    "Styling with Tailwind CSS...",
    "Creating interactive logic...",
    "Please Wait, almost done...",
    "Finalizing the changes...",
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="flex items-center gap-3">
      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      <span className="text-sm md:text-base text-muted-foreground transition-all duration-300 min-w-[200px]">
        {messages[currentMessageIndex]}
      </span>
    </div>
  );
};

export const MessageLoading = () => {
  return (
    <div className="flex flex-col group px-2 pb-4">
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image
          src="/logo.svg"
          alt="Vibe"
          width={18}
          height={18}
          className="shrink-0"
        />
        <span className="text-sm font-medium">Vibe</span>
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4">
         <div className="p-4 bg-muted/30 rounded-lg border border-muted/50 w-full max-w-[80%]">
             <ShimmerMessages />
             {/* Fake progress bar */}
             <div className="w-full bg-muted mt-3 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-primary/50 animate-progress origin-left"></div>
             </div>
         </div>
      </div>
    </div>
  );
};
