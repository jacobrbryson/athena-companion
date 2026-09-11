/**
 * Device-local photo store (IndexedDB).
 *
 * Photo memories keep the image on THIS device: the server only ever stores
 * Athena's description plus an opaque `media_ref`. This store maps that ref
 * to the downscaled JPEG so the Memories panel can show the original. Clearing
 * site data (or another device) simply shows the memory without its picture.
 */

const DB_NAME = 'athena-companion';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(ref: string, blob: Blob): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(blob, ref));
  } catch {
    /* private mode / quota — the memory still exists without its picture */
  }
}

export async function loadPhotoUrl(ref: string): Promise<string | null> {
  try {
    const blob = (await tx<Blob | undefined>('readonly', (s) => s.get(ref))) as Blob | undefined;
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function deletePhoto(ref: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(ref));
  } catch {
    /* ignore */
  }
}

/**
 * Downscale an image file to at most `max` px on the long edge as JPEG, so the
 * upload is small (~100-300 KB) and no full-resolution original ever leaves.
 */
export async function downscale(file: File, max = 1024, quality = 0.82): Promise<{ blob: Blob; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality)
  );
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { blob, base64 };
}
