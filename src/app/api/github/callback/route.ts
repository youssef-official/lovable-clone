import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing configuration or code" }, { status: 400 });
  }

  // Exchange code for token
  const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
      },
      body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
      })
  });

  const data = await response.json();

  if (data.error || !data.access_token) {
      return NextResponse.json({ error: data.error_description || "Failed to get token" }, { status: 400 });
  }

  const { userId } = await auth();
  if (userId) {
      await prisma.gitHubToken.upsert({
          where: { userId },
          update: { token: data.access_token },
          create: { userId, token: data.access_token },
      });
  }

  // Set HTTP-only cookie as fallback
  const cookieStore = await cookies();
  cookieStore.set("gh_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 // 30 days
  });

  return new NextResponse(`
      <html>
        <script>
            window.opener.postMessage({ type: 'GITHUB_CONNECTED' }, '*');
            window.close();
        </script>
        <body>Connected! You can close this window.</body>
      </html>
  `, {
      status: 200,
      headers: { "Content-Type": "text/html" }
  });
}
