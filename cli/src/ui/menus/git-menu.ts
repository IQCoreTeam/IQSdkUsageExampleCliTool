import { GitService } from "../../apps/git/git-service";
import { prompt } from "../../utils/prompt";

const service = new GitService();

const waitForKey = async () => {
  await prompt("\nPress Enter to continue...");
};

const actionInitRepo = async () => {
  console.log("\n--- Init New Repo ---");
  const name = await prompt("Repo Name: ");
  const desc = await prompt("Description: ");

  if (!name) {
    console.log("Name required.");
    return;
  }

  console.log("\nVisibility:");
  console.log("  1) Public (anyone can read)");
  console.log("  2) Private (only owner/collaborators can read)");
  const visChoice = await prompt("Select (default: 1): ");
  const isPublic = visChoice !== "2";

  try {
    await service.createRepo(name, desc, isPublic);
  } catch (e: any) {
    console.error("Error creating repo:", e.message);
  }
  await waitForKey();
};

const actionListRepos = async () => {
  console.log("\n--- Repository List ---");
  try {
    const repos = await service.listRepos();
    if (repos.length === 0) {
      console.log("No repositories found.");
    } else {
      console.table(
        repos.map((r) => ({
          Name: r.name,
          Description: r.description,
          Owner: r.owner.slice(0, 8) + "...",
          Visibility: r.isPublic === false ? "🔒 Private" : "🌐 Public",
        }))
      );
    }
  } catch (e: any) {
    console.error("Error fetching repos:", e.message);
  }
  await waitForKey();
};

const actionCommit = async () => {
  console.log("\n--- Snapshot / Commit ---");

  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("Create a repo first!");
    await waitForKey();
    return;
  }

  console.log("Select Repository to commit to:");
  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const choice = await prompt("Select # (or empty to cancel): ");
  if (!choice) return;

  const idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= repos.length) {
    console.log("Invalid selection.");
    return;
  }

  const repo = repos[idx];
  console.log(`\nSelected Repo: ${repo.name}`);
  console.log(`Current Directory: ${process.cwd()}`);
  console.log(
    "WARNING: This will recursively upload all files in this directory (ignoring node_modules)."
  );

  const confirm = await prompt("Proceed? (y/n): ");
  if (confirm.toLowerCase() !== "y") return;

  const msg = await prompt("Commit Message: ");
  if (!msg) {
    console.log("Message required.");
    return;
  }

  try {
    await service.commit(repo.name, msg);
  } catch (e: any) {
    console.error("Commit failed:", e.message);
  }
  await waitForKey();
};

