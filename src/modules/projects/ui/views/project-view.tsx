"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { Suspense, useState } from "react";
import { Fragment } from "@/generated/prisma";
import { ProjectHeader } from "../components/project-header";
import { FragmentWeb } from "../components/fragment-web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeIcon, CrownIcon, EyeIcon, RocketIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/client";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

interface Props {
  projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
  const { has } = useAuth();
  const hasProAccess = has?.({ permission: "pro" });

  const trpc = useTRPC();
  const [subdomain, setSubdomain] = useState("");
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);

  const restoreMutation = useMutation(
    trpc.projects.restoreSandbox.mutationOptions({
        onSuccess: (data) => {
             toast.success("Preview restored! It may take a minute to start.");
             if (activeFragment) {
                 // Update the local fragment URL to force a re-render or at least show the new URL
                 // In a real app we might want to refetch the fragment or update the cache.
                 // For now, let's just update the state if we can, or just let the user see the new URL on next load?
                 // Actually, we should update the activeFragment state.
                 setActiveFragment({ ...activeFragment, sandboxUrl: data.url });
             }
        },
        onError: (error) => {
            toast.error("Failed to restore preview: " + error.message);
        }
    })
  );

  const publishMutation = useMutation(
    trpc.projects.publish.mutationOptions({
        onSuccess: (data) => {
            toast.success("Published successfully!", {
                action: {
                    label: "View",
                    onClick: () => window.open(data.url, "_blank"),
                }
            });
            setIsPublishDialogOpen(false);
        },
        onError: (error) => {
            toast.error(error.message);
        }
    })
  );

  const handlePublish = () => {
      if (!subdomain) return;
      publishMutation.mutate({ projectId, subdomain });
  };
  const [tabState, setTabState] = useState<"preview" | "code">("preview");

  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");

  // Mobile layout check or CSS-based toggling
  // Since we are server-rendering initially, we can't rely on window.width easily without hydration mismatch.
  // But we can use CSS classes. Tailwind 'md:flex' etc.

  return (
    <div className="h-screen flex flex-col md:flex-row relative">
      <ResizablePanelGroup direction="horizontal" className="hidden md:flex flex-1">
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
            className="h-full gap-y-0"
            defaultValue="preview"
            value={tabState}
            onValueChange={(value) => setTabState(value as "preview" | "code")}
          >
            <div className="w-full flex items-center p-2 border-b gap-x-2">
              <TabsList className="h-8 p-0 border rounded-md">
                <TabsTrigger value="preview" className="rounded-md">
                  <EyeIcon /> <span>Demo</span>
                </TabsTrigger>
                <TabsTrigger value="code" className="rounded-md">
                  <CodeIcon /> <span>Code</span>
                </TabsTrigger>
              </TabsList>
              {tabState === "preview" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restoreMutation.mutate({ projectId })}
                    disabled={restoreMutation.isPending}
                    title="Restart Preview Server"
                   >
                      <RefreshCwIcon className={restoreMutation.isPending ? "animate-spin" : ""} />
                  </Button>
              )}
              <div className="ml-auto flex items-center gap-x-2">
                {!hasProAccess && (
                  <Button asChild size="sm" variant={"tertiary"}>
                    <Link href="/pricing">
                      <CrownIcon /> Upgrade
                    </Link>
                  </Button>
                )}
                <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white border-0">
                            <RocketIcon className="mr-2 size-4" /> Publish
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Publish to the Web</DialogTitle>
                            <DialogDescription>
                                Enter a unique subdomain to deploy your project instantly.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Subdomain</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="my-awesome-app"
                                        value={subdomain}
                                        onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    />
                                    <span className="text-muted-foreground text-sm">.youssef-elsayed.tech</span>
                                </div>
                            </div>
                            <Button
                                onClick={handlePublish}
                                className="w-full"
                                disabled={publishMutation.isPending || !subdomain}
                            >
                                {publishMutation.isPending ? "Publishing..." : "Deploy Now"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                <UserControl />
              </div>
            </div>
            <TabsContent value="preview">
              {activeFragment && <FragmentWeb data={activeFragment} />}
            </TabsContent>
            <TabsContent value="code" className="min-h-0">
              {!!activeFragment?.files && (
                <FileExplorer
                  files={activeFragment.files as { [path: string]: string }}
                />
              )}
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Mobile View Implementation */}
      <div className="md:hidden flex-1 flex flex-col min-h-0 pb-14">
          {mobileTab === "chat" ? (
             <div className="flex flex-col h-full">
                <ProjectHeader projectId={projectId} />
                <MessagesContainer
                    projectId={projectId}
                    activeFragment={activeFragment}
                    setActiveFragment={setActiveFragment}
                />
             </div>
          ) : (
            <Tabs
            className="h-full gap-y-0 flex flex-col"
            defaultValue="preview"
            value={tabState}
            onValueChange={(value) => setTabState(value as "preview" | "code")}
          >
            <div className="w-full flex items-center p-2 border-b gap-x-2 shrink-0">
              <TabsList className="h-8 p-0 border rounded-md">
                <TabsTrigger value="preview" className="rounded-md">
                  <EyeIcon className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="code" className="rounded-md">
                  <CodeIcon className="size-4" />
                </TabsTrigger>
              </TabsList>
              {tabState === "preview" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restoreMutation.mutate({ projectId })}
                    disabled={restoreMutation.isPending}
                    title="Restart Preview Server"
                   >
                      <RefreshCwIcon className={restoreMutation.isPending ? "animate-spin" : ""} />
                  </Button>
              )}
              <div className="ml-auto flex items-center gap-x-2">
                 <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white border-0 px-2">
                            <RocketIcon className="size-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Publish to the Web</DialogTitle>
                            <DialogDescription>
                                Enter a unique subdomain to deploy your project instantly.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Subdomain</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="my-awesome-app"
                                        value={subdomain}
                                        onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    />
                                    <span className="text-muted-foreground text-sm">.pages.dev</span>
                                </div>
                            </div>
                            <Button
                                onClick={handlePublish}
                                className="w-full"
                                disabled={publishMutation.isPending || !subdomain}
                            >
                                {publishMutation.isPending ? "Publishing..." : "Deploy Now"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
              </div>
            </div>
            <TabsContent value="preview" className="flex-1 min-h-0">
              {activeFragment && <FragmentWeb data={activeFragment} />}
            </TabsContent>
            <TabsContent value="code" className="flex-1 min-h-0">
              {!!activeFragment?.files && (
                <FileExplorer
                  files={activeFragment.files as { [path: string]: string }}
                />
              )}
            </TabsContent>
          </Tabs>
          )}
      </div>

      {/* Floating Bottom Navigation for Mobile - Styled like Lovable/Ymo */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-[#1C1C1E] dark:bg-[#1C1C1E] border border-white/10 rounded-full shadow-2xl p-1.5 flex items-center gap-1">
          <Button
            variant={"ghost"}
            size="sm"
            className={`rounded-full px-6 transition-all duration-300 ${mobileTab === "chat" ? "bg-[#2C2C2E] text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            onClick={() => setMobileTab("chat")}
          >
            Chat
          </Button>
          <Button
            variant={"ghost"}
            size="sm"
            className={`rounded-full px-6 transition-all duration-300 ${mobileTab === "preview" ? "bg-[#2C2C2E] text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            onClick={() => setMobileTab("preview")}
          >
            Preview
          </Button>
        </div>
      </div>
    </div>
  );
};
