"use client";

import type { ClassPeriod } from "@/lib/marqad";

interface SettingsOverlayProps {
  periods: ClassPeriod[];
  newPeriod: {
    period_number: string;
    class_name: string;
    start_time: string;
    end_time: string;
  };
  setNewPeriod: (p: { period_number: string; class_name: string; start_time: string; end_time: string }) => void;
  periodError: string | null;
  periodSaving: boolean;
  onAdd: () => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

export function SettingsOverlay({
  periods,
  newPeriod,
  setNewPeriod,
  periodError,
  periodSaving,
  onAdd,
  onDelete,
  onClose,
}: SettingsOverlayProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Class Periods</span>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="settings-desc">
          Recording names are auto-generated based on the start time. Add or edit class periods below.
          Times cannot overlap.
        </div>

        {/* Existing periods list */}
        <div className="periods-list">
          {periods.length === 0 && (
            <div className="periods-empty">No periods configured. Add one below.</div>
          )}
          {periods.map((p) => (
            <div key={p.id ?? p.period_number} className="period-row">
              <div className="period-num">P{p.period_number}</div>
              <div className="period-name">{p.class_name}</div>
              <div className="period-time">{p.start_time} – {p.end_time}</div>
              {p.id && (
                <button
                  className="period-delete"
                  onClick={() => onDelete(p.id!)}
                  title="Delete period"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new period form */}
        <div className="period-add-section">
          <div className="period-add-label">Add new period</div>
          <div className="period-add-form">
            <input
              className="period-input period-input-num"
              type="number"
              min="1"
              placeholder="Period #"
              value={newPeriod.period_number}
              onChange={(e) => setNewPeriod({ ...newPeriod, period_number: e.target.value })}
            />
            <input
              className="period-input period-input-name"
              type="text"
              placeholder="Class name"
              value={newPeriod.class_name}
              onChange={(e) => setNewPeriod({ ...newPeriod, class_name: e.target.value })}
            />
            <input
              className="period-input period-input-time"
              type="time"
              value={newPeriod.start_time}
              onChange={(e) => setNewPeriod({ ...newPeriod, start_time: e.target.value })}
            />
            <span className="period-time-sep">–</span>
            <input
              className="period-input period-input-time"
              type="time"
              value={newPeriod.end_time}
              onChange={(e) => setNewPeriod({ ...newPeriod, end_time: e.target.value })}
            />
            <button
              className="period-add-btn"
              onClick={onAdd}
              disabled={periodSaving}
            >
              {periodSaving ? "…" : "Add"}
            </button>
          </div>
          {periodError && <div className="period-error">{periodError}</div>}
        </div>
      </div>
    </div>
  );
}
