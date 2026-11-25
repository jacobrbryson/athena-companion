import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The kids' camera: a live viewfinder and a shutter, inside the page.
 *
 * The kid pages used to take photos with `<input type="file" capture>`, which
 * hands the job to the tablet's camera app. The browser on the kids' Fire
 * tablets (Amazon Kids, UA `AmazonKidsBrowser`) ignores that input entirely —
 * tapping it does nothing. Opening the camera in the page with getUserMedia
 * goes through the browser's own camera permission instead.
 *
 * The photo is a still frame from the stream; the stream is stopped the moment
 * the sheet closes, whichever way it closes, so the camera light never stays
 * on. Where the camera can't be opened, "Choose a photo instead" falls back to
 * the file picker, and where there's no getUserMedia at all the button is the
 * file picker, as before.
 */

const MAX_EDGE = 1600;

export function KidCamera({ className, disabled, children, onPhoto }: {
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  onPhoto: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canStream = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    setError('');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        if (!live) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        // Ready comes from the video's own events, not play()'s promise,
        // which some browsers leave pending even while frames are showing.
        if (v) { v.srcObject = stream; void v.play().catch(() => {}); }
      })
      .catch((err: Error) => {
        if (!live) return;
        setError(err?.name === 'NotAllowedError'
          ? 'The camera is turned off for this browser. Ask a grown-up to allow it, or choose a photo instead.'
          : err?.name === 'NotFoundError' ? 'This tablet has no camera we can use. Choose a photo instead.'
          : 'The camera wouldn’t open. Try again, or choose a photo instead.');
      });
    return () => { live = false; stop(); };
  }, [open]);

  function close() { stop(); setOpen(false); }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { setError('That photo didn’t come out. Try again!'); return; }
      close();
      onPhoto(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }

  function choose() { fileRef.current?.click(); }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => (canStream ? setOpen(true) : choose())}>
        {children}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { close(); onPhoto(f); } }} />
      {open && (
        <div className="kid-cam" role="dialog" aria-modal="true" aria-label="Camera">
          <div className="kid-cam-view">
            <video ref={videoRef} playsInline muted autoPlay onLoadedData={() => setReady(true)} onPlaying={() => setReady(true)} />
            {!ready && !error && <p className="kid-cam-msg">Opening the camera…</p>}
            {error && <p className="kid-cam-msg">{error}</p>}
          </div>
          <div className="kid-cam-actions">
            <button type="button" className="kid-btn" onClick={close}>Cancel</button>
            <button type="button" className="kid-btn kid-btn-primary kid-cam-shutter" disabled={!ready} onClick={snap}>📸 Snap!</button>
            <button type="button" className="kid-btn" onClick={choose}>Choose a photo instead</button>
          </div>
        </div>
      )}
    </>
  );
}
