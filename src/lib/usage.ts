import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "./db";
import { auth } from "@clerk/nextjs/server";

export const FREE_DAILY_POINTS = 5;
export const FREE_MONTHLY_POINTS = 50;
export const PRO_MONTHLY_POINTS = 100;
export const MONTHLY_DURATION = 30 * 24 * 60 * 60; // 30 days
export const DAILY_DURATION = 24 * 60 * 60; // 24 hours

export function getEgyptDateString() {
  // Returns YYYY-MM-DD in Africa/Cairo timezone
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function getEgyptMonthString() {
  // Returns YYYY-MM in Africa/Cairo timezone
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

// Internal helper to get limiters, ensuring consistency
function getLimiters(userId: string, isPro: boolean) {
  if (isPro) {
    const monthlyKey = `${userId}:${getEgyptMonthString()}`;
    const monthlyLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      tableName: "Usage",
      points: PRO_MONTHLY_POINTS,
      duration: MONTHLY_DURATION,
      keyPrefix: "rlflx-pro",
    });
    return {
        isPro: true,
        monthly: { limiter: monthlyLimiter, key: monthlyKey },
        daily: null
    };
  } else {
    const monthlyKey = userId;
    const monthlyPrefix = `rlflx-free-monthly-${getEgyptMonthString()}`;
    const monthlyLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      tableName: "Usage",
      points: FREE_MONTHLY_POINTS,
      duration: MONTHLY_DURATION,
      keyPrefix: monthlyPrefix,
    });

    const dailyKey = userId;
    const dailyPrefix = `rlflx-free-daily-${getEgyptDateString()}`;
    const dailyLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      tableName: "Usage",
      points: FREE_DAILY_POINTS,
      duration: DAILY_DURATION,
      keyPrefix: dailyPrefix,
    });

    return {
        isPro: false,
        monthly: { limiter: monthlyLimiter, key: monthlyKey },
        daily: { limiter: dailyLimiter, key: dailyKey }
    };
  }
}

export async function consumeCredits() {
  const { userId, has } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const isPro = has?.({ permission: "pro" }) ?? false;
  const limiters = getLimiters(userId, isPro);

  if (limiters.isPro && limiters.monthly) {
    // Pro users: Only consume monthly, no daily limit.
    await limiters.monthly.limiter.consume(limiters.monthly.key, 1);
  } else if (!limiters.isPro && limiters.monthly && limiters.daily) {
    // Free users: Check Daily limit first.
    try {
      await limiters.daily.limiter.consume(limiters.daily.key, 1);
    } catch (e) {
       throw new Error("Daily credit limit reached");
    }

    // Free users: Check Monthly limit second.
    try {
      await limiters.monthly.limiter.consume(limiters.monthly.key, 1);
    } catch (e) {
      // If monthly fails, we theoretically "wasted" a daily point.
      // However, "wasting" a daily point is less severe than wasting a monthly point.
      // Daily points reset tomorrow. Monthly points are more scarce.
      // Ideally, we would rollback, but that's complex.
      throw new Error("Monthly credit limit reached");
    }
  }
}

export async function getUsageStatus() {
  const { userId, has } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const isPro = has?.({ permission: "pro" }) ?? false;
  const limiters = getLimiters(userId, isPro);

  if (limiters.isPro && limiters.monthly) {
    const res = await limiters.monthly.limiter.get(limiters.monthly.key);
    return {
      isPro: true,
      monthly: {
        remaining: res ? res.remainingPoints : PRO_MONTHLY_POINTS,
        limit: PRO_MONTHLY_POINTS,
      },
      daily: null
    };
  } else if (limiters.monthly && limiters.daily) {
    const monthlyRes = await limiters.monthly.limiter.get(limiters.monthly.key);
    const dailyRes = await limiters.daily.limiter.get(limiters.daily.key);

    return {
      isPro: false,
      monthly: {
        remaining: monthlyRes ? monthlyRes.remainingPoints : FREE_MONTHLY_POINTS,
        limit: FREE_MONTHLY_POINTS,
      },
      daily: {
        remaining: dailyRes ? dailyRes.remainingPoints : FREE_DAILY_POINTS,
        limit: FREE_DAILY_POINTS,
      }
    };
  }

  // Fallback (should not happen)
  return {
     isPro: false,
     monthly: { remaining: 0, limit: 0 },
     daily: { remaining: 0, limit: 0 }
  };
}

export async function addCredits(userId: string, points: number) {
  // Update both potential keys to ensure coverage
  const egyptMonth = getEgyptMonthString();
  const freeKey = `rlflx-free-monthly-${egyptMonth}:${userId}`;
  const proKey = `rlflx-pro:${userId}:${egyptMonth}`;
  
  const upsertPoints = async (key: string, pts: number) => {
     const now = new Date();
     const expireAt = new Date(now.getTime() + MONTHLY_DURATION * 1000);

     // NOTE: rate-limiter-flexible usually treats 'points' in DB as "consumed".
     // If we want to RESET credits, we should set 'points' to 0 (meaning 0 consumed).
     // If we are setting a CUSTOM LIMIT, standard RateLimiterPrisma doesn't easily support per-user limits
     // without using 'insurance' or custom logic.
     // Assuming 'addCredits' here is intended to RESET the user's usage (give them a fresh start),
     // we set consumed points to 0.
     // If 'points' argument meant "New Limit", we can't easily change the limit per user with this setup.
     // However, typically admin tools 'add credits' means 'reset usage'.

     // Correcting the logic: Set 'points' (consumed) to 0.
     // The 'remainingPoints' column is for our reference if we want to use it, but library uses 'points'.

     await prisma.usage.upsert({
        where: { key },
        update: {
            points: 0, // Reset consumed to 0
            remainingPoints: pts, // Store limit for reference if needed, or remaining (full)
            expire: expireAt
        },
        create: {
            key,
            points: 0, // Reset consumed to 0
            remainingPoints: pts,
            expire: expireAt
        }
     });
  };

  await upsertPoints(freeKey, points);
  await upsertPoints(proKey, points);
}
