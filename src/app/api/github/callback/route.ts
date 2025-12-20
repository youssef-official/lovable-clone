
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser, auth } from "@clerk/nextjs/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // We need to associate this with the logged-in user.
  // Since this is an API route called by GitHub, the browser cookie for Clerk should be present.
  const { userId } = await auth();

  if (!userId) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
        throw new Error(tokenData.error_description);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub User Info to get username
    const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = await userRes.json();

    // Store in DB
    await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: "github",
        },
      },
      update: {
        accessToken,
        username: userData.login,
        updatedAt: new Date(),
      },
      create: {
        userId,
        provider: "github",
        accessToken,
        username: userData.login,
      },
    });

    // Redirect back to the project page.
    // Ideally we know which project initiated this. Use a cookie or state?
    // For now, redirect to dashboard or referer.
    // The prompt says "Redirect back to project" is implied by flow.
    // We can redirect to /?connected=true or a generic success page.
    return NextResponse.redirect(new URL("/", req.url));

  } catch (error) {
    console.error("GitHub Auth Error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
