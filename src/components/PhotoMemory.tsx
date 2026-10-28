import { useEffect, useRef, useState } from 'react';
import { Drawer, Label } from './Drawer';
import { downscale, savePhoto } from './photoStore';
import { memoryApi, type MemoryEvent } from '../api/companion';
import { BillResultView } from './BillScan';
import type { BillResult } from '../api/propertyTaxes';

/**
 * "Show Athena a photo." The image is downscaled on-device, described by the
 * vision tier (local first), and only the description is stored server-side.
 * The picture itself stays in this browser (IndexedDB), linked by media_ref.
 *
 * A photo of a vehicle registration or property tax bill is recognised on the
 * server and comes back as a bill (BillScan.tsx): one approval card, or a short
 * "check this" sheet. It is not kept as a photo memory — it carries plate and
 * account numbers — unless the person chooses "Keep it as a photo instead".
 */
export function PhotoMemory({ onClose, onTalkAbout }: { onClose: () => void; onTalkAbout: (event: MemoryEvent) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MemoryEvent | null>(null);
  const [bill, setBill] = useState<BillResult | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setSaved(null);
    setBill(null);
    setError(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  async function submit(skipBill = false) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, base64 } = await downscale(file);
      const mediaRef = `photo-${crypto.randomUUID()}`;
      const res = await memoryApi.rememberPhoto({
        imageBase64: base64,
        mimeType: 'image/jpeg',
        caption: caption.trim() || undefined,
        mediaRef,
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
        skipBill,
        today: new Date().toLocaleDateString('en-CA'),
      });
      if (res.bill) {
        setBill(res.bill);
      } else if (res.event) {
        await savePhoto(mediaRef, blob);
        setSaved(res.event);
      }
    } catch (err) {
      setError((err as Error).message || 'Athena could not look at that photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer eyebrow="photo memory" title="Show Athena a photo" onClose={onClose}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {!preview ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="grid h-56 w-full place-items-center rounded border border-dashed border-emerald-500/30 font-mono text-xs uppercase tracking-[0.3em] opacity-70 hover:bg-emerald-500/5"
        >
          <span>
            <span className="mb-2 block text-3xl" aria-hidden>
              📷
            </span>
            Choose or take a photo
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded border border-emerald-500/20">
            <img src={preview} alt="Selected" className="max-h-72 w-full object-contain bg-black" />
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/60">
                <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-emerald-300/20 to-transparent animate-decryptScan" />
                <p className="font-mono text-xs uppercase tracking-[0.3em]">
                  looking<span className="animate-caret">_</span>
                </p>
              </div>
            )}
          </div>

          {bill && (
            <>
              <BillResultView result={bill} onResult={setBill} onClose={onClose} />
              <button onClick={() => void submit(true)} disabled={busy} className="h-10 w-full rounded-full border border-emerald-500/30 px-4 text-sm hover:bg-emerald-500/10 disabled:opacity-30">
                Keep it as a photo instead
              </button>
            </>
          )}

          {!saved && !bill && (
            <>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Anything she should know? (optional)"
                maxLength={300}
                className="h-11 w-full rounded-full bg-white/5 px-4 text-sm outline-none placeholder:opacity-40 focus:bg-white/10"
              />
              <div className="flex gap-2">
                <button onClick={() => void submit()} disabled={busy} className="h-11 flex-1 rounded-full bg-emerald-500/80 text-sm font-semibold text-black disabled:opacity-30 active:scale-95">
                  Remember this
                </button>
                <button onClick={() => inputRef.current?.click()} disabled={busy} className="h-11 rounded-full border border-emerald-500/30 px-4 text-sm hover:bg-emerald-500/10">
                  Change
                </button>
              </div>
            </>
          )}

          {saved && (
            <div className="rounded border border-emerald-500/20 bg-white/[0.03] p-3 animate-missionReady">
              <Label>remembered · {saved.title}</Label>
              <p className="whitespace-pre-line text-sm leading-relaxed opacity-90">{saved.content}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onTalkAbout(saved)} className="h-10 flex-1 rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95">
                  Talk about it
                </button>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setSaved(null);
                    setBill(null);
                    setCaption('');
                  }}
                  className="h-10 rounded-full border border-emerald-500/30 px-4 text-sm hover:bg-emerald-500/10"
                >
                  Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}
      <p className="mt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-40">
        The photo stays on this device. Athena keeps only her description of it — and for a bill, only the details she read.
      </p>
    </Drawer>
  );
}
