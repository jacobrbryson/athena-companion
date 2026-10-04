import { useState } from 'react';
import { Label } from './Drawer';
import { dashboardApi, type AlertTestResult } from '../api/dashboard';
import { usePulsePointAlerts } from '../athena/useAndroidPush';

/**
 * Emergency alerts on this phone: letting Athena read PulsePoint Respond's
 * notifications, using the phone's position for each call, and the test
 * alerts that walk a made-up call or warning through the real steps.
 *
 * Lives on the Community page under the points of interest it checks calls
 * against (it was the lower half of the old Watched places drawer).
 */
/** watch.testAlert's steps, in words. */
const STEP_LABELS: Record<string, string> = {
  places: 'Points of interest',
  alert: 'Made a test warning',
  parsed: 'Read the call',
  placed: 'Found the address',
  near: 'Inside a ring',
  push: 'Sent to your devices',
};

type TestRow = { label: string; ok: boolean; detail?: string | null };
type TestReport = { kind: 'pulsepoint' | 'weather'; ok: boolean; rows: TestRow[]; note?: string };

function rowsFrom(result: AlertTestResult | null | undefined): TestRow[] {
  return (result?.steps || []).map((s) => ({ label: STEP_LABELS[s.step] || s.step, ok: s.ok, detail: s.detail }));
}

const errorText = (e: unknown, fallback: string) => {
  const err = e as Error & { body?: { message?: string } };
  return err?.body?.message || err?.message || fallback;
};

