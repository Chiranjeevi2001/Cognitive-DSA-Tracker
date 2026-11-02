import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countDailySolves } from '../src/activity.ts';

test('counts distinct problems per day, including reviews and excluding failures', () => {
  const progress = {
    first: { history: [
      { date: '2026-11-01', result: 'solved', kind: 'initial' },
      { date: '2026-11-01', result: 'solved', kind: 'review' },
      { date: '2026-11-02', result: 'solved', kind: 'weak' },
      { date: '2026-11-03', result: 'weak', kind: 'weak-start' },
    ] },
    second: { history: [{ date: '2026-11-01', result: 'solved', kind: 'initial' }] },
    untouched: { history: [] },
  };
  const before = structuredClone(progress);
  assert.deepEqual(countDailySolves(progress), { '2026-11-01': 2, '2026-11-02': 1 });
  assert.deepEqual(progress, before, 'existing progress must not change');
  assert.deepEqual(countDailySolves({}), {});
});
