import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let dir: string;
let app: ReturnType<typeof createApp>;

const L = (o: object) => JSON.stringify(o);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  // Normal night: file order is not job order; "zeta" has no owner and ends in fail.
  writeFileSync(
    join(dir, '2026-01-01.jsonl'),
    [
      L({ at: '2026-01-01T01:00:00+01:00', job: 'zeta', status: 'fail', error: 'boom' }),
      L({ at: '2026-01-01T02:00:00+01:00', job: 'alpha', status: 'ok', owner: 'ana' }),
      L({ at: '2026-01-01T03:00:00+01:00', job: 'mid', status: 'ok', owner: 'bo' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-01-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-01-03.jsonl'),
    [
      L({ at: '2026-01-03T01:00:00Z', job: 'alpha', status: 'ok', owner: 'ana' }),
      'not json',
      L({ at: 'nope', job: 'x', status: 'ok' }),
    ].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-01-01T00:00:00Z', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /digest/:night', () => {
  it('renders a normal night', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-01-01');
    expect(html).toContain('alpha');
    expect(html).toContain('<tr class="warn">'); // zeta failed
    expect(html).toContain('—'); // null owner
    expect(html).not.toContain('bad line');
  });

  it('404s for a night with no file', async () => {
    const res = await app.request('/digest/2026-02-02');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('counts bad lines and still renders', async () => {
    const res = await app.request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('2 bad lines skipped');
    expect(html).toContain('alpha');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night JSON, null owner stays null', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'night', 'rows']);
    expect(body.night).toBe('2026-01-01');
    expect(body.counts).toEqual({ ok: 2, retry: 0, fail: 1 });
    expect(body.badLines).toBe(0);
    expect(body.rows.find((r) => r.job === 'zeta')?.owner).toBeNull();
  });

  it('404s with JSON for a missing night', async () => {
    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });

  it('returns rows [] for the empty night', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts bad lines and still returns rows', async () => {
    const body = (await (await app.request('/api/digest/2026-01-03')).json()) as Night;
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha']);
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same order', async () => {
    const body = (await (await app.request('/api/digest/2026-01-01')).json()) as Night;
    const html = await (await app.request('/digest/2026-01-01')).text();
    const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(body.rows.map((r) => r.job));
    expect(pageJobs).toEqual(['alpha', 'mid', 'zeta']);
  });
});
