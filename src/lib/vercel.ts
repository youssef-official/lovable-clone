
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

  // Inject vercel.json for Vite projects if missing
  const framework = detectFramework(files);
  if (framework === "vite" && !files["vercel.json"] && !files["./vercel.json"]) {
    vercelFiles.push({
      file: "vercel.json",
      data: JSON.stringify({
        rewrites: [{ source: "/(.*)", destination: "/index.html" }]
      }, null, 2)
    });
  }

  // Log payload for debugging
  console.log("Vercel Payload:", JSON.stringify({ name: projectName, files: vercelFiles.map(f => f.file), framework }, null, 2));

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
        framework: framework,
      },
      target: "production", // Explicitly target production
    }),
  });

  if (!response.ok) {
    try {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to deploy to Vercel");
    } catch (e) {
        if (e instanceof Error && e.message !== "Failed to deploy to Vercel") throw e;
        throw new Error(`Vercel deployment failed with status ${response.status}: ${response.statusText}`);
    }
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

function detectFramework(files: Record<string, string>): string | null {
  const pkgJsonContent = files["package.json"] || files["./package.json"];
  if (!pkgJsonContent) return null;

  try {
    const pkg = JSON.parse(pkgJsonContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["next"]) return "nextjs";
    if (deps["vite"]) return "vite";
  } catch (e) {
    // ignore parse error
  }
  return null;
}
