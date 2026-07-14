import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Database,
  Download,
  ExternalLink,
  Filter,
  Flame,
  NotebookPen,
  Play,
  RotateCcw,
  Search,
  Target,
  Timer,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { categories, problems, type Problem } from './problemData';
import {
  NORMAL_STAGES,
  WEAK_STAGES,
  addDays,
  daysBetween,
  formatDate,
  isDue,
  normalGap,
  todayKey,
} from './schedule';

const STORAGE_KEY = 'dsa-tracker-state-v1';
const API_STATE_URL = '/api/state';
const MAX_DAILY_PROBLEMS = 5;

type Status = 'not-started' | 'reviewing' | 'mastered';
type StatusFilter = 'All' | 'Not started' | 'Reviewing' | 'Due' | 'Weak' | 'Mastered';
type StorageMode = 'checking' | 'file' | 'browser';

interface Notebook {
  pattern: string;
  insight: string;
  complexity: string;
  traps: string;
  recognition: string;
  mistakes: string;
  notes: string;
}

interface WeakProgress {
  active: boolean;
  stepIndex: number;
  successCount: number;
}

interface ReviewEvent {
  date: string;
  kind: 'initial' | 'review' | 'weak' | 'weak-start' | 'reset';
  stageLabel: string;
  stageOffsetDays?: number;
  result: 'solved' | 'weak' | 'reset';
}

interface ProblemProgress {
  id: string;
  status: Status;
  startedOn?: string;
  nextReviewOn?: string;
  stageIndex: number;
  weak?: WeakProgress;
  masteredOn?: string;
  lastReviewedOn?: string;
  notebook: Notebook;
  history: ReviewEvent[];
}

interface Settings {
  startDate: string;
  dailyMinutes: number;
}

interface TrackerState {
  settings: Settings;
  progress: Record<string, ProblemProgress>;
}

interface StateApiResponse {
  exists: boolean;
  state: Partial<TrackerState> | null;
  path?: string;
}

const emptyNotebook: Notebook = {
  pattern: '',
  insight: '',
  complexity: '',
  traps: '',
  recognition: '',
  mistakes: '',
  notes: '',
};

const defaultSettings = (): Settings => ({
  startDate: todayKey(),
  dailyMinutes: 60,
});

const defaultProgress = (id: string): ProblemProgress => ({
  id,
  status: 'not-started',
  stageIndex: 0,
  notebook: { ...emptyNotebook },
  history: [],
});

function getProblemProgress(progress: Record<string, ProblemProgress>, id: string): ProblemProgress {
  return progress[id] ?? defaultProgress(id);
}

function loadState(): TrackerState {
  return normalizeState(readLocalState());
}

function readLocalState(): Partial<TrackerState> | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<TrackerState>) : null;
  } catch {
    return null;
  }
}

function normalizeState(value: Partial<TrackerState> | null | undefined): TrackerState {
  const fallback: TrackerState = {
    settings: defaultSettings(),
    progress: {},
  };

  return {
    settings: {
      ...fallback.settings,
      ...(value?.settings ?? {}),
    },
    progress: value?.progress ?? {},
  };
}

function stateWeight(state: TrackerState): number {
  return Object.values(state.progress).reduce((weight, progress) => {
    const notebookWeight = Object.values(progress.notebook ?? {}).filter(Boolean).length;
    const activeWeight = progress.status !== 'not-started' ? 1 : 0;

    return weight + activeWeight + notebookWeight + progress.history.length;
  }, 0);
}

function statusLabel(progress: ProblemProgress, due: boolean): StatusFilter {
  if (progress.status === 'mastered') {
    return 'Mastered';
  }

  if (progress.weak?.active) {
    return 'Weak';
  }

  if (due) {
    return 'Due';
  }

  if (progress.status === 'reviewing') {
    return 'Reviewing';
  }

  return 'Not started';
}

function difficultyClass(difficulty: Problem['difficulty']): string {
  return difficulty.toLowerCase();
}

function getCurrentStage(progress: ProblemProgress) {
  if (progress.weak?.active) {
    return WEAK_STAGES[progress.weak.stepIndex] ?? WEAK_STAGES[0];
  }

  return NORMAL_STAGES[progress.stageIndex] ?? NORMAL_STAGES[0];
}

