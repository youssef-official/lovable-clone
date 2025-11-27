"use server";

import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

export async function getUserCredits() {
  try {
    // The RateLimiterRes object from rate-limiter-flexible doesn't expose 'points' directly on the result object
    // in the same way we might expect if it was just a raw db record.
    // However, the RateLimiterPrisma 'get' method returns a RateLimiterRes object.
    // Let's check what properties it has. It usually has remainingPoints, msBeforeNext, consumedPoints, isFirstInDuration.
    // It does NOT have 'points' (the limit). We might need to assume the limit based on the user's role or fetch it from config.
    // Or we can query the usage table directly since we are using prisma.

    // Instead of using usageTracker.get(userId) which returns RateLimiterRes,
    // let's fetch the record directly from Prisma to get the actual 'points' column if we want to show the limit.

    const userId = (await auth()).userId;

    if (!userId) {
      return { remainingPoints: 0, points: 0 };
    }

    const usageRecord = await prisma.usage.findUnique({
      where: { key: userId },
    });

    return {
      remainingPoints: usageRecord?.remainingPoints ?? 0,
      points: usageRecord?.points ?? 0,
    };
  } catch (error) {
    console.error("Failed to fetch user credits:", error);
    return { remainingPoints: 0, points: 0 };
  }
}
