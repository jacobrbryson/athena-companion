import { useEffect, useState } from "react";
import {
  dashboardApi,
  type WorkplaceInput,
  type Website,
  type WorkplacesOverview,
} from "../api/dashboard";
import { projectsApi, type Project } from "../api/projects";
import { workApi, type WorkCredential } from "../api/workItems";
import { Drawer } from "./Drawer";
import { DrawerButton } from "./ActionControls";
import { WorkplaceForm, LinkForm } from "./Workplaces";
import { WorkspaceAssignments, projectPhase } from "./WorkPage";
import { CompanyCredentials } from "./CompanyCredentials";
import { CompanyReviewSettings } from "./WorkspaceReviewDrawers";
import "./workspaceReviews.css";

/** Existing workspace fields and reversible resource links, using Work's shared controls. */
export function WorkspaceSettingsDrawer({
  workplaceUuid,
  initial,
  onChanged,
  onClose,
  onConnect,
}: {
  workplaceUuid: string;
  initial: WorkplacesOverview;
  onChanged: (o: WorkplacesOverview) => void;
  onClose: () => void;
  onConnect: () => void;
}) {
  const [overview, setOverview] = useState(initial);
  const [credentials, setCredentials] = useState<WorkCredential[] | null>(null);
  const [sites, setSites] = useState<Website[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewVersion, setReviewVersion] = useState(0);
  useEffect(() => {
    setOverview(initial);
  }, [initial]);
  useEffect(() => {
    let live = true;
    const fail = (section: string) => (e: Error) => {
      if (live)
        setLoadErrors((old) => ({
          ...old,
          [section]: e.message || "Could not load this section.",
        }));
    };
    dashboardApi
      .workplaces()
      .then((o) => {
        if (live) setOverview(o);
      })
      .catch(fail("workspace"));
    workApi
      .setup()
      .then((s) => {
        if (live) setCredentials(s.credentials);
      })
      .catch(fail("credentials"));
    dashboardApi
      .websites()
      .then((s) => {
        if (live) setSites(s.sites);
      })
      .catch(fail("sites"));
    projectsApi
      .all()
      .then((s) => {
        if (live)
          setProjects(
            s.projects.filter(
              (p) => p.areas.some((a) => a.area === "work") && projectPhase(p),
            ),
          );
      })
      .catch(fail("projects"));
    return () => {
      live = false;
    };
  }, [workplaceUuid]);
  const place = overview.workplaces.find((w) => w.uuid === workplaceUuid);
  function apply(o: WorkplacesOverview) {
    setOverview(o);
    onChanged(o);
  }
  async function run(
    write: () => Promise<WorkplacesOverview>,
    message: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      apply(await write());
      setNotice(message);
    } catch (e) {
      setError((e as Error).message || "Could not update this workspace.");
    } finally {
      setBusy(false);
    }
  }
  async function save(input: WorkplaceInput) {
    await run(
      () => dashboardApi.saveWorkplace(input, workplaceUuid),
      "Workspace details saved.",
    );
  }
  async function refreshCredentials() {
    const [s, o] = await Promise.all([
      workApi.setup(),
      dashboardApi.workplaces(),
    ]);
    setCredentials(s.credentials);
    apply(o);
    setReviewVersion((v) => v + 1);
  }
  return (
    <Drawer
      wide
      eyebrow={place?.name || "WORKSPACE"}
      title="Edit workspace"
      onClose={onClose}
    >
      <div className="ws-review-drawer ws-workspace-settings">
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {Object.entries(loadErrors).map(([section, message]) => (
          <p role="alert" key={section}>
            {section}: {message}
          </p>
        ))}
        {!place ? (
          <p>This workspace is no longer on your list.</p>
        ) : (
          <>
            <section>
              <h3>Workspace details</h3>
              <WorkplaceForm
                key={place.uuid}
                initial={{
                  name: place.name,
                  role: place.role,
                  domain: place.domain,
                  primary: place.primary,
                  notes: place.notes,
                }}
                busy={busy}
                onSave={(input) => void save(input)}
                onCancel={onClose}
              />
            </section>
            <section>
              <h3>Company keys & review provider</h3>
              {credentials === null ? (
                <p>
                  {loadErrors.credentials
                    ? "Company credentials are unavailable."
                    : "Loading company credentials…"}
                </p>
              ) : (
                <CompanyCredentials
                  workplaceUuid={workplaceUuid}
                  credentials={credentials}
                  onChanged={refreshCredentials}
                />
              )}
              <CompanyReviewSettings
                key={reviewVersion}
                workplaceUuid={workplaceUuid}
                includeCredentials={false}
              />
            </section>
            <section>
              <h3>Connected apps & email addresses</h3>
              {!place.connections.length && !place.emails.length && (
                <p>No connections or email addresses linked yet.</p>
              )}
              <ul className="ws-workspace-links">
                {place.connections.map((c) => (
                  <li key={c.uuid}>
                    <span>
                      {c.label}
                      {c.account ? ` · ${c.account}` : ""}
                      <small>{c.status}</small>
                    </span>
                    <DrawerButton
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            dashboardApi.unlinkWorkplace(workplaceUuid, c.uuid),
                          "App unlinked from this workspace.",
                        )
                      }
                    >
                      Unlink
                    </DrawerButton>
                  </li>
                ))}
                {place.emails.map((e) => (
                  <li key={e.uuid}>
                    <span>{e.email}</span>
                    <DrawerButton
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            dashboardApi.unlinkWorkplace(workplaceUuid, e.uuid),
                          "Email address unlinked.",
                        )
                      }
                    >
                      Unlink
                    </DrawerButton>
                  </li>
                ))}
              </ul>
              <LinkForm
                place={place}
                available={overview.available}
                busy={busy}
                onLink={(link) =>
                  void run(
                    () => dashboardApi.linkWorkplace(workplaceUuid, link),
                    "Workspace connection saved.",
                  )
                }
                onCancel={onClose}
              />
              <DrawerButton onClick={onConnect}>
                Connect another app
              </DrawerButton>
            </section>
            <section>
              <h3>Sites & work projects</h3>
              {sites !== null && projects !== null ? (
                <WorkspaceAssignments
                  workplace={place}
                  places={overview.workplaces}
                  sites={sites}
                  projects={projects}
                  onChanged={apply}
                />
              ) : (
                <p>
                  Sites and work projects{" "}
                  {loadErrors.sites || loadErrors.projects
                    ? "could not be loaded."
                    : "are loading…"}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
