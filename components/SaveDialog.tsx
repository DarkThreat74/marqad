"use client";

import { useState, useEffect, useRef } from "react";

interface SaveDialogProps {
  defaultName: string;
  isBatch: boolean;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export function SaveDialog({ defaultName, isBatch, onConfirm, onCancel }: SaveDialogProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync name if defaultName changes (e.g. different recording)
  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  // Auto-focus and select the name so the user can quickly edit or just press Enter
  // 300ms timeout for mobile keyboard readiness
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    onConfirm(trimmed || defaultName);
  };

  return (
    <div className="save-dialog-overlay" onClick={onCancel}>
      <form className="save-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="save-dialog-title">
          {isBatch ? "Save recording" : "Save session"}
        </div>
        <div className="save-dialog-subtitle">
          {isBatch ? "Transcription will start after you save." : "Enter a name for this recording."}
        </div>
        <input
          ref={inputRef}
          className="save-dialog-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Session name"
        />
        <div className="save-dialog-actions">
          <button type="button" className="save-dialog-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="save-dialog-save">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
