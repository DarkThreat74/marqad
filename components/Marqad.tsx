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
  isArabicWord,
  isFillerWord,
  loadVocabCache,
  saveVocabCache,
  type VocabCacheEntry,
  loadHistory,
  saveSession,
  deleteSession,
  getUsageStats,
  addToMonthlySeconds,
  addToMonthlySecondsDB,
  loadMonthlySecondsFromDB,
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
  let i = 0;
  let nodeIdx = 0;

  while (i < seg.words.length) {
    const w = seg.words[i];

    // Pause markers — inserted during parseTranscript to survive merges
    if (w.type === "pause") {
      const kind = w.pauseKind || "none";
      if (kind === "ellipsis") {
        nodes.push(<span key={`pause-${nodeIdx++}`} className="thinking-pause">…</span>);
      } else if (kind === "comma") {
        nodes.push(<span key={`pause-${nodeIdx++}`}>, </span>);
      } else if (kind === "line") {
        nodes.push(<br key={`pause-${nodeIdx++}`} />);
      } else if (kind === "paragraph") {
        nodes.push(<br key={`pause1-${nodeIdx++}`} />);
        nodes.push(<br key={`pause2-${nodeIdx++}`} />);
      } else if (kind === "divider") {
        nodes.push(<hr key={`pause-${nodeIdx++}`} className="spacing-divider" />);
      }
      i++;
      continue;
    }

    if (w.type === "spacing") {
      nodes.push(<span key={`sp-${nodeIdx++}`}> </span>);
      i++;
      continue;
    }

    if (w.type === "punctuation") {
      nodes.push(<span key={`p-${nodeIdx++}`}>{w.content}</span>);
      if (/[.!?؟。]/.test(w.content)) sentenceInitial = true;
      i++;
      continue;
    }

    // Check if this word starts an Arabic run
    if (isArabicWord(w)) {
      // Collect all consecutive Arabic words into one RTL span
      const arabicWords: WordToken[] = [];
      while (i < seg.words.length) {
        const cw = seg.words[i];
        if (cw.type === "spacing") {
          // Include the space in the Arabic run if the next word is also Arabic
          if (i + 1 < seg.words.length && isArabicWord(seg.words[i + 1])) {
            arabicWords.push(cw);
            i++;
            continue;
          }
          break;
        }
        if (cw.type === "punctuation") {
          // Include punctuation in the Arabic run if followed by more Arabic
          if (i + 1 < seg.words.length && isArabicWord(seg.words[i + 1])) {
            arabicWords.push(cw);
            i++;
            continue;
          }
          break;
        }
        if (isArabicWord(cw)) {
          arabicWords.push(cw);
          i++;
        } else {
          break;
        }
      }

      // Add space before the Arabic run if not the first node
      if (nodes.length > 0) {
        nodes.push(<span key={`sp-${nodeIdx++}`}> </span>);
      }

      // Render the Arabic run as a single RTL span
      const arabicContent = arabicWords
        .map((aw) => aw.content)
        .join(" ");
      nodes.push(
        <span key={`ar-${nodeIdx++}`} className="arabic" dir="rtl">
          {arabicContent}
        </span>
      );
      sentenceInitial = false;
    } else {
      // English/Latin word
      if (nodes.length > 0) {
        nodes.push(<span key={`sp-${nodeIdx++}`}> </span>);
      }
      const classes = classifyWord(w, sentenceInitial);
      // Mark filler words (um, uh, hmm) with a muted class
      if (isFillerWord(w.content)) {
        classes.push("filler-word");
      }
      nodes.push(
        <span key={`w-${nodeIdx++}`} className={classes.join(" ")}>
          {w.content}
        </span>
      );
      sentenceInitial = false;
      i++;
    }
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
    // Notes mode: bullet-style, no timestamp, more compact.
    // Designed for quick scanning — just speaker + text, indented.
    return (
      <div className="notes-block">
        <div className="notes-header">
          <span className="speaker-swatch" style={{ background: color }} />
          <span className="speaker-label">Speaker {segment.speaker}</span>
        </div>
        <div className="notes-text">{renderWords(segment)}</div>
      </div>
    );
  }

  return (
    <span>
      {segment.spacing === "ellipsis" && <span className="thinking-pause">…</span>}
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

type RecordingState = "idle" | "connecting" | "recording" | "paused" | "stopping" | "processing";

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
  const [liveEditMode, setLiveEditMode] = useState(false); // edit live transcript
  const [liveEditText, setLiveEditText] = useState("");
  const [isOnline, setIsOnline] = useState(true);

  // --- Fix this popover (vocabulary correction) ---
  const [fixPopover, setFixPopover] = useState<{
    show: boolean;
    x: number;
    y: number;
    wrongText: string;
    correctText: string;
  }>({ show: false, x: 0, y: 0, wrongText: "", correctText: "" });
  const [fixSaving, setFixSaving] = useState(false);
  const [fixToast, setFixToast] = useState<string | null>(null);
  const transcriptAreaRef = useRef<HTMLDivElement | null>(null);

  // --- Recording mode (Live vs Batch) ---
  const [recordingMode, setRecordingMode] = useState<"live" | "batch">("live");
  const [batchRecording, setBatchRecording] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const batchChunksRef = useRef<Blob[]>([]);
  const batchJobIdRef = useRef<string | null>(null);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Vocab refresh ---
  const [vocabRefreshing, setVocabRefreshing] = useState(false);
  const [vocabToast, setVocabToast] = useState<string | null>(null);

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
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<any>(null); // Screen Wake Lock — keeps screen on during recording
  const startBatchRecordingRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const acquireWakeLockRef = useRef<() => Promise<void>>(() => Promise.resolve());
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
    // Load usage from database (async)
    loadMonthlySecondsFromDB().then(() => {
      setUsageStats(getUsageStats(0));
    });
  }, []);

  // Online/offline detection — uses refs to avoid re-running on state changes
  const statusKindRef = useRef(statusKind);
  const statusTextRef = useRef(statusText);
  const recStateRef = useRef(recState);
  useEffect(() => {
    statusKindRef.current = statusKind;
    statusTextRef.current = statusText;
    recStateRef.current = recState;
  }, [statusKind, statusText, recState]);

  useEffect(() => {
    const updateOnline = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (!online) {
        setStatusText("You're offline — check your internet connection");
        setStatusKind("error");
      } else if (statusKindRef.current === "error" && statusTextRef.current.includes("offline")) {
        setStatusText("Back online");
        setStatusKind("idle");
        setTimeout(() => {
          if (recStateRef.current === "idle") {
            setStatusText("Ready");
          }
        }, 2000);
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  // Save usage on page close/unload (so partial session is counted)
  useEffect(() => {
    const handleUnload = () => {
      const sec = sessionStreamingSecRef.current;
      const remainder = sec % 10;
      if (remainder > 0) {
        // Use sendBeacon with a Blob to set correct Content-Type
        try {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/usage`
            : "https://vnrgimvfsdgcpgfwcnlw.supabase.co/functions/v1/usage";
          const blob = new Blob(
            [JSON.stringify({ seconds: remainder })],
            { type: "application/json" }
          );
          navigator.sendBeacon(url, blob);
        } catch {
          addToMonthlySeconds(remainder);
        }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Register service worker — force update on every load
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const handleControllerChange = () => {
        window.location.reload();
      };
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.update();
      }).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    }
  }, []);

  // Auto-scroll — keep pinned to bottom when new content arrives
  useEffect(() => {
    const el = pageScrollRef.current;
    if (el && isAtBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
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

    // Log every message for debugging
    console.log("[Marqad] WS message:", msg.message, msg.type || "");

    switch (msg.message) {
      case "RecognitionStarted":
        recognitionStartedRef.current = true;
        reconnectAttemptsRef.current = 0;
        setRecState("recording");
        setStatusText("Recording");
        setStatusKind("active");
        break;

      case "AddPartialTranscript":
        // Show partial immediately
        if (msg.metadata?.transcript) {
          setPartial(msg.metadata.transcript);
        } else {
          setPartial("");
        }
        break;

      case "AddTranscript": {
        const seg = parseTranscript(msg);
        if (seg) {
          setSegments((prev) => {
            // Always merge consecutive same-speaker segments.
            // Speechmatics sends many tiny AddTranscript messages (1-2 words each),
            // so we accumulate them into one segment per speaker turn.
            // A new segment is only created when the speaker changes.
            const last = prev[prev.length - 1];
            if (last && last.speaker === seg.speaker) {
              // Mutate the words array in place to avoid O(n) copy on every message.
              // Over a 1-hour session, a single segment can accumulate thousands of
              // words — copying the entire array on each of thousands of messages
              // would cause severe jank after ~30 minutes.
              last.words.push(...seg.words);
              last.transcript = last.transcript + seg.transcript;
              last.audioEnd = seg.audioEnd;
              // Create a new segment object reference so memo'd SegmentView
              // re-renders, but don't copy the words array (it was mutated in place)
              const mergedSeg = { ...last };
              const next = [...prev.slice(0, -1), mergedSeg];
              segmentsRef.current = next;
              return next;
            }
            const next = [...prev, seg];
            segmentsRef.current = next;
            return next;
          });
        }
        // Clear partial immediately — the final transcript is now rendered
        // in the segments above. Keeping the partial would show duplicate
        // text. The next AddPartialTranscript arrives within milliseconds.
        setPartial("");
        break;
      }

      case "EndOfTranscript":
        break;

      case "Error":
        // Handle quota exhaustion gracefully
        if (msg.type === "quota_exceeded" || msg.code === 4005) {
          setStatusText("Free tier minutes exhausted — resets next month");
          setStatusKind("error");
          shouldReconnectRef.current = false;
          setRecState("idle");
          teardown();
        } else if (msg.type === "invalid_config" || msg.type === "invalid_message" || msg.type === "invalid_language" || msg.type === "invalid_model") {
          // Fatal config errors — don't retry, show the actual reason
          const errDetail = msg.reason || msg.type || "invalid config";
          setStatusText(`Config error: ${errDetail}`);
          setStatusKind("error");
          shouldReconnectRef.current = false;
          setRecState("idle");
          teardown();
          console.error("Speechmatics config error:", JSON.stringify(msg));
        } else {
          // Show the actual error from Speechmatics for debugging
          const errDetail = msg.reason || msg.message || msg.type || "unknown";
          setStatusText(`Speechmatics error: ${errDetail}`);
          setStatusKind("error");
          // Log full error to console for debugging
          console.error("Speechmatics error:", JSON.stringify(msg));
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

      // Strip punctuation — we handle spacing via pause detection, not
      // Speechmatics' auto-punctuation (which inserts false periods)
      if (type === "punctuation") continue;

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
      // Use audio gap when available (accurate), fall back to wall time
      const gap = audioGap >= 0 ? audioGap : wallGap;
      spacing = classifyPause(gap);

      // Passive pause logging — data collection only, not self-tuning.
      // Logs every measured pause for later manual analysis of threshold tuning.
      if (spacing !== "none" && spacing !== "ellipsis") {
        const tier = spacing === "comma" ? "comma"
          : spacing === "line" ? "line"
          : spacing === "paragraph" ? "para"
          : "turn";
        fetch("/api/pause-observation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_date: new Date().toISOString().slice(0, 10),
            slot_number: 0,
            pause_ms: Math.round(gap),
            pause_tier: tier,
          }),
        }).catch(() => {}); // non-fatal — don't interrupt recording
      }
    }

    lastAudioEndRef.current = audioEnd;
    lastWallTimeRef.current = wallTime;

    // Insert a pause marker at the beginning of the words array if there
    // was a meaningful pause. This ensures pauses survive segment merges
    // (previously, spacing was overwritten on merge, losing paragraph breaks).
    if (spacing !== "none") {
      words.unshift({
        content: "",
        speaker: primarySpeaker,
        language: "",
        direction: "ltr",
        confidence: 0,
        type: "pause",
        pauseKind: spacing,
      });
    }

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
    console.log("[Marqad] connectWebSocket — fetching token from", CONFIG.TOKEN_ENDPOINT);

    let jwt: string;
    try {
      if (!navigator.onLine) {
        throw new Error("You're offline — check your internet connection");
      }
      if (!CONFIG.TOKEN_ENDPOINT || !CONFIG.TOKEN_ENDPOINT.startsWith("https://")) {
        throw new Error("Token endpoint not configured");
      }
      const resp = await fetch(CONFIG.TOKEN_ENDPOINT);
      console.log("[Marqad] Token response:", resp.status, resp.statusText);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      jwt = data.jwt;
      if (!jwt) throw new Error("No jwt in response");
      console.log("[Marqad] Token acquired, opening WebSocket");
    } catch (err: any) {
      let msg: string;
      if (!navigator.onLine || err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        msg = "You're offline — check your internet connection";
      } else if (err.message.includes("DOCTYPE") || err.message.includes("valid JSON")) {
        msg = "Token endpoint returned HTML, not JSON — check the Edge Function is deployed";
      } else if (err.message.includes("Server missing SPEECHMATICS_API_KEY")) {
        msg = "Speechmatics API key not set — run supabase secrets set";
      } else {
        msg = `Token error: ${err.message}`;
      }
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

    ws.onopen = async () => {
      // Use cached vocab immediately — don't block session start on a network fetch
      const cache = loadVocabCache();
      let extraVocab: Array<{ content: string; sounds_like: string[] }> | undefined;
      if (cache && cache.vocab.length > 0) {
        extraVocab = cache.vocab;
      }
      const configMsg = buildStartRecognition(extraVocab);
      console.log("[Marqad] Sending StartRecognition, vocab size:", extraVocab?.length || 0);
      ws.send(configMsg);
      setStatusText("Starting recognition...");

      // Timeout — if Speechmatics doesn't respond within 25 seconds, something is wrong
      // (additional_vocab can cause up to 15s delay per docs, give extra margin)
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = setTimeout(() => {
        if (!recognitionStartedRef.current && wsRef.current === ws) {
          console.error("[Marqad] RecognitionStarted timeout — no response in 25s");
          setStatusText("Speechmatics not responding — check console for details");
          setStatusKind("error");
          shouldReconnectRef.current = false;
          setRecState("idle");
          teardown();
          try { ws.close(); } catch {}
        }
      }, 25000);

      // Background refresh (non-blocking) — check if cache is stale
      // If so, refetch and update cache for the NEXT session
      refreshVocabInBackground();
    };

    ws.onmessage = (event) => {
      // Clear startup timeout on any message from Speechmatics
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      handleWsMessage(event);
    };

    ws.onerror = (event) => {
      console.error("[Marqad] WebSocket error:", event);
      if (!navigator.onLine) {
        setStatusText("You're offline — transcription paused");
      } else {
        setStatusText("Connection error to Speechmatics — will retry");
      }
      setStatusKind("error");
    };

    ws.onclose = (event) => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      recognitionStartedRef.current = false;

      // Log close details for debugging
      console.warn(`[Marqad] WebSocket closed: code=${event.code}, reason="${event.reason}"`);

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
        const reason = event.reason ? `: ${event.reason}` : ` (code ${event.code})`;
        setStatusText(`Connection failed${reason}`);
        setStatusKind("error");
        setRecState("idle");
        shouldReconnectRef.current = false;
      } else {
        // shouldReconnectRef is false — Error handler already set the error message.
        // But make sure we're not stuck in "connecting" state.
        if (recState !== "idle") {
          setRecState("idle");
        }
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

    // Block start if offline
    if (!navigator.onLine) {
      setStatusText("You're offline — check your internet connection");
      setStatusKind("error");
      return;
    }

    // Gap 3 fix: block start if free tier is exhausted
    const stats = getUsageStats(0);
    if (stats.isOverLimit) {
      setStatusText("Free tier exhausted — resets next month");
      setStatusKind("error");
      return;
    }

    // Branch: batch mode vs live mode
    if (recordingMode === "batch") {
      // Batch mode — record locally, no WebSocket
      if (viewingRecord) {
        setViewingRecord(null);
        setEditText("");
        setEditDirty(false);
      }
      setSegments([]);
      segmentsRef.current = [];
      setPartial("");
      startBatchRecordingRef.current();
      return;
    }

    // Live mode — existing behavior
    setRecState("connecting");
    setStatusText("Requesting microphone...");
    setStatusKind("connecting");
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    recognitionStartedRef.current = false;
    isPausedRef.current = false;

    lastAudioEndRef.current = null;
    lastWallTimeRef.current = null;

    // If viewing a past session, exit viewing mode and start fresh.
    // The old session is preserved in history.
    if (viewingRecord) {
      setViewingRecord(null);
      setEditText("");
      setEditDirty(false);
    }
    setSegments([]);
    segmentsRef.current = [];
    setPartial("");
    setElapsedSec(0);
    elapsedRef.current = 0;
    sessionStreamingSecRef.current = 0;
    sessionStartRef.current = Date.now();
    isAtBottomRef.current = true; // reset auto-scroll on new session

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
        // Worklet transfers an ArrayBuffer — wrap it in a Float32Array view
        const float32 = new Float32Array(e.data);

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

      // Keep screen on during recording
      acquireWakeLockRef.current();

      // Start elapsed time tracker (counts wall time for display)
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSec(elapsedRef.current);
      }, 1000);

      // Start streaming seconds tracker (counts actual streaming time for billing)
      // Saves to database every 10 seconds so usage survives page crash/close
      streamingTimerRef.current = setInterval(() => {
        if (!isPausedRef.current && recognitionStartedRef.current) {
          sessionStreamingSecRef.current += 1;
          // Save to database every 10 seconds
          if (sessionStreamingSecRef.current % 10 === 0) {
            addToMonthlySecondsDB(10).catch(() => {
              // Fallback to localStorage if database is unreachable
              addToMonthlySeconds(10);
            });
            setUsageStats(getUsageStats(sessionStreamingSecRef.current));
          }
        }
      }, 1000);
    } catch (err: any) {
      let msg: string;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Microphone access denied — allow mic permission in your browser";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No microphone found — connect a mic and try again";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "Microphone is in use by another app — close it and try again";
      } else if (!navigator.onLine) {
        msg = "You're offline — check your internet connection";
      } else {
        msg = `Microphone error: ${err.message || err.name}`;
      }
      setStatusText(msg);
      setStatusKind("error");
      setRecState("idle");
      shouldReconnectRef.current = false;
      teardown();
    }
  }, [recState, connectWebSocket, viewingRecord, recordingMode]);

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
    if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
    // Cancel animation frame
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    // Release wake lock
    releaseWakeLock();

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
    // Batch mode: stop batch recording and submit for transcription
    if (batchRecording) {
      stopBatchRecording();
      return;
    }
    // Don't allow stop during batch processing (the job is already submitted)
    if (batchProcessing) return;

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

    // Update monthly usage — only the remainder since last 10-second save
    const remainder = streamingSec % 10;
    if (remainder > 0) {
      addToMonthlySecondsDB(remainder).then(() => {
        setUsageStats(getUsageStats(0));
      });
    } else {
      setUsageStats(getUsageStats(0));
    }
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
  // Live edit mode — edit the current transcript on the page
  // ============================================================

  const toggleLiveEdit = useCallback(() => {
    setLiveEditMode((prev) => {
      if (!prev) {
        // Entering edit mode — snapshot current transcript into the textarea
        setLiveEditText(buildExportText(segmentsRef.current));
        return true;
      }
      // Exiting edit mode — discard changes, go back to rendered view
      return false;
    });
  }, []);

  const saveLiveEdit = useCallback(() => {
    if (!liveEditMode) return;
    const record: SessionRecord = {
      id: `session-${Date.now()}`,
      date: new Date().toISOString(),
      durationSec: elapsedSec,
      segmentCount: segmentsRef.current.length,
      preview: liveEditText.slice(0, 120).replace(/\n/g, " "),
      exportText: liveEditText,
    };
    const updated = saveSession(record);
    setHistory(updated);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  }, [liveEditMode, liveEditText, elapsedSec]);

  // ============================================================
  // Fix this — vocabulary correction from text selection
  // ============================================================

  const handleTranscriptMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setFixPopover((prev) => (prev.show ? { ...prev, show: false } : prev));
      return;
    }
    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2 || selectedText.length > 80) {
      setFixPopover((prev) => (prev.show ? { ...prev, show: false } : prev));
      return;
    }
    // Position popover near the selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setFixPopover({
      show: true,
      x: rect.left + rect.width / 2,
      y: rect.bottom + window.scrollY + 8,
      wrongText: selectedText,
      correctText: "",
    });
  }, []);

  const submitVocabFix = useCallback(async () => {
    if (!fixPopover.wrongText || !fixPopover.correctText.trim()) return;
    setFixSaving(true);
    try {
      const resp = await fetch("/api/vocab-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wrong_text: fixPopover.wrongText,
          correct_text: fixPopover.correctText.trim(),
          source_date: new Date().toISOString().slice(0, 10),
          source_slot: 0,
        }),
      });
      if (resp.ok) {
        // Replace the wrong text in the current transcript view
        // (visual fix — the stored transcript is updated via edit mode save)
        const corrected = fixPopover.correctText.trim();
        setFixToast(`Fixed — this will also help future recordings recognize "${corrected}" correctly.`);
        setTimeout(() => setFixToast(null), 4000);
        setFixPopover({ show: false, x: 0, y: 0, wrongText: "", correctText: "" });
        window.getSelection()?.removeAllRanges();
      } else {
        setFixToast("Could not save correction — please try again.");
        setTimeout(() => setFixToast(null), 3000);
      }
    } catch {
      setFixToast("Network error — correction not saved.");
      setTimeout(() => setFixToast(null), 3000);
    }
    setFixSaving(false);
  }, [fixPopover.wrongText, fixPopover.correctText]);

  // ============================================================
  // Vocabulary cache — background refresh + manual refresh
  // ============================================================

  const refreshVocabInBackground = useCallback(async () => {
    try {
      const resp = await fetch("/api/vocab-correction");
      if (!resp.ok) return;
      const data = await resp.json();
      const corrections = data.corrections || [];
      if (corrections.length === 0) return;

      // Check if cache is stale
      const cache = loadVocabCache();
      const newCount = corrections.length;
      const newMax = corrections.reduce((max: string, c: any) => {
        const ts = c.last_confirmed_at || c.first_added_at || "";
        return ts > max ? ts : max;
      }, "");
      if (cache && cache.count === newCount && cache.maxLastConfirmed === newMax) {
        return; // cache is fresh
      }

      // Cache is stale — update it for the next session
      const vocab = corrections.map((c: any) => ({
        content: c.correct_text,
        sounds_like: c.sounds_like || [],
      }));
      saveVocabCache({
        vocab,
        count: newCount,
        maxLastConfirmed: newMax,
        cachedAt: Date.now(),
      });
    } catch {
      // Non-fatal — background refresh failure is silent
    }
  }, []);

  const refreshVocabNow = useCallback(async () => {
    setVocabRefreshing(true);
    try {
      const resp = await fetch("/api/vocab-correction");
      if (!resp.ok) throw new Error("Fetch failed");
      const data = await resp.json();
      const corrections = data.corrections || [];
      if (corrections.length > 0) {
        const vocab = corrections.map((c: any) => ({
          content: c.correct_text,
          sounds_like: c.sounds_like || [],
        }));
        const newMax = corrections.reduce((max: string, c: any) => {
          const ts = c.last_confirmed_at || c.first_added_at || "";
          return ts > max ? ts : max;
        }, "");
        saveVocabCache({
          vocab,
          count: corrections.length,
          maxLastConfirmed: newMax,
          cachedAt: Date.now(),
        });
        setVocabToast(`Vocabulary refreshed — ${corrections.length} corrections loaded.`);
      } else {
        setVocabToast("No corrections to load yet.");
      }
    } catch {
      setVocabToast("Could not refresh vocabulary — check your connection.");
    }
    setTimeout(() => setVocabToast(null), 3000);
    setVocabRefreshing(false);
  }, []);

  // ============================================================
  // Batch transcription mode
  // ============================================================

  // Wake Lock — keeps the screen on during recording so a 1-hour class
  // doesn't get interrupted by the screen sleeping. Re-acquires on
  // visibilitychange (e.g. if user switches tabs and comes back).
  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("[Marqad] Wake Lock acquired — screen will stay on");
      }
    } catch {
      // Wake Lock not supported or denied — non-fatal
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
      console.log("[Marqad] Wake Lock released");
    }
  }, []);

  // Re-acquire wake lock when tab becomes visible again + resume AudioContext
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Re-acquire wake lock if recording
        if ((recState === "recording" || batchRecording) && !wakeLockRef.current) {
          acquireWakeLock();
        }
        // Resume AudioContext if it was suspended (browser suspends it in background)
        if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [recState, batchRecording, acquireWakeLock]);

  const startBatchRecording = useCallback(async () => {
    startBatchRecordingRef.current = startBatchRecording;
    if (!navigator.onLine) {
      setStatusText("You're offline — check your internet connection");
      setStatusKind("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000, // 48kHz capture for batch — higher quality than live's 16kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Use MediaRecorder for local audio capture (compressed webm/opus)
      // 128kbps is high quality for speech — clear enough for batch transcription
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
        audioBitsPerSecond: 128000,
      });
      batchChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) batchChunksRef.current.push(e.data);
      };
      recorder.start(1000); // collect data every 1 second
      mediaRecorderRef.current = recorder;

      setBatchRecording(true);
      setRecState("recording");
      setStatusText("Recording (batch mode)");
      setStatusKind("active");
      setElapsedSec(0);
      elapsedRef.current = 0;
      sessionStreamingSecRef.current = 0;
      sessionStartRef.current = Date.now();
      acquireWakeLock();

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSec(elapsedRef.current);
      }, 1000);

      // Start streaming seconds tracker for usage billing
      streamingTimerRef.current = setInterval(() => {
        sessionStreamingSecRef.current += 1;
        if (sessionStreamingSecRef.current % 10 === 0) {
          addToMonthlySecondsDB(10).catch(() => addToMonthlySeconds(10));
          setUsageStats(getUsageStats(sessionStreamingSecRef.current));
        }
      }, 1000);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setStatusText("Microphone access denied — allow mic access in your browser");
      } else if (err.name === "NotFoundError") {
        setStatusText("No microphone found — connect a mic and try again");
      } else {
        setStatusText(`Microphone error: ${err.message}`);
      }
      setStatusKind("error");
    }
  }, [acquireWakeLock]);

  // Keep refs in sync so confirmStart can call them without ordering issues
  useEffect(() => {
    startBatchRecordingRef.current = startBatchRecording;
  }, [startBatchRecording]);
  useEffect(() => {
    acquireWakeLockRef.current = acquireWakeLock;
  }, [acquireWakeLock]);

  const stopBatchRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    // Stop timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamingTimerRef.current) { clearInterval(streamingTimerRef.current); streamingTimerRef.current = null; }

    // Save final usage seconds
    const remainder = sessionStreamingSecRef.current % 10;
    if (remainder > 0) {
      addToMonthlySecondsDB(remainder).catch(() => addToMonthlySeconds(remainder));
      setUsageStats(getUsageStats(sessionStreamingSecRef.current));
    }

    // Stop recorder and wait for final data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Stop mic stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    // Release wake lock — recording is done, screen can sleep now
    releaseWakeLock();

    setBatchRecording(false);
    setBatchProcessing(true);
    setRecState("processing");
    setBatchStatus("Uploading audio to Speechmatics...");

    // Create audio blob from collected chunks
    const audioBlob = new Blob(batchChunksRef.current, { type: "audio/webm" });

    try {
      // Step 1: Get a batch JWT from the Edge Function
      const tokenResp = await fetch(CONFIG.BATCH_TOKEN_ENDPOINT);
      if (!tokenResp.ok) throw new Error("Could not get batch token");
      const tokenData = await tokenResp.json();
      const batchJwt = tokenData.jwt;
      if (!batchJwt) throw new Error("No batch JWT in response");

      // Step 2: Build config (reuse the same config as live mode)
      const cache = loadVocabCache();
      const extraVocab = cache?.vocab;
      const config = buildStartRecognition(extraVocab);
      // Extract just the transcription_config from the StartRecognition message
      const parsed = JSON.parse(config);
      const batchConfig = {
        type: "transcription",
        transcription_config: parsed.transcription_config,
      };

      // Step 3: Create batch job — upload audio directly to Speechmatics
      const formData = new FormData();
      formData.append("data_file", audioBlob, "recording.webm");
      formData.append("config", JSON.stringify(batchConfig));

      setBatchStatus("Submitting to Speechmatics Batch API...");

      const jobResp = await fetch(`${CONFIG.BATCH_API_HOST}/jobs/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${batchJwt}`,
        },
        body: formData,
      });

      if (!jobResp.ok) {
        const errText = await jobResp.text();
        throw new Error(`Batch job creation failed: ${errText}`);
      }

      const jobData = await jobResp.json();
      const jobId = jobData.id;
      if (!jobId) throw new Error("No job ID in response");
      batchJobIdRef.current = jobId;

      // Step 4: Poll job status every 5 seconds
      // For a 1-hour recording, batch processing may take several minutes.
      // Timeout after 15 minutes to avoid infinite polling.
      setBatchStatus("Processing transcript... this may take a few minutes for a long recording.");

      const pollStartTime = Date.now();
      const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

      batchPollRef.current = setInterval(async () => {
        // Check for timeout
        if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
          if (batchPollRef.current) {
            clearInterval(batchPollRef.current);
            batchPollRef.current = null;
          }
          setBatchStatus("Transcription timed out — please try again");
          setBatchProcessing(false);
          setRecState("idle");
          setStatusKind("error");
          setStatusText("Batch transcription timed out");
          return;
        }
        try {
          const statusResp = await fetch(`${CONFIG.BATCH_API_HOST}/jobs/${jobId}`, {
            headers: { "Authorization": `Bearer ${batchJwt}` },
          });
          if (!statusResp.ok) return;
          const statusData = await statusResp.json();

          if (statusData.job?.status === "done") {
            // Stop polling
            if (batchPollRef.current) {
              clearInterval(batchPollRef.current);
              batchPollRef.current = null;
            }

            setBatchStatus("Fetching transcript...");

            // Fetch transcript (txt format for simplicity)
            const transcriptResp = await fetch(
              `${CONFIG.BATCH_API_HOST}/jobs/${jobId}/transcript?format=txt`,
              { headers: { "Authorization": `Bearer ${batchJwt}` } }
            );

            if (!transcriptResp.ok) throw new Error("Could not fetch transcript");
            const transcriptText = await transcriptResp.text();

            // Save to history (same as live mode)
            const record: SessionRecord = {
              id: `batch-${Date.now()}`,
              date: new Date().toISOString(),
              durationSec: elapsedRef.current,
              segmentCount: 0,
              preview: transcriptText.slice(0, 120).replace(/\n/g, " "),
              exportText: transcriptText,
            };
            const updated = saveSession(record);
            setHistory(updated);

            // Show the transcript in viewing mode
            setViewingRecord(record);
            setEditText(transcriptText);

            setBatchProcessing(false);
            setRecState("idle");
            setStatusText("Ready");
            setStatusKind("idle");
            setBatchStatus("");
          } else if (statusData.job?.status === "rejected") {
            if (batchPollRef.current) {
              clearInterval(batchPollRef.current);
              batchPollRef.current = null;
            }
            const rejectReason = statusData.job?.error || "unknown error";
            setBatchStatus(`Transcription failed: ${rejectReason}`);
            setBatchProcessing(false);
            setRecState("idle");
            setStatusKind("error");
            setStatusText(`Batch transcription failed: ${rejectReason}`);
          }
        } catch {
          // Polling error — keep trying, will retry on next interval
        }
      }, 5000);

    } catch (err: any) {
      setBatchProcessing(false);
      setRecState("idle");
      setStatusKind("error");
      setStatusText(`Batch error: ${err.message}`);
      setBatchStatus("");
    }
  }, [releaseWakeLock]);

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
    // More generous threshold — if within 120px of bottom, treat as "at bottom"
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
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
          {/* Mode selector — only visible when idle */}
          {recState === "idle" && !batchProcessing && (
            <div className="mode-selector">
              <button
                className={`mode-btn ${recordingMode === "live" ? "active" : ""}`}
                onClick={() => setRecordingMode("live")}
                title="Live: see the transcript as you speak"
              >
                Live
              </button>
              <button
                className={`mode-btn ${recordingMode === "batch" ? "active" : ""}`}
                onClick={() => setRecordingMode("batch")}
                title="Record & transcribe after: no live preview, typically more accurate"
              >
                Record &amp; after
              </button>
            </div>
          )}

          {/* Mic / Start button with accidental-start prevention */}
          {recState === "idle" && !batchProcessing ? (
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
          {/* Refresh vocabulary — small, unobtrusive */}
          {recState === "idle" && !batchProcessing && (
            <button
              className="vocab-refresh-btn"
              onClick={refreshVocabNow}
              disabled={vocabRefreshing}
              title="Refresh vocabulary corrections from server"
            >
              {vocabRefreshing ? "…" : "↻"}
            </button>
          )}
          <UsageBar stats={usageStats || getUsageStats(0)} />

          {viewingRecord ? (
            <>
              <button
                className={`copy-btn ${editSaved ? "copied" : ""}`}
                onClick={handleSaveEdit}
                disabled={!editDirty}
              >
                {editSaved ? "✓ Saved" : "Save"}
              </button>
              <button
                className="history-text-btn"
                onClick={() => setHistoryOpen(true)}
                aria-label="History"
                title="Session history"
              >
                History
              </button>
              <button
                className="new-session-btn"
                onClick={handleNewSession}
                aria-label="Start new session"
                title="Clear and start fresh"
              >
                + New
              </button>
            </>
          ) : (
            <>
              {liveEditMode ? (
                <>
                  <button
                    className={`copy-btn ${editSaved ? "copied" : ""}`}
                    onClick={saveLiveEdit}
                  >
                    {editSaved ? "✓ Saved" : "Save"}
                  </button>
                  <button
                    className="new-session-btn"
                    onClick={toggleLiveEdit}
                    title="Exit edit mode"
                  >
                    Done
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
                    className="edit-toggle-btn"
                    onClick={toggleLiveEdit}
                    disabled={segments.length === 0}
                    aria-label="Edit transcript"
                    title="Edit transcript"
                  >
                    Edit
                  </button>

                  <button
                    className="history-text-btn"
                    onClick={() => setHistoryOpen(true)}
                    aria-label="History"
                    title="Session history"
                  >
                    History
                  </button>

                  {segments.length > 0 && recState === "idle" && (
                    <button
                      className="new-session-btn"
                      onClick={handleNewSession}
                      aria-label="Start new session"
                      title="Clear transcript and start fresh"
                    >
                      + New
                    </button>
                  )}

                  <button
                    className={`copy-btn ${copied ? "copied" : ""}`}
                    onClick={copyTranscript}
                    disabled={segments.length === 0}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== Offline banner ===== */}
      {!isOnline && (
        <div className="tier-banner tier-banner-error">
          You're offline — transcription won't work until you reconnect
        </div>
      )}

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
        <div
          className="page"
          ref={transcriptAreaRef}
          onMouseUp={handleTranscriptMouseUp}
        >
          {batchRecording || batchProcessing ? (
            /* ===== Batch mode: recording or processing ===== */
            <div className="batch-mode">
              {batchRecording ? (
                <>
                  <div className="batch-recording-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                  </div>
                  <div className="batch-recording-text">
                    Recording — the transcript will be ready shortly after you stop.
                  </div>
                  <div className="batch-recording-time">
                    {formatTimestamp(elapsedSec)}
                  </div>
                  <div className="batch-recording-hint">
                    No live preview in this mode. Press the stop button when done.
                  </div>
                </>
              ) : (
                <>
                  <div className="batch-processing-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                  <div className="batch-processing-text">{batchStatus}</div>
                </>
              )}
            </div>
          ) : viewingRecord ? (
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
          ) : liveEditMode ? (
            /* ===== Live edit mode: edit current transcript on the page ===== */
            <div className="viewing-mode">
              <div className="viewing-meta">
                Editing live transcript
                {liveEditText !== buildExportText(segmentsRef.current) && (
                  <span className="edit-dirty"> · unsaved</span>
                )}
              </div>
              <textarea
                className="edit-transcript"
                value={liveEditText}
                onChange={(e) => setLiveEditText(e.target.value)}
                spellCheck={false}
                autoFocus
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

              {partial && (
                <span
                  className="interim"
                  dir={isArabicText(partial) ? "rtl" : "ltr"}
                >
                  {" "}{partial}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== Fix this popover (vocabulary correction) ===== */}
      {fixPopover.show && (
        <div
          className="fix-popover"
          style={{ left: fixPopover.x, top: fixPopover.y }}
        >
          <div className="fix-popover-label">
            Fix &ldquo;{fixPopover.wrongText}&rdquo; →
          </div>
          <input
            type="text"
            className="fix-popover-input"
            placeholder="What should this actually say?"
            value={fixPopover.correctText}
            onChange={(e) =>
              setFixPopover((prev) => ({ ...prev, correctText: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") submitVocabFix();
              if (e.key === "Escape") {
                setFixPopover({ show: false, x: 0, y: 0, wrongText: "", correctText: "" });
              }
            }}
            autoFocus
            disabled={fixSaving}
          />
          <button
            className="fix-popover-btn"
            onClick={submitVocabFix}
            disabled={fixSaving || !fixPopover.correctText.trim()}
          >
            {fixSaving ? "Saving…" : "Fix"}
          </button>
        </div>
      )}

      {/* ===== Fix toast ===== */}
      {fixToast && (
        <div className="fix-toast">{fixToast}</div>
      )}

      {/* ===== Vocab refresh toast ===== */}
      {vocabToast && (
        <div className="fix-toast">{vocabToast}</div>
      )}

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
