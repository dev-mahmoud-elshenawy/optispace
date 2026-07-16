-- CreateTable
CREATE TABLE "GithubPullRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repo" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT NOT NULL,
    "reviewDecision" TEXT,
    "checksStatus" TEXT,
    "headBranch" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "updatedAtRemote" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "GithubPullRequest_state_idx" ON "GithubPullRequest"("state");

-- CreateIndex
CREATE UNIQUE INDEX "GithubPullRequest_repo_number_key" ON "GithubPullRequest"("repo", "number");

