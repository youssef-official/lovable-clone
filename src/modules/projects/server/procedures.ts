import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";
import { createCloudflareProject, uploadToCloudflare, addDomainToProject } from "@/lib/cloudflare";
import { deployToVercel } from "@/lib/vercel";
import { Sandbox } from "@e2b/code-interpreter";
import { cookies } from "next/headers";
import { createGitHubRepo, pushToGitHub } from "@/lib/github";

export const projectsRouter = createTRPCRouter({
  syncToGithub: protectedProcedure
    .input(z.object({
        projectId: z.string(),
        repoName: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
        // 1. Get files
        const project = await prisma.project.findUnique({
            where: { id: input.projectId, userId: ctx.auth.userId },
            include: {
                messages: {
                    where: { role: "ASSISTANT", type: "RESULT", fragment: { isNot: null } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    include: { fragment: true }
                }
            }
        });

        if (!project || project.messages.length === 0 || !project.messages[0].fragment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Project or files not found" });
        }
        const files = project.messages[0].fragment.files as Record<string, string>;

        // 2. Get GitHub Token from Cookie
        const cookieStore = await cookies();
        const token = cookieStore.get("gh_token")?.value;

        if (!token) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "GitHub not connected" });
        }

        try {
            // 3. Create or Check Repo
            const { user, repoName, exists } = await createGitHubRepo(token, input.repoName);

            // 4. Push files
            // Logic differs slightly if it's an update vs init, but pushToGitHub handles basic "push to main".
            // If it exists, we just commit on top.
            // If it's new, we commit to empty (handled by auto_init or careful logic).

            const commitMessage = exists
                ? `Update project (ID: ${input.projectId.slice(0, 8)})`
                : "Initial commit via Vibe";

            const result = await pushToGitHub(token, user.login, repoName, files, commitMessage);
            return { ...result, repoName };
        } catch (e: any) {
            console.error("GitHub Sync Error:", e);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `GitHub Sync Failed: ${e.message}` });
        }
    }),
  restoreSandbox: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
        const project = await prisma.project.findUnique({
            where: { id: input.projectId, userId: ctx.auth.userId },
            include: {
                messages: {
                    where: { role: "ASSISTANT", type: "RESULT", fragment: { isNot: null } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    include: { fragment: true }
                }
            }
        });

        if (!project || project.messages.length === 0 || !project.messages[0].fragment) {
             throw new TRPCError({ code: "NOT_FOUND", message: "Project or code not found" });
        }

        const fragment = project.messages[0].fragment;
        const files = fragment.files as Record<string, string>;

        // Create new Sandbox
        const sandbox = await Sandbox.create("base", {
            timeoutMs: 3600_000, // 1 hour
        });

        const host = sandbox.getHost(3000);
        const url = `https://${host}`;

        // Restore files
        for (const [path, content] of Object.entries(files)) {
             const cleanPath = path.startsWith('/') ? path.substring(1) : path;
             await sandbox.files.write(cleanPath, content);
        }

        const startCommand = "npm install --no-audit --no-fund --quiet && npm run dev > /home/user/server.log 2>&1 &";
        await sandbox.commands.run(startCommand, { timeoutMs: 0 });

        // Update DB with new URL
        await prisma.fragment.update({
            where: { id: fragment.id },
            data: { sandboxUrl: url }
        });

        return { url };
    }),
  publish: protectedProcedure
    .input(z.object({
        projectId: z.string(),
        subdomain: z.string().min(3).max(63).regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/),
        provider: z.enum(['cloudflare', 'vercel']).optional().default('cloudflare'),
        cfAccountId: z.string().optional(),
        cfApiToken: z.string().optional(),
        vercelToken: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
        // 1. Get the latest fragment/files for the project
        const project = await prisma.project.findUnique({
            where: { id: input.projectId, userId: ctx.auth.userId },
            include: {
                messages: {
                    where: { role: "ASSISTANT", type: "RESULT", fragment: { isNot: null } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    include: { fragment: true }
                }
            }
        });

        if (!project || project.messages.length === 0 || !project.messages[0].fragment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Project or files not found" });
        }

        const files = project.messages[0].fragment.files as Record<string, string>;
        const creds = {
            provider: input.provider,
            cfAccountId: input.cfAccountId,
            cfApiToken: input.cfApiToken,
            vercelToken: input.vercelToken,
        };

        if (input.provider === 'vercel') {
            try {
                const result = await deployToVercel(input.subdomain, files, creds);
                return { url: result.url };
            } catch (e: any) {
                console.error("Vercel Deployment Error", e);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Vercel deployment failed: ${e.message}` });
            }
        } else {
            // Cloudflare
            try {
                await createCloudflareProject(input.subdomain, creds);
            } catch (e) {
                console.error("Failed to create CF project", e);
                // Continue, as it might already exist
            }

            try {
                 const result = await uploadToCloudflare(input.subdomain, files, creds);
                 if (!result.success) {
                     throw new Error(result.errors?.[0]?.message || "Upload failed");
                 }

                 if (!input.cfAccountId) {
                     const customDomain = `${input.subdomain}.youssef-elsayed.tech`;
                     try {
                        await addDomainToProject(input.subdomain, customDomain, creds);
                        return { url: `https://${customDomain}` };
                     } catch (domainError) {
                        console.warn("Failed to add custom domain:", domainError);
                     }
                 }

                 // Default to pages.dev
                 return { url: result.result?.url || `https://${input.subdomain}.pages.dev` };
            } catch (e: any) {
                console.error("CF Upload Error", e);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Publishing failed: ${e.message}` });
            }
        }
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
      try {
        await consumeCredits();
      } catch (error) {
        if (error instanceof Error && error.message === "User not authenticated") {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be logged in to create a project.",
          });
        }

        if (error instanceof Error) {
          console.error("Credit consumption error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Credit consumption failed: ${error.message}`,
          });
        }

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
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: createdProject.id,
        },
      });

      return createdProject;
    }),
});
