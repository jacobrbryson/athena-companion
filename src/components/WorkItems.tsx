import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Drawer, Label } from "./Drawer";
import { DrawerButton } from "./ActionControls";
import { Markdown } from "./Markdown";
import { actionsApi, devicesApi, type AthenaAction } from "../api/companion";
import {
  workApi,
  type Adf,
  type WorkConfig,
  type WorkIssue,
  type WorkRun,
  type WorkSetup,
} from "../api/workItems";
import "./workItems.css";

/** ADF is provider data, never HTML. Only safe structural nodes are rendered. */
export function JiraDocument({ node }: { node?: Adf | null }): ReactNode {
  if (!node) return null;
  if (node.type === "text") return node.text || "";
  const children = node.content?.map((n, i) => (
    <Fragment key={i}>
      <JiraDocument node={n} />
    </Fragment>
  ));
  if (node.type === "hardBreak") return <br />;
  if (node.type === "bulletList") return <ul>{children}</ul>;
  if (node.type === "orderedList") return <ol>{children}</ol>;
  if (node.type === "listItem") return <li>{children}</li>;
  if (node.type === "codeBlock") return <pre>{children}</pre>;
  if (node.type === "blockquote") return <blockquote>{children}</blockquote>;
  if (node.type === "heading") return <h3>{children}</h3>;
  if (node.type === "paragraph") return <p>{children}</p>;
  if (node.type === "mention")
    return <span>{(node.attrs as { text?: string })?.text || "@mention"}</span>;
  return <>{children}</>;
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Work is unavailable.";
const preset = (): WorkConfig => ({
  runnerUuid: "",
  jiraCredentialUuid: "",
  githubCredentialUuid: "",
  modelCredentialUuid: "",
  provider: "openai",
  model: "",
  tokenLimit: 150000,
  postgresVersion: 17,
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
  backup: "gs://dream-db-exports/sterilized/",
  backupFormat: "sql.gz",
  // Dream's `start` scripts: craco on 8081, ts-node on PORT or 8080. The backend
  // has no health route, so the check accepts any non-5xx answer from /.
  frontendUrl: "http://frontend:8081/",
  backendUrl: "http://backend:8080/",
  // Dream's local config calls http://localhost:8080 and its developers browse
  // http://localhost:8081; the demo browser sees the same two addresses.
  services: ["redis"],
  localPorts: [
    { port: 8081, repository: "frontend" },
    { port: 8080, repository: "backend" },
  ],
  // Dream's test tenant, as in both repositories' untracked .env files (public
  // SPA values, not secrets). The owner must also allow the domain in
  // WORK_AUTH_DOMAINS. Set the role, or remove this block to plan without a
  // signed-in demo.
  auth: {
    domain: "dream-test.us.auth0.com",
    loginCredentialUuid: "",
    role: "MINIMAL_ROLE_FOR_TICKET",
    startLabel: null,
    usernameLabel: "Email address",
    passwordLabel: "Password",
    submitLabel: "Continue",
  },
  acceptanceField: null,
  recipes: [
    {
      id: "frontend-install",
      repository: "frontend",
      kind: "install",
      command: "npm ci",
    },
    {
      id: "backend-install",
      repository: "backend",
      kind: "install",
      command: "npm ci",
    },
    {
      id: "frontend-test",
      repository: "frontend",
      kind: "test",
      // craco test is Jest in watch mode unless CI is set; it would never exit.
      command: "CI=true npm test -- --watchAll=false",
    },
    {
      id: "backend-test",
      repository: "backend",
      kind: "test",
      // Without REDIS_HOST_URL Dream falls back to a hosted Redis address.
      command: "REDIS_HOST_URL=redis:6379 npm test -- --runInBand",
    },
    {
      id: "frontend-start",
      repository: "frontend",
      kind: "start",
      // No `dev` script exists; the host check would reject the private hostname.
      command:
        'NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=3072" BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_AUTH0_DOMAIN=dream-test.us.auth0.com REACT_APP_AUTH0_CLIENT_ID=NxVQTaPNKofycgDEZ56nMASN2W3OmYiW REACT_APP_AUTH0_AUDIENCE=https://dream-test.us.auth0.com/api/v2/ npm start',
    },
    {
      id: "backend-start",
      repository: "backend",
      kind: "start",
      // `dev` forces NODE_ENV=development through nodemon; `start` keeps the sandbox's.
      command:
        "REDIS_HOST_URL=redis:6379 allowedOrigins=http://localhost:8081 AUTH0_DOMAIN=dream-test.us.auth0.com AUTH0_AUDIENCE=https://dream-test.us.auth0.com/api/v2/ npm start",
    },
  ],
});

type ApprovedEnvironment = {
  recipes?: { id: string; kind: string; command: string }[];
};

/** The exact commands this approval authorizes, from the server-normalized params. */
function ApprovedRecipes({ params }: { params: AthenaAction["params"] }) {
  const recipes = (params?.environment as ApprovedEnvironment | undefined)
    ?.recipes;
  if (!recipes?.length) return null;
  return (
    <ul className="wi-recipes" aria-label="Commands this approval runs">
      {recipes.map((r) => (
        <li key={r.id}>
          <span>
            {r.id} · {r.kind}
          </span>
          <code>{r.command}</code>
        </li>
      ))}
    </ul>
  );
}

export function WorkItems({
  issueUrl,
  onCloseIssue,
}: {
  issueUrl: string | null;
  onCloseIssue: () => void;
}) {
  const [setup, setSetup] = useState<WorkSetup | null>(null);
  const [runs, setRuns] = useState<WorkRun[]>([]);
  const [settings, setSettings] = useState(false);
  const [issue, setIssue] = useState<WorkIssue | null>(null);
  const [run, setRun] = useState<WorkRun | null>(null);
  const [environment, setEnvironment] = useState("");
  const [tab, setTab] = useState("issue");
  const [pending, setPending] = useState<AthenaAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([workApi.setup(), workApi.runs()]);
    setSetup(s);
    setRuns(r);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(errorText(e)));
  }, [refresh]);
  useEffect(() => {
    let live = true;
    if (issueUrl) {
      setIssue(null);
      setRun(null);
      setPending(null);
      setTab("issue");
      setError("");
      workApi
        .issue(issueUrl)
        .then((i) => {
          if (live) setIssue(i);
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        });
    }
    return () => {
      live = false;
    };
  }, [issueUrl]);
  useEffect(() => {
    let live = true;
    const id = setInterval(() => {
      workApi
        .runs()
        .then((r) => {
          if (live) setRuns(r);
        })
        .catch(() => undefined);
      if (run)
        workApi
          .run(run.uuid)
          .then((r) => {
            if (live) setRun(r);
          })
          .catch((e) => {
            if (live) setError(errorText(e));
          });
    }, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [run?.uuid]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("run");
    if (id)
      workApi
        .run(id)
        .then((r) => {
          setRun(r);
          setIssue(r.issue);
          setTab("plan");
        })
        .catch((e) => setError(errorText(e)));
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setIssue(null);
    setRun(null);
    setPending(null);
    onCloseIssue();
  };
  const openRun = (r: WorkRun) =>
    act(async () => {
      const full = await workApi.run(r.uuid);
      setRun(full);
      setIssue(full.issue);
      setPending(null);
      setTab("plan");
    });
  const propose = (kind: "plan" | "implement") =>
    act(async () => {
      const r = run || (await workApi.create(environment, issue!.url));
      setRun(r);
      setIssue(r.issue);
      setPending((await workApi.propose(r.uuid, kind, r.plan_hash)).action);
      setTab("plan");
    });
  return (
    <section className="work-items section-panel-wide">
      <header>
        <div>
          <h2>Work runs</h2>
          <p>
            Plan, review and verify changes in your own development environment.
          </p>
        </div>
        <DrawerButton onClick={() => setSettings(true)}>
          Development environments & keys
        </DrawerButton>
      </header>
      <form
        className="wi wi-open-ticket"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            const i = await workApi.issue(ticketUrl);
            setIssue(i);
            setRun(null);
            setPending(null);
            setTab("issue");
          });
        }}
      >
        <label>
          Open a Jira issue by URL
          <input
            type="url"
            required
            value={ticketUrl}
            onChange={(e) => setTicketUrl(e.target.value)}
            placeholder="https://your-site.atlassian.net/browse/KEY-123"
          />
        </label>
        <DrawerButton disabled={busy || !ticketUrl} type="submit">
          Open issue
        </DrawerButton>
      </form>
      {error && !issue && !settings && <p role="alert">{error}</p>}
      {!runs.length ? (
        <p>No work runs yet. Open a Jira issue to prepare a plan.</p>
      ) : (
        <ul className="wi-runs">
          {runs.map((r) => (
            <li key={r.uuid}>
              <button onClick={() => void openRun(r)}>
                <strong>
                  {r.issue.key} · {r.issue.title}
                </strong>
                <span>{r.phase.replace(/_/g, " ")}</span>
                {r.reason && <small>{r.reason}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {settings && (
        <EnvironmentSetup
          setup={setup}
          onClose={() => setSettings(false)}
          refresh={refresh}
        />
      )}
      {(issue || issueUrl || run) && !settings && (
        <Drawer
          wide
          eyebrow={issue?.key || "JIRA"}
          title={issue?.title || "Loading issue…"}
          onClose={close}
          footer={
            <div className="wi-actions">
              {!run && (
                <>
                  <select
                    aria-label="Development environment"
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="">Choose environment</option>
                    {setup?.environments
                      .filter(
                        (e) =>
                          !issue ||
                          e.config.jiraCredentialUuid === issue.credentialUuid,
                      )
                      .map((e) => (
                        <option key={e.uuid} value={e.uuid}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                  <DrawerButton
                    primary
                    disabled={!issue || !environment || busy}
                    onClick={() => void propose("plan")}
                  >
                    Plan
                  </DrawerButton>
                </>
              )}
              {run?.phase === "draft" && !pending && (
                <DrawerButton
                  primary
                  disabled={busy}
                  onClick={() => void propose("plan")}
                >
                  Review planning approval
                </DrawerButton>
              )}
              {run?.phase === "awaiting_review" && !pending && (
                <DrawerButton
                  primary
                  disabled={busy}
                  onClick={() => void propose("implement")}
                >
                  Approve & implement…
                </DrawerButton>
              )}
              {run &&
                !["cancelled", "ready_for_review"].includes(run.phase) && (
                  <DrawerButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await workApi.stop(run.uuid);
                        setRun(await workApi.run(run.uuid));
                        setPending(null);
                      })
                    }
                  >
                    Stop
                  </DrawerButton>
                )}
            </div>
          }
        >
          <div className="wi">
            <nav aria-label="Issue views">
              {["issue", "plan", "run", "evidence"].map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            {error && <p role="alert">{error}</p>}
            {run && (
              <p className="wi-status" role="status">
                {run.phase.replace(/_/g, " ")}
                {run.reason && ` · ${run.reason}`}
              </p>
            )}
            {pending && (
              <section className="wi-approval">
                <h3>Confirm this action</h3>
                <p>{pending.summary}</p>
                <ApprovedRecipes params={pending.params} />
                <p>
                  Company tokens fund ticket work. Athena funds orchestration
                  and voice. Only the listed environment and recipes are
                  authorized.
                </p>
                <DrawerButton
                  primary
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await actionsApi.confirm(pending.uuid);
                      setPending(null);
                      setRun(await workApi.run(run!.uuid));
                      await refresh();
                    })
                  }
                >
                  Confirm approval
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
                  Decline
                </DrawerButton>
              </section>
            )}
            {tab === "issue" && issue && (
              <>
                <a href={issue.url} target="_blank" rel="noopener noreferrer">
                  Open in Jira ↗
                </a>
                <p>
                  {issue.status} · {issue.priority} ·{" "}
                  {issue.assignee || "Unassigned"}
                </p>
                <Label>Description</Label>
                <JiraDocument node={issue.description} />
                {issue.acceptanceCriteria && (
                  <>
                    <Label>Acceptance criteria</Label>
                    <pre>{issue.acceptanceCriteria}</pre>
                  </>
                )}
                {issue.parent && <p>Parent: {issue.parent}</p>}
                {issue.subtasks.map((t) => (
                  <p key={t.key}>
                    {t.key} · {t.title}
                  </p>
                ))}
                {issue.attachments.length > 0 && (
                  <>
                    <Label>Attachments</Label>
                    {issue.attachments.map((a, i) => (
                      <p key={i}>
                        {a.name} · {Math.ceil(a.size / 1024)} KB
                      </p>
                    ))}
                  </>
                )}
                <Label>Comments</Label>
                {issue.comments.start > 0 && (
                  <p>Showing the latest comments for this run.</p>
                )}
                {issue.comments.items.map((c) => (
                  <article key={c.id}>
                    <small>
                      {c.author} · {new Date(c.at).toLocaleString()}
                    </small>
                    <JiraDocument node={c.body} />
                  </article>
                ))}
                {issue.comments.start === 0 &&
                  issue.comments.items.length < issue.comments.total && (
                    <DrawerButton
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const page = await workApi.comments(
                            issue,
                            issue.comments.items.length,
                          );
                          setIssue({
                            ...issue,
                            comments: {
                              ...page,
                              start: 0,
                              items: [...issue.comments.items, ...page.items],
                            },
                          });
                        })
                      }
                    >
                      Load more comments
                    </DrawerButton>
                  )}
              </>
            )}
            {tab === "plan" && (
              <>
                {run?.plan ? (
                  <Markdown source={run.plan} />
                ) : (
                  <p>
                    The planning run will check the environment and produce a
                    reviewable plan here.
                  </p>
                )}
                {run?.phase === "awaiting_review" && (
                  <p>
                    To request changes, stop this attempt and start a fresh
                    plan. The approved plan is immutable.
                  </p>
                )}
                {run && (
                  <details>
                    <summary>Approved environment and recipes</summary>
                    <pre>{JSON.stringify(run.config, null, 2)}</pre>
                  </details>
                )}
              </>
            )}
            {tab === "run" && (
              <>
                <p>
                  Company tokens used: {run?.tokens_used ?? 0} ·
                  reserved/unknown: {run?.tokens_reserved ?? 0}
                </p>
                {run?.events?.map((e) => (
                  <article key={e.id}>
                    <strong>{e.kind.replace(/_/g, " ")}</strong>
                    <pre>{JSON.stringify(e.detail, null, 2)}</pre>
                  </article>
                ))}
                {run?.usage?.map((u, i) => (
                  <p key={i}>
                    {u.payer} · {u.provider} · {u.operation} · {u.state}
                  </p>
                ))}
              </>
            )}
            {tab === "evidence" && (
              <>
                {!run?.artifacts?.length && (
                  <p>
                    Tests, the patch and the narrated recording appear here
                    after implementation. A recording alone does not confirm
                    acceptance.
                  </p>
                )}
                {run?.artifacts?.map((a) => (
                  <WorkArtifact key={a.uuid} artifact={a} />
                ))}
              </>
            )}
          </div>
        </Drawer>
      )}
    </section>
  );
}
function WorkArtifact({
  artifact,
}: {
  artifact: { uuid: string; name: string; mime: string };
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let object = "";
    workApi
      .artifact(artifact.uuid)
      .then((b) => {
        object = URL.createObjectURL(b);
        if (live) setUrl(object);
        else URL.revokeObjectURL(object);
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      live = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [artifact.uuid]);
  return (
    <article>
      {error && <p role="alert">{error}</p>}
      {url && (
        <>
          {artifact.mime === "video/mp4" && (
            <video controls src={url} preload="metadata" />
          )}
          <a href={url} download={artifact.name}>
            Download {artifact.name}
          </a>
        </>
      )}
    </article>
  );
}
function EnvironmentSetup({
  setup,
  onClose,
  refresh,
}: {
  setup: WorkSetup | null;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [workplace, setWorkplace] = useState(setup?.workplaces[0]?.uuid || "");
  const [name, setName] = useState("Dream local");
  const [config, setConfig] = useState(JSON.stringify(preset(), null, 2));
  const [provider, setProvider] = useState("github");
  const [key, setKey] = useState("");
  const [username, setUsername] = useState("");
  const isLogin = provider === "work_login";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const fill = () => {
    const c = JSON.parse(config) as WorkConfig;
    const w = setup?.workplaces.find((w) => w.uuid === workplace);
    const keys =
      setup?.credentials.filter(
        (k) =>
          w?.connections.some((l) => l.credentialUuid === k.uuid) &&
          k.status === "active",
      ) || [];
    c.githubCredentialUuid =
      keys.find((k) => k.provider === "github")?.uuid || "";
    c.jiraCredentialUuid = keys.find((k) => k.provider === "jira")?.uuid || "";
    c.modelCredentialUuid =
      keys.find((k) => k.provider === c.provider)?.uuid || "";
    if (c.auth)
      c.auth.loginCredentialUuid =
        keys.find((k) => k.provider === "work_login")?.uuid || "";
    c.runnerUuid =
      setup?.devices.find((d) => /work runner/i.test(d.name))?.uuid || "";
    setConfig(JSON.stringify(c, null, 2));
  };
  return (
    <Drawer
      wide
      eyebrow="CLIENT DEVELOPMENT"
      title="Environments & company keys"
      onClose={onClose}
    >
      <div className="wi wi-setup">
        {error && <p role="alert">{error}</p>}
        <label>
          Client
          <select
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
          >
            <option value="">Choose workplace</option>
            {setup?.workplaces.map((w) => (
              <option key={w.uuid} value={w.uuid}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <h3>Company credentials</h3>
        <p>
          Keys are encrypted on the server. Ticket work uses the selected
          company key; orchestration and Athena’s voice use core funding.
        </p>
        <select
          aria-label="Credential provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="github">GitHub read token</option>
          <option value="openai">OpenAI API key</option>
          <option value="anthropic">Anthropic API key</option>
          <option value="work_login">Demo test login (minimal role)</option>
        </select>
        {isLogin && (
          <label>
            Test login username
            <input
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
        )}
        <label>
          {isLogin ? "Test login password" : "API key"}
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <DrawerButton
          disabled={busy || !key || !workplace || (isLogin && !username)}
          onClick={() => {
            const value = key;
            setKey("");
            void act(async () => {
              await workApi.saveKey(
                workplace,
                provider,
                value,
                isLogin ? username : undefined,
              );
              await refresh();
            });
          }}
        >
          Save encrypted key
        </DrawerButton>
        {setup?.credentials
          .filter((k) => k.external_account_id === `workplace:${workplace}`)
          .map((k) => (
            <p key={k.uuid}>
              {k.display_name} · {k.status}{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await workApi.revokeKey(workplace, k.provider, k.uuid);
                    await refresh();
                  })
                }
              >
                Revoke
              </button>
            </p>
          ))}
        <h3>Pair this computer</h3>
        <p>
          Run the local work-runner package with the core API URL and this
          pairing code. Keep Docker running. Pairing grants revocable access to
          your account; use only your own computer.
        </p>
        <DrawerButton
          disabled={busy}
          onClick={() =>
            void act(async () =>
              setCode(
                (await devicesApi.pairingCode("Work runner", "web")).code,
              ),
            )
          }
        >
          Create pairing code
        </DrawerButton>
        <DrawerButton disabled={busy} onClick={() => void act(refresh)}>
          Refresh setup
        </DrawerButton>
        {code && <pre>{code}</pre>}
        <h3>Save an environment revision</h3>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p>
          The Dream preset is a starting point. Confirm branches, an exact
          sterilized backup object, model ID, ports and every shell recipe
          before saving. Database access inside containers uses DATABASE_URL. Do
          not put secrets in this configuration.
        </p>
        <DrawerButton
          disabled={busy}
          onClick={() => void act(async () => fill())}
        >
          Fill linked credential and runner IDs
        </DrawerButton>
        <label>
          Reviewed configuration
          <textarea
            rows={26}
            spellCheck={false}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
          />
        </label>
        <DrawerButton
          primary
          disabled={busy || !workplace}
          onClick={() =>
            void act(async () => {
              await workApi.saveEnvironment(
                workplace,
                name,
                JSON.parse(config),
              );
              await refresh();
            })
          }
        >
          Save new revision
        </DrawerButton>
        {setup?.environments.map((e) => (
          <article key={e.uuid}>
            <strong>{e.name}</strong>
            <small> · {e.uuid.slice(0, 8)}</small>
            <button
              onClick={() => {
                setWorkplace(e.workplace_uuid);
                setName(e.name);
                setConfig(JSON.stringify(e.config, null, 2));
              }}
            >
              Copy configuration
            </button>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
