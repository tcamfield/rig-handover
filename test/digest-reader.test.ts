import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseLine, readNight } from '../src/digest/read-night.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('reads 5 jobs, sorted by job, and counts the 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('keeps a null owner as null, and keeps the row', () => {
    const row = night.rows.find((r) => r.job === 'digest/render');
    expect(row).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('sums runs and retries per job, with the last status and the last error', () => {
    const byJob = Object.fromEntries(night.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['lane/sync']).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(byJob['notes/backup']).toMatchObject({ owner: 'lane-07', runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob['rig/rotate-logs']).toMatchObject({ firstAt: '2026-10-28T23:00:02+01:00', lastError: null });
  });

  it('counts valid lines by status', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('skips blank lines, counts bad ones, never throws', () => {
    write(
      '2026-01-03',
      [
        '',
        '{"at":"2026-01-03T23:00:00+01:00","job":"b","status":"ok","owner":"rook"}',
        '   ',
        'not json',
        '[]',
        'null',
        '{"at":"2026-01-03T23:00:00+01:00","job":"a","status":"done","owner":"rook"}',
        '{"at":"yesterday","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T23:00:00+01:00","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T23:00:00+01:00","job":"a","status":"ok","owner":7}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-03')!;
    expect(night.rows.map((r) => r.job)).toEqual(['b']);
    expect(night.badLines).toBe(7);
  });

  it('orders a job by time, keeping each logged offset', () => {
    write(
      '2026-01-04',
      [
        '{"at":"2026-01-04T23:30:00+01:00","job":"x","status":"retry","owner":"rook","error":"late"}',
        '{"at":"2026-01-04T22:00:00Z","job":"x","status":"fail","owner":"rook","error":"early"}',
      ].join('\n'),
    );
    const [row] = readNight(dir, '2026-01-04')!.rows;
    expect(row).toMatchObject({
      firstAt: '2026-01-04T22:00:00Z',
      lastAt: '2026-01-04T23:30:00+01:00',
      runs: 2,
      lastStatus: 'retry',
      lastError: 'late',
    });
  });
});

describe('parseLine', () => {
  it('treats a missing owner as null and drops nothing else', () => {
    expect(parseLine('{"at":"2026-01-01T00:00:00+01:00","job":"j","status":"ok"}')).toEqual({
      at: '2026-01-01T00:00:00+01:00',
      job: 'j',
      status: 'ok',
      owner: null,
    });
  });
});
