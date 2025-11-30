"use server";

import { getUsageStatus } from "@/lib/usage";

export async function getUserCredits() {
  try {
    const status = await getUsageStatus();

    if (status.isPro) {
      return {
        remainingPoints: status.monthly.remaining,
        points: status.monthly.limit,
        isPro: true,
        monthly: status.monthly,
        daily: null
      };
    } else {
      // For Free users, the UI header should show the most restrictive *remaining* count.
      // If daily limit is 5 and used 1 (4 remaining), and monthly limit is 50 and used 1 (49 remaining).
      // The user can make 4 more requests today. So show 4.
      const dailyRemaining = status.daily?.remaining ?? 0;
      const monthlyRemaining = status.monthly.remaining;
      const effectiveRemaining = Math.min(dailyRemaining, monthlyRemaining);

      return {
        remainingPoints: effectiveRemaining,
        points: status.daily?.limit ?? 5, // The denominator for the header button is less relevant, but 5 is the daily cap.
        isPro: false,
        monthly: status.monthly,
        daily: status.daily
      };
    }
  } catch (error) {
    console.error("Failed to fetch user credits:", error);
    // Return a safe fallback that won't crash the UI
    return {
        remainingPoints: 0,
        points: 0,
        isPro: false,
        monthly: { remaining: 0, limit: 0 },
        daily: { remaining: 0, limit: 0 }
    };
  }
}
