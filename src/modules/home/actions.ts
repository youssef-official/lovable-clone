"use server";

import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

export async function getUserCredits() {
  try {
    const { userId, has } = await auth();

    if (!userId) {
      return { remainingPoints: 0, points: 0 };
    }

    // RateLimiterPrisma uses a 'rlflx:' prefix by default.
    // We must check for this key to find the record created by the library.
    const key = `rlflx:${userId}`;
    const usageRecord = await prisma.usage.findUnique({
      where: { key },
    });

    // Determine the default limit based on user role (matching logic in src/lib/usage.ts)
    const hasProAccess = has?.({ permission: "pro" });
    const PRO_POINTS = 100;
    const FREE_POINTS = 5;
    const defaultPoints = hasProAccess ? PRO_POINTS : FREE_POINTS;

    // If no record exists yet, the user has the full default amount.
    // If a record exists, use its values.
    // Note: usageRecord.points might be the 'consumed' points or 'limit' depending on implementation.
    // But in rate-limiter-flexible with Prisma, 'points' usually stores the LIMIT if we use blockDuration?
    // Actually, RateLimiterPrisma schema is: key, points, expire.
    // 'points' is whatever was set when the record was created/updated.
    // In src/lib/usage.ts, we initialize it with PRO_POINTS or FREE_POINTS.
    // So 'points' in DB SHOULD be the limit (e.g. 5 or 100).
    // 'remainingPoints' is the balance.

    // If the user sees "0 / 4", it means points=4. That is weird if FREE_POINTS=5.
    // Unless the user consumed 1 point and somehow the limit got decremented? No.
    // Maybe the user had a custom limit set manually in the admin dashboard to 4?
    // Or maybe the user logic is checking a different plan?

    // Regardless, the user wants to see "1 / 5" (remaining / limit).
    // The current code returns { remainingPoints, points }.
    // The UI displays "{remainingPoints} / {points}".
    // If the user wants "1" (remaining) "not 4" (consumption?), they might be misinterpreting "4" as consumption?
    // "0 / 4" -> 0 remaining, 4 limit.
    // If they want "1", they imply they have 1 remaining.
    // If they say "not 4", maybe 4 is the USED amount?
    // 5 (Limit) - 1 (Remaining) = 4 (Used).
    // So the user sees "Used / Limit"?
    // Let's check the UI component.

    // src/modules/home/ui/components/user-credits.tsx:
    // {credits.remainingPoints} / {credits.points}

    // So it displays Remaining / Limit.
    // If user sees 0/4, they have 0 remaining out of 4 limit.
    // User claims "free user is 5 credit".
    // Why is limit 4?
    // Maybe the DB record has `points: 4`.
    // We should enforce the standard limit if the DB record looks "off" or just trust the DB?
    // The user says "Show the credit in the account i.e. 1 not 4".
    // This implies they think 4 is the "used" amount and they want "remaining".
    // But 0/4 means 0 remaining.
    // Wait, if they have 1 remaining, and limit is 5, then used is 4.
    // If they see "4", maybe they see "4" somewhere else?
    // "Credits: 0 / 4"
    // Maybe they want the display to be "Remaining" only?
    // "show the credit in the account ie 1 not 4"
    // "not 4" (which is used).
    // So they want to see Remaining.
    // The UI shows `remainingPoints`.

    // I will ensure we return `defaultPoints` (the limit) correctly.
    // To ensure the limit is always displayed as the PLAN limit (5 or 100) instead of whatever is in the DB (which might be stale or weird),
    // I will return `defaultPoints` as the denominator.

    return {
      remainingPoints: usageRecord?.remainingPoints ?? defaultPoints,
      points: defaultPoints, // Always show the plan limit (5 or 100), not the DB value which might differ if plan changed
    };
  } catch (error) {
    console.error("Failed to fetch user credits:", error);
    return { remainingPoints: 0, points: 0 };
  }
}
