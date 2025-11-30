import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
      return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });
  }

  // Dynamically determine the origin from the request to support previews/deployments
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/github/callback`;
  const scope = "repo"; // Read/Write access to repos

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

  redirect(url);
}
