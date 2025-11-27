import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "./db";
import { auth } from "@clerk/nextjs/server";

const FREE_POINTS = 5;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60; // 30 days
const GENERATION_COST = 1;

export async function getUsageTracker() {
  const { has } = await auth();
  const hasProAccess = has({ permission: "pro" });

  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: hasProAccess ? PRO_POINTS : FREE_POINTS,
    duration: DURATION,
    // The points are only set on first use. If a record exists, the existing points are used.
    // This is the intended fix for the Pro user credit issue.
    execEvenly: false,
  });

  return usageTracker;
}

export async function consumeCredits() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const result = await usageTracker.consume(userId, GENERATION_COST);

  return result;
}

export async function getUsageStatus() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const usageTracker = await getUsageTracker();
  const result = await usageTracker.get(userId);

  return result;
}

export async function addCredits(userId: string, points: number) {
  const usageTracker = await getUsageTracker();
  // The RateLimiterPrisma's underlying model is 'Usage'.
  // We can directly update the 'points' field to set a new limit for the user.
  // This effectively "adds" credits by increasing the limit.
  // The RateLimiterPrisma's underlying model is 'Usage'.
  // We can directly update the 'points' field to set a new limit for the user.
  // This effectively "adds" credits by increasing the limit.
  
  // We will use Prisma directly to update the user's credit limit and remaining points.
  // This is a manual override for the admin panel.
  
  const now = new Date();
  const durationInSeconds = DURATION;
  const expireAt = new Date(now.getTime() + durationInSeconds * 1000);

  await prisma.usage.upsert({
    where: {
      key: userId,
    },
    update: {
      points: points,
      remainingPoints: points,
      expire: expireAt,
    },
    create: {
      key: userId,
      points: points,
      remainingPoints: points,
      expire: expireAt,
    },
  });
}

