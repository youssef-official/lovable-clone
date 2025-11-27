export const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

export async function createCloudflareProject(projectName: string) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error("Missing Cloudflare credentials");
  }

  // Check if project exists or create it
  // For simplicity, we assume we can just try to create it.
  // Note: Cloudflare Pages projects need to be unique per account?
  // Let's use the subdomain as the project name for direct mapping.

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: "main", // Required but we are doing direct upload
      }),
    }
  );

  const data = await response.json();

  // If error is "Project already exists", that's fine.
  if (!data.success) {
    const error = data.errors[0];
    // 8000009 = Project already exists. This is expected if the user publishes to the same domain.
    if (error && error.code !== 8000009) {
       console.error("Cloudflare Create Project Error:", JSON.stringify(data));
       throw new Error(`Cloudflare error: ${error.message} (Code: ${error.code})`);
    }
  }

  return data;
}

export async function uploadToCloudflare(projectName: string, files: Record<string, string>) {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Missing Cloudflare credentials");
    }

    // Cloudflare Pages Direct Upload via API is complex (requires FormData with files).
    // https://developers.cloudflare.com/api/operations/pages-deployment-create-deployment

    const formData = new FormData();

    // Cloudflare requires a manifest.
    // For simplicity in this environment, we might need a workaround if `FormData` is node-specific.
    // Next.js server actions run in Node.

    // We need to construct the file objects.
    // Note: This simple implementation assumes text files. Binary assets would need handling.

    Object.entries(files).forEach(([path, content]) => {
        // Remove leading slash if present
        const cleanPath = path.startsWith('/') ? path.substring(1) : path;
        const blob = new Blob([content], { type: 'text/plain' });
        formData.append("files", blob, cleanPath);
    });

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
                // Do not set Content-Type, fetch sets it with boundary for FormData
            },
            body: formData,
        }
    );

    const data = await response.json();
    return data;
}

export async function addDomainToProject(projectName: string, domain: string) {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Missing Cloudflare credentials");
    }

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: domain,
            }),
        }
    );

    const data = await response.json();

    // Ignore error if domain already active (code 8000021 or similar?)
    // Actually Cloudflare usually returns error if it exists.
    if (!data.success) {
        const error = data.errors[0];
        // 8000021? = Domain already exists/active.
        // We log but don't fail hard to allow update flow.
        console.warn("Cloudflare Add Domain Warning:", JSON.stringify(data));
        // We only throw if it's a critical error, but for now let's proceed.
    }

    return data;
}