export function EmergencyAlertSetup() {
  const pulsePoint = usePulsePointAlerts();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);

  /**
   * "Test PulsePoint alert" / "Test weather alert". In the Android app the
   * PulsePoint test goes through the phone's own forwarding request, so it
   * proves the phone -> Athena leg too; anywhere else it starts at the server.
   */
  async function runTest(kind: 'pulsepoint' | 'weather') {
    setError(null);
    setReport(null);
    setBusy(`test-${kind}`);
    try {
      if (kind === 'pulsepoint' && pulsePoint.available) {
        const r = await pulsePoint.test();
        const rows: TestRow[] = [{ label: 'Phone paired with Athena', ok: r.paired }];
        if (r.paired) rows.push({ label: 'Phone reached Athena', ok: !!r.status && r.status < 300, detail: r.status ? `HTTP ${r.status}` : null });
        rows.push(...rowsFrom(r.server));
        // An older server treats the test as an ordinary notification and
        // answers without steps — that is not a pass.
        if (r.paired && !r.server?.steps?.length) rows.push({ label: 'Athena ran the test', ok: false, detail: 'no test steps in the reply' });
        const note = !r.listening
          ? "The test went through, but real PulsePoint alerts won't reach me until you allow notification access above."
          : !r.location
            ? 'Calls are checked against your points of interest. Allow location above to have them checked against where you are, too.'
            : undefined;
        setReport({ kind, ok: rows.every((x) => x.ok), rows, note });
      } else {
        const r = await dashboardApi.testAlert(kind);
        setReport({ kind, ok: r.ok, rows: rowsFrom(r) });
      }
    } catch (err) {
      setError(errorText(err, 'The test could not run.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="alert-setup">
      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}
      {pulsePoint.available && pulsePoint.state !== 'checking' && (
        <section className="mt-4 rounded border border-emerald-500/15 bg-white/[0.02] p-3">
          <Label>911 calls on this phone</Label>
          <p className="text-xs leading-relaxed opacity-70">
            <strong>PulsePoint Respond</strong> notifies you about 911 calls — if you let me read those notifications,
            I'll place them against your rings and tell you about the close ones.
          </p>
          <p className="mt-2 font-mono text-[10px] opacity-45">
            {pulsePoint.state === 'on'
              ? 'on · I can read PulsePoint alerts here'
              : pulsePoint.state === 'app-missing'
                ? "off · I can't see PulsePoint Respond on this phone"
                : 'off · I cannot see PulsePoint alerts'}
          </p>
          {/* The "is it installed?" answer is a hint, never a gate: Android
              hides other apps from us unless they are declared in the manifest,
              and an older build of Athena will always answer no. Offer the
              switch regardless and let the person decide. */}
          {pulsePoint.state !== 'on' && (
            <>
              <button
                type="button"
                onClick={() => void pulsePoint.open()}
                className="mt-2 rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black"
              >
                Let me read PulsePoint alerts
              </button>
              <p className="mt-1.5 text-[11px] opacity-50">
                Android opens its own settings screen — find <strong>Athena</strong> in the list and switch it on. I only
                ever read PulsePoint's notifications; everything else on your phone is ignored.
                {pulsePoint.state === 'app-missing' && ' If PulsePoint Respond is installed, this still works.'}
              </p>
              <p className="mt-2 text-[11px] opacity-50">
                If Android says <strong>Restricted setting</strong> or Athena's switch is greyed out: open Athena's app
                info, tap <strong>⋮</strong> (top right) → <strong>Allow restricted settings</strong>, then come back and
                tap the button above again. Android does this for apps not installed from the Play Store.
              </p>
              <button
                type="button"
                onClick={() => void pulsePoint.openAppInfo()}
                className="mt-1.5 rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300"
              >
                Open Athena's app info
              </button>
            </>
          )}
          {pulsePoint.state === 'on' && (
            <>
              <button
                type="button"
                onClick={() => void pulsePoint.openPulsePointSettings()}
                className="mt-2 rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300"
              >
                Make PulsePoint's own alerts silent
              </button>
              <p className="mt-1.5 text-[11px] opacity-50">
                I read every one of PulsePoint's notifications and dismiss them right away — you shouldn't see them in
                your tray. This opens PulsePoint's own notification settings so you can turn its sound and pop-up off
                too, since only PulsePoint (or you) can do that. Choose <strong>Silent</strong>, not{' '}
                <strong>Off</strong> — Off would stop me seeing them as well.
              </p>
              <div className="mt-3 border-t border-emerald-500/10 pt-3">
                <p className="text-xs leading-relaxed opacity-70">
                  <strong>Near you, too.</strong> When a call comes in, I can check it against where this phone is as well
                  as your points of interest — only at that moment, never on a schedule.
                </p>
                <p className="mt-1 font-mono text-[10px] opacity-45">
                  {pulsePoint.location ? "on · I'll check calls against where you are" : 'off · points of interest only'}
                </p>
                {!pulsePoint.location && (
                  <>
                    <button
                      type="button"
                      onClick={() => void pulsePoint.enableLocation()}
                      className="mt-2 rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                    >
                      Use this phone's location
                    </button>
                    <p className="mt-1.5 text-[11px] opacity-50">
                      Choose <strong>Allow all the time</strong> — PulsePoint alerts arrive while I'm closed, and
                      "only while using the app" would mean I never see where you are when it matters.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <section className="mt-4 rounded border border-emerald-500/15 bg-white/[0.02] p-3">
        <Label>test alerts</Label>
        <p className="text-xs leading-relaxed opacity-70">
          A made-up call or warning at one of your points of interest, sent through the same steps a real one takes, then to your
          phone. Nothing is saved and nothing shows in the banner.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTest('pulsepoint')}
            className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
          >
            {busy === 'test-pulsepoint' ? 'Testing…' : 'Test PulsePoint alert'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTest('weather')}
            className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
          >
            {busy === 'test-weather' ? 'Testing…' : 'Test weather alert'}
          </button>
        </div>
        {report && (
          <div className="mt-3">
            <p className="text-xs font-semibold">
              {report.ok
                ? 'Sent — check your phone.'
                : `The ${report.kind === 'weather' ? 'weather' : 'PulsePoint'} test stopped at the step marked below.`}
            </p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]">
              {report.rows.map((row) => (
                <li key={row.label} className={row.ok ? 'opacity-60' : ''} style={row.ok ? undefined : { color: 'var(--gd-error)' }}>
                  {row.ok ? '✓' : '✗'} {row.label}
                  {row.detail ? ` · ${row.detail}` : ''}
                </li>
              ))}
            </ul>
            {report.note && <p className="mt-1.5 text-[11px] opacity-60">{report.note}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
