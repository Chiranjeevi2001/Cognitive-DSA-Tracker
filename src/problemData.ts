import neetcodeRaw from './data/neetcode150_list.json';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Problem {
  id: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  leetcodeUrl: string;
  neetcodeUrl: string;
  order: number;
  phase: number;
}

type ProblemSource = {
  nurl: string;
  url: string;
  difficulty: Difficulty;
};

const rawData = neetcodeRaw as Record<string, Record<string, ProblemSource>>;

const CATEGORY_ORDER = [
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Binary Search',
  'Linked List',
  'Trees',
  'Heap / Priority Queue',
  'Backtracking',
  'Graphs',
  '1-D Dynamic Programming',
  '2-D Dynamic Programming',
  'Tries',
  'Advanced Graphs',
  'Greedy',
  'Intervals',
  'Math & Geometry',
  'Bit Manipulation',
];

const PRIORITY_BY_CATEGORY: Record<string, string[]> = {
  'Arrays & Hashing': [
    'Two Sum',
    'Contains Duplicate',
    'Group Anagrams',
    'Top K Frequent Elements',
    'Product of Array Except Self',
    'Encode and Decode Strings',
    'Longest Consecutive Sequence',
  ],
  'Two Pointers': [
    'Valid Palindrome',
    'Two Sum II Input Array Is Sorted',
    '3Sum',
    'Container With Most Water',
    'Trapping Rain Water',
  ],
  'Sliding Window': [
    'Best Time to Buy And Sell Stock',
    'Longest Substring Without Repeating Characters',
    'Longest Repeating Character Replacement',
    'Permutation in String',
    'Minimum Window Substring',
  ],
  Stack: [
    'Valid Parentheses',
    'Min Stack',
    'Daily Temperatures',
    'Car Fleet',
    'Largest Rectangle In Histogram',
  ],
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getPhase(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length + 1 : index + 1;
}

function priorityIndex(category: string, title: string, originalIndex: number): number {
  const priorities = PRIORITY_BY_CATEGORY[category] ?? [];
  const priority = priorities.indexOf(title);
  return priority === -1 ? priorities.length + originalIndex : priority;
}

export const categories = CATEGORY_ORDER.filter((category) => rawData[category]);

export const problems: Problem[] = Object.entries(rawData)
  .flatMap(([category, entries]) =>
    Object.entries(entries).map(([title, source], originalIndex) => ({
      id: `${slugify(category)}-${slugify(title)}`,
      title,
      category,
      difficulty: source.difficulty,
      leetcodeUrl: source.url,
      neetcodeUrl: source.nurl,
      phase: getPhase(category),
      order: priorityIndex(category, title, originalIndex),
    })),
  )
  .sort((a, b) => a.phase - b.phase || a.order - b.order || a.title.localeCompare(b.title));
