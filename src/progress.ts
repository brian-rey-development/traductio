const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const NON_TTY_INTERVAL = 100;

export type Progress = { readonly tick: () => void; readonly done: () => void };

type Snapshot = { readonly label: string; readonly completed: number; readonly total: number; readonly rate: number };

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '--';
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m${String(Math.floor(seconds % SECONDS_PER_MINUTE)).padStart(2, '0')}s`;
};

const formatLine = ({ label, completed, total, rate }: Snapshot): string => {
  const percent = ((completed / total) * 100).toFixed(1);
  const eta = formatDuration((total - completed) / rate);
  return `${label} ${completed}/${total} (${percent}%) ${rate.toFixed(2)} requests/s, ETA ${eta}`;
};

const writeLine = (line: string, completed: number, total: number): void => {
  if (process.stderr.isTTY) process.stderr.write(`\r\u001b[2K${line}`);
  else if (completed % NON_TTY_INTERVAL === 0 || completed === total) process.stderr.write(`${line}\n`);
};

// The rate counts real model calls only, so segments served from the cache do not distort the ETA on resume.
export const createProgress = (label: string, total: number, modelCalls: () => number): Progress => {
  const startedAt = Date.now();
  const callsAtStart = modelCalls();
  let completed = 0;
  return {
    tick: () => {
      completed += 1;
      const rate = (modelCalls() - callsAtStart) / ((Date.now() - startedAt) / MS_PER_SECOND);
      writeLine(formatLine({ label, completed, total, rate }), completed, total);
    },
    done: () => {
      if (process.stderr.isTTY && total > 0) process.stderr.write('\n');
    },
  };
};
