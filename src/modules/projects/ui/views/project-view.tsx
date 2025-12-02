"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { ArrowLeftIcon, ChevronDownIcon, SettingsIcon, UploadIcon, Loader2Icon } from "lucide-react";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
  const { has } = useAuth();
  const hasProAccess = has?.({ permission: "pro" });
  const router = useRouter();

  const trpc = useTRPC();
  const [subdomain, setSubdomain] = useState("");
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);

  const restoreMutation = useMutation(
    trpc.projects.restoreSandbox.mutationOptions({
        onSuccess: (data) => {
             toast.success("Preview restored! It may take a minute to start.");
             if (activeFragment) {
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

  const { data: projectData, isLoading: isProjectLoading } = useQuery(trpc.projects.getOne.queryOptions({ id: projectId }));

  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("preview");

  return (
    <div className="h-screen flex flex-col md:flex-row relative">
      {/* Desktop View - Unchanged */}
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
          <div className="hidden md:block h-full">
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
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Mobile View Implementation - Lovable Style */}
      <div className="md:hidden flex flex-col h-[100dvh] bg-[#0A0A0A] text-white">
        {/* 1. Top Navigation Bar (Glassy, Blurred, Transparent) */}
        <div className="absolute top-0 left-0 right-0 z-50 p-4 backdrop-blur-md bg-black/20 border-b border-white/5">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <Button
                variant="ghost"
                size="icon"
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                onClick={() => router.back()}
            >
              <ArrowLeftIcon className="size-5" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                <span className="text-sm font-medium truncate max-w-[150px]">
                    {isProjectLoading ? "Loading..." : projectData?.name || "Project"}
                </span>
                <ChevronDownIcon className="size-3 text-white/50" />
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
            >
              <SettingsIcon className="size-5" />
            </Button>
          </div>
        </div>

        {/* 2. Main Content Area */}
        <div className="flex-1 flex flex-col w-full relative pt-[72px] pb-[90px]">
          {mobileTab === "chat" ? (
            <div className="flex-1 h-full min-h-0 flex flex-col">
              {/* Chat Content */}
              <MessagesContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full bg-white relative">
                {/* Loading State */}
                {(!activeFragment || restoreMutation.isPending) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-20">
                    <Loader2Icon className="size-8 animate-spin text-white mb-4" />
                    <p className="text-sm text-gray-400 font-medium">
                        {restoreMutation.isPending ? "Restoring Preview..." : "Generating..."}
                    </p>
                    {/* Allow retry if it takes too long or fails - manually triggerable via refresh button in top bar usually, but let's add one here if stuck */}
                     <Button
                        variant="link"
                        size="sm"
                        className="mt-2 text-blue-400"
                        onClick={() => restoreMutation.mutate({ projectId })}
                     >
                        Force Refresh
                     </Button>
                  </div>
                )}

                {/* Iframe Content - Full Width/Height */}
                {activeFragment && (
                    <div className="flex-1 w-full h-full">
                         <FragmentWeb data={activeFragment} />
                    </div>
                )}
            </div>
          )}
        </div>

        {/* 3. Bottom Floating Bar */}
        <div className="absolute bottom-6 left-0 right-0 z-50 flex justify-center items-center px-4 pointer-events-none">
          <div className="relative pointer-events-auto flex items-center">
            {/* Pill Tabs */}
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl p-1.5 flex items-center gap-1">
              <button
                onClick={() => setMobileTab("chat")}
                className={`
                    relative px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300
                    ${mobileTab === "chat"
                        ? "text-black bg-white shadow-sm"
                        : "text-gray-400 hover:text-white hover:bg-white/5"}
                `}
              >
                Chat
              </button>
              <button
                onClick={() => setMobileTab("preview")}
                className={`
                    relative px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300
                    ${mobileTab === "preview"
                        ? "text-black bg-white shadow-sm"
                        : "text-gray-400 hover:text-white hover:bg-white/5"}
                `}
              >
                Preview
              </button>
            </div>

            {/* Circular Action Button */}
            <button
              onClick={() => setIsPublishDialogOpen(true)}
              className="ml-3 bg-white text-black p-3.5 rounded-full shadow-lg hover:bg-gray-200 transition-colors active:scale-95 flex items-center justify-center"
            >
              <UploadIcon className="size-5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
