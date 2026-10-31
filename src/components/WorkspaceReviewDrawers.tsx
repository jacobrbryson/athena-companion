import { useEffect, useState } from "react";
import {
  workspaceReviewsApi,
  type PullDetail,
  type RepositoryCriteria,
  type ReviewDraft,
  type ReviewEvent,
  type ReviewSettings,
} from "../api/workspaceReviews";
import { actionsApi, type AthenaAction } from "../api/companion";
import { Drawer } from "./Drawer";
import { DrawerButton } from "./ActionControls";
import { Markdown } from "./Markdown";
import { CompanyCredentials } from "./CompanyCredentials";
import "./workspaceReviews.css";

const errorText = (e: unknown) =>
  (e as Error).message || "This request could not be completed.";

/** Extract readable text from GitHub's mixed Markdown/HTML without rendering HTML. */
function discussionText(source: string): string {
  // Code examples are literal text, including any HTML they demonstrate.
  return source.split(/(`{3,}[^\n]*\n[\s\S]*?(?:\n`{3,}|$)|~{3,}[^\n]*\n[\s\S]*?(?:\n~{3,}|$)|`+[^`\n]*`+)/g)
    .map((part, index) => {
      if (index % 2 || !/<!--|<\/?[a-z][\w-]*(?:\s[^<>]*|\/?)>/i.test(part)) return part;
      // A template is inert: embedded scripts, images and event handlers never run.
      const template = document.createElement("template");
      template.innerHTML = part;
      template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());
      template.content.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
      template.content.querySelectorAll("img").forEach((node) => node.replaceWith(node.getAttribute("alt") || ""));
      template.content.querySelectorAll("p, div, section, details, summary, li, tr, h1, h2, h3, h4, h5, h6, pre, blockquote")
        .forEach((node) => { node.prepend("\n"); node.append("\n"); });
      template.content.querySelectorAll("td, th").forEach((node) => node.append(" "));
      return template.content.textContent || "";
    }).join("");
}

function discussionType(state: string | null): string {
  switch (state?.toUpperCase()) {
    case "APPROVED":
    case "APPROVE":
      return "Approval";
    case "CHANGES_REQUESTED":
    case "REQUEST_CHANGES":
      return "Requested changes";
    default:
      return "Comment";
  }
}

export function RepositoryReviewDrawer({
  workplaceUuid,
  repository,
  onClose,
}: {
  workplaceUuid: string;
  repository: string;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<RepositoryCriteria | null>(null);
  const [criteria, setCriteria] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    workspaceReviewsApi
      .criteria(workplaceUuid, repository)
      .then((r) => {
        if (live) {
          setSaved(r);
          setCriteria(r.criteria);
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [workplaceUuid, repository]);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSaved(
        await workspaceReviewsApi.saveCriteria(
          workplaceUuid,
          repository,
          criteria,
        ),
      );
      setNotice(
        "Review criteria saved. Future Athena reviews will use these criteria.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      wide
      eyebrow="REPOSITORY"
      title={repository}
      onClose={onClose}
      footer={
        <DrawerButton
          primary
          disabled={busy || !saved || saved.criteria === criteria.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save review criteria"}
        </DrawerButton>
      }
    >
      <div className="ws-review-drawer">
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!saved ? (
          <p>
            {error
              ? "Criteria could not be loaded. Close and reopen to retry."
              : "Loading review criteria…"}
          </p>
        ) : (
          <>
            <label htmlFor="repository-review-criteria">Review Criteria</label>
            <p>
              Tell the review agents what matters in this repository:
              conventions, risks, tests and checks to prioritize.
            </p>
            <textarea
              id="repository-review-criteria"
              rows={16}
              maxLength={16000}
              value={criteria}
              disabled={busy}
              onChange={(e) => {
                setCriteria(e.target.value);
                setNotice("");
              }}
              placeholder="For example: check database migrations for safe rollbacks, validate permission checks, and flag regressions in public APIs."
            />
          </>
        )}
      </div>
    </Drawer>
  );
}

export function CompanyReviewSettings({
  workplaceUuid,
  includeCredentials = true,
}: {
  workplaceUuid: string;
  includeCredentials?: boolean;
}) {
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [credential, setCredential] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() {
    const s = await workspaceReviewsApi.settings(workplaceUuid);
    setSettings(s);
    setCredential(s.config?.credentialUuid || s.keys[0]?.uuid || "");
    setModel(s.config?.model || "");
  }
  useEffect(() => {
    let live = true;
    workspaceReviewsApi
      .settings(workplaceUuid)
      .then((s) => {
        if (live) {
          setSettings(s);
          setCredential(s.config?.credentialUuid || s.keys[0]?.uuid || "");
          setModel(s.config?.model || "");
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [workplaceUuid]);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSettings(
        await workspaceReviewsApi.saveSettings(
          workplaceUuid,
          credential,
          model,
        ),
      );
      setNotice("Review provider saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-review-drawer">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!settings ? (
        <p>
          {error
            ? "Settings could not be loaded."
            : "Loading company settings…"}
        </p>
      ) : (
        <>
          {includeCredentials && (
            <CompanyCredentials
              workplaceUuid={workplaceUuid}
              providers={["openai", "anthropic"]}
              credentials={settings.keys.map((k) => ({
                uuid: k.uuid,
                provider: k.provider,
                display_name: k.name,
                external_account_id: `workplace:${workplaceUuid}`,
                status: "active",
              }))}
              onChanged={refresh}
            />
          )}
          <section>
            <h3>Athena review provider</h3>
            {!settings.keys.length ? (
              <p>Add a company AI API key above to enable reviews.</p>
            ) : (
              <>
                <label>
                  Company AI key
                  <select
                    value={credential}
                    disabled={busy}
                    onChange={(e) => {
                      setCredential(e.target.value);
                      setModel("");
                    }}
                  >
                    {settings.keys.map((k) => (
                      <option key={k.uuid} value={k.uuid}>
                        {k.name} · {k.provider}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Model ID
                  <input
                    value={model}
                    disabled={busy}
                    maxLength={100}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Enter a model ID available to this company key"
                    autoComplete="off"
                  />
                </label>
                <p>
                  Reviews use this key and model only. Existing company
                  environment settings are used until you save a choice here.
                </p>
                <DrawerButton
                  primary
                  disabled={busy || !credential || !model.trim()}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save review provider"}
                </DrawerButton>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function PullRequestReviewDrawer({
  workplaceUuid,
  repository,
  number,
  onClose,
  onReviewChanged,
  onManageKeys,
  onRepository,
}: {
  workplaceUuid: string;
  repository: string;
  number: number;
  onClose: () => void;
  onReviewChanged: () => void;
  onManageKeys: () => void;
  onRepository: () => void;
}) {
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<AthenaAction | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [editorCommit, setEditorCommit] = useState<{
    head: string;
    base: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    workspaceReviewsApi
      .detail(workplaceUuid, repository, number)
      .then((d) => {
        if (live) {
          setDetail(d);
          setReview(d.review);
          setBody(d.review?.body || "");
          setEditorCommit({
            head: d.review?.headSha || d.headSha,
            base: d.review?.baseSha || d.baseSha,
          });
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [workplaceUuid, repository, number]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const stale =
    !!detail &&
    !!editorCommit &&
    (editorCommit.head !== detail.headSha ||
      editorCommit.base !== detail.baseSha);
  const running = review?.state === "generating";
  // A review runs in the background, so the drawer only watches it finish.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      workspaceReviewsApi
        .status(workplaceUuid, repository, number)
        .then((r) => {
          setReview(r);
          if (r?.state === "generating") return;
          onReviewChanged();
          if (r?.state === "ready") {
            setBody(r.body);
            setNotice(
              "Athena’s review is ready to edit. Nothing has been submitted.",
            );
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [running, workplaceUuid, repository, number]); // eslint-disable-line react-hooks/exhaustive-deps
  const canGenerate =
    !!detail &&
    detail.state === "open" &&
    detail.settings.keys.length > 0 &&
    !!detail.settings.config &&
    !running &&
    !pending;
  async function prepare(event: ReviewEvent) {
    if (!detail) return;
    const { action } = await workspaceReviewsApi.propose(
      workplaceUuid,
      detail,
      body,
      event,
    );
    if (action.status === "done") {
      setNotice("This review has already been submitted.");
      setResultUrl(action.result_ref || "");
    } else if (action.status === "pending") setPending(action);
    else
      setNotice(
        `The existing submission is ${action.status}. Refresh the PR to check GitHub.`,
      );
  }
  return (
    <Drawer
      wide
      eyebrow={`${repository} · #${number}`}
      title={detail?.title || "Pull Request"}
      onClose={onClose}
    >
      <div className="ws-review-drawer">
        <div className="ws-review-actions">
          <DrawerButton
            primary
            disabled={busy || !canGenerate}
            onClick={() =>
              void act(async () => {
                const r = await workspaceReviewsApi.generate(
                  workplaceUuid,
                  detail!,
                );
                setReview(r);
                setBody("");
                setEditorCommit({ head: r.headSha, base: r.baseSha });
                setResultUrl("");
                onReviewChanged();
              })
            }
          >
            {running
              ? "Reviewing…"
              : busy && !pending
                ? "Working…"
                : "Let Athena Review"}
          </DrawerButton>
          <DrawerButton
            disabled={busy || !!pending}
            onClick={() =>
              void act(async () => {
                const d = await workspaceReviewsApi.detail(
                  workplaceUuid,
                  repository,
                  number,
                );
                setDetail(d);
                setReview(d.review);
                if (!body.trim()) {
                  setBody(d.review?.body || "");
                  setEditorCommit({
                    head: d.review?.headSha || d.headSha,
                    base: d.review?.baseSha || d.baseSha,
                  });
                }
              })
            }
          >
            Refresh PR
          </DrawerButton>
          <DrawerButton disabled={busy || !!pending} onClick={onManageKeys}>
            Company AI keys
          </DrawerButton>
          <a
            href={`https://github.com/${repository}/pull/${number}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in GitHub ↗
          </a>
        </div>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!detail ? (
          <p>
            {error
              ? "PR details could not be loaded. Use Refresh PR to retry."
              : "Loading pull request…"}
          </p>
        ) : (
          <>
            {!detail.settings.keys.length && (
              <div className="ws-review-alert" role="alert">
                Athena needs at least one company AI API key to review this pull
                request.{" "}
                <DrawerButton onClick={onManageKeys}>
                  Add a company AI key
                </DrawerButton>
              </div>
            )}
            {detail.settings.keys.length > 0 && !detail.settings.config && (
              <div className="ws-review-alert" role="alert">
                Choose the company AI key and model to use for reviews.{" "}
                <DrawerButton onClick={onManageKeys}>
                  Configure reviews
                </DrawerButton>
              </div>
            )}
            {detail.state !== "open" && (
              <p role="alert">
                This pull request is closed. Reviews cannot be submitted here.
              </p>
            )}
            <p>
              {detail.author} · {detail.state}
              {detail.draft ? " · Draft" : ""} · Commit{" "}
              <code>{detail.headSha.slice(0, 8)}</code>
            </p>
            <DrawerButton disabled={busy || !!pending} onClick={onRepository}>
              Repository review criteria
            </DrawerButton>
            <section>
              <h3>Description</h3>
              <Markdown
                source={discussionText(detail.description) || "No description provided."}
              />
            </section>
            <section>
              <h3>Reviewers</h3>
              {detail.reviewers.length ? (
                <ul>
                  {detail.reviewers.map((r, i) => (
                    <li key={`${r.name}-${i}`}>
                      <strong>{r.name}</strong> · {r.state.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No reviewers yet.</p>
              )}
            </section>
            <section>
              <h3>Comments & reviews</h3>
              {detail.truncated && (
                <p role="alert">
                  This discussion is larger than the read limit. Open GitHub for
                  the complete thread.
                </p>
              )}
              {!detail.comments.length ? (
                <p>No comments yet.</p>
              ) : (
                detail.comments.map((c) => (
                  <details className="ws-review-comment" key={c.id}>
                    <summary>
                      <strong>{c.author}</strong>
                      <span>{discussionType(c.state)}</span>
                      <time dateTime={c.at}>{new Date(c.at).toLocaleString()}</time>
                    </summary>
                    <div className="ws-review-comment-body">
                      {c.path && <code>{c.path}</code>}
                      <Markdown source={discussionText(c.body)} />
                    </div>
                  </details>
                ))
              )}
            </section>
            <section>
              <h3>Athena review</h3>
              <p>
                {review
                  ? `${review.provider} · ${review.model} · ${review.headSha.slice(0, 8)}`
                  : "Generate a review, then edit the draft before submitting."}
              </p>
              {running && (
                <p role="status">
                  Athena is reviewing this in the background
                  {review?.progress ? ` (${review.progress})` : ""}. You can
                  close this and follow it in Athena’s Agents.
                </p>
              )}
              {review?.state === "unknown" && (
                <p role="alert">
                  {review.failure || "The last review call did not finish."} It
                  may have incurred company usage; check provider billing before
                  trying again.
                </p>
              )}
              {review?.state === "failed" && (
                <p role="alert">
                  {review.failure ||
                    "The last model response was unreadable. Nothing was submitted."}
                </p>
              )}
              {stale && (
                <p role="alert">
                  This draft is for an older commit. Generate a new review
                  before submitting.
                </p>
              )}
              {review?.warnings.map((w) => (
                <p className="ws-review-alert" key={w}>
                  {w}
                </p>
              ))}
              <label htmlFor="athena-pr-review">Review text</label>
              <textarea
                id="athena-pr-review"
                rows={14}
                maxLength={32000}
                value={body}
                disabled={busy || !!pending || running}
                onChange={(e) => {
                  setBody(e.target.value);
                  setResultUrl("");
                }}
              />
              <p>
                Submits through this company’s linked GitHub account. Each
                submission requires your confirmation.
              </p>
              <div className="ws-review-actions">
                {(
                  [
                    ["COMMENT", "Comment"],
                    ["APPROVE", "Approve"],
                    ["REQUEST_CHANGES", "Request Changes"],
                  ] as const
                ).map(([event, label]) => (
                  <DrawerButton
                    key={event}
                    disabled={
                      busy ||
                      !!pending ||
                      !body.trim() ||
                      stale ||
                      running ||
                      detail.state !== "open"
                    }
                    onClick={() => void act(() => prepare(event))}
                  >
                    {label}
                  </DrawerButton>
                ))}
              </div>
            </section>
            {pending && (
              <section className="ws-review-alert">
                <h3>Confirm GitHub review</h3>
                <p>{pending.summary}</p>
                <pre>{String(pending.params?.body || "")}</pre>
                <div className="ws-review-actions">
                  <DrawerButton
                    primary
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        let r;
                        try {
                          r = await actionsApi.confirm(pending.uuid);
                        } catch (e) {
                          setPending(null);
                          throw new Error(
                            `${errorText(e)} Check this PR on GitHub before preparing another submission.`,
                          );
                        }
                        setResultUrl(r.action.result_ref || "");
                        setPending(null);
                        setNotice("Review submitted to GitHub.");
                        const d = await workspaceReviewsApi.detail(
                          workplaceUuid,
                          repository,
                          number,
                        );
                        setDetail(d);
                      })
                    }
                  >
                    Confirm submission
                  </DrawerButton>
                  <DrawerButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await actionsApi.decline(pending.uuid);
                        setPending(null);
                      })
                    }
                  >
                    Cancel submission
                  </DrawerButton>
                </div>
              </section>
            )}
            {resultUrl && (
              <a href={resultUrl} target="_blank" rel="noopener noreferrer">
                View submitted review on GitHub ↗
              </a>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
