"use client";

import { useEffect, useState } from "react";
import { getUserCredits } from "../../actions";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CoinsIcon } from "lucide-react";

interface UserCreditsProps {
  className?: string;
}

interface CreditData {
  remainingPoints: number;
  points: number;
  isPro: boolean;
  monthly?: { remaining: number; limit: number };
  daily?: { remaining: number; limit: number } | null;
}

export const UserCredits = ({ className }: UserCreditsProps) => {
  const [credits, setCredits] = useState<CreditData | null>(null);

  useEffect(() => {
    const fetchCredits = async () => {
      const data = await getUserCredits();
      setCredits(data);
    };

    fetchCredits();
  }, []);

  if (!credits) {
    return null;
  }

  const { isPro, remainingPoints, monthly, daily } = credits;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex items-center gap-2 text-sm font-medium",
            remainingPoints === 0 && "text-red-500 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-600",
            className
          )}
        >
          <CoinsIcon className="size-4" />
          <span>
            {remainingPoints} {isPro ? "Credits" : "Free Credits"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium leading-none">Raseedak (Balance)</h4>
            <p className="text-sm text-muted-foreground">
              {isPro ? "Pro Plan Usage" : "Free Plan Usage"}
            </p>
          </div>

          {isPro ? (
            // Pro View
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Monthly Credits</span>
                <span className="font-bold">{monthly?.remaining ?? remainingPoints} / {monthly?.limit ?? 100}</span>
              </div>
              <Progress
                value={((monthly?.remaining ?? remainingPoints) / (monthly?.limit ?? 100)) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground pt-1">
                 You have {monthly?.limit ?? 100} points this month. No daily limits.
              </p>
            </div>
          ) : (
            // Free View
            <div className="space-y-6">
              {/* Daily Limit */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Daily Limit</span>
                  <span className="font-bold">{daily?.remaining ?? 0} / {daily?.limit ?? 5}</span>
                </div>
                <Progress
                   value={((daily?.remaining ?? 0) / (daily?.limit ?? 5)) * 100}
                   className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  Resets 12 AM Egypt
                </p>
              </div>

              {/* Monthly Limit */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Monthly Balance</span>
                  <span className="font-bold">{monthly?.remaining ?? 0} / {monthly?.limit ?? 50}</span>
                </div>
                <Progress
                  value={((monthly?.remaining ?? 0) / (monthly?.limit ?? 50)) * 100}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                   Up to {monthly?.limit ?? 50} points per month.
                </p>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
