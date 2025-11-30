
export interface DeploymentCredentials {
  provider: 'cloudflare' | 'vercel';
  cfAccountId?: string;
  cfApiToken?: string;
  vercelToken?: string;
}

export async function createCloudflareProject(projectName: string, creds: DeploymentCredentials) {
  const accountId = creds.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = creds.cfApiToken || process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("Missing Cloudflare credentials");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
      }),
    }
  );

  const data = await response.json();

  if (!data.success) {
    const error = data.errors[0];
    if (error && error.code !== 8000009) { // 8000009 = Project already exists
       console.error("Cloudflare Create Project Error:", JSON.stringify(data));
       throw new Error(`Cloudflare error: ${error.message} (Code: ${error.code})`);
    }
  }

  return data;
}

export async function uploadToCloudflare(projectName: string, files: Record<string, string>, creds: DeploymentCredentials) {
    const accountId = creds.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = creds.cfApiToken || process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error("Missing Cloudflare credentials");
    }

    const formData = new FormData();

    Object.entries(files).forEach(([path, content]) => {
        const cleanPath = path.startsWith('/') ? path.substring(1) : path;
        const blob = new Blob([content], { type: 'text/plain' });
        formData.append("files", blob, cleanPath);
    });

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
            },
            body: formData,
        }
    );

    const data = await response.json();
    if (!data.success) {
        throw new Error(`Cloudflare Upload Error: ${data.errors?.[0]?.message}`);
    }

    // Return the alias URL (preview URL) or the project URL
    return data;
}

export async function addDomainToProject(projectName: string, domain: string, creds: DeploymentCredentials) {
    const accountId = creds.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = creds.cfApiToken || process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error("Missing Cloudflare credentials");
    }

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: domain,
            }),
        }
    );

    const data = await response.json();
    if (!data.success) {
         console.warn("Cloudflare Add Domain Warning:", JSON.stringify(data));
    }

    return data;
}