const actionLog = async () => {
  console.log("\n--- Commit Log ---");

  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const choice = await prompt("Select Repo #: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  try {
    const commits = await service.getLog(repo.name);
    if (commits.length === 0) {
      console.log("No commits found.");
    } else {
      commits.forEach((c) => {
        const date = new Date(c.timestamp).toLocaleString();
        console.log(`\n[${c.id.slice(0, 8)}] ${date}`);
        console.log(`Author: ${c.author}`);
        console.log(`Message: ${c.message}`);
        console.log(`Tree: ${c.treeTxId}`);
      });
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  await waitForKey();
};

const actionCheckout = async () => {
  console.log("\n--- Checkout (Restore) ---");

  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const repoChoice = await prompt("Select Repo #: ");
  if (!repoChoice) return;
  const repo = repos[parseInt(repoChoice) - 1];

  try {
    const commits = await service.getLog(repo.name);
    if (commits.length === 0) {
      console.log("No commits in this repo.");
      await waitForKey();
      return;
    }

    console.log(`\nCommits for ${repo.name}:`);
    commits.forEach((c, i) => {
      const date = new Date(c.timestamp).toLocaleString();
      console.log(`${i + 1}) [${c.id.slice(0, 8)}] ${date} - ${c.message}`);
    });

    const commitChoice = await prompt("\nSelect Commit # to checkout: ");
    if (!commitChoice) return;

    const commitIdx = parseInt(commitChoice) - 1;
    if (commitIdx < 0 || commitIdx >= commits.length) {
      console.log("Invalid selection.");
      return;
    }

    const commit = commits[commitIdx];

    const defaultDir = `./checkout_${commit.id.slice(0, 6)}`;
    const dir = await prompt(`Output Directory (default: ${defaultDir}): `);
    const finalDir = dir || defaultDir;

    await service.checkout(commit.id, finalDir);
  } catch (e: any) {
    console.error("Error during checkout:", e.message);
  }
  await waitForKey();
};

const actionBranching = async () => {
  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const repoChoice = await prompt("Select Repo #: ");
  if (!repoChoice) return;
  const repo = repos[parseInt(repoChoice) - 1];

  console.log(`\n--- Branching: ${repo.name} ---`);
  console.log("1. List Branches");
  console.log("2. Create Branch");

  const choice = await prompt("Option: ");

  if (choice === "1") {
    const branches = await service.listBranches(repo.name);
    if (branches.length === 0) {
      console.log("No branches found.");
    } else {
      console.table(branches);
    }
  } else if (choice === "2") {
    const name = await prompt("New Branch Name: ");
    if (!name) return;

    const commits = await service.getLog(repo.name);
    if (commits.length === 0) {
      console.log("No commits to branch from.");
      return;
    }

    const latest = commits[0];
    console.log(`Latest commit: [${latest.id.slice(0, 8)}] ${latest.message}`);
    const useLatest = await prompt("Point to latest? (y/n): ");

    let commitId = latest.id;
    if (useLatest.toLowerCase() !== "y") {
      const commitChoice = await prompt("Enter Commit ID: ");
      if (!commitChoice) return;
      commitId = commitChoice;
    }

    await service.createBranch(repo.name, name, commitId);
  }
  await waitForKey();
};

const actionClone = async () => {
  console.log("\n--- Clone Repository ---");
  const repoName = await prompt("Repo Name: ");
  if (!repoName) return;

  const dir = await prompt(`Output Directory (default: ./${repoName}): `);
  const finalDir = dir || `./${repoName}`;

  try {
    await service.clone(repoName, finalDir);
  } catch (e: any) {
    console.error("Clone failed:", e.message);
  }
  await waitForKey();
};

const actionStatus = async () => {
  console.log("\n--- Git Status (Diff) ---");

  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const choice = await prompt("Select Repo #: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  try {
    console.log(`Checking status against '${repo.name}'...`);
    const status = await service.status(repo.name);

    console.log("\n--- Status Report ---");

    if (status.added.length > 0) {
      console.log("Untracked / Added files:");
      status.added.forEach((f) => console.log(`  + ${f}`));
    } else {
      console.log("Untracked: None");
    }

    if (status.modified.length > 0) {
      console.log("\nModified files:");
      status.modified.forEach((f) => console.log(`  M ${f}`));
    } else {
      console.log("\nModified: None");
    }

    if (status.deleted.length > 0) {
      console.log("\nDeleted files (in remote but missing locally):");
      status.deleted.forEach((f) => console.log(`  - ${f}`));
    } else {
      console.log("\nDeleted: None");
    }

    console.log(`\nUnchanged files: ${status.unchanged.length}`);
  } catch (e: any) {
    console.error("Status check failed:", e.message);
  }
  await waitForKey();
};

const actionRunApp = async () => {
  console.log("\n--- Run On-Chain App ---");

  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No apps found.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const choice = await prompt("Select App #: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  try {
    await service.run(repo.name);
  } catch (e: any) {
    console.error("Run failed:", e.message);
  }
  await waitForKey();
};

const actionCollaborators = async () => {
  console.log("\n--- Manage Collaborators ---");
  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => console.log(`${i + 1}) ${r.name}`));
  const choice = await prompt("Select Repo #: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  console.log(`\nRepo: ${repo.name}`);
  console.log("1. List Collaborators");
  console.log("2. Add Collaborator");
  const opt = await prompt("Option: ");

  if (opt === "1") {
    const collabs = await service.getCollaborators(repo.name);
    if (collabs.length === 0) console.log("No collaborators.");
    else console.table(collabs);
  } else if (opt === "2") {
    const addr = await prompt("User Wallet Address (Base58): ");
    if (addr) {
      try {
        await service.addCollaborator(repo.name, addr);
      } catch (e: any) {
        console.error("Error:", e.message);
      }
    }
  }
  await waitForKey();
};

const actionFork = async () => {
  console.log("\n--- Fork Repository ---");
  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) =>
    console.log(
      `${i + 1}) ${r.name} (Owner: ${r.owner.slice(0, 8)}...)${
        r.isPublic === false ? " 🔒" : ""
      }`
    )
  );
  const choice = await prompt("Select Repo to Fork: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  const newName = await prompt(`New Repo Name (default: ${repo.name}-fork): `);
  const finalName = newName || `${repo.name}-fork`;

  try {
    await service.forkRepo(repo.name, finalName);
  } catch (e: any) {
    console.error("Fork failed:", e.message);
  }
  await waitForKey();
};

const actionVisibility = async () => {
  console.log("\n--- Manage Visibility ---");
  const repos = await service.listRepos();
  if (repos.length === 0) {
    console.log("No repos.");
    await waitForKey();
    return;
  }

  repos.forEach((r, i) => {
    const visibility = r.isPublic === false ? "🔒 Private" : "🌐 Public";
    console.log(`${i + 1}) ${r.name} [${visibility}]`);
  });

  const choice = await prompt("Select Repo #: ");
  if (!choice) return;
  const repo = repos[parseInt(choice) - 1];

  if (!repo) {
    console.log("Invalid selection.");
    await waitForKey();
    return;
  }

  const currentVisibility = repo.isPublic === false ? "private" : "public";
  console.log(`\nRepo: ${repo.name}`);
  console.log(`Current visibility: ${currentVisibility}`);
  console.log("\n1. Make Public");
  console.log("2. Make Private");

  const opt = await prompt("Option: ");

  if (opt === "1" || opt === "2") {
    const newVisibility = opt === "1";
    try {
      await service.setVisibility(repo.name, newVisibility);
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  }
  await waitForKey();
};

export const runGitMenu = async () => {
  while (true) {
    console.clear();
    console.log("\n============================");
    console.log("       Git on Chain         ");
    console.log("============================\n");
    console.log("  1) Init Repo");
    console.log("  2) List Repos");
    console.log("  3) Commit (Snapshot CWD)");
    console.log("  4) Log");
    console.log("  5) Checkout (Restore)");
    console.log("  6) Branching");
    console.log("  7) Clone");
    console.log("  8) Status (Diff)");
    console.log("  9) Run App (New Internet)");
    console.log(" 10) Collaborators");
    console.log(" 11) Fork Repo");
    console.log(" 12) Visibility (Public/Private)");
    console.log(" 13) Back");
    console.log("\n");

    const choice = await prompt("Select option: ");

    switch (choice) {
      case "1":
        await actionInitRepo();
        break;
      case "2":
        await actionListRepos();
        break;
      case "3":
        await actionCommit();
        break;
      case "4":
        await actionLog();
        break;
      case "5":
        await actionCheckout();
        break;
      case "6":
        await actionBranching();
        break;
      case "7":
        await actionClone();
        break;
      case "8":
        await actionStatus();
        break;
      case "9":
        await actionRunApp();
        break;
      case "10":
        await actionCollaborators();
        break;
      case "11":
        await actionFork();
        break;
      case "12":
        await actionVisibility();
        break;
      case "13":
        return;
      default:
        console.log("Invalid option.");
        await waitForKey();
    }
  }
};
