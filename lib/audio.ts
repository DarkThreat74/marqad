// Audio utilities: webm → wav/mp3 conversion and IndexedDB storage
// Allows users to download recordings as MP3 and optionally save them
// alongside transcripts for later reference.

import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Decode any audio blob (webm, mp3, wav, etc.) to PCM samples using AudioContext.
 * Returns Float32Array of mono samples and the sample rate.
 */
async function decodeAudio(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  // Mix down to mono if needed
  let samples: Float32Array;
  if (audioBuffer.numberOfChannels > 1) {
    const channel1 = audioBuffer.getChannelData(0);
    const channel2 = audioBuffer.getChannelData(1);
    samples = new Float32Array(channel1.length);
    for (let i = 0; i < channel1.length; i++) {
      samples[i] = (channel1[i] + channel2[i]) / 2;
    }
  } else {
    samples = audioBuffer.getChannelData(0);
  }

  return { samples, sampleRate: audioBuffer.sampleRate };
}

/**
 * Convert Float32 samples to 16-bit PCM and encode as a WAV file.
 * This is the optimal format for Speechmatics Batch API (16-bit PCM).
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Build WAV header
  const buffer = new ArrayBuffer(44 + int16.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint8(0, "R".charCodeAt(0));
  view.setUint8(1, "I".charCodeAt(0));
  view.setUint8(2, "F".charCodeAt(0));
  view.setUint8(3, "F".charCodeAt(0));
  view.setUint32(4, 36 + int16.length * 2, true);
  view.setUint8(8, "W".charCodeAt(0));
  view.setUint8(9, "A".charCodeAt(0));
  view.setUint8(10, "V".charCodeAt(0));
  view.setUint8(11, "E".charCodeAt(0));

  // fmt chunk
  view.setUint8(12, "f".charCodeAt(0));
  view.setUint8(13, "m".charCodeAt(0));
  view.setUint8(14, "t".charCodeAt(0));
  view.setUint8(15, " ".charCodeAt(0));
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  view.setUint8(36, "d".charCodeAt(0));
  view.setUint8(37, "a".charCodeAt(0));
  view.setUint8(38, "t".charCodeAt(0));
  view.setUint8(39, "a".charCodeAt(0));
  view.setUint32(40, int16.length * 2, true);

  // Write PCM data
  const pcmView = new Int16Array(buffer, 44, int16.length);
  pcmView.set(int16);

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Convert a webm/opus audio blob to WAV (16-bit PCM).
 * This is required because the Speechmatics Batch API does NOT support
 * webm format — only wav, mp3, aac, ogg, mpeg, amr, m4a, mp4, flac.
 * WAV is the optimal format (no transcoding needed server-side).
 */
export async function webmToWav(webmBlob: Blob): Promise<Blob> {
  const { samples, sampleRate } = await decodeAudio(webmBlob);
  return encodeWav(samples, sampleRate);
}

/**
 * Convert a webm/opus audio blob to MP3.
 * Decodes the webm to PCM using AudioContext, then encodes to MP3.
 * Returns a Blob with type audio/mpeg.
 */
export async function webmToMp3(webmBlob: Blob): Promise<Blob> {
  // Decode webm to PCM (reuse shared decoder)
  const { samples, sampleRate } = await decodeAudio(webmBlob);

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

// ============================================================
// Supabase Storage — upload/download audio to the cloud
// Audio files are stored in the 'marqad-audio' bucket so they
// persist across devices and browsers.
// ============================================================

import { createClient } from "@supabase/supabase-js";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Upload an audio blob to Supabase Storage.
 * Returns the storage path (e.g. "marqad-user/session-123.webm")
 * or null if the upload failed.
 */
export async function uploadAudioToStorage(
  sessionId: string,
  blob: Blob
): Promise<string | null> {
  const client = getStorageClient();
  if (!client) {
    console.warn("[Marqad] Supabase not configured — audio not uploaded");
    return null;
  }

  const path = `marqad-user/${sessionId}.webm`;
  try {
    const { error } = await client.storage
      .from("marqad-audio")
      .upload(path, blob, {
        contentType: "audio/webm",
        upsert: true,
      });

    if (error) {
      console.warn("[Marqad] Audio upload failed:", error.message);
      return null;
    }

    console.log("[Marqad] Audio uploaded to storage:", path);
    return path;
  } catch (err) {
    console.warn("[Marqad] Audio upload error:", err);
    return null;
  }
}

/**
 * Get a public URL for an audio file in Supabase Storage.
 */
export function getAudioUrl(audioPath: string): string | null {
  const client = getStorageClient();
  if (!client) return null;

  try {
    const { data } = client.storage
      .from("marqad-audio")
      .getPublicUrl(audioPath);
    return data.publicUrl;
  } catch {
    return null;
  }
}
