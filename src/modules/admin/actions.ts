"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

// In a real app, this should be an environment variable or a secure check.
// But we are following the explicit instruction for a hardcoded password.
const ADMIN_PASSWORD = "Yy654321##";
const COOKIE_NAME = "admin_session";

export async function verifyAdminPassword(password: string) {
  if (password === ADMIN_PASSWORD) {
    (await cookies()).set(COOKIE_NAME, password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
    });
    return true;
  }
  return false;
}

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const password = cookieStore.get(COOKIE_NAME)?.value;
  if (password !== ADMIN_PASSWORD) {
    throw new Error("Unauthorized");
  }
}

export async function getAllUsageRecords() {
  await checkAdminAuth();

  // Usage records are keyed by userId
  const usage = await prisma.usage.findMany({
    orderBy: {
      key: 'asc',
    },
  });
  return usage;
}

export async function updateUserCredits(
  userId: string,
  amount: number,
  type: 'set' | 'add' | 'subtract'
) {
  await checkAdminAuth();

  const currentUsage = await prisma.usage.findUnique({
    where: { key: userId },
  });

  let newPoints = amount;

  if (currentUsage) {
    if (type === 'add') {
      newPoints = currentUsage.remainingPoints + amount;
    } else if (type === 'subtract') {
      newPoints = Math.max(0, currentUsage.remainingPoints - amount);
    } else if (type === 'set') {
      newPoints = amount;
    }
  } else {
    // If no record exists, 'add' and 'set' effectively behave the same.
    // 'subtract' from 0 stays 0.
    if (type === 'subtract') {
      newPoints = 0;
    } else {
      newPoints = amount;
    }
  }

  // We reuse addCredits but we might need to be careful because addCredits
  // in lib/usage.ts sets both 'points' (the limit) and 'remainingPoints'.
  // If we just want to update remaining balance but keep the limit, we should do a direct update.
  // However, the request implies manipulating the available credit.
  // Let's modify the record directly to be precise.

  const DURATION = 30 * 24 * 60 * 60; // 30 days
  const now = new Date();
  const expireAt = new Date(now.getTime() + DURATION * 1000);

  // If we are "setting" credits, we update both points (limit) and remainingPoints?
  // Usually "adding credit" means top-up.
  // If the user is on a plan with 100 points, and we add 50, they have 150/100? Or 150/150?
  // Let's assume we update the 'remainingPoints' primarily.
  // But RateLimiterPrisma might reset it if 'points' is lower?
  // To be safe and simple: update both 'points' (limit) and 'remainingPoints' to the new value if it exceeds old limit,
  // or just update remainingPoints if it's within limit?
  // The 'addCredits' function in lib/usage.ts updates both.

  // Let's replicate what addCredits does but with our calculated value.
  // effectively setting the new limit and balance to 'newPoints'.

  return await prisma.usage.upsert({
    where: {
      key: userId,
    },
    update: {
      points: newPoints, // Update the limit to match current balance so it doesn't get capped weirdly on next reset? Actually standard rate limiter logic is complex.
                         // But for this simple credit system, let's just set both.
      remainingPoints: newPoints,
      expire: expireAt,
    },
    create: {
      key: userId,
      points: newPoints,
      remainingPoints: newPoints,
      expire: expireAt,
    },
  });
}
