import { DeploymentCredentials } from "./cloudflare";

export async function deployToVercel(projectName: string, files: Record<string, string>, creds: DeploymentCredentials) {
    if (!creds.vercelToken) {
        throw new Error("Missing Vercel Token");
    }

    // 1. Create Project (if not exists) - Vercel API usually creates on deployment if configured,
    // but explicit creation is safer for configuration. However, for a simple "deploy files",
    // we can use the /v13/deployments endpoint which creates the project if the `name` is new.

    const fileList = Object.entries(files).map(([path, content]) => ({
        file: path.startsWith('/') ? path.substring(1) : path,
        data: content
    }));

    const response = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${creds.vercelToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: projectName,
            files: fileList,
            projectSettings: {
                framework: "nextjs" // Or infer from files, but default to nextjs for this platform
            },
            target: "production"
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Vercel Deployment Error: ${data.error?.message || response.statusText}`);
    }

    return {
        url: `https://${data.url}`, // Vercel returns the deployment URL (without protocol usually)
        dashboardUrl: data.inspectorUrl
    };
}
