"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  CONFIG,
  type Segment,
  type WordToken,
  type ViewFormat,
  type SessionRecord,
  type UsageStats,
  speakerColor,
  classifyWord,
  classifyPause,
  formatTimestamp,
  float32ToInt16,
  buildStartRecognition,
  buildExportText,
  isArabicText,
  loadHistory,
  saveSession,
  deleteSession,
  getUsageStats,
  addToMonthlySeconds,
  loadMonthlySeconds,
  exportHistoryJSON,
  importHistoryJSON,
} from "@/lib/marqad";

// ============================================================
// Memoized segment view
// ============================================================

function renderWords(seg: Segment): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let sentenceInitial = true;
  for (let i = 0; i < seg.words.length; i++) {
    const w = seg.words[i];
    if (w.type === "spacing") {
      nodes.push(<span key={i}> </span>);
      continue;
    }
    if (w.type === "punctuation") {
      nodes.push(<span key={i}>{w.content}</span>);
      if (/[.!?؟。]/.test(w.content)) sentenceInitial = true;
      continue;
    }
    // Always add a space before a word unless it's the very first token.
    // This fixes: "word.word" → "word. word" and Arabic word concatenation.
    if (nodes.length > 0) {
      nodes.push(<span key={`sp-${i}`}> </span>);
    }
    const classes = classifyWord(w, sentenceInitial);
    nodes.push(
      <span key={i} className={classes.join(" ")}>
        {w.content}
      </span>
    );
    sentenceInitial = false;
  }
  return nodes;
}

const SegmentView = memo(function SegmentView({
  segment,
  format,
  prevSpeaker,
}: {
  segment: Segment;
  format: ViewFormat;
  prevSpeaker: string | null;
}) {
  const speakerChanged = prevSpeaker !== segment.speaker;
  const color = speakerColor(segment.speaker);

  if (format === "dialogue") {
    return (
      <div className="dialogue-line">
        <div className="dialogue-meta">
          [{formatTimestamp(segment.audioStart)}]{" "}
          <span className="speaker-swatch" style={{ background: color }} />
          <span className="speaker-label">Speaker {segment.speaker}</span>
        </div>
        <span>{renderWords(segment)}</span>
      </div>
    );
  }

  if (format === "notes") {
    return (
      <div className="notes-block">
        <div className="notes-header">
          <span className="speaker-swatch" style={{ background: color }} />
          <span className="speaker-label">
            Speaker {segment.speaker} · {formatTimestamp(segment.audioStart)}
          </span>
        </div>
        <span>{renderWords(segment)}</span>
      </div>
    );
  }

  return (
    <span>
      {segment.spacing === "line" && <br />}
      {segment.spacing === "paragraph" && (
        <>
          <br />
          <br />
        </>
      )}
      {segment.spacing === "divider" && (
        <hr className="spacing-divider" />
      )}
      {speakerChanged && (
        <span
          className="speaker-dot"
          style={{ background: color }}
          title={`Speaker ${segment.speaker}`}
        />
      )}
      {renderWords(segment)}
    </span>
  );
});

// ============================================================
// History Panel
// ============================================================

