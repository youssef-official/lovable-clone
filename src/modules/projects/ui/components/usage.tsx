import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { formatDuration, intervalToDuration } from "date-fns";
import { CrownIcon } from "lucide-react";
import Link from "next/link";

interface Props {
  points: number;
  msBeforeNext?: number;
}

export default function Usage({ points, msBeforeNext }: Props) {
  const { has } = useAuth();
  const hasProAccess = has?.({ permission: "pro" });

  const resetTime = msBeforeNext
    ? new Date(Date.now() + msBeforeNext)
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default placeholder?

  // If msBeforeNext is 0 or undefined, maybe we shouldn't show the timer or show "Now"?
  // But for the sake of UI stability, let's keep it safe.

  return (
    <div className="rounded-t-xl bg-background border border-b-0 p-2.5">
      <div className="flex items-center gap-x-2">
        <div>
          <p className="text-sm">
            {points} {hasProAccess ? "" : "free"} credits remaining
          </p>
          {msBeforeNext ? (
             <p className="text-xs text-muted-foreground">
               Resets in{" "}
               {formatDuration(
                 intervalToDuration({
                   start: new Date(),
                   end: resetTime,
                 }),
                 { format: ["months", "days", "hours"] },
               )}
             </p>
          ) : !hasProAccess ? (
            <p className="text-xs text-muted-foreground">
               Resets daily at 12 AM Egypt
            </p>
          ) : null}
        </div>
        {!hasProAccess && (
          <Button asChild size="sm" variant={"tertiary"} className="ml-auto">
            <Link href="/pricing">
              <CrownIcon /> Upgrade
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
