import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus, StatusCounts } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Plan morning-digest § 1. Contract in ./types.ts.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return digest(night, text);
};

export function digest(night: string, text: string): Night {
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) lines.push(line);
    else badLines++;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunLine[]>();
  for (const line of lines) {
    counts[line.status]++;
    const runs = byJob.get(line.job);
    if (runs) runs.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, counts, badLines };
}

// Time order, not file order; the log order breaks ties. `at` keeps its offset for display.
function toRow(runs: RunLine[]): DigestRow {
  const sorted = runs
    .map((line, i) => ({ line, i, t: Date.parse(line.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((r) => r.line);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastError = sorted.findLast((l) => l.error !== undefined)?.error ?? null;
  return {
    job: last.job,
    owner: last.owner,
    runs: sorted.length,
    retries: sorted.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

// The edge: anything that isn't a well-formed RunLine is a bad line. A missing owner is `null`.
export function parseLine(raw: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const { at, job, status, owner = null, error } = o;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status: status as RunStatus, owner };
  if (error !== undefined) line.error = error;
  return line;
}
