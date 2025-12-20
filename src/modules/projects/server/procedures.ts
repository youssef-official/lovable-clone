import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";
import { generateProject } from "@/lib/agent";
import { Sandbox } from "@e2b/code-interpreter";
import { initializeSandbox } from "@/lib/sandbox";
import { deployToVercel, getDeploymentStatus } from "@/lib/vercel";
import { createGitHubRepo, pushToGitHub } from "@/lib/github";
import { after } from "next/server";

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
      after(() => {
        generateProject({
          value: input.value,
          projectId: createdProject.id,
        }).catch((e) => {
          console.error("Failed to generate project:", e);
        });
      });

      return createdProject;
    }),

  // Deployment Procedures
  deployToVercel: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        token: z.string().optional(), // If provided, uses this instead of env
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Get latest files
      const latestFragment = await prisma.fragment.findFirst({
        where: { message: { projectId: input.projectId } },
        orderBy: { createdAt: "desc" },
      });

      if (!latestFragment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No code to deploy" });
      }

      if (!latestFragment.files || Object.keys(latestFragment.files as object).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No files to deploy" });
      }

      const token = input.token || process.env.VERCEL_TOKEN;
      if (!token) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No Vercel token available" });
      }

      // Save token if it's a custom user token (only if provided in input)
      if (input.token) {
        await prisma.project.update({
          where: { id: input.projectId },
          data: { vercelToken: input.token },
        });
      }

      await prisma.project.update({
        where: { id: input.projectId },
        data: { lastDeploymentStatus: "starting" },
      });

      try {
        const deployment = await deployToVercel({
          token,
          projectName: project.name, // or custom name?
          files: latestFragment.files as Record<string, string>,
        });

        await prisma.project.update({
            where: { id: input.projectId },
            data: {
                deploymentUrl: `https://${deployment.url}`,
                lastDeploymentStatus: "building"
            },
        });

        return deployment;
      } catch (error: any) {
        await prisma.project.update({
            where: { id: input.projectId },
            data: { lastDeploymentStatus: "error" },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
    }),

  checkVercelStatus: protectedProcedure
    .input(z.object({ projectId: z.string(), deploymentId: z.string() }))
    .query(async ({ input, ctx }) => {
        const project = await prisma.project.findUnique({
            where: { id: input.projectId, userId: ctx.auth.userId },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });

        // Decide which token to use
        const token = project.vercelToken || process.env.VERCEL_TOKEN;
         if (!token) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No Vercel token available" });
        }

        try {
            const status = await getDeploymentStatus(token, input.deploymentId);

            // Map Vercel status to our simple status
            let dbStatus = "building";
            if (status.status === "READY") dbStatus = "success";
            if (status.status === "ERROR" || status.status === "CANCELED") dbStatus = "error";

            await prisma.project.update({
                where: { id: input.projectId },
                data: { lastDeploymentStatus: dbStatus },
            });

            return status;
        } catch (e) {
            return { status: "UNKNOWN" };
        }
    }),

    getGithubConnection: protectedProcedure.query(async ({ ctx }) => {
        const connection = await prisma.userIntegration.findUnique({
            where: {
                userId_provider: {
                    userId: ctx.auth.userId,
                    provider: "github"
                }
            }
        });
        return connection ? { username: connection.username } : null;
    }),

    syncToGithub: protectedProcedure
      .input(z.object({ projectId: z.string(), repoName: z.string() }))
      .mutation(async ({ input, ctx }) => {
         const project = await prisma.project.findUnique({
             where: { id: input.projectId, userId: ctx.auth.userId }
         });
         if (!project) throw new TRPCError({ code: "NOT_FOUND" });

         const integration = await prisma.userIntegration.findUnique({
             where: {
                 userId_provider: {
                     userId: ctx.auth.userId,
                     provider: "github"
                 }
             }
         });

         if (!integration) {
             throw new TRPCError({ code: "BAD_REQUEST", message: "GitHub not connected" });
         }

         const latestFragment = await prisma.fragment.findFirst({
            where: { message: { projectId: input.projectId } },
            orderBy: { createdAt: "desc" },
          });

          if (!latestFragment) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No code to sync" });
          }

          console.log("Syncing to GitHub:", { repoName: input.repoName, fileCount: Object.keys(latestFragment.files || {}).length });

          try {
              // 1. Ensure Repo Exists
              await createGitHubRepo(integration.accessToken, input.repoName);

              // 2. Push Code
              const result = await pushToGitHub(
                  integration.accessToken,
                  integration.username!, // Assuming username exists if integration exists
                  input.repoName,
                  latestFragment.files as Record<string, string>,
                  "Initial commit from Vibe"
              );

              // 3. Save Repo Name
              await prisma.project.update({
                  where: { id: input.projectId },
                  data: { githubRepo: input.repoName }
              });

              return { url: `https://github.com/${integration.username}/${input.repoName}` };

          } catch (error: any) {
              console.error("GitHub Sync Error", error);
              throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: error.message || "Failed to sync to GitHub"
              });
          }
      })
});
