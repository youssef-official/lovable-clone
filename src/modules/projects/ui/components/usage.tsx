import { Button } from "@/components/ui/button";
import { formatDuration, intervalToDuration } from "date-fns";
import { CrownIcon } from "lucide-react";
import Link from "next/link";

interface Props {
  points: number;
  msBeforeNext?: number;
  isPro?: boolean;
}

export default function Usage({ points, msBeforeNext, isPro = false }: Props) {
  const resetTime = msBeforeNext
    ? new Date(Date.now() + msBeforeNext)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  return (
    <div className="rounded-t-xl bg-background border border-b-0 p-2.5">
      <div className="flex items-center gap-x-2">
        <div>
          <p className="text-sm">
            {points} {isPro ? "" : "free"} credits remaining
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
          ) : !isPro ? (
            <p className="text-xs text-muted-foreground">
               Resets daily at 12 AM Egypt
            </p>
          ) : null}
        </div>
        {!isPro && (
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
