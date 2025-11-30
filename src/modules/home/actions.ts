"use server";

import { getUsageStatus } from "@/lib/usage";

export async function getUserCredits() {
  try {
    const status = await getUsageStatus();

    // Transform the detailed status into the simple { remainingPoints, points } format expected by the legacy UI
    // But we will also add the detailed info for the new UI component if needed.

    if (status.isPro) {
      return {
        remainingPoints: status.monthly.remaining,
        points: status.monthly.limit,
        // Add extra fields if the UI evolves
        isPro: true,
        monthly: status.monthly,
        daily: null
      };
    } else {
      // For Free users, the "effective" remaining points is the bottleneck.
      // If Daily is 0, they can't use app, so effective is 0.
      // If Monthly is 0, they can't use app, so effective is 0.
      // If Daily is 3 and Monthly is 40, effective is 3.
      // If Daily is 5 and Monthly is 2, effective is 2.
      const dailyRemaining = status.daily?.remaining ?? 0;
      const monthlyRemaining = status.monthly.remaining;
      const effectiveRemaining = Math.min(dailyRemaining, monthlyRemaining);

      return {
        remainingPoints: effectiveRemaining,
        points: status.daily?.limit ?? 5, // Show Daily Limit as the primary limit context? Or Monthly?
        // Actually, for free users, it's better to show detailed stats in the new UI.
        // For the header pill, showing "X Free Credits" usually refers to the daily allowance since that's the most immediate constraint?
        // But if monthly runs out, showing "5 Free Credits" (daily) is misleading if they can't use them.
        // So effectiveRemaining is correct for the number.
        // The denominator is tricky. "2 / 5" implies daily. "2 / 50" implies monthly.
        // Let's return the detailed object so the UI can decide.

        isPro: false,
        monthly: status.monthly,
        daily: status.daily
      };
    }
  } catch (error) {
    console.error("Failed to fetch user credits:", error);
    return { remainingPoints: 0, points: 0, isPro: false, monthly: { remaining: 0, limit: 0 }, daily: { remaining: 0, limit: 0 } };
  }
}
