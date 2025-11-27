"use client";

import { useEffect, useState } from "react";
import { getUserCredits } from "../../actions";
import { cn } from "@/lib/utils";

interface UserCreditsProps {
  className?: string;
}

export const UserCredits = ({ className }: UserCreditsProps) => {
  const [credits, setCredits] = useState<{ remainingPoints: number; points: number } | null>(null);

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

  const isPro = credits.points > 5; // Simple heuristic based on default limits (5 vs 100)

  return (
    <div className={cn("flex items-center gap-2 text-sm font-medium", className)}>
      <span className={cn(credits.remainingPoints === 0 && "text-red-500")}>
        {credits.remainingPoints} {isPro ? "Credits" : "Free Credits"}
      </span>
    </div>
  );
};
