import { Card } from "@/components/ui/card";
import { Fragment, MessageRole, MessageType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronRightIcon, Code2Icon } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface UserMessageProps {
  content: string;
}

const UserMessage = ({ content }: UserMessageProps) => {
  return (
    <div className="flex justify-end pb-4 pr-2 pl-10">
      <Card className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground p-3 shadow-none border-none max-w-[80%] break-words">
        <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
      </Card>
    </div>
  );
};

interface FragmentCardProps {
  fragment: Fragment;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
}

const FragmentCard = ({
  fragment,
  isActiveFragment,
  onFragmentClick,
}: FragmentCardProps) => {
  return (
    <button
      className={cn(
        "flex items-start text-start gap-2 border rounded-lg bg-muted w-fit p-3 hover:bg-secondary transition-colors",
        isActiveFragment &&
          "bg-primary text-primary-foreground border-primary hover:bg-primary",
      )}
      onClick={() => onFragmentClick(fragment)}
    >
      <Code2Icon className="size-4 mt-0.5" />
      <div className="flex flex-col flex-1">
        <span className="text-sm font-medium line-clamp-1">
          {fragment.title}
        </span>
        <span className="text-sm opacity-80">Preview</span>
      </div>
      <div className="flex items-center justify-center mt-0.5">
        <ChevronRightIcon className="size-4" />
      </div>
    </button>
  );
};

interface AssistantMessageProps {
  content: string;
  fragment: Fragment | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
  type: MessageType;
}

const AssistantMessage = ({
  content,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
}: AssistantMessageProps) => {
  return (
    <div
      className={cn(
        "flex flex-col group px-2 pb-4",
        type === "ERROR" && "text-red-700 dark:text-red-500",
      )}
    >
      <div className="flex items-center gap-2 pl-2 mb-2">
        <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-1">
             <Image
                src="/logo.svg"
                alt="Vibe"
                width={14}
                height={14}
                className="shrink-0"
            />
        </div>
        <span className="text-sm font-medium">Vibe</span>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(createdAt, "HH:mm")}
        </span>
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4 max-w-[90%] md:max-w-[85%]">
        <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed text-foreground">
             <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({children}) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                    li: ({children}) => <li className="mb-1">{children}</li>,
                    a: ({children, href}) => <a href={href} className="text-primary hover:underline underline-offset-4" target="_blank" rel="noopener noreferrer">{children}</a>,
                    blockquote: ({children}) => <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground">{children}</blockquote>,
                    code: ({node, className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return !className ? (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                {children}
                            </code>
                        ) : (
                             <code className={className} {...props}>
                                {children}
                            </code>
                        )
                    },
                    pre: ({children}) => <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-xs my-2 border">{children}</pre>,
                    h1: ({children}) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
                    h2: ({children}) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
                    h3: ({children}) => <h3 className="text-base font-bold mb-2 mt-2">{children}</h3>,
                }}
             >
                {content}
            </ReactMarkdown>
        </div>
        {fragment && type === "RESULT" && (
          <FragmentCard
            fragment={fragment}
            onFragmentClick={onFragmentClick}
            isActiveFragment={isActiveFragment}
          />
        )}
      </div>
    </div>
  );
};

interface MessageCardProps {
  content: string;
  role: MessageRole;
  fragment: Fragment | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
  type: MessageType;
}

export const MessageCard = ({
  content,
  role,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
}: MessageCardProps) => {
  if (role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={content}
        fragment={fragment}
        createdAt={createdAt}
        isActiveFragment={isActiveFragment}
        onFragmentClick={onFragmentClick}
        type={type}
      />
    );
  }
  return <UserMessage content={content} />;
};
