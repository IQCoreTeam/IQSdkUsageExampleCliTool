export interface Repository {
  name: string;
  description: string;
  owner: string;
  timestamp: number;
  isPublic: boolean;
}

export interface Commit {
  id: string;
  repoName: string;
  message: string;
  author: string;
  timestamp: number;
  treeTxId: string;
  parentCommitId?: string;
}

export interface FileTree {
  [filePath: string]: {
    txId: string;
    hash: string;
  };
}

export interface Ref {
  repoName: string;
  refName: string;
  commitId: string;
}

export interface Collaborator {
  repoName: string;
  userAddress: string;
  role: "admin" | "writer";
}

export interface Fork {
  originalRepoName: string;
  forkRepoName: string;
  owner: string;
}

export const GIT_CONSTANTS = {
  REPOS_TABLE: "git_repos",
  COMMITS_TABLE: "git_commits",
  REFS_TABLE: "git_refs",
  COLLABORATORS_TABLE: "git_collabs",
  FORKS_TABLE: "git_forks",
};
