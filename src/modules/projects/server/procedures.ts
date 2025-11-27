import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string().min(1, { message: "Id is required" }) }))
    .query(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }
      return existingProject;
    }),
  getMany: protectedProcedure.query(async ({ ctx }) => {
    const projects = await prisma.project.findMany({
      where: {
        userId: ctx.auth.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    return projects;
  }),
  create: protectedProcedure
    .input(
      z.object({
        value: z
          .string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Note: Could be moved + extracted to reusable
      try {
        await consumeCredits();
      } catch (error) {
        if (error instanceof Error && error.message === "User not authenticated") {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be logged in to create a project.",
          });
        }

        // rate-limiter-flexible throws a "RateLimiterRes" object (which is not an Error) when rejected.
        // But if it throws a real Error (like DB error), we should know.
        // However, checking "instanceof Error" catches DB errors too.

        // We assume that if it is NOT an Error instance, it is a RateLimiterRes, so we are out of credits.
        // If it IS an Error instance, it's likely a DB error or something else.

        if (error instanceof Error) {
          console.error("Credit consumption error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Credit consumption failed: ${error.message}`,
          });
        }

        // If it's not an error object, it's the rejection from rate-limiter (out of credits)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "You have run out of credits",
        });
      }

      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: generateSlug(2, {
            format: "kebab",
          }),
          messages: {
            create: {
              content: input.value,
              role: "USER",
              type: "RESULT",
            },
          },
        },
      });

      await inngest.send({
        name: "code-agent/run", // needs ot match in functions.ts!
        data: {
          value: input.value,
          projectId: createdProject.id,
        },
      });

      return createdProject;
    }),
});
