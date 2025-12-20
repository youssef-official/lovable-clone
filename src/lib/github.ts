
import { Octokit } from "@octokit/rest";

export async function createGitHubRepo(token: string, name: string) {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name,
      private: false, // Default to public, can be changed
    });
    return data;
  } catch (error: any) {
     // If repo already exists, try to get it
     if (error.status === 422) {
       // Assuming it exists, we might want to return the existing one or throw specific error
       // For now, let's verify if we can access it
       const user = await octokit.users.getAuthenticated();
       const { data } = await octokit.repos.get({
         owner: user.data.login,
         repo: name,
       });
       return data;
     }
     throw error;
  }
}

export async function pushToGitHub(
  token: string,
  owner: string,
  repo: string,
  files: Record<string, string>,
  message: string
) {
  if (Object.keys(files).length === 0) throw new Error("No files to push");
  const octokit = new Octokit({ auth: token });

  // 1. Get the current commit SHA of the default branch
  let baseTreeSha: string | undefined;
  let parentCommitSha: string | undefined;

  try {
    // Try main then master
    const defaultBranch = "main";
    const ref = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    parentCommitSha = ref.data.object.sha;

    const commit = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: parentCommitSha,
    });
    baseTreeSha = commit.data.tree.sha;
  } catch (e) {
    // If empty repo, no parents
    console.log("Empty repo or branch not found, starting fresh.");
  }

  // 2. Create blobs for all files
  const treeItems: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];

  for (const [path, content] of Object.entries(files)) {
    const cleanPath = path.startsWith("./") ? path.slice(2) : path;

    // Skip node_modules or .git if they somehow got in
    if (cleanPath.startsWith("node_modules") || cleanPath.startsWith(".git")) continue;

    const { data: blob } = await octokit.git.createBlob({
      owner,
      repo,
      content,
      encoding: "utf-8",
    });

    treeItems.push({
      path: cleanPath,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // 3. Create a new tree
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha, // If omitted, it assumes everything else is deleted? No, if base_tree is provided, it updates. If not, it's a root tree.
    // Wait, if we want to replace existing or add, using base_tree is safer for incremental.
    // But for a full sync of what we have generated, maybe we want to overwrite?
    // The user usually expects the generated project to be the source of truth.
    // However, recreating the whole tree without base_tree effectively deletes files not in the list.
    // Given this is a generated project, that's likely desired.
    // But to be safe and avoid conflict errors on initial empty repo, let's use base_tree if it exists.
    tree: treeItems,
  });

  // 4. Create commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: parentCommitSha ? [parentCommitSha] : [],
  });

  // 5. Update reference
  try {
     await octokit.git.updateRef({
      owner,
      repo,
      ref: "heads/main",
      sha: newCommit.sha,
    });
  } catch (e) {
    // If ref doesn't exist (empty repo), create it
    await octokit.git.createRef({
        owner,
        repo,
        ref: "refs/heads/main",
        sha: newCommit.sha,
    });
  }

  return { commitUrl: newCommit.html_url };
}
