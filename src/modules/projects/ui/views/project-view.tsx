"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { Suspense, useState, useEffect } from "react";
import { Fragment } from "@/generated/prisma";
import { ProjectHeader } from "../project-header";
import { FragmentWeb } from "../components/fragment-web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeIcon, CrownIcon, EyeIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";
import { PublishDialog } from "../components/publish-dialog";
import { DownloadZipButton } from "../components/download-zip";

interface Props {
  projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
  const { has } = useAuth();
  const hasProAccess = has?.({ plan: "pro" });

  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview" | "code">("chat");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 min-h-0 relative">
        {mobileTab === "chat" && (
          <div className="h-full flex flex-col">
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
          </div>
        )}
        {mobileTab === "preview" && (
          <div className="h-full">
            {activeFragment ? (
              <FragmentWeb data={activeFragment} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No preview available yet</p>
              </div>
            )}
          </div>
        )}
        {mobileTab === "code" && (
          <div className="h-full overflow-auto">
            {activeFragment?.files ? (
              <FileExplorer
                files={activeFragment.files as { [path: string]: string }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No code available yet</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Mobile Navigation Bar */}
      <div className="border-t bg-background p-2 flex items-center justify-around gap-x-2">
        <Button 
          variant={mobileTab === "chat" ? "default" : "ghost"} 
          className="flex-1 flex flex-col items-center py-6 h-auto"
          onClick={() => setMobileTab("chat")}
        >
          <MessageSquareIcon className="w-5 h-5 mb-1" />
          <span className="text-xs">Chat</span>
        </Button>
        <Button 
          variant={mobileTab === "preview" ? "default" : "ghost"} 
          className="flex-1 flex flex-col items-center py-6 h-auto"
          onClick={() => setMobileTab("preview")}
        >
          <EyeIcon className="w-5 h-5 mb-1" />
          <span className="text-xs">Preview</span>
        </Button>
        <Button 
          variant={mobileTab === "code" ? "default" : "ghost"} 
          className="flex-1 flex flex-col items-center py-6 h-auto"
          onClick={() => setMobileTab("code")}
        >
          <CodeIcon className="w-5 h-5 mb-1" />
          <span className="text-xs">Code</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden">
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
};
