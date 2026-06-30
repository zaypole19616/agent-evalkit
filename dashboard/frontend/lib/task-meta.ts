// Task taxonomy for the dashboard. Categories are generic ("Task type 1/2")
// so any project can group its own test sets; the demo maps its placeholder
// test sets into the two buckets. taskLabel/Description fall back to the raw
// task key when no explicit mapping is provided, so a new test set shows up
// with its key as the label out of the box.
export type TaskCategory = 'Task type 1' | 'Task type 2'

export const TASK_CATEGORIES: Record<TaskCategory, string[]> = {
  'Task type 1': ['Test set 1', 'Test set 2'],
  'Task type 2': ['Test set 3'],
}

// Bilingual display labels for the category keys (keys themselves are stable
// internal ids). categoryLabel(cat, t) renders the one for the current lang.
const CATEGORY_ZH: Record<string, string> = {
  'Task type 1': '任务类型 1',
  'Task type 2': '任务类型 2',
}

export function categoryLabel(cat: string, t: (zh: string, en: string) => string): string {
  return t(CATEGORY_ZH[cat] ?? cat, cat)
}

// Optional per-task display metadata. Empty by default — taskLabel() falls
// back to the raw task key, which is already human-readable for the demo.
export const TASK_LABELS: Record<string, string> = {}
export const TASK_DESCRIPTIONS: Record<string, string> = {}
export const SCORING_SCALES: Record<string, string> = {}

export function taskLabel(task: string): string {
  return TASK_LABELS[task] ?? task
}

export function taskDescription(task: string): string {
  return TASK_DESCRIPTIONS[task] ?? ''
}

export function taskScoringScale(task: string): string {
  return SCORING_SCALES[task] ?? ''
}

// Which category a task belongs to. Unknown tasks default to the first
// category (matches the fallback in ``groupTasksByCategory``).
export function taskCategory(task: string): TaskCategory {
  for (const [cat, members] of Object.entries(TASK_CATEGORIES) as Array<[TaskCategory, string[]]>) {
    if (members.includes(task)) return cat
  }
  return 'Task type 1'
}

export function groupTasksByCategory(taskKeys: string[]): Array<{ category: TaskCategory; tasks: string[] }> {
  const out: Array<{ category: TaskCategory; tasks: string[] }> = []
  for (const [cat, members] of Object.entries(TASK_CATEGORIES) as Array<[TaskCategory, string[]]>) {
    const present = members.filter((m) => taskKeys.includes(m))
    if (present.length > 0) out.push({ category: cat, tasks: present })
  }
  // Anything not in a category goes into a fallback bucket appended to the first.
  const known = new Set(Object.values(TASK_CATEGORIES).flat())
  const unknown = taskKeys.filter((t) => !known.has(t)).sort()
  if (unknown.length > 0) {
    out.push({ category: 'Task type 1' as TaskCategory, tasks: unknown })
  }
  return out
}
