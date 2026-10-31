import { useState } from "react";
import { workApi, type WorkCredential } from "../api/workItems";
import { DrawerButton } from "./ActionControls";

/** Shared encrypted company-key editor; secrets are cleared before dispatch and never returned. */
export function CompanyCredentials({
  workplaceUuid,
  credentials,
  onChanged,
  providers = ["github", "openai", "anthropic", "work_login"],
}: {
  workplaceUuid: string;
  credentials: WorkCredential[];
  onChanged: () => Promise<void>;
  providers?: string[];
}) {
  const [provider, setProvider] = useState(providers[0]);
  const [key, setKey] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const login = provider === "work_login";
  const labels: Record<string, string> = {
    github: "GitHub token",
    openai: "OpenAI API key",
    anthropic: "Anthropic API key",
    work_login: "Demo test login (minimal role)",
  };
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await onChanged();
      setNotice("Company credentials updated.");
    } catch (e) {
      setError((e as Error).message || "Could not update company credentials.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="company-credentials">
      <h3>Company credentials</h3>
      <p>
        Keys are encrypted on the server and belong to this company. AI review
        calls use the selected company key.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label>
        Credential provider
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setKey("");
          }}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </select>
      </label>
      {login && (
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
        {login ? "Test login password" : "API key"}
        <input
          type="password"
          autoComplete="new-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <DrawerButton
        disabled={
          busy || !key.trim() || !workplaceUuid || (login && !username.trim())
        }
        onClick={() => {
          const secret = key;
          setKey("");
          void act(async () => {
            await workApi.saveKey(
              workplaceUuid,
              provider,
              secret,
              login ? username : undefined,
            );
          });
        }}
      >
        Save encrypted key
      </DrawerButton>
      {credentials
        .filter(
          (k) =>
            k.external_account_id === `workplace:${workplaceUuid}` &&
            providers.includes(k.provider),
        )
        .map((k) => (
          <p key={k.uuid}>
            {k.display_name} · {k.status}{" "}
            <DrawerButton
              disabled={busy || k.status !== "active"}
              onClick={() =>
                void act(async () => {
                  await workApi.revokeKey(workplaceUuid, k.provider, k.uuid);
                })
              }
            >
              Revoke
            </DrawerButton>
          </p>
        ))}
    </section>
  );
}
