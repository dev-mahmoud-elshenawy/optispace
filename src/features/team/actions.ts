"use server";

import { fetchTeamWorkItems, getAzureDevOpsConfig } from "@/features/integrations/azure-devops/service";

import type { TeamFetchResult, TeamWindow } from "./types";

export type TeamWorkResult = ({ ok: true } & TeamFetchResult) | { ok: false; error: string };

// Live read — no cache, no table. The error string is guaranteed non-empty: an Error with a
// blank .message renders as nothing in a `{error ? … : null}` view (see the ADO adoError note).
export async function loadTeamWork(input: {
  project: string;
  iterationPath: string | null;
  windowDays: TeamWindow;
}): Promise<TeamWorkResult> {
  if (!(await getAzureDevOpsConfig())) {
    return { ok: false, error: "Azure DevOps isn't configured yet — add your org URL and PAT in Settings." };
  }
  try {
    const result = await fetchTeamWorkItems(input);
    return { ok: true, ...result };
  } catch (error) {
    console.error("[optispace] Team work query failed", error);
    const message = error instanceof Error ? error.message : "";
    return { ok: false, error: message || "Couldn't read team work from Azure DevOps." };
  }
}
