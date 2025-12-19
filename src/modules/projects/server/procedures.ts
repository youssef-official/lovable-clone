import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";
import { generateProject } from "@/lib/agent";
import { Sandbox } from "@e2b/code-interpreter";
import { getBoilerplateFiles } from "@/lib/sandbox";

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

      // If the fragment doesn't have package.json, we assume it needs the boilerplate
      // This handles cases where the project was created before the boilerplate was tracked,
      // or if the agent somehow deleted it.
      const files = latestFragment.files as Record<string, string>;
      if (!files["package.json"]) {
        const boilerplate = getBoilerplateFiles();
        for (const [path, content] of Object.entries(boilerplate)) {
          await sandbox.files.write(path, content);
        }
      }

      // Write files (overwriting boilerplate if necessary)
      for (const [path, content] of Object.entries(files)) {
        await sandbox.files.write(path, content);
      }

      // Patch vite.config.ts to allow all hosts
      try {
        const viteConfigPath = Object.keys(files).find((f) =>
          f.endsWith("vite.config.ts"),
        );
        if (viteConfigPath) {
          const viteConfig = await sandbox.files.read(viteConfigPath);
          if (!viteConfig.includes("allowedHosts: true")) {
            const patchedConfig = viteConfig.replace(
              "server: {",
              "server: {\n    allowedHosts: true,",
            );
            await sandbox.files.write(viteConfigPath, patchedConfig);
          }
        }
      } catch (error) {
        console.warn("Failed to patch vite.config.ts:", error);
      }

      // Start dev server
      console.log("Installing dependencies...");
      await sandbox.commands.run("npm install", {
        timeoutMs: 300000, // 5 minutes
      });

      console.log("Starting dev server...");
      await sandbox.commands.run("npm run dev > /dev/null 2>&1 &");

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
