import React, { ChangeEvent, useRef, useState } from 'react';
import { rescoreSession, SCORE_VERSION } from '../../sim/index.js';
import { deleteAllData, exportData, importData, listSessions, saveSession } from './db.js';
import './localData.css';

export function LocalDataControls(): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vajra-local-data-v${data.formatVersion}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${data.sessions.length} sessions.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await importData(JSON.parse(await file.text()) as unknown);
      window.dispatchEvent(new Event('vajra:data-changed'));
      setMessage(`Merged ${result.merged} records from the export.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      event.target.value = '';
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete all trainees, units, sessions, and settings stored on this device?')) {
      return;
    }
    setBusy(true);
    try {
      await deleteAllData();
      window.dispatchEvent(new Event('vajra:data-changed'));
      setMessage('All local VAJRA data was deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRescore = async () => {
    setBusy(true);
    setMessage('Preparing saved sessions…');
    try {
      const sessions = await listSessions();
      let mismatches = 0;
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        if (!session) continue;
        const result = rescoreSession(session.sessionLog);
        const hashMismatch = result.hash !== session.hash;
        if (hashMismatch) mismatches++;
        await saveSession({
          ...session,
          report: result.report,
          scoreVersion: SCORE_VERSION,
          hashMismatch,
          summary: {
            ...session.summary,
            total: result.report.total,
            grade: result.report.grade,
            subscores: result.report.subscores,
          },
        });
        setMessage(`Re-scoring ${i + 1}/${sessions.length}… ${mismatches} hash mismatch(es).`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      window.dispatchEvent(new Event('vajra:data-changed'));
      setMessage(`Re-scored ${sessions.length} sessions. ${mismatches} hash mismatch(es) flagged.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Re-scoring failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="local-data-controls">
      <summary>LOCAL DATA & SCORING</summary>
      <p>Data stays on this device. Export a backup before clearing local data.</p>
      <div className="local-data-actions">
        <button type="button" disabled={busy} onClick={() => void handleExport()}>Export data</button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Import data</button>
        <button type="button" disabled={busy} onClick={() => void handleRescore()}>Re-score all sessions</button>
        <button type="button" disabled={busy} onClick={() => void handleDelete()}>Delete all data</button>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void handleImport(event)} />
      </div>
      <output aria-live="polite">{message}</output>
    </details>
  );
}
