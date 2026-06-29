// Task taxonomy for the dashboard. Categories are generic ("任务类型 1/2")
// so any project can group its own test sets; the demo maps its
// placeholder test sets into the two buckets. taskLabel/Description fall
// back to the raw task key when no explicit mapping is provided, so a new
// test set shows up with its key as the label out of the box.
export type TaskCategory = '任务类型 1' | '任务类型 2'

export const TASK_CATEGORIES: Record<TaskCategory, string[]> = {
  '任务类型 1': ['测试集 1', '测试集 2'],
  '任务类型 2': ['测试集 3'],
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
  return '任务类型 1'
}

export function groupTasksByCategory(taskKeys: string[]): Array<{ category: TaskCategory; tasks: string[] }> {
  const out: Array<{ category: TaskCategory; tasks: string[] }> = []
  for (const [cat, members] of Object.entries(TASK_CATEGORIES) as Array<[TaskCategory, string[]]>) {
    const present = members.filter((m) => taskKeys.includes(m))
    if (present.length > 0) out.push({ category: cat, tasks: present })
  }
  // Anything not in a category goes into a fallback bucket appended to 任务类型 1
  const known = new Set(Object.values(TASK_CATEGORIES).flat())
  const unknown = taskKeys.filter((t) => !known.has(t)).sort()
  if (unknown.length > 0) {
    out.push({ category: '任务类型 1' as TaskCategory, tasks: unknown })
  }
  return out
}
