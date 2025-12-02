"use client";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";

export const ProjectsList = () => {
  const trpc = useTRPC();
  const { user } = useUser();
  const { data: projects } = useQuery(trpc.projects.getMany.queryOptions());

  if (!user) return null;

  return (
    <div className="w-full bg-white dark:bg-sidebar rounded-xl p-4 sm:p-8 border flex flex-col gap-y-4 sm:gap-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold">{user?.firstName}&apos;s Vibes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {projects?.length === 0 && (
          <div className="col-span-full text-center">
            <p className="text-muted-foreground">No projects found</p>
          </div>
        )}
        {projects?.map((project) => (
          <Button
            key={project.id}
            variant="outline"
            className="font-normal h-auto justify-start w-full text-start p-3 sm:p-4 hover:shadow-md transition-all border-zinc-200 dark:border-zinc-800"
            asChild
          >
            <Link href={`/projects/${project.id}`}>
              <div className="flex items-center gap-x-3 sm:gap-x-4 w-full">
                <div className="relative shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg flex items-center justify-center border border-blue-500/20">
                  <Image
                    src="/logo.svg"
                    alt="Vibe"
                    width={20}
                    height={20}
                    className="object-contain w-5 h-5 sm:w-6 sm:h-6"
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <h3 className="truncate font-medium text-sm sm:text-base">{project.name}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    Edited {formatDistanceToNow(project.updatedAt, {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
};
