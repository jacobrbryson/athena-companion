import { api } from "./client";
import type { AthenaAction, PairedDevice } from "./companion";
import type { Workplace } from "./dashboard";
export interface WorkConfig {
  runnerUuid: string;
  jiraCredentialUuid: string;
  githubCredentialUuid: string;
  modelCredentialUuid: string;
  provider: "openai" | "anthropic";
  model: string;
  tokenLimit: number;
  repositories: { name: string; url: string; ref: string }[];
  backup: string;
  backupFormat: "sql" | "sql.gz" | "custom";
  postgresVersion: number;
  recipes: { id: string; repository: string; kind: string; command: string }[];
  /** Supporting services the runner starts beside PostgreSQL. */
  services?: "redis"[];
  /** The demo browser reaches each repository's service as localhost:<port>. */
  localPorts?: { port: number; repository: string }[];
  /** Demo sign-in at an owner-allowed tenant with an encrypted test login. */
  auth?: {
    domain: string;
    loginCredentialUuid: string;
    role: string;
    startLabel?: string | null;
    usernameLabel?: string;
    passwordLabel?: string;
    submitLabel?: string;
  } | null;
  frontendUrl: string;
  backendUrl: string;
  acceptanceField?: string | null;
}
export interface WorkCredential {
  uuid: string;
  provider: string;
  display_name: string;
  external_account_id: string;
  status: string;
}
export interface WorkEnvironment {
  uuid: string;
  workplace_uuid: string;
  name: string;
  config: WorkConfig;
}
export interface WorkSetup {
  environments: WorkEnvironment[];
  workplaces: Workplace[];
  credentials: WorkCredential[];
  devices: PairedDevice[];
}
export interface Adf {
  type: string;
  text?: string;
  attrs?: { href?: string; level?: number };
  content?: Adf[];
  marks?: { type: string }[];
}
export interface WorkComments {
  start: number;
  total: number;
  items: { id: string; author: string; at: string; body: Adf; text: string }[];
}
export interface WorkIssue {
  key: string;
  url: string;
  credentialUuid: string;
  title: string;
  status: string;
  updated: string;
  description: Adf;
  descriptionText: string;
  acceptanceCriteria: string | null;
  assignee: string | null;
  priority: string;
  parent?: string;
  subtasks: { key: string; title: string }[];
  attachments: { name: string; size: number }[];
  comments: WorkComments;
}
export interface WorkRun {
  uuid: string;
  phase: string;
  reason: string | null;
  issue: WorkIssue;
  config: WorkConfig;
  plan?: string;
  plan_hash?: string;
  tokens_used?: number;
  tokens_reserved?: number;
  events?: { id: number; kind: string; detail: unknown; created_at: string }[];
  usage?: {
    payer: string;
    provider: string;
    state: string;
    operation: string;
    usage_json: unknown;
  }[];
  artifacts?: { uuid: string; name: string; mime: string; bytes: number }[];
}
const root = "/api/v1/work-items";
export const workApi = {
  setup: () => api.get<WorkSetup>(`${root}/setup`),
  issue: (url: string) =>
    api.get<WorkIssue>(`${root}/issue?url=${encodeURIComponent(url)}`),
  comments: (i: WorkIssue, start: number) =>
    api.get<WorkComments>(
      `${root}/comments?url=${encodeURIComponent(i.url)}&credential=${i.credentialUuid}&start=${start}`,
    ),
  saveEnvironment: (workplaceUuid: string, name: string, config: WorkConfig) =>
    api.post<{ uuid: string }>(`${root}/environments`, {
      workplaceUuid,
      name,
      config,
    }),
  saveKey: (
    workplaceUuid: string,
    provider: string,
    key: string,
    username?: string,
  ) => api.post(`${root}/keys`, { workplaceUuid, provider, key, username }),
  revokeKey: (workplaceUuid: string, provider: string, uuid: string) =>
    api.post(`${root}/keys/${uuid}/revoke`, { workplaceUuid, provider }),
  runs: () => api.get<WorkRun[]>(`${root}/runs`),
  run: (uuid: string) => api.get<WorkRun>(`${root}/runs/${uuid}`),
  create: (environmentUuid: string, url: string) =>
    api.post<WorkRun>(`${root}/runs`, { environmentUuid, url }),
  propose: (uuid: string, kind: "plan" | "implement", planHash?: string) =>
    api.post<{ action: AthenaAction }>(`${root}/runs/${uuid}/propose`, {
      kind,
      planHash,
    }),
  stop: (uuid: string) => api.post(`${root}/runs/${uuid}/stop`),
  artifact: (uuid: string) => api.blob(`${root}/artifacts/${uuid}`),
};
