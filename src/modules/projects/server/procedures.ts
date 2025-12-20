import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";
import { generateProject } from "@/lib/agent";
import { Sandbox } from "@e2b/code-interpreter";
import { initializeSandbox } from "@/lib/sandbox";

export const projectsRouter = createTRPCRouter({
  restoreSandbox: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const latestFragment = await prisma.fragment.findFirst({
        where: {
          message: {
            projectId: input.projectId,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!latestFragment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No generated code found for this project",
        });
      }

      const templateId = process.env.E2B_TEMPLATE_ID || "vibe-nextjs-test-4";
      let sandbox;

      try {
        sandbox = await Sandbox.create(templateId, {
          timeoutMs: 30 * 60 * 1000, // 30 minutes
        });
      } catch (e) {
        console.warn(
          `Failed to load custom template "${templateId}". Falling back to base sandbox. Error: ${e}`,
        );
        sandbox = await Sandbox.create("base", {
          timeoutMs: 30 * 60 * 1000, // 30 minutes
        });
      }

      // Restore sandbox state
      await initializeSandbox(sandbox, latestFragment.files as Record<string, string>);

      const host = sandbox.getHost(3000);
      const sandboxUrl = `https://${host}`;

      await prisma.fragment.update({
        where: {
          id: latestFragment.id,
        },
        data: {
          sandboxUrl,
        },
      });

      return sandboxUrl;
    }),
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
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Something went wrong",
          });
        } else {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You have run out of credits",
          });
        }
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

      // Execute the agent directly
      // Note: This will take some time to complete
      generateProject({
        value: input.value,
        projectId: createdProject.id,
      }).catch((e) => {
        console.error("Failed to generate project:", e);
      });

      return createdProject;
    }),
});
