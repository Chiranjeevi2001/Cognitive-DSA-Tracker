interface ActivityProgress {
  history: readonly { date: string; result: string }[];
}

// A problem contributes at most once to each day, including successful reviews.
export function countDailySolves(progress: Record<string, ActivityProgress>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const problem of Object.values(progress)) {
    const dates = new Set(problem.history.filter((event) => event.result === 'solved').map((event) => event.date));
    for (const date of dates) {
      counts[date] = (counts[date] ?? 0) + 1;
    }
  }
  return counts;
}
