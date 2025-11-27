import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { addCredits } from "@/lib/usage";
import { prisma } from "@/lib/db";
import { clerkClient } from "@clerk/nextjs/server";


// Middleware to check if the user is the authorized admin
const isAdmin = protectedProcedure.use(({ ctx, next }) => {
  const user = await (await clerkClient()).users.getUser(ctx.auth.userId);
  if (user.emailAddresses[0]?.emailAddress !== "youssef.official.2411@gmail.com") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You are not authorized to access this admin panel.",
    });
  }
  return next({
    ctx: {
      // Infers the new context with the admin check
      auth: ctx.auth,
    },
  });
});

export const adminRouter = createTRPCRouter({
  // Procedure to find a user by email or ID
  findUser: isAdmin
    .input(
      z.object({
        query: z.string().min(1, { message: "Email or User ID is required" }),
      }),
    )
    .query(async ({ input }) => {
      const { query } = input;

      try {
        // 1. Try to find by User ID
        if (query.startsWith("user_")) {
          const user = await (await clerkClient()).users.getUser(query);
          return {
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress || "N/A",
            firstName: user.firstName,
            lastName: user.lastName,
          };
        }

        // 2. Try to find by Email Address
        const users = await (await clerkClient()).users.getUserList({
          emailAddress: [query],
        });

        if (users.length > 0) {
          const user = users[0];
          return {
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress || "N/A",
            firstName: user.firstName,
            lastName: user.lastName,
          };
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found by ID or Email.",
        });
      } catch (error) {
        // Handle Clerk errors (e.g., user not found by ID)
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found by ID or Email.",
        });
      }
    }),

  // Procedure to set credits for a user
  setCredits: isAdmin
    .input(
      z.object({
        userId: z.string().min(1, { message: "User ID is required" }),
        points: z.number().int().min(0, { message: "Points must be a non-negative integer" }),
      }),
    )
    .mutation(async ({ input }) => {
      const { userId, points } = input;

      try {
        await addCredits(userId, points);
        return { success: true, message: `Successfully set ${points} credits for user ${userId}.` };
      } catch (error) {
        console.error("Error setting credits:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set credits.",
        });
      }
    }),
});
