// UI fixtures only. These are not the contents or execution results of DRM-9902.
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const issue = (url = "https://vivacitytech.atlassian.net/browse/DEMO-101") => ({
  url,
  key: url.split("/").pop() || "DEMO-101",
  credentialUuid: "c-jira",
  title: "Preview fixture: validate the work-item review flow",
  status: "In Progress",
  priority: "Medium",
  assignee: "Sam Rivera",
  updated: new Date().toISOString(),
  description: doc(
    "This is canned preview data. Open an issue, choose an environment, review the plan and inspect run activity.",
  ),
  descriptionText: "Canned preview data.",
  acceptanceCriteria: "The work issue opens inside the sidebar.",
  subtasks: [],
  attachments: [{ name: "example-reference.png", size: 4096 }],
  comments: {
    start: 0,
    total: 1,
    items: [
      {
        id: "comment-1",
        author: "Preview reviewer",
        at: new Date().toISOString(),
        body: doc(
          "Please demonstrate the sidebar and keep the plan review explicit.",
        ),
        text: "Please demonstrate the sidebar.",
      },
    ],
  },
});
let runs: any[] = [];
let environments: any[] = [
  {
    uuid: "demo-environment",
    workplace_uuid: "w1",
    name: "Dream local · preview only",
    config: {
      runnerUuid: "demo-runner",
      jiraCredentialUuid: "c-jira",
      githubCredentialUuid: "demo-github",
      modelCredentialUuid: "demo-company-key",
      provider: "openai",
      model: "preview-model",
      tokenLimit: 150000,
      repositories: [
        {
          name: "frontend",
          url: "https://github.com/Vivacity-Tech/Dream-Frontend",
          ref: "main",
        },
        {
          name: "backend",
          url: "https://github.com/Vivacity-Tech/Dream-Backend",
          ref: "main",
        },
      ],
      backup: "gs://dream-db-exports/sterilized/PREVIEW.sql.gz",
      backupFormat: "sql.gz",
      postgresVersion: 17,
      recipes: [
        {
          id: "frontend-test",
          repository: "frontend",
          kind: "test",
          command: "npm test",
        },
      ],
      frontendUrl: "http://frontend:3000/",
      backendUrl: "http://backend:3001/health",
    },
  },
];
const proposals = new Map<string, { run: any; kind: string }>();
export function mockWorkItems(method: string, url: URL, body: any): any {
  const p = url.pathname;
  if (p.startsWith("/api/v1/actions/mock-work-") && p.endsWith("/confirm")) {
    const id = p.split("/")[4],
      proposal = proposals.get(id);
    if (!proposal) throw new Error("Preview approval expired");
    const r = proposal.run;
    r.phase = proposal.kind === "implement" ? "blocked" : "awaiting_review";
    r.reason =
      proposal.kind === "implement"
        ? "Preview only: a real paired Docker runner is required to implement and record evidence."
        : null;
    r.plan =
      "# Preview change plan\n\n- Inspect the real issue and acceptance criteria.\n- Confirm the environment baseline.\n- Implement the reviewed change after approval.\n- Run tests and record criterion-specific assertions.\n\nThis is a UI fixture, not a diagnosis of a real Dream issue.";
    r.plan_hash = "preview-plan-hash";
    r.events.unshift({
      id: Date.now(),
      kind: r.phase,
      created_at: new Date().toISOString(),
      detail: { preview: true },
    });
    proposals.delete(id);
    return { success: true, action: { uuid: id, status: "done" } };
  }
  if (!p.startsWith("/api/v1/work-items")) return undefined;
  if (p.endsWith("/setup"))
    return {
      environments,
      workplaces: [
        {
          uuid: "w1",
          name: "Vivacity Tech PBC",
          connections: [
            { uuid: "link-jira", credentialUuid: "c-jira" },
            { uuid: "link-github", credentialUuid: "demo-github" },
            { uuid: "link-model", credentialUuid: "demo-company-key" },
          ],
          emails: [],
          primary: true,
        },
      ],
      credentials: [
        { uuid: "c-jira", provider: "jira", status: "active" },
        {
          uuid: "demo-github",
          provider: "github",
          status: "active",
          external_account_id: "workplace:w1",
          display_name: "Vivacity GitHub · fixture",
        },
        {
          uuid: "demo-company-key",
          provider: "openai",
          status: "active",
          external_account_id: "workplace:w1",
          display_name: "Vivacity OpenAI · fixture",
        },
      ],
      devices: [{ uuid: "demo-runner", name: "Work runner", platform: "web" }],
    };
  if (p.endsWith("/issue"))
    return issue(url.searchParams.get("url") || undefined);
  if (p.endsWith("/comments")) return issue().comments;
  if (p.endsWith("/environments") && method === "POST") {
    const uuid = `preview-env-${Date.now()}`;
    environments.unshift({
      uuid,
      workplace_uuid: body.workplaceUuid,
      name: body.name,
      config: body.config,
    });
    return { uuid };
  }
  if (p.includes("/keys")) return { success: true }; // Never store even fixture API-key inputs.
  if (p.endsWith("/runs") && method === "GET") return runs;
  if (p.endsWith("/runs") && method === "POST") {
    const r = {
      uuid: `preview-run-${Date.now()}`,
      issue: issue(body.url),
      config: environments.find((e) => e.uuid === body.environmentUuid)?.config,
      phase: "draft",
      tokens_used: 0,
      events: [],
      usage: [],
      artifacts: [],
    };
    runs.unshift(r);
    return r;
  }
  const id = p.split("/")[5],
    r = runs.find((r) => r.uuid === id);
  if (!r) throw new Error("Preview run not found");
  if (p.endsWith("/stop")) {
    r.phase = "cancelled";
    return { success: true };
  }
  if (p.endsWith("/propose")) {
    const uuid = `mock-work-${Date.now()}`;
    proposals.set(uuid, { run: r, kind: body.kind });
    return {
      action: {
        uuid,
        summary: `Preview approval: ${body.kind} this client work item in the configured environment.`,
        params: { run_uuid: r.uuid, environment: { recipes: r.config?.recipes ?? [] } },
        status: "pending",
      },
    };
  }
  return r;
}
