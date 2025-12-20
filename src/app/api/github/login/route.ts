
import { NextRequest, NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const REDIRECT_URI = "https://youssef.ymoo.site/api/github/callback";

export async function GET(req: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    return NextResponse.json({ error: "GitHub Client ID not configured" }, { status: 500 });
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.append("client_id", GITHUB_CLIENT_ID);
  url.searchParams.append("redirect_uri", REDIRECT_URI);
  // Request scope to read/write repos
  url.searchParams.append("scope", "repo user");

  // Store the return URL (referer) if needed, or just redirect back to home/dashboard
  // For now, we rely on the callback handling the final redirect logic or passing state

  return NextResponse.redirect(url.toString());
}
