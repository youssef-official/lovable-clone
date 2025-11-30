"use client";

import { useEffect, useState } from "react";
import { getUserCredits } from "../../actions";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface CreditStatusProps {
  className?: string;
}

interface CreditData {
  remainingPoints: number;
  points: number;
  isPro: boolean;
  monthly?: { remaining: number; limit: number };
  daily?: { remaining: number; limit: number } | null;
}

export const CreditStatus = ({ className }: CreditStatusProps) => {
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

  if (credits.isPro) {
    // Pro View
    const percentage = (credits.remainingPoints / (credits.monthly?.limit || 100)) * 100;

    return (
      <Card className={cn("w-full max-w-sm", className)}>
        <CardHeader>
          <CardTitle>Raseedak (Balance)</CardTitle>
          <CardDescription>You are on the Pro Plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly Credits</span>
              <span className="font-bold">{credits.remainingPoints} / {credits.monthly?.limit}</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            Enjoy your 100 monthly points!
          </p>
        </CardContent>
      </Card>
    );
  } else {
    // Free View
    const monthlyLimit = credits.monthly?.limit || 50;
    const monthlyRemaining = credits.monthly?.remaining || 0;
    const dailyLimit = credits.daily?.limit || 5;
    const dailyRemaining = credits.daily?.remaining || 0;

    const monthlyPercent = (monthlyRemaining / monthlyLimit) * 100;
    const dailyPercent = (dailyRemaining / dailyLimit) * 100;

    return (
      <Card className={cn("w-full max-w-sm", className)}>
        <CardHeader>
          <CardTitle>Raseedak (Balance)</CardTitle>
          <CardDescription>Free Plan Usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Daily Limit */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Daily Limit (Resets 12 AM Egypt)</span>
              <span className="font-bold">{dailyRemaining} / {dailyLimit}</span>
            </div>
            <Progress value={dailyPercent} className="h-2" />
          </div>

          {/* Monthly Limit */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly Balance</span>
              <span className="font-bold">{monthlyRemaining} / {monthlyLimit}</span>
            </div>
            <Progress value={monthlyPercent} className="h-2" />
          </div>

          <p className="text-xs text-muted-foreground">
            You get 5 points daily, up to 50 points per month.
          </p>
        </CardContent>
      </Card>
    );
  }
};