function HistoryPanel({
  open,
  onClose,
  history,
  onDelete,
  onView,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  history: SessionRecord[];
  onDelete: (id: string) => void;
  onView: (record: SessionRecord) => void;
  onImport: (json: string) => void;
}) {
  const [viewing, setViewing] = useState<SessionRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!open) return null;

  const handleExport = () => {
    const json = exportHistoryJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marqad-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onImport(reader.result as string);
      } catch {
        setImportError("Invalid backup file");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <>
      <div className="history-overlay" onClick={onClose} />
      <div className="history-panel">
        <div className="history-header">
          <h2 className="history-title">History</h2>
          <button className="history-close" onClick={onClose} aria-label="Close history">
            ✕
          </button>
        </div>

        {!viewing && (
          <div className="history-actions">
            <button className="history-action-btn" onClick={handleExport} disabled={history.length === 0}>
              ↓ Backup
            </button>
            <button className="history-action-btn" onClick={handleImportClick}>
              ↑ Restore
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelected}
              style={{ display: "none" }}
            />
          </div>
        )}
        {importError && <div className="history-import-error">{importError}</div>}

        {viewing ? (
          <div className="history-viewer">
            <button className="history-back" onClick={() => setViewing(null)}>
              ← Back
            </button>
            <div className="history-viewer-meta">
              {new Date(viewing.date).toLocaleString()} ·{" "}
              {Math.round(viewing.durationSec / 60)} min ·{" "}
              {viewing.segmentCount} segments
            </div>
            <div className="history-viewer-actions">
              <button
                className="history-action-btn"
                onClick={() => onView(viewing)}
              >
                Open in editor
              </button>
              <button
                className="history-action-btn"
                onClick={() => {
                  navigator.clipboard.writeText(viewing.exportText).catch(() => {});
                }}
              >
                Copy
              </button>
            </div>
            <pre className="history-viewer-text">{viewing.exportText}</pre>
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty">No recorded sessions yet.</div>
        ) : (
          <div className="history-list">
            {history.map((record) => (
              <div key={record.id} className="history-entry">
                <div
                  className="history-entry-content"
                  onClick={() => onView(record)}
                >
                  <div className="history-entry-date">
                    {new Date(record.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {new Date(record.date).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="history-entry-meta">
                    {Math.round(record.durationSec / 60)} min ·{" "}
                    {record.segmentCount} segments
                  </div>
                  <div className="history-entry-preview">{record.preview}</div>
                </div>
                {confirmDelete === record.id ? (
                  <div className="history-delete-confirm">
                    <button
                      className="history-delete-yes"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                        onDelete(record.id);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      className="history-delete-no"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="history-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(record.id);
                    }}
                    aria-label="Delete session"
                    title="Delete this session"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// Usage Bar (free plan calculator)
// ============================================================

function UsageBar({ stats }: { stats: UsageStats }) {
  const { percentUsed, remainingMinutes, monthlyMinutes, projectedMonthlyMinutes } = stats;
  const barColor =
    percentUsed >= 90 ? "#F5A623" : percentUsed >= 75 ? "#F5A623" : "#5EEAD4";

  return (
    <div className="usage-bar-container" title={`Free tier: 3,000 min/month. Used ${monthlyMinutes.toFixed(1)} min. Projected: ${projectedMonthlyMinutes.toFixed(0)} min.`}>
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${percentUsed}%`, background: barColor }}
        />
      </div>
      <div className="usage-bar-label">
        <span className="usage-bar-used">{monthlyMinutes.toFixed(0)} min</span>
        <span className="usage-bar-sep">/</span>
        <span className="usage-bar-total">3000</span>
      </div>
    </div>
  );
}

// ============================================================
// Main Marqad component
// ============================================================

type RecordingState = "idle" | "connecting" | "recording" | "paused" | "stopping";

export default function Marqad() {
  // --- State ---
  const [recState, setRecState] = useState<RecordingState>("idle");
  const [statusText, setStatusText] = useState("Ready");
  const [statusKind, setStatusKind] = useState<"idle" | "active" | "connecting" | "error" | "paused">("idle");
  const [partial, setPartial] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [format, setFormat] = useState<ViewFormat>("prose");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [armed, setArmed] = useState(false); // accidental start prevention
  const [viewingRecord, setViewingRecord] = useState<SessionRecord | null>(null);
  const [editText, setEditText] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // --- Refs ---
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const zeroGainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const recognitionStartedRef = useRef(false);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAudioEndRef = useRef<number | null>(null);
  const lastWallTimeRef = useRef<number | null>(null);
  const segIdCounter = useRef(0);
  const isAtBottomRef = useRef(true);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformData = useRef<number[]>(new Array(48).fill(0));
  const rafRef = useRef<number | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);
  const sessionStartRef = useRef<number>(0);
  const sessionStreamingSecRef = useRef(0); // actual streaming time (excludes pauses)
  const streamingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep segmentsRef in sync
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Load history + usage on mount
  useEffect(() => {
    setHistory(loadHistory());
    setUsageStats(getUsageStats(0));
  }, []);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = pageScrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [segments, partial]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      teardown();
      if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
    };
  }, []);

  // ============================================================
  // Waveform
  // ============================================================

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);
    const data = waveformData.current;
    const barWidth = w / data.length;
    const isActive = recState === "recording";
    const color = isActive ? "#5EEAD4" : recState === "paused" ? "#F5A623" : "#2a2823";

    for (let i = 0; i < data.length; i++) {
      const amp = Math.min(1, data[i]);
      const barH = Math.max(2 * dpr, amp * h * 0.9);
      ctx.fillStyle = color;
      ctx.fillRect(
        i * barWidth + barWidth * 0.15,
        (h - barH) / 2,
        barWidth * 0.7,
        barH
      );
    }

    if (isActive || recState === "paused") {
      rafRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [recState]);

  useEffect(() => {
    if (recState === "recording" || recState === "paused") {
      rafRef.current = requestAnimationFrame(drawWaveform);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recState, drawWaveform]);

  // ============================================================
  // WebSocket message handling
  // ============================================================

  const handleWsMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) return;
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.message) {
      case "RecognitionStarted":
        recognitionStartedRef.current = true;
        reconnectAttemptsRef.current = 0;
        setRecState("recording");
        setStatusText("Recording");
        setStatusKind("active");
        break;

      case "AddPartialTranscript":
        if (msg.metadata?.transcript) {
          setPartial(msg.metadata.transcript);
        }
        break;

      case "AddTranscript": {
        setPartial("");
        const seg = parseTranscript(msg);
        if (seg) {
          setSegments((prev) => {
            // Merge with the last segment if same speaker and no significant pause.
            // Speechmatics sends many small AddTranscript messages (1-2 words each),
            // so we accumulate them into one segment per speaker turn.
            const last = prev[prev.length - 1];
            if (last && last.speaker === seg.speaker && seg.spacing === "none") {
              const merged: Segment = {
                ...last,
                words: [...last.words, ...seg.words],
                transcript: last.transcript + seg.transcript,
                audioEnd: seg.audioEnd,
              };
              const next = [...prev.slice(0, -1), merged];
              segmentsRef.current = next;
              return next;
            }
            const next = [...prev, seg];
            segmentsRef.current = next;
            return next;
          });
        }
        break;
      }

      case "EndOfTranscript":
        break;

      case "Error":
        // Gap 3 fix: handle quota exhaustion gracefully
        if (msg.type === "quota_exceeded" || msg.code === 4005) {
          setStatusText("Free tier minutes exhausted — resets next month");
          setStatusKind("error");
          shouldReconnectRef.current = false; // don't retry — will keep failing
          setRecState("idle");
          teardown();
        } else {
          setStatusText(`Error: ${msg.reason || msg.type || "unknown"}`);
          setStatusKind("error");
        }
        break;
    }
  }, []);

  const parseTranscript = useCallback((msg: any): Segment | null => {
    const metadata = msg.metadata || {};
    const results: any[] = msg.results || [];
    const transcript: string = metadata.transcript || "";
    if (!transcript && results.length === 0) return null;

    const words: WordToken[] = [];
    let primarySpeaker = "UU";

    for (const r of results) {
      const alt = r.alternatives?.[0] || {};
      const content = alt.content || "";
      const type = r.type || "word";
      const speaker = alt.speaker || "UU";
      const language = alt.language || "";
      const direction: "ltr" | "rtl" =
        alt.direction || (language.startsWith("ar") ? "rtl" : "ltr");
      const confidence = alt.confidence || 0;

      words.push({ content, speaker, language, direction, confidence, type });

      if (type === "word" && speaker !== "UU") {
        primarySpeaker = speaker;
      }
    }

    if (words.length === 0 && transcript) {
      // Speechmatics sometimes returns the transcript as a single string
      // without word-level results. Split by spaces to create individual
      // word tokens so they render with proper spacing.
      // Also handle the case where Arabic words are concatenated without
      // spaces — we can't fix that here (it's in Speechmatics' output),
      // but splitting by spaces at least handles the normal case.
      const parts = transcript.split(/(\s+)/).filter((s) => s.length > 0);
      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          words.push({
            content: part,
            speaker: primarySpeaker,
            language: "",
            direction: "ltr",
            confidence: 0,
            type: "spacing",
          });
        } else if (/^[.,!?;:؟،'"—\-–]+$/.test(part)) {
          words.push({
            content: part,
            speaker: primarySpeaker,
            language: "",
            direction: "ltr",
            confidence: 0,
            type: "punctuation",
          });
        } else {
          const isAr = isArabicText(part);
          words.push({
            content: part,
            speaker: primarySpeaker,
            language: isAr ? "ar" : "en",
            direction: isAr ? "rtl" : "ltr",
            confidence: 0,
            type: "word",
          });
        }
      }
      // Fallback if splitting produced nothing useful
      if (words.length === 0) {
        const isAr = isArabicText(transcript);
        words.push({
          content: transcript,
          speaker: primarySpeaker,
          language: isAr ? "ar" : "en",
          direction: isAr ? "rtl" : "ltr",
          confidence: 0,
          type: "word",
        });
      }
    }

    const audioStart = metadata.start_time ?? 0;
    const audioEnd = metadata.end_time ?? audioStart;
    const wallTime = Date.now();

    let spacing: Segment["spacing"] = "none";
    if (lastAudioEndRef.current !== null && lastWallTimeRef.current !== null) {
      const audioGap = (audioStart - lastAudioEndRef.current) * 1000;
      const wallGap = wallTime - lastWallTimeRef.current;
      const gap = audioGap >= 0 ? audioGap : wallGap;
      spacing = classifyPause(gap);
    }

    lastAudioEndRef.current = audioEnd;
    lastWallTimeRef.current = wallTime;

    return {
      id: `seg-${segIdCounter.current++}`,
      words,
      transcript,
      speaker: primarySpeaker,
      audioStart,
      audioEnd,
      wallTime,
      spacing,
    };
  }, []);

  // ============================================================
  // WebSocket connection
  // ============================================================

  const connectWebSocket = useCallback(async () => {
    setStatusText("Fetching token...");
    setStatusKind("connecting");

    let jwt: string;
    try {
      if (!CONFIG.TOKEN_ENDPOINT || !CONFIG.TOKEN_ENDPOINT.startsWith("https://")) {
        throw new Error("Token endpoint not configured");
      }
      const resp = await fetch(CONFIG.TOKEN_ENDPOINT);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      jwt = data.jwt;
      if (!jwt) throw new Error("No jwt in response");
    } catch (err: any) {
      const msg = err.message.includes("DOCTYPE") || err.message.includes("valid JSON")
        ? "Token endpoint returned HTML, not JSON — check the Edge Function is deployed"
        : `Token error: ${err.message}`;
      setStatusText(msg);
      setStatusKind("error");
      setRecState("idle");
      return false;
    }

    setStatusText("Connecting to Speechmatics...");
    setStatusKind("connecting");

    const wsUrl = `${CONFIG.WS_HOST}/${CONFIG.LANGUAGE}?jwt=${jwt}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(buildStartRecognition());
      setStatusText("Starting recognition...");
    };

    ws.onmessage = handleWsMessage;

    ws.onerror = () => {
      setStatusText("Connection error");
      setStatusKind("error");
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      recognitionStartedRef.current = false;

      if (shouldReconnectRef.current && !isPausedRef.current && reconnectAttemptsRef.current < 4) {
        const delays = [2000, 5000, 10000, 20000];
        const delay = delays[reconnectAttemptsRef.current];
        reconnectAttemptsRef.current++;
        setStatusText(`Reconnecting in ${delay / 1000}s... (${reconnectAttemptsRef.current}/4)`);
        setStatusKind("connecting");
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      } else if (shouldReconnectRef.current && reconnectAttemptsRef.current >= 4) {
        setStatusText("Reconnection failed");
        setStatusKind("error");
        setRecState("idle");
        shouldReconnectRef.current = false;
      }
    };

    return true;
  }, [handleWsMessage]);

  // ============================================================
  // Start recording (with accidental-start prevention)
  // ============================================================

  const armStart = useCallback(() => {
    if (recState !== "idle") return;
    setArmed(true);
    // Auto-disarm after 4 seconds if not confirmed
    if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
    armedTimerRef.current = setTimeout(() => setArmed(false), 4000);
  }, [recState]);

  const confirmStart = useCallback(async () => {
    if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
    setArmed(false);

    if (recState !== "idle") return;

    // Gap 3 fix: block start if free tier is exhausted
    const stats = getUsageStats(0);
    if (stats.isOverLimit) {
      setStatusText("Free tier exhausted — resets next month");
      setStatusKind("error");
      return;
    }

    setRecState("connecting");
    setStatusText("Requesting microphone...");
    setStatusKind("connecting");
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    recognitionStartedRef.current = false;
    isPausedRef.current = false;

    lastAudioEndRef.current = null;
    lastWallTimeRef.current = null;

    setSegments([]);
    segmentsRef.current = [];
    setPartial("");
    setElapsedSec(0);
    elapsedRef.current = 0;
    sessionStreamingSecRef.current = 0;
    sessionStartRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: CONFIG.SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      await audioCtx.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletNodeRef.current = worklet;

      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      zeroGainRef.current = zeroGain;

      source.connect(worklet);
      worklet.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);

      worklet.port.onmessage = (e: MessageEvent) => {
        const float32: Float32Array = e.data;

        // Update waveform
        let sum = 0;
        for (let i = 0; i < float32.length; i++) {
          sum += float32[i] * float32[i];
        }
        const rms = Math.sqrt(sum / float32.length);
        waveformData.current.push(rms);
        if (waveformData.current.length > 48) {
          waveformData.current.shift();
        }

        // Send audio only when recording (not paused) and WS is open
        if (
          !isPausedRef.current &&
          recognitionStartedRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          const pcm16 = float32ToInt16(float32);
          wsRef.current.send(pcm16);
        }
      };

      await connectWebSocket();

      // Start elapsed time tracker (counts wall time for display)
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSec(elapsedRef.current);
      }, 1000);

      // Start streaming seconds tracker (counts actual streaming time for billing)
      streamingTimerRef.current = setInterval(() => {
        if (!isPausedRef.current && recognitionStartedRef.current) {
          sessionStreamingSecRef.current += 1;
        }
      }, 1000);
    } catch (err: any) {
      setStatusText(`Error: ${err.message}`);
      setStatusKind("error");
      setRecState("idle");
      shouldReconnectRef.current = false;
      teardown();
    }
  }, [recState, connectWebSocket]);

  // ============================================================
  // Pause / Resume
  // ============================================================

  const pauseRecording = useCallback(() => {
    if (recState !== "recording") return;
    isPausedRef.current = true;
    setRecState("paused");
    setStatusText("Paused");
    setStatusKind("paused");

    // Stop the source node — audio capture halts, worklet receives no input
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch {}
    }
  }, [recState]);

  const resumeRecording = useCallback(() => {
    if (recState !== "paused") return;
    isPausedRef.current = false;

    // Reconnect source node to resume audio capture
    if (sourceNodeRef.current && workletNodeRef.current && audioCtxRef.current) {
      try {
        sourceNodeRef.current.connect(workletNodeRef.current);
      } catch {
        // If reconnect fails, try recreating the source from the existing stream
        if (mediaStreamRef.current && audioCtxRef.current) {
          try {
            const newSource = audioCtxRef.current.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current = newSource;
            newSource.connect(workletNodeRef.current!);
          } catch {}
        }
      }
    }

    // If WebSocket closed during pause, reconnect
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatusText("Reconnecting...");
      setStatusKind("connecting");
      connectWebSocket();
    } else {
      setStatusText("Recording");
      setStatusKind("active");
    }

    setRecState("recording");
  }, [recState, connectWebSocket]);

  // ============================================================
  // Stop + teardown
  // ============================================================

  const teardown = useCallback(() => {
    // Clear all timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamingTimerRef.current) { clearInterval(streamingTimerRef.current); streamingTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }

    // Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ message: "EndOfStream" }));
        }
      } catch {}
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    // Disconnect audio nodes — order matters: source first, then downstream
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.port.close(); } catch {}
      try { workletNodeRef.current.disconnect(); } catch {}
      workletNodeRef.current = null;
    }
    if (zeroGainRef.current) {
      try { zeroGainRef.current.disconnect(); } catch {}
      zeroGainRef.current = null;
    }

    // Stop ALL media stream tracks — this turns off the browser mic indicator
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      mediaStreamRef.current = null;
    }

    // Close AudioContext — must be last, after nodes are disconnected
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      try {
        if (ctx.state !== "closed") {
          ctx.close().catch(() => {});
        }
      } catch {}
    }

    recognitionStartedRef.current = false;
    isPausedRef.current = false;
  }, []);

  const stopRecording = useCallback(() => {
    shouldReconnectRef.current = false;
    const streamingSec = sessionStreamingSecRef.current;
    teardown();
    setRecState("idle");
    setStatusText("Stopped");
    setStatusKind("idle");
    setPartial("");

    // Save to history
    const currentSegments = segmentsRef.current;
    if (currentSegments.length > 0) {
      const exportText = buildExportText(currentSegments);
      const preview = currentSegments
        .map((s) => s.transcript)
        .join(" ")
        .slice(0, 120);
      const record: SessionRecord = {
        id: `session-${Date.now()}`,
        date: new Date().toISOString(),
        durationSec: streamingSec,
        segmentCount: currentSegments.length,
        preview: preview || "(empty session)",
        exportText,
      };
      const updated = saveSession(record);
      setHistory(updated);
    }

    // Update monthly usage with actual streaming seconds
    if (streamingSec > 0) {
      addToMonthlySeconds(streamingSec);
    }
    setUsageStats(getUsageStats(0));
  }, [teardown]);

  // ============================================================
  // Copy transcript
  // ============================================================

  const copyTranscript = useCallback(async () => {
    const text = buildExportText(segmentsRef.current);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  // ============================================================
  // History handlers
  // ============================================================

  const handleDeleteHistory = useCallback((id: string) => {
    const updated = deleteSession(id);
    setHistory(updated);
    // If we're viewing the deleted session, close it
    if (viewingRecord?.id === id) {
      setViewingRecord(null);
      setEditText("");
      setEditDirty(false);
    }
  }, [viewingRecord]);

  const handleImportHistory = useCallback((json: string) => {
    try {
      const updated = importHistoryJSON(json);
      setHistory(updated);
    } catch {
      // Error is handled in HistoryPanel via onImport throw
    }
  }, []);

  // View a past session — loads it into the main transcript area (read-only)
  const handleViewHistory = useCallback((record: SessionRecord) => {
    setViewingRecord(record);
    setEditText(record.exportText);
    setEditDirty(false);
    setEditSaved(false);
    setHistoryOpen(false);
    setPartial("");
  }, []);

  // Start a new session — clears the current transcript
  const handleNewSession = useCallback(() => {
    if (recState !== "idle") {
      stopRecording();
    }
    setViewingRecord(null);
    setEditText("");
    setEditDirty(false);
    setEditSaved(false);
    setSegments([]);
    segmentsRef.current = [];
    setPartial("");
    setElapsedSec(0);
    setStatusText("Ready");
    setStatusKind("idle");
  }, [recState, stopRecording]);

  // Save edited transcript as a new history entry
  const handleSaveEdit = useCallback(() => {
    if (!viewingRecord || !editDirty) return;
    const newRecord: SessionRecord = {
      id: `session-${Date.now()}`,
      date: new Date().toISOString(),
      durationSec: viewingRecord.durationSec,
      segmentCount: viewingRecord.segmentCount,
      preview: editText.slice(0, 120).replace(/\n/g, " "),
      exportText: editText,
    };
    const updated = saveSession(newRecord);
    setHistory(updated);
    setViewingRecord(newRecord);
    setEditDirty(false);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  }, [viewingRecord, editDirty, editText]);

  // ============================================================
  // Scroll tracking
  // ============================================================

  const handleScroll = useCallback(() => {
    const el = pageScrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // ============================================================
  // Update usage stats periodically while recording
  // ============================================================

  useEffect(() => {
    if (recState === "recording" || recState === "paused") {
      const interval = setInterval(() => {
        setUsageStats(getUsageStats(sessionStreamingSecRef.current));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [recState]);

  // ============================================================
  // Render
  // ============================================================

  const isRecording = recState === "recording";
  const isPaused = recState === "paused";
  const isConnecting = recState === "connecting";
  const isBusy = isConnecting || isRecording || isPaused;
  const sessionMin = (elapsedSec / 60).toFixed(1);

  return (
    <div className="app">
      {/* ===== Control Rail ===== */}
      <div className="rail">
        <div className="rail-brand">
          <span className="rail-brand-mark">م</span>
          <span className="rail-brand-text">Marqad</span>
        </div>

        <div className="rail-controls">
          {/* Mic / Start button with accidental-start prevention */}
          {recState === "idle" ? (
            <button
              className={`mic-btn ${armed ? "armed" : ""}`}
              onClick={armed ? confirmStart : armStart}
              aria-label={armed ? "Confirm start recording" : "Start recording"}
              title={armed ? "Click again to confirm" : "Start recording"}
            >
              {armed ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>
          ) : (
            <button
              className={`mic-btn recording ${recState === "connecting" ? "connecting" : ""} ${recState === "paused" ? "paused" : ""}`}
              onClick={stopRecording}
              aria-label="Stop recording"
              title="Stop recording"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          )}

          {/* Pause/Resume button */}
          {(isRecording || isPaused) && (
            <button
              className={`pause-btn ${isPaused ? "resumed" : ""}`}
              onClick={isPaused ? resumeRecording : pauseRecording}
              aria-label={isPaused ? "Resume recording" : "Pause recording"}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              )}
            </button>
          )}

          <div className="waveform">
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
          </div>

          <div className={`status ${statusKind}`}>
            <span className="status-dot" />
            {statusText}
          </div>
        </div>

        <div className="rail-spacer" />

        <div className="rail-right">
          <UsageBar stats={usageStats || getUsageStats(0)} />

          {viewingRecord ? (
            <>
              <button
                className="new-session-btn"
                onClick={handleNewSession}
                aria-label="Start new session"
                title="Start new session"
              >
                + New
              </button>
              <button
                className={`copy-btn ${editSaved ? "copied" : ""}`}
                onClick={handleSaveEdit}
                disabled={!editDirty}
              >
                {editSaved ? "✓ Saved" : "Save"}
              </button>
            </>
          ) : (
            <>
              <select
                className="format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as ViewFormat)}
                aria-label="View format"
              >
                <option value="prose">Prose</option>
                <option value="dialogue">Dialogue</option>
                <option value="notes">Notes</option>
              </select>

              <button
                className="history-btn"
                onClick={() => setHistoryOpen(true)}
                aria-label="History"
                title="Session history"
              >
                <span className="history-icon">⏷</span>
                <span className="history-count">{history.length}</span>
              </button>

              <button
                className={`copy-btn ${copied ? "copied" : ""}`}
                onClick={copyTranscript}
                disabled={segments.length === 0}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== Free tier warning banner (gap 3 fix) ===== */}
      {usageStats?.isOverLimit && (
        <div className="tier-banner tier-banner-error">
          Free tier exhausted ({usageStats.monthlyMinutes.toFixed(0)}/{usageStats.freeTierMinutes} min). Transcription will not work until next month resets.
        </div>
      )}
      {usageStats?.isCriticalLimit && !usageStats.isOverLimit && (
        <div className="tier-banner tier-banner-warning">
          Approaching free tier limit — {usageStats.remainingMinutes.toFixed(0)} min left this month.
        </div>
      )}

      {/* ===== Paper Page ===== */}
      <div className="page-scroll" ref={pageScrollRef} onScroll={handleScroll}>
        <div className="page">
          {viewingRecord ? (
            /* ===== Viewing mode: editable past session ===== */
            <div className="viewing-mode">
              <div className="viewing-meta">
                {new Date(viewingRecord.date).toLocaleString()} ·{" "}
                {Math.round(viewingRecord.durationSec / 60)} min ·{" "}
                {viewingRecord.segmentCount} segments
                {editDirty && <span className="edit-dirty"> · unsaved</span>}
              </div>
              <textarea
                className="edit-transcript"
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  setEditDirty(true);
                }}
                spellCheck={false}
              />
            </div>
          ) : (
            /* ===== Live transcription mode ===== */
            <>
              {segments.length === 0 && !partial && (
                <div className="empty-state">
                  <div className="empty-state-icon">م</div>
                  <div className="empty-state-text">
                    Press the microphone button to begin transcribing.
                  </div>
                  <div className="empty-state-hint">
                    Arabic-English bilingual · Speaker diarization · Live transcription
                  </div>
                </div>
              )}

              {segments.map((seg, i) => (
                <SegmentView
                  key={seg.id}
                  segment={seg}
                  format={format}
                  prevSpeaker={i > 0 ? segments[i - 1].speaker : null}
                />
              ))}

              {partial && <span className="interim"> {partial}</span>}
            </>
          )}
        </div>
      </div>

      {/* ===== History Panel ===== */}
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={history}
        onDelete={handleDeleteHistory}
        onView={handleViewHistory}
        onImport={handleImportHistory}
      />
    </div>
  );
}
