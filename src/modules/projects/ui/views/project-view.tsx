"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { Suspense, useState, useEffect } from "react";
import { Fragment } from "@/generated/prisma";
import { ProjectHeader } from "../components/project-header";
import { FragmentWeb } from "../components/fragment-web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeIcon, CrownIcon, EyeIcon, MessageSquareIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";
import { PublishDialog } from "../components/publish-dialog";
import { DownloadZipButton } from "../components/download-zip";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
  const { has } = useAuth();
  const hasProAccess = has?.({ plan: "pro" });
  const trpc = useTRPC();

  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const restoreSandbox = useMutation(
    trpc.projects.restoreSandbox.mutationOptions({
      onSuccess: () => {
        toast.success("Sandbox restored successfully");
        window.location.reload();
      },
      onError: () => {
        toast.error("Failed to restore sandbox");
      },
    }),
  );

  const DesktopView = () => (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel
        defaultSize={35}
        minSize={20}
        className="flex flex-col min-h-0"
      >
        <Suspense fallback={<p>Loading project...</p>}>
          <ProjectHeader projectId={projectId} />
        </Suspense>
        <Suspense fallback={<p>Loading...</p>}>
          <MessagesContainer
            projectId={projectId}
            activeFragment={activeFragment}
            setActiveFragment={setActiveFragment}
          />
        </Suspense>
      </ResizablePanel>
      <ResizableHandle className="hover:bg-primary transition-colors" />
      <ResizablePanel defaultSize={65} minSize={50}>
        <Tabs
          className="h-full gap-y-0 flex flex-col"
          defaultValue="preview"
        >
          <div className="w-full flex items-center p-2 border-b gap-x-2">
            <TabsList className="h-8 p-0 border rounded-md">
              <TabsTrigger value="preview" className="rounded-md">
                <EyeIcon className="w-4 h-4 mr-2" /> <span>Demo</span>
              </TabsTrigger>
              <TabsTrigger value="code" className="rounded-md">
                <CodeIcon className="w-4 h-4 mr-2" /> <span>Code</span>
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => restoreSandbox.mutate({ projectId })}
                disabled={restoreSandbox.isPending}
              >
                <RotateCwIcon className={`w-4 h-4 mr-2 ${restoreSandbox.isPending ? "animate-spin" : ""}`} />
                Restart Sandbox
              </Button>
              {!hasProAccess && (
                <Button asChild size="sm" variant={"tertiary"}>
                  <Link href="/pricing">
                    <CrownIcon className="w-4 h-4 mr-2" /> Upgrade
                  </Link>
                </Button>
              )}
              <DownloadZipButton
                files={activeFragment?.files as Record<string, string> || {}}
                name={activeFragment?.id || "project"}
              />
              <PublishDialog projectId={projectId} />
              <UserControl />
            </div>
          </div>
          <TabsContent value="preview" className="flex-1 min-h-0 m-0">
            {activeFragment && <FragmentWeb data={activeFragment} />}
          </TabsContent>
          <TabsContent value="code" className="flex-1 min-h-0 m-0">
            {!!activeFragment?.files && (
              <FileExplorer
                files={activeFragment.files as { [path: string]: string }}
              />
            )}
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  const MobileView = () => (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex-1 min-h-0 relative">
        {mobileTab === "chat" && (
          <div className="h-full flex flex-col">
            <Suspense fallback={<p>Loading project...</p>}>
              <div className="flex items-center justify-between pr-2">
                <ProjectHeader projectId={projectId} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => restoreSandbox.mutate({ projectId })}
                  disabled={restoreSandbox.isPending}
                >
                  <RotateCwIcon className={`w-5 h-5 ${restoreSandbox.isPending ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </Suspense>
            <Suspense fallback={<p>Loading...</p>}>
              <MessagesContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
              />
            </Suspense>
          </div>
        )}
        {mobileTab === "preview" && (
          <div className="h-full flex flex-col">
             <div className="p-2 border-b flex items-center justify-between">
                <span className="font-medium text-sm px-2">Preview</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => restoreSandbox.mutate({ projectId })}
                  disabled={restoreSandbox.isPending}
                >
                  <RotateCwIcon className={`w-5 h-5 ${restoreSandbox.isPending ? "animate-spin" : ""}`} />
                </Button>
             </div>
            {activeFragment ? (
              <FragmentWeb data={activeFragment} />
            ) : (
              <div className="flex items-center justify-center flex-1">
                <p className="text-muted-foreground">No preview available yet</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Mobile Navigation Bar - Styled like the requested image */}
      <div className="p-4 pb-8 bg-background border-t">
        <div className="flex bg-muted/50 rounded-full p-1 max-w-md mx-auto">
          <button 
            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${mobileTab === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMobileTab("chat")}
          >
            Chat
          </button>
          <button 
            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${mobileTab === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMobileTab("preview")}
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden">
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
};
