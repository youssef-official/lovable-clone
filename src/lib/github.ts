import { Octokit } from "@octokit/rest";

export async function createGitHubRepo(token: string, name: string) {
  const octokit = new Octokit({ auth: token });

  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();

  // Check if repo exists
  try {
      await octokit.repos.get({ owner: user.login, repo: name });
      // If no error, it exists. Return user info and repo info.
      return { user, repoName: name, exists: true };
  } catch (e: any) {
      if (e.status !== 404) {
          throw e;
      }
  }

  // Create repo
  const { data: repo } = await octokit.repos.createForAuthenticatedUser({
    name,
    auto_init: true, // Init with README so we can commit immediately? Or empty?
    // If we want to push our code, empty is better, or auto_init and we update.
    // Let's do auto_init=false (empty) then we push.
    // Actually, handling empty repo via API is harder (no HEAD).
    // Let's do auto_init=true so we have a HEAD.
  });

  return { user, repoName: repo.name, exists: false };
}

export async function pushToGitHub(token: string, repoOwner: string, repoName: string, files: Record<string, string>, commitMessage: string) {
    const octokit = new Octokit({ auth: token });

    // 1. Get current commit (HEAD)
    // If repo is empty (no commits), this fails.
    let latestCommitSha;
    try {
        const { data: refData } = await octokit.git.getRef({
            owner: repoOwner,
            repo: repoName,
            ref: "heads/main", // Assuming main
        });
        latestCommitSha = refData.object.sha;
    } catch (e) {
        // Maybe 'master'? Or repo is empty.
        // If empty and we used auto_init, it should have main.
        // If we didn't use auto_init, we need to create the first commit differently.
        throw new Error("Repository must have an initial commit (main branch).");
    }

    // 2. Get the tree for the commit
    const { data: commitData } = await octokit.git.getCommit({
        owner: repoOwner,
        repo: repoName,
        commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeItems = [];
    for (const [path, content] of Object.entries(files)) {
        // API usually prefers no leading slash
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;

        const { data: blob } = await octokit.git.createBlob({
            owner: repoOwner,
            repo: repoName,
            content: content,
            encoding: "utf-8",
        });

        treeItems.push({
            path: cleanPath,
            mode: "100644" as const, // file mode
            type: "blob" as const,
            sha: blob.sha,
        });
    }

    // 4. Create new tree
    const { data: newTree } = await octokit.git.createTree({
        owner: repoOwner,
        repo: repoName,
        base_tree: baseTreeSha,
        tree: treeItems,
    });

    // 5. Create new commit
    const { data: newCommit } = await octokit.git.createCommit({
        owner: repoOwner,
        repo: repoName,
        message: commitMessage,
        tree: newTree.sha,
        parents: [latestCommitSha],
    });

    // 6. Update reference (heads/main)
    await octokit.git.updateRef({
        owner: repoOwner,
        repo: repoName,
        ref: "heads/main",
        sha: newCommit.sha,
    });

    return {
        url: `https://github.com/${repoOwner}/${repoName}`,
        commitId: newCommit.sha
    };
}