function getStageOffset(progress: ProblemProgress): number | undefined {
  if (progress.weak?.active) {
    return undefined;
  }

  return NORMAL_STAGES[progress.stageIndex]?.offsetDays;
}

function appendEvent(progress: ProblemProgress, event: ReviewEvent): ReviewEvent[] {
  return [...progress.history, event];
}

function didRetainAfter30Days(progress: ProblemProgress): boolean {
  return progress.history.some(
    (event) =>
      event.result === 'solved' &&
      event.kind === 'review' &&
      typeof event.stageOffsetDays === 'number' &&
      event.stageOffsetDays >= 30,
  );
}

function getStudyStartDate(progress: Record<string, ProblemProgress>): string | undefined {
  const dates = Object.values(progress).flatMap((problemProgress) => [
    ...(problemProgress.startedOn ? [problemProgress.startedOn] : []),
    ...problemProgress.history.filter((event) => event.kind === 'initial').map((event) => event.date),
  ]);

  return dates.sort()[0];
}

function App() {
  const [state, setState] = useState<TrackerState>(loadState);
  const [selectedId, setSelectedId] = useState(problems[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [storageMode, setStorageMode] = useState<StorageMode>('checking');
  const [storageMessage, setStorageMessage] = useState('Checking file storage');
  const importRef = useRef<HTMLInputElement>(null);

  const today = todayKey();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    async function loadFileState() {
      try {
        const response = await fetch(API_STATE_URL, { cache: 'no-store' });

        if (!response.ok) {
          throw new Error(`State API returned ${response.status}`);
        }

        const payload = (await response.json()) as StateApiResponse;

        if (cancelled) {
          return;
        }

        if (payload.exists && payload.state) {
          const fileState = normalizeState(payload.state);
          const localState = normalizeState(readLocalState());
          const shouldMigrateLocalState = stateWeight(localState) > stateWeight(fileState);

          setState(shouldMigrateLocalState ? localState : fileState);
          setStorageMessage(shouldMigrateLocalState ? 'Migrated browser data' : 'Loaded from file');
        } else {
          setStorageMessage('File storage ready');
        }

        setStorageMode('file');
      } catch {
        if (!cancelled) {
          setStorageMode('browser');
          setStorageMessage('Using browser storage');
        }
      }
    }

    void loadFileState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (storageMode !== 'file') {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setStorageMessage('Saving to file');
        const response = await fetch(API_STATE_URL, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(state),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`State API returned ${response.status}`);
        }

        setStorageMessage(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStorageMode('browser');
          setStorageMessage('File save failed; using browser storage');
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [state, storageMode]);

  const selectedProblem = useMemo(
    () => problems.find((problem) => problem.id === selectedId) ?? problems[0],
    [selectedId],
  );

  const progressByProblem = useMemo(
    () =>
      problems.map((problem) => ({
        problem,
        progress: getProblemProgress(state.progress, problem.id),
      })),
    [state.progress],
  );

  const dueReviews = useMemo(
    () =>
      progressByProblem
        .filter(({ progress }) => progress.status === 'reviewing' && isDue(progress.nextReviewOn, today))
        .sort((a, b) => (a.progress.nextReviewOn ?? '').localeCompare(b.progress.nextReviewOn ?? '')),
    [progressByProblem, today],
  );

  const weakReviews = useMemo(
    () => progressByProblem.filter(({ progress }) => progress.weak?.active),
    [progressByProblem],
  );

  const upcomingReviews = useMemo(
    () =>
      progressByProblem
        .filter(({ progress }) => progress.status === 'reviewing' && !isDue(progress.nextReviewOn, today))
        .sort((a, b) => (a.progress.nextReviewOn ?? '').localeCompare(b.progress.nextReviewOn ?? ''))
        .slice(0, 8),
    [progressByProblem, today],
  );

  const eventsToday = Object.values(state.progress).flatMap((progress) =>
    progress.history.filter((event) => event.date === today),
  );
  const newToday = eventsToday.filter((event) => event.kind === 'initial' && event.result === 'solved').length;
  const reviewsToday = eventsToday.filter(
    (event) => (event.kind === 'review' || event.kind === 'weak') && event.result === 'solved',
  ).length;

  const studyStartDate = getStudyStartDate(state.progress);
  const studyDay = studyStartDate ? Math.max(1, daysBetween(studyStartDate, today) + 1) : 1;
  const currentMonth = Math.max(1, Math.floor((studyDay - 1) / 30) + 1);
  const targetNew = currentMonth === 1 ? 2 : 1;
  const reviewMinutes = currentMonth === 1 ? 20 : 50;
  const newMinutes = state.settings.dailyMinutes - reviewMinutes;
  const masteredCount = progressByProblem.filter(({ progress }) => progress.status === 'mastered').length;
  const retained30 = progressByProblem.filter(({ progress }) => didRetainAfter30Days(progress)).length;
  const availableNewProblems = progressByProblem.filter(({ progress }) => progress.status === 'not-started');
  const scheduledDueReviews = dueReviews.slice(0, MAX_DAILY_PROBLEMS);
  const overflowDueReviews = Math.max(0, dueReviews.length - scheduledDueReviews.length);
  const remainingDailyCapacity = Math.max(0, MAX_DAILY_PROBLEMS - scheduledDueReviews.length);
  const dailyNewProblems = availableNewProblems.slice(0, remainingDailyCapacity);
  const todayTaskCount = scheduledDueReviews.length + dailyNewProblems.length;

  const filteredProblems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return progressByProblem.filter(({ problem, progress }) => {
      const due = isDue(progress.nextReviewOn, today);
      const status = statusLabel(progress, due);
      const matchesQuery =
        !normalizedQuery ||
        problem.title.toLowerCase().includes(normalizedQuery) ||
        problem.category.toLowerCase().includes(normalizedQuery) ||
        problem.difficulty.toLowerCase().includes(normalizedQuery);
      const matchesCategory = categoryFilter === 'All' || problem.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || status === statusFilter;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, progressByProblem, query, statusFilter, today]);

  function updateProblem(id: string, updater: (progress: ProblemProgress) => ProblemProgress) {
    setState((current) => {
      const progress = getProblemProgress(current.progress, id);
      return {
        ...current,
        progress: {
          ...current.progress,
          [id]: updater(progress),
        },
      };
    });
  }

  function completeInitialSolve(id: string) {
    updateProblem(id, (progress) => {
      const date = todayKey();
      return {
        ...progress,
        status: 'reviewing',
        startedOn: progress.startedOn ?? date,
        stageIndex: 1,
        nextReviewOn: addDays(date, NORMAL_STAGES[1].offsetDays),
        weak: undefined,
        lastReviewedOn: date,
        history: appendEvent(progress, {
          date,
          kind: 'initial',
          stageLabel: NORMAL_STAGES[0].label,
          stageOffsetDays: 0,
          result: 'solved',
        }),
      };
    });
  }

  function recordNormalSuccess(id: string) {
    updateProblem(id, (progress) => {
      if (progress.status === 'not-started') {
        const date = todayKey();
        return {
          ...progress,
          status: 'reviewing',
          startedOn: date,
          stageIndex: 1,
          nextReviewOn: addDays(date, NORMAL_STAGES[1].offsetDays),
          history: appendEvent(progress, {
            date,
            kind: 'initial',
            stageLabel: NORMAL_STAGES[0].label,
            stageOffsetDays: 0,
            result: 'solved',
          }),
        };
      }

      if (progress.weak?.active) {
        return recordWeakSuccess(progress);
      }

      const date = todayKey();
      const currentStageIndex = Math.max(1, progress.stageIndex);
      const currentStage = NORMAL_STAGES[currentStageIndex] ?? NORMAL_STAGES[1];
      const history = appendEvent(progress, {
        date,
        kind: 'review',
        stageLabel: currentStage.label,
        stageOffsetDays: currentStage.offsetDays,
        result: 'solved',
      });

      if (currentStageIndex >= NORMAL_STAGES.length - 1) {
        return {
          ...progress,
          status: 'mastered',
          nextReviewOn: undefined,
          lastReviewedOn: date,
          masteredOn: date,
          history,
        };
      }

      const nextStageIndex = currentStageIndex + 1;
      return {
        ...progress,
        status: 'reviewing',
        stageIndex: nextStageIndex,
        nextReviewOn: addDays(date, normalGap(currentStageIndex, nextStageIndex)),
        lastReviewedOn: date,
        history,
      };
    });
  }

  function recordWeakSuccess(progress: ProblemProgress): ProblemProgress {
    const date = todayKey();
    const weak = progress.weak ?? { active: true, stepIndex: 0, successCount: 0 };
    const weakStage = WEAK_STAGES[weak.stepIndex] ?? WEAK_STAGES[0];
    const successCount = weak.successCount + 1;
    const history = appendEvent(progress, {
      date,
      kind: 'weak',
      stageLabel: weakStage.label,
      result: 'solved',
    });

    if (successCount >= WEAK_STAGES.length) {
      const currentNormalStage = Math.max(1, progress.stageIndex);

      if (currentNormalStage >= NORMAL_STAGES.length - 1) {
        return {
          ...progress,
          status: 'mastered',
          weak: undefined,
          nextReviewOn: undefined,
          lastReviewedOn: date,
          masteredOn: date,
          history,
        };
      }

      const nextStageIndex = currentNormalStage + 1;
      return {
        ...progress,
        status: 'reviewing',
        weak: undefined,
        stageIndex: nextStageIndex,
        nextReviewOn: addDays(date, normalGap(currentNormalStage, nextStageIndex)),
        lastReviewedOn: date,
        history,
      };
    }

    const nextWeakStageIndex = Math.min(weak.stepIndex + 1, WEAK_STAGES.length - 1);
    return {
      ...progress,
      status: 'reviewing',
      weak: {
        active: true,
        stepIndex: nextWeakStageIndex,
        successCount,
      },
      nextReviewOn: addDays(date, WEAK_STAGES[nextWeakStageIndex].delayDays),
      lastReviewedOn: date,
      history,
    };
  }

  function markWeak(id: string) {
    updateProblem(id, (progress) => {
      const date = todayKey();
      const stage = getCurrentStage(progress);

      return {
        ...progress,
        status: 'reviewing',
        weak: {
          active: true,
          stepIndex: 0,
          successCount: 0,
        },
        nextReviewOn: addDays(date, WEAK_STAGES[0].delayDays),
        lastReviewedOn: date,
        history: appendEvent(progress, {
          date,
          kind: 'weak-start',
          stageLabel: stage.label,
          stageOffsetDays: getStageOffset(progress),
          result: 'weak',
        }),
      };
    });
  }

  function resetProblem(id: string) {
    if (!window.confirm('Reset review progress for this problem? Your notes will be kept.')) {
      return;
    }

    updateProblem(id, (progress) => ({
      ...defaultProgress(id),
      notebook: {
        ...emptyNotebook,
        ...progress.notebook,
      },
    }));
  }

  function updateStartDateFromImportedData(parsed: Partial<TrackerState>) {
    const importedState = normalizeState(parsed);
    const importedStartDate = getStudyStartDate(importedState.progress);

    if (!importedStartDate) {
      return importedState;
    }

    return {
      ...importedState,
      settings: {
        ...importedState.settings,
        startDate: importedStartDate,
      },
    };
  }

  function setImportedState(parsed: Partial<TrackerState>) {
    const importedState = updateStartDateFromImportedData(parsed);

    setState((current) => {
      const next = {
        ...importedState,
        settings: {
          ...current.settings,
          ...importedState.settings,
        },
      };

      return {
        ...next,
      };
    });
  }

  function updateNotebook(id: string, field: keyof Notebook, value: string) {
    updateProblem(id, (progress) => ({
      ...progress,
      notebook: {
        ...progress.notebook,
        [field]: value,
      },
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dsa-tracker-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<TrackerState>;
      setImportedState(parsed);
    } catch {
      window.alert('Could not import that tracker file.');
    } finally {
      event.target.value = '';
    }
  }

  const selectedProgress = selectedProblem
    ? getProblemProgress(state.progress, selectedProblem.id)
    : defaultProgress('');
  const selectedDue = isDue(selectedProgress.nextReviewOn, today);
  const selectedStage = getCurrentStage(selectedProgress);
  const selectedStatus = statusLabel(selectedProgress, selectedDue);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">NeetCode 150 spaced review</p>
          <h1>DSA Tracker</h1>
        </div>
        <div className="topbar-actions">
          <span className={`storage-pill ${storageMode}`} title="Tracker persistence mode">
            <Database size={16} />
            {storageMessage}
          </span>
          <button className="icon-button" type="button" onClick={exportData} title="Export tracker data">
            <Download size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => importRef.current?.click()}
            title="Import tracker data"
          >
            <Upload size={18} />
          </button>
          <input ref={importRef} className="hidden-input" type="file" accept="application/json" onChange={importData} />
        </div>
      </header>

      <main>
        <section className="daily-band">
          <div className="daily-copy">
            <p className="eyebrow">Study day {studyDay} · Month {currentMonth}</p>
            <h2>{newMinutes} min new work / {reviewMinutes} min review</h2>
            <p>
              {studyStartDate
                ? `Started from your first Day 0 solve on ${formatDate(studyStartDate)}.`
                : 'The study day starts when you complete your first Day 0 solve.'}
            </p>
          </div>

          <div className="metric-grid">
            <MetricCard icon={<Target size={18} />} label="New today" value={`${newToday}/${targetNew}`} />
            <MetricCard icon={<CheckCircle2 size={18} />} label="Reviews done" value={String(reviewsToday)} />
            <MetricCard icon={<Timer size={18} />} label="Reviews due" value={String(dueReviews.length)} />
            <MetricCard icon={<AlertTriangle size={18} />} label="Weak queue" value={String(weakReviews.length)} />
            <MetricCard icon={<BookOpen size={18} />} label="Mastered" value={`${masteredCount}/${problems.length}`} />
            <MetricCard icon={<Flame size={18} />} label="30-day retained" value={`${retained30}/${problems.length}`} />
          </div>

          <div className="today-plan">
            <div className="today-plan-header">
              <div>
                <span className="small-label">Today&apos;s work</span>
                <strong>{todayTaskCount === 0 ? 'Done for today' : `${todayTaskCount} problems queued`}</strong>
              </div>
              <span>{newToday + reviewsToday} completed today</span>
            </div>

            <div className="today-task-list">
              {scheduledDueReviews.map(({ problem, progress }) => (
                <TodayTaskItem
                  key={`review-${problem.id}`}
                  problem={problem}
                  label={progress.weak?.active ? 'Weak review' : 'Review'}
                  detail={getCurrentStage(progress).label}
                  onSelect={() => setSelectedId(problem.id)}
                  onPrimary={() => recordNormalSuccess(problem.id)}
                  primaryLabel="Solved"
                  onSecondary={() => markWeak(problem.id)}
                  secondaryLabel="Weak"
                />
              ))}

              {dailyNewProblems.map(({ problem }) => (
                <TodayTaskItem
                  key={`new-${problem.id}`}
                  problem={problem}
                  label="New problem"
                  detail={`Phase ${problem.phase} · ${problem.category}`}
                  onSelect={() => setSelectedId(problem.id)}
                  onPrimary={() => {
                    setSelectedId(problem.id);
                    completeInitialSolve(problem.id);
                  }}
                  primaryLabel="Complete Day 0"
                />
              ))}

              {todayTaskCount === 0 && (
                <EmptyState icon={<CheckCircle2 size={22} />} text="No scheduled work remains for today." />
              )}
            </div>

            {overflowDueReviews > 0 && (
              <p className="small-label">{overflowDueReviews} more due review{overflowDueReviews === 1 ? '' : 's'} waiting behind today&apos;s 5-problem cap.</p>
            )}
          </div>
        </section>

        <section className="workbench">
          <aside className="queue-column">
            <SectionHeader icon={<Timer size={18} />} title="Review Queue" count={scheduledDueReviews.length} />
            <div className="queue-list">
              {scheduledDueReviews.length === 0 ? (
                <EmptyState icon={<CheckCircle2 size={22} />} text="No reviews due today." />
              ) : (
                scheduledDueReviews.map(({ problem, progress }) => (
                  <QueueItem
                    key={problem.id}
                    problem={problem}
                    progress={progress}
                    active={problem.id === selectedProblem?.id}
                    onSelect={() => setSelectedId(problem.id)}
                    onSolved={() => recordNormalSuccess(problem.id)}
                    onWeak={() => markWeak(problem.id)}
                  />
                ))
              )}
            </div>
            {overflowDueReviews > 0 && (
              <p className="small-label">{overflowDueReviews} additional due review{overflowDueReviews === 1 ? '' : 's'} are deferred to keep today within 5 problems.</p>
            )}
          </aside>

          <section className="problem-detail">
            {selectedProblem && (
              <>
                <div className="problem-title-row">
                  <div>
                    <div className="title-meta">
                      <span className={`difficulty ${difficultyClass(selectedProblem.difficulty)}`}>
                        {selectedProblem.difficulty}
                      </span>
                      <span className={`status-pill ${selectedStatus.toLowerCase().replace(' ', '-')}`}>
                        {selectedStatus}
                      </span>
                    </div>
                    <h2>{selectedProblem.title}</h2>
                    <p>{selectedProblem.category} · Phase {selectedProblem.phase}</p>
                  </div>
                  <div className="link-actions">
                    <a href={selectedProblem.leetcodeUrl} target="_blank" rel="noreferrer" className="icon-link">
                      LeetCode
                      <ExternalLink size={15} />
                    </a>
                    <a href={selectedProblem.neetcodeUrl} target="_blank" rel="noreferrer" className="icon-link">
                      NeetCode
                      <ExternalLink size={15} />
                    </a>
                  </div>
                </div>

                <div className="stage-panel">
                  <div>
                    <span className="small-label">{selectedProgress.weak?.active ? 'Weak protocol' : 'Normal stage'}</span>
                    <h3>{selectedStage.label}</h3>
                    <p>{selectedStage.target}</p>
                  </div>
                  <div className="stage-date">
                    <span>Next review</span>
                    <strong>{formatDate(selectedProgress.nextReviewOn)}</strong>
                  </div>
                </div>

                <div className="action-row">
                  {selectedProgress.status === 'not-started' ? (
                    <button type="button" className="primary-button" onClick={() => completeInitialSolve(selectedProblem.id)}>
                      <Play size={16} />
                      Complete Day 0
                    </button>
                  ) : (
                    <>
                      <button type="button" className="primary-button" onClick={() => recordNormalSuccess(selectedProblem.id)}>
                        <CheckCircle2 size={16} />
                        Solved Review
                      </button>
                      {selectedProgress.status !== 'mastered' && (
                        <button type="button" className="danger-button" onClick={() => markWeak(selectedProblem.id)}>
                          <AlertTriangle size={16} />
                          Mark Weak
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => resetProblem(selectedProblem.id)}
                    title="Reset review progress and keep notebook notes"
                  >
                    <RotateCcw size={16} />
                    Reset Progress
                  </button>
                </div>

                <div className="notebook-grid">
                  <NotebookField
                    label="Pattern"
                    value={selectedProgress.notebook.pattern}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'pattern', value)}
                  />
                  <NotebookField
                    label="Core insight"
                    value={selectedProgress.notebook.insight}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'insight', value)}
                  />
                  <NotebookField
                    label="Complexity"
                    value={selectedProgress.notebook.complexity}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'complexity', value)}
                  />
                  <NotebookField
                    label="Common traps"
                    value={selectedProgress.notebook.traps}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'traps', value)}
                  />
                  <NotebookField
                    label="Recognition signals"
                    value={selectedProgress.notebook.recognition}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'recognition', value)}
                  />
                  <NotebookField
                    label="Mistakes"
                    value={selectedProgress.notebook.mistakes}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'mistakes', value)}
                  />
                  <NotebookField
                    label="Extra notes"
                    value={selectedProgress.notebook.notes}
                    onChange={(value) => updateNotebook(selectedProblem.id, 'notes', value)}
                    wide
                  />
                </div>
              </>
            )}
          </section>

          <aside className="queue-column secondary">
            <SectionHeader icon={<AlertTriangle size={18} />} title="Weak Points" count={weakReviews.length} />
            <div className="queue-list compact">
              {weakReviews.length === 0 ? (
                <EmptyState icon={<Circle size={22} />} text="No weak problems active." />
              ) : (
                weakReviews.map(({ problem, progress }) => (
                  <button
                    key={problem.id}
                    type="button"
                    className="weak-row"
                    onClick={() => setSelectedId(problem.id)}
                  >
                    <strong>{problem.title}</strong>
                    <span>
                      {getCurrentStage(progress).label} · {formatDate(progress.nextReviewOn)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <SectionHeader icon={<CalendarDays size={18} />} title="Upcoming" count={upcomingReviews.length} />
            <div className="queue-list compact">
              {upcomingReviews.map(({ problem, progress }) => (
                <button
                  key={problem.id}
                  type="button"
                  className="upcoming-row"
                  onClick={() => setSelectedId(problem.id)}
                >
                  <span>{formatDate(progress.nextReviewOn)}</span>
                  <strong>{problem.title}</strong>
                </button>
              ))}
              {upcomingReviews.length === 0 && <EmptyState icon={<BookOpen size={22} />} text="Start a problem to build the queue." />}
            </div>
          </aside>
        </section>

        <section className="library-section">
          <div className="library-toolbar">
            <SectionHeader icon={<NotebookPen size={18} />} title="Problem Library" count={filteredProblems.length} />
            <div className="filters">
              <label className="search-control">
                <Search size={16} />
                <input
                  type="search"
                  value={query}
                  placeholder="Search problems"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="select-control">
                <Filter size={16} />
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option>All</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <select className="plain-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                {(['All', 'Not started', 'Reviewing', 'Due', 'Weak', 'Mastered'] satisfies StatusFilter[]).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="problem-table">
            {filteredProblems.map(({ problem, progress }) => {
              const due = isDue(progress.nextReviewOn, today);
              const status = statusLabel(progress, due);

              return (
                <button
                  key={problem.id}
                  type="button"
                  className={`problem-row ${problem.id === selectedProblem?.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(problem.id)}
                >
                  <span className="phase-cell">P{problem.phase}</span>
                  <span className="problem-name">
                    <strong>{problem.title}</strong>
                    <small>{problem.category}</small>
                  </span>
                  <span className={`difficulty ${difficultyClass(problem.difficulty)}`}>{problem.difficulty}</span>
                  <span className={`status-pill ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
                  <span className="date-cell">{formatDate(progress.nextReviewOn)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="section-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{count}</span>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function TodayTaskItem({
  problem,
  label,
  detail,
  onSelect,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: {
  problem: Problem;
  label: string;
  detail: string;
  onSelect: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}) {
  return (
    <article className="today-task">
      <button type="button" className="today-task-main" onClick={onSelect}>
        <span className="small-label">{label}</span>
        <strong>{problem.title}</strong>
        <small>{detail}</small>
      </button>
      <span className={`difficulty ${difficultyClass(problem.difficulty)}`}>{problem.difficulty}</span>
      <div className="today-task-actions">
        <button type="button" className="primary-button" onClick={onPrimary}>
          <CheckCircle2 size={16} />
          {primaryLabel}
        </button>
        {onSecondary && secondaryLabel && (
          <button type="button" className="danger-button" onClick={onSecondary}>
            <AlertTriangle size={16} />
            {secondaryLabel}
          </button>
        )}
      </div>
    </article>
  );
}

function QueueItem({
  problem,
  progress,
  active,
  onSelect,
  onSolved,
  onWeak,
}: {
  problem: Problem;
  progress: ProblemProgress;
  active: boolean;
  onSelect: () => void;
  onSolved: () => void;
  onWeak: () => void;
}) {
  const stage = getCurrentStage(progress);

  return (
    <article className={`queue-item ${active ? 'active' : ''}`}>
      <button type="button" className="queue-main" onClick={onSelect}>
        <span className={`difficulty ${difficultyClass(problem.difficulty)}`}>{problem.difficulty}</span>
        <strong>{problem.title}</strong>
        <small>{stage.label} · {formatDate(progress.nextReviewOn)}</small>
      </button>
      <div className="mini-actions">
        <button type="button" onClick={onSolved} title="Mark solved">
          <CheckCircle2 size={16} />
        </button>
        <button type="button" onClick={onWeak} title="Mark weak">
          <AlertTriangle size={16} />
        </button>
      </div>
    </article>
  );
}

function NotebookField({
  label,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`notebook-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={wide ? 5 : 4} />
    </label>
  );
}

export default App;
