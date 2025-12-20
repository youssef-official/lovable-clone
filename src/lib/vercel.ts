
const VERCEL_API_URL = "https://api.vercel.com";

interface VercelFile {
  file: string;
  data: string;
}

export async function deployToVercel({
  token,
  projectName,
  files,
}: {
  token: string;
  projectName: string;
  files: Record<string, string>;
}) {
  // Convert files map to Vercel's expected format
  const vercelFiles: VercelFile[] = Object.entries(files).map(([path, content]) => ({
    file: path.startsWith("./") ? path.slice(2) : path, // Clean paths
    data: content,
  }));

  // Create the deployment
  const response = await fetch(`${VERCEL_API_URL}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      files: vercelFiles,
      projectSettings: {
        framework: "nextjs",
      },
      target: "production", // Explicitly target production
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to deploy to Vercel");
  }

  const data = await response.json();
  return {
    id: data.id,
    url: data.url, // This is usually project-name-hash.vercel.app
    status: data.readyState, // "QUEUED", "BUILDING", "READY", "ERROR"
  };
}

export async function getDeploymentStatus(token: string, deploymentId: string) {
  const response = await fetch(`${VERCEL_API_URL}/v13/deployments/${deploymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to check deployment status");
  }

  const data = await response.json();
  return {
    status: data.readyState, // "READY", "ERROR", etc.
    url: data.url,
  };
}
