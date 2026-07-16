// Audio utilities: webm → mp3 conversion and IndexedDB storage
// Allows users to download recordings as MP3 and optionally save them
// alongside transcripts for later reference.

import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Convert a webm/opus audio blob to MP3.
 * Decodes the webm to PCM using AudioContext, then encodes to MP3.
 * Returns a Blob with type audio/mpeg.
 */
export async function webmToMp3(webmBlob: Blob): Promise<Blob> {
  // Decode webm to PCM
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  // Get PCM data from the first channel (mono)
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Encode to MP3 at 128kbps
  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const blockSize = 1152; // MP3 frame size
  const mp3Data: Int8Array[] = [];
  let offset = 0;

  while (offset < int16Samples.length) {
    const chunk = int16Samples.subarray(offset, offset + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf));
    }
    offset += blockSize;
  }

  const end = encoder.flush();
  if (end.length > 0) {
    mp3Data.push(new Int8Array(end));
  }

  // Combine all MP3 chunks into one blob
  const totalLength = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
  const mp3Bytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of mp3Data) {
    mp3Bytes.set(chunk, pos);
    pos += chunk.length;
  }

  return new Blob([mp3Bytes], { type: "audio/mpeg" });
}

/**
 * Trigger a browser download of a blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// IndexedDB storage for audio recordings
// ============================================================

const DB_NAME = "marqad-audio";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an audio blob to IndexedDB, associated with a session ID.
 */
export async function saveAudioToDB(sessionId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: sessionId, blob, date: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Retrieve an audio blob from IndexedDB by session ID.
 */
export async function getAudioFromDB(sessionId: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(sessionId);
    request.onsuccess = () => { db.close(); resolve(request.result?.blob || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/**
 * Delete an audio blob from IndexedDB by session ID.
 */
export async function deleteAudioFromDB(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(sessionId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
