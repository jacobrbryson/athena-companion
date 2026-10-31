// Preview fixtures only. No provider calls, GitHub writes, or secret storage.
import type {
  ReviewSettings,
  ReviewDraft,
  PullDetail,
} from "../src/api/workspaceReviews";
const criteria = new Map<string, string>();
const configs = new Map<string, ReviewSettings["config"]>();
const companyKeys = new Map<string, ReviewSettings["keys"]>();
const drafts = new Map<string, ReviewDraft>();
const submissions = new Map<string, any>();
const comments = new Map<string, PullDetail["comments"]>();
const settings = (company: string): ReviewSettings => ({
  keys: companyKeys.get(company) || [],
  config: configs.get(company) || null,
});
/** The preview's reviews as Athena's Agents lists them. */
export const mockReviewRuns = () =>
  [...drafts].map(([thread, d]) => {
    const [workplaceUuid, repo, n] = thread.split(":");
    return {
      uuid: d.uuid,
      kind: "review",
      repo,
      summary: `#${n} Pull request #${n} · preview`,
      state: d.state === "generating" ? "working" : d.state,
      progress: d.progress,
      failure: d.failure,
      workplaceUuid,
      number: Number(n),
      at: d.createdAt,
    };
  });
export function mockWorkspaceReviews(method: string, url: URL, body: any): any {
  const parts = url.pathname.split("/");
  if (
    url.pathname.startsWith("/api/v1/work-items/keys") &&
    method === "POST" &&
    ["openai", "anthropic"].includes(body?.provider)
  ) {
    const company = body.workplaceUuid;
    const existing = companyKeys.get(company) || [];
    const uuid = `preview-${company}-${body.provider}`;
    companyKeys.set(company, [
      ...existing.filter((k) => k.uuid !== uuid),
      ...(url.pathname.endsWith("/revoke")
        ? []
        : [
            {
              uuid,
              provider: body.provider,
              name: `Company ${body.provider} · fixture`,
            },
          ]),
    ]);
    return { success: true };
  }
  if (url.pathname.startsWith("/api/v1/actions/preview-pr-")) {
    const action = submissions.get(parts[4]);
    if (!action) throw new Error("Preview proposal not found.");
    action.status = url.pathname.endsWith("/confirm") ? "done" : "declined";
    if (action.status === "done") {
      action.result_ref = `https://github.com/${action.params.repository}/pull/${action.params.pull_number}`;
      const list = comments.get(action.thread) || [];
      list.push({
        id: action.uuid,
        author: "Company GitHub account · preview",
        body: action.params.body,
        at: new Date().toISOString(),
        kind: "Review",
        state: action.params.event,
        path: null,
      });
      comments.set(action.thread, list);
    }
    return { success: true, action };
  }
  if (parts[4] !== "workplaces") return undefined;
  const company = decodeURIComponent(parts[5] || ""),
    route = parts[6];
  if (!["review-settings", "repository-review", "pull-request"].includes(route))
    return undefined;
  const repo = (
    body?.repository ||
    url.searchParams.get("repository") ||
    ""
  ).toLowerCase();
  const n = Number(
    body?.number || body?.pull_number || url.searchParams.get("number"),
  );
  const id = `${company}:${repo}`,
    thread = `${id}:${n}`;
  if (route === "review-settings") {
    if (method === "PATCH") {
      const k = settings(company).keys.find(
        (k) => k.uuid === body.credentialUuid,
      );
      if (!k) throw new Error("Select a company key.");
      configs.set(company, {
        credentialUuid: k.uuid,
        provider: k.provider,
        model: body.model,
      });
    }
    return settings(company);
  }
  if (route === "repository-review") {
    if (method === "PATCH") criteria.set(id, body.criteria);
    return {
      repository: repo,
      criteria: criteria.get(id) || "",
      updatedAt: null,
    };
  }
  if (parts[7] === "draft") {
    const config = settings(company).config;
    if (!config) throw new Error("Configure a company review key and model.");
    const c = criteria.get(id) || "";
    const d: ReviewDraft = {
      uuid: `preview-draft-${Date.now()}`,
      state: "generating",
      progress: "Part 1 of 3",
      failure: null,
      headSha: "a".repeat(40),
      baseSha: "b".repeat(40),
      criteria: c,
      provider: config.provider,
      model: config.model,
      usage: { preview: true },
      warnings: ["Preview fixture: no repository code was analyzed."],
      createdAt: new Date().toISOString(),
      body: "",
    };
    drafts.set(thread, d);
    setTimeout(() => {
      d.state = "ready";
      d.progress = null;
      d.body = `## Athena review · preview only\n\nThis is a fixture demonstrating the editable review flow. No provider was called.\n\nRepository criteria used:\n${c || "(No repository criteria saved.)"}\n\n- Verify the changed behavior with regression tests.\n- Check error handling and permission boundaries.`;
    }, 12000);
    return { ...d };
  }
  if (parts[7] === "review") {
    const d = drafts.get(thread);
    return d ? { ...d } : null;
  }
  if (parts[7] === "propose") {
    const action = {
      uuid: `preview-pr-${Date.now()}`,
      status: "pending",
      action_id: "submit_workspace_review",
      summary: `${body.event}: ${repo}#${n} · preview only`,
      params: body,
      thread,
    };
    submissions.set(action.uuid, action);
    return { action };
  }
  return {
    repository: repo,
    number: n,
    title: `Pull request #${n} · preview`,
    description:
      "## Change description\n\nPreview fixture for the PR details drawer. This change adds validation and regression tests.",
    author: "Preview author",
    state: "open",
    draft: false,
    url: `https://github.com/${repo}/pull/${n}`,
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    reviewers: [{ name: "Preview reviewer", state: "Requested" }],
    comments: comments.get(thread) || [
      {
        id: "fixture-comment",
        author: "Preview reviewer",
        body: "Please include a regression test for the failure case.",
        at: new Date().toISOString(),
        kind: "Comment",
        path: null,
        state: null,
      },
    ],
    truncated: false,
    settings: settings(company),
    criteria: {
      repository: repo,
      criteria: criteria.get(id) || "",
      updatedAt: null,
    },
    review: drafts.get(thread) || null,
  } satisfies PullDetail;
}
