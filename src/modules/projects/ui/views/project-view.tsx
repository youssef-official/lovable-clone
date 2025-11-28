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
import { trpc } from "@/trpc/client";
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

  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("preview"); // Set default to preview as per Lovable style

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

	      {/* Mobile View Implementation - New Lovable Style */}
      <div className="md:hidden flex-1 flex flex-col min-h-0 relative bg-[#111111] text-white">
        {/* 1. Top Navigation Bar (Glassy, Blurred, Transparent) */}
        <div className="fixed top-0 left-0 right-0 z-40 p-4 backdrop-blur-lg bg-black/30 border-b border-white/10">
          <div className="flex items-center justify-between max-w-sm mx-auto">
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white">
              <ArrowLeftIcon className="size-5" />
            </Button>
            <div className="flex items-center gap-1">
	              <span className="text-lg font-semibold truncate max-w-[150px]">
	                {/* Use project name from trpc query */}
	                {trpc.projects.getOne.useSuspenseQuery({ id: projectId }).data.name}
	              </span>
              <ChevronDownIcon className="size-4 text-white/60" />
            </div>
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white">
              <SettingsIcon className="size-5" />
            </Button>
          </div>
        </div>

        {/* 2. Main Content Area - Adjust padding for fixed header/footer */}
        <div className="flex-1 overflow-y-auto pt-[72px] pb-[100px] flex justify-center items-center">
          {mobileTab === "chat" ? (
            <div className="flex flex-col h-full w-full">
              {/* Chat Content - Keep MessagesContainer, remove ProjectHeader */}
              <MessagesContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
              />
            </div>
          ) : (
            <div className="flex flex-col h-full w-full p-4">
              {/* Preview Content - Mobile Frame */}
              <div className="relative w-full max-w-xs aspect-[9/16] mx-auto bg-black rounded-[3rem] shadow-[0_0_0_10px_#222,0_0_0_12px_#333,0_0_0_15px_#444] overflow-hidden">
                {/* Placeholder for Speaker/Camera Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-black rounded-b-xl z-10"></div>
                
                {/* Loading State */}
                {restoreMutation.isPending ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <Loader2Icon className="size-8 animate-spin text-white/80" />
                  </div>
                ) : (
                  <div className="w-full h-full p-2">
                    {/* Iframe/FragmentWeb - Needs to be styled as an iframe with rounded corners */}
                    <div className="w-full h-full bg-white rounded-2xl overflow-hidden border border-gray-700">
                      {activeFragment ? (
                        <FragmentWeb data={activeFragment} />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          No active preview.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. Bottom Floating Bar (Rounded Pill) */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
          <div className="flex items-center justify-center">
            <div className="relative bg-black/50 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl p-1.5 flex items-center gap-1 w-fit">
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-full px-6 transition-all duration-300 font-medium ${mobileTab === "chat" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                onClick={() => setMobileTab("chat")}
              >
                Chat
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-full px-6 transition-all duration-300 font-medium ${mobileTab === "preview" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                onClick={() => setMobileTab("preview")}
              >
                Preview
              </Button>
            </div>
            {/* Floating Circular Action Button */}
            <Button
              variant="default"
              size="icon"
              className="absolute right-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full size-12 shadow-lg hover:bg-white/20 transition-colors"
              onClick={() => setIsPublishDialogOpen(true)}
            >
              <UploadIcon className="size-5 text-white" />
            </Button>
          </div>
        </div>
      </div>




    </div>
  );
};
