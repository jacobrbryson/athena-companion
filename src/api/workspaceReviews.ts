import { api } from "./client";
import type { AthenaAction } from "./companion";
export interface ReviewSettings {
  keys: { uuid: string; provider: string; name: string }[];
  config: { credentialUuid: string; provider: string; model: string } | null;
}
export interface RepositoryCriteria {
  repository: string;
  criteria: string;
  updatedAt: string | null;
}
export interface ReviewDraft {
  uuid: string;
  state: string;
  body: string;
  headSha: string;
  baseSha: string;
  criteria: string;
  provider: string;
  model: string;
  usage: unknown;
  warnings: string[];
  progress: string | null;
  failure: string | null;
  createdAt: string;
}
export interface PullDetail {
  repository: string;
  number: number;
  title: string;
  description: string;
  author: string;
  state: string;
  draft: boolean;
  url: string;
  headSha: string;
  baseSha: string;
  reviewers: { name: string; state: string }[];
  comments: {
    id: string;
    author: string;
    body: string;
    at: string;
    kind: string;
    path: string | null;
    state: string | null;
  }[];
  truncated: boolean;
  settings: ReviewSettings;
  criteria: RepositoryCriteria;
  review: ReviewDraft | null;
}
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
const root = (uuid: string) =>
  `/api/v1/dashboard/workplaces/${encodeURIComponent(uuid)}`;
const query = (repo: string, number?: number) =>
  new URLSearchParams({
    repository: repo,
    ...(number === undefined ? {} : { number: String(number) }),
  });
export const workspaceReviewsApi = {
  settings: (uuid: string) =>
    api.get<ReviewSettings>(`${root(uuid)}/review-settings`),
  saveSettings: (uuid: string, credentialUuid: string, model: string) =>
    api.patch<ReviewSettings>(`${root(uuid)}/review-settings`, {
      credentialUuid,
      model,
    }),
  criteria: (uuid: string, repo: string) =>
    api.get<RepositoryCriteria>(
      `${root(uuid)}/repository-review?${query(repo)}`,
    ),
  saveCriteria: (uuid: string, repo: string, criteria: string) =>
    api.patch<RepositoryCriteria>(`${root(uuid)}/repository-review`, {
      repository: repo,
      criteria,
    }),
  detail: (uuid: string, repo: string, n: number) =>
    api.get<PullDetail>(`${root(uuid)}/pull-request?${query(repo, n)}`),
  status: (uuid: string, repo: string, n: number) =>
    api.get<ReviewDraft | null>(
      `${root(uuid)}/pull-request/review?${query(repo, n)}`,
    ),
  generate: (uuid: string, p: PullDetail) =>
    api.post<ReviewDraft>(`${root(uuid)}/pull-request/draft`, {
      repository: p.repository,
      number: p.number,
      headSha: p.headSha,
      baseSha: p.baseSha,
    }),
  propose: (uuid: string, p: PullDetail, body: string, event: ReviewEvent) =>
    api.post<{ action: AthenaAction }>(`${root(uuid)}/pull-request/propose`, {
      repository: p.repository,
      pull_number: p.number,
      head_sha: p.headSha,
      base_sha: p.baseSha,
      body,
      event,
    }),
};
