// Plan morning-digest § 1. The shapes every part of the digest builds on: the page (#2), the
// JSON (#3), the board counts (#4) and the route tests (#5). The reader that fills them is
// `readNight` in `src/digest/read-night.ts`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing. Lines that don't fit this are bad lines.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job that ran in the night.
export type DigestRow = {
  job: string;
  // From the job's latest line. `null` stays `null` here; the page renders it as `—`, the JSON
  // returns `null`.
  owner: string | null;
  // Lines for this job, whatever their status.
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status of the job's latest line.
  lastStatus: RunStatus;
  // The most recent `error` the job reported that night, even if a later run went fine;
  // `null` if it reported none.
  lastError: string | null;
  // `at` of the job's earliest and latest line, exactly as logged (offset kept, never UTC).
  firstAt: string;
  lastAt: string;
};

// Valid lines of the night, counted by status (one count per line, not per job).
export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  counts: StatusCounts;
  // Non-blank lines that didn't parse into a RunLine. Counted, never thrown.
  badLines: number;
};

// Reads `<runsDir>/<night>.jsonl`. Never writes to `runsDir`.
//
// - No file (or `night` isn't YYYY-MM-DD): `null`. The page answers 404.
// - Empty file (or only blank or bad lines): a Night with `rows: []`. The page renders
//   "nothing ran".
export type ReadNight = (runsDir: string, night: string) => Night | null;
