
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CoinsIcon } from "lucide-react";
import Link from "next/link";

export const UserCredits = () => {
  const { has } = useAuth();
  const hasProAccess = has?.({ permission: "pro" });
  const trpc = useTRPC();

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());

  if (!usage) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
            <CoinsIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{usage.remainingPoints}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <div className="space-y-2">
           <h4 className="font-medium leading-none">Credits</h4>
           <p className="text-sm text-muted-foreground">
             {usage.remainingPoints} {hasProAccess ? "" : "free"} credits remaining.
           </p>
           {!hasProAccess && (
             <Button asChild className="w-full mt-2" size="sm">
               <Link href="/pricing">Upgrade to Pro</Link>
             </Button>
           )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
