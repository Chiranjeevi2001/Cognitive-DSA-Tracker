export interface ReviewStage {
  index: number;
  label: string;
  offsetDays: number;
  mode: string;
  target: string;
}

export interface WeakStage {
  index: number;
  label: string;
  delayDays: number;
  target: string;
}

export const NORMAL_STAGES: ReviewStage[] = [
  {
    index: 0,
    label: 'Initial Solve',
    offsetDays: 0,
    mode: 'Learning',
    target: 'Write pattern, insight, complexity, traps, and recognition cues.',
  },
  {
    index: 1,
    label: 'Review 1',
    offsetDays: 2,
    mode: 'Title-only recall',
    target: 'Attempt from memory for up to 10 minutes before opening notes.',
  },
  {
    index: 2,
    label: 'Review 2',
    offsetDays: 6,
    mode: 'Recall then code',
    target: 'Name the pattern, complexity, and core idea before coding.',
  },
  {
    index: 3,
    label: 'Review 3',
    offsetDays: 13,
    mode: 'Blind solve',
    target: 'Solve without notes at roughly 70% of original solve time.',
  },
  {
    index: 4,
    label: 'Review 4',
    offsetDays: 30,
    mode: 'Interview simulation',
    target: 'Timer on, no hints, no notes.',
  },
  {
    index: 5,
    label: 'Review 5',
    offsetDays: 60,
    mode: 'Mastery check',
    target: 'Solve cleanly within minutes.',
  },
  {
    index: 6,
    label: 'Review 6',
    offsetDays: 120,
    mode: 'Mastery check',
    target: 'Confirm the pattern is internalized.',
  },
];

export const WEAK_STAGES: WeakStage[] = [
  { index: 0, label: 'Weak +1', delayDays: 1, target: 'Recover the core idea without restarting the normal schedule.' },
  { index: 1, label: 'Weak +3', delayDays: 3, target: 'Solve again and tighten the missed recognition signal.' },
  { index: 2, label: 'Weak +7', delayDays: 7, target: 'Third clean solve returns the problem to normal review.' },
];

export function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(value: string, days: number): string {
  const next = parseDateKey(value);
  next.setDate(next.getDate() + days);
  return todayKey(next);
}

export function daysBetween(start: string, end: string): number {
  const startTime = parseDateKey(start).getTime();
  const endTime = parseDateKey(end).getTime();
  return Math.round((endTime - startTime) / 86_400_000);
}

export function isDue(date: string | undefined, today = todayKey()): boolean {
  if (!date) {
    return false;
  }

  return daysBetween(date, today) >= 0;
}

export function formatDate(value: string | undefined): string {
  if (!value) {
    return 'Not scheduled';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseDateKey(value));
}

export function normalGap(currentStageIndex: number, nextStageIndex: number): number {
  const current = NORMAL_STAGES[currentStageIndex] ?? NORMAL_STAGES[0];
  const next = NORMAL_STAGES[nextStageIndex] ?? NORMAL_STAGES[NORMAL_STAGES.length - 1];
  return Math.max(1, next.offsetDays - current.offsetDays);
}
