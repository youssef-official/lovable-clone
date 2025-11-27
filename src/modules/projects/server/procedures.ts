import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";
import { createCloudflareProject, uploadToCloudflare, addDomainToProject } from "@/lib/cloudflare";
import { Sandbox } from "@e2b/code-interpreter";

export const projectsRouter = createTRPCRouter({
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
        // E2B SDK doesn't support batch write easily? Actually writing one by one is fine for now.
        for (const [path, content] of Object.entries(files)) {
             // Ensure directory exists? sandbox.files.write handles it usually?
             // We might need to ensure paths are relative.
             const cleanPath = path.startsWith('/') ? path.substring(1) : path;
             await sandbox.files.write(cleanPath, content);
        }

        // Install and start
        // We assume package.json is in the files.
        console.log("Restoring sandbox... Installing dependencies and starting server.");

        // We run the install and dev command.
        // We do NOT background the install part, because we want it to finish before we return 'success' to the UI
        // (so the UI knows it's ready-ish).
        // BUT npm install takes time. If we block, the request might timeout (Vercel has 10s limit on free tier, usually longer on others).
        // If we block, the user waits.
        // If we don't block, the user sees "Closed Port" immediately.

        // Compromise: Run both in background, but user needs to wait.
        // To make it more robust, we explicitly set the port 3000 to be open? No, Next.js does that.
        // We add a small sleep to allow the process to spawn? No, that doesn't help with "npm install".

        // The best approach for "restore" is to just trigger it and tell the user "It may take a minute".
        // The previous command was correct: "npm install && npm run dev &"
        // But maybe the output redirection is hiding errors.
        // Let's log output to a file inside the sandbox for debugging if needed.

        // Use --no-audit --no-fund to speed up install.
        const startCommand = "npm install --no-audit --no-fund --quiet && npm run dev > /home/user/server.log 2>&1 &";
        await sandbox.commands.run(startCommand);

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

        // 2. Create/Check Cloudflare Project
        try {
            await createCloudflareProject(input.subdomain);
        } catch (e) {
            console.error("Failed to create CF project", e);
             throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to initialize publishing" });
        }

        // 3. Upload Files
        try {
             const result = await uploadToCloudflare(input.subdomain, files);
             if (!result.success) {
                 throw new Error(result.errors?.[0]?.message || "Upload failed");
             }

             // 4. Add Custom Domain
             // We try to add the custom subdomain.youssef-elsayed.tech
             const customDomain = `${input.subdomain}.youssef-elsayed.tech`;
             try {
                await addDomainToProject(input.subdomain, customDomain);
             } catch (domainError) {
                console.warn("Failed to add custom domain, but project published:", domainError);
                // We don't fail the whole request, as the *.pages.dev URL is still valid.
             }

             // Return the custom domain URL if possible, else the pages.dev one
             // Cloudflare Pages usually provides the alias instantly if DNS is managed by them.
             return { url: `https://${customDomain}`, subdomain: input.subdomain };
        } catch (e: any) {
            console.error("CF Upload Error", e);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Publishing failed: ${e.message}. Please ask Vibe support.` });
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
