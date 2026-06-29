import type { Leaderboard, LeaderboardRow } from './types'
import { taskCategory, type TaskCategory } from './task-meta'

// Real cross-task weighted score, computed client-side. The chain
// runner (``runners/benchmark/run_many.py``) spawns one ``cmd_run``
// per (model, task) cell, so each global ``weighted_score`` row written
// to leaderboard.json is actually just that single task's score, not
// a true cross-task mean. Rather than rewrite the chain runner and
// re-run everything, we recompute from the per-task ``data.tasks``
// rows on read: for each model take its latest score per task (by
// ``tested_at``), then mean across tasks the model has any score for.
// Tasks the model never ran simply don't enter that model's denominator.
export function computeWeightedByModel(
  tasksByName: Leaderboard['tasks'],
): Map<string, number> {
  const latestScoreByModelTask = new Map<string, Map<string, number>>()
  for (const [taskName, rows] of Object.entries(tasksByName)) {
    const latestForTask = new Map<string, { score: number; tested_at: string }>()
    for (const r of rows) {
      const prev = latestForTask.get(r.model)
      if (!prev || prev.tested_at < r.tested_at) {
        latestForTask.set(r.model, { score: r.score, tested_at: r.tested_at })
      }
    }
    for (const [model, info] of latestForTask) {
      // Skip null / non-numeric scores — a task shown as "—" (a voided model
      // like DeepSeek, or a task with too few valid cases) must not be counted
      // nor drag the mean to NaN. The model's weighted = mean over the tasks
      // it actually has a score for.
      if (!Number.isFinite(info.score)) continue
      if (!latestScoreByModelTask.has(model)) latestScoreByModelTask.set(model, new Map())
      latestScoreByModelTask.get(model)!.set(taskName, info.score)
    }
  }
  const weighted = new Map<string, number>()
  for (const [model, taskMap] of latestScoreByModelTask) {
    const scores = Array.from(taskMap.values())
    if (scores.length > 0) weighted.set(model, scores.reduce((a, b) => a + b, 0) / scores.length)
  }
  return weighted
}

// Per-model cost, broken out by task category. Two units the user actually
// cares about:
//   - 生成均价: "what does it cost to do ONE generation operation on this
//     model" — mean across generation tasks (html_gen / md_gen / pptx_gen /…).
//   - 检索均价: same for recall / search.
// Plus the legacy ``full_sum`` (sum of per-task means across all covered
// tasks) kept as a tooltip footnote — it's the run-the-whole-suite price,
// which only makes sense from an ops/budget perspective.
//
// Replaces the older "sum of per-task means" + "mean of per-task medians".
// Both flattened the dispersion across radically different task types
// (recall ≈ $0.02, pptx_gen ≈ $2) into one meaningless figure.
export interface CategoryCost {
  mean: number | null   // mean of per-task means (over tasks with cost)
  covered: number       // # tasks with cost data
  total: number         // # tasks of this category in the leaderboard
}

export interface ModelCost {
  generation: CategoryCost
  retrieval: CategoryCost
  full_sum: number      // sum across every covered task (any category)
  total_covered: number // # tasks with cost
  total_tasks: number   // # tasks total in the leaderboard
}

function emptyCategory(): CategoryCost {
  return { mean: null, covered: 0, total: 0 }
}

export function computeCostByModel(
  tasksByName: Leaderboard['tasks'],
): Map<string, ModelCost> {
  const allTaskNames = Object.keys(tasksByName)
  const totalByCategory: Record<TaskCategory, number> = { '任务类型 1': 0, '任务类型 2': 0 }
  for (const t of allTaskNames) totalByCategory[taskCategory(t)]++

  // model → task → mean(cost_median_usd over (model, task)'s runs)
  const perTaskMean = new Map<string, Map<string, number>>()
  for (const [taskName, rows] of Object.entries(tasksByName)) {
    const byModel = new Map<string, number[]>()
    for (const r of rows) {
      const c = r.cost_median_usd
      if (c == null || c <= 0) continue
      if (!byModel.has(r.model)) byModel.set(r.model, [])
      byModel.get(r.model)!.push(c)
    }
    for (const [model, costs] of byModel) {
      if (!perTaskMean.has(model)) perTaskMean.set(model, new Map())
      const mean = costs.reduce((a, b) => a + b, 0) / costs.length
      perTaskMean.get(model)!.set(taskName, mean)
    }
  }

  const out = new Map<string, ModelCost>()
  for (const [model, taskMap] of perTaskMean) {
    const byCat: Record<TaskCategory, number[]> = { '任务类型 1': [], '任务类型 2': [] }
    for (const [taskName, cost] of taskMap) byCat[taskCategory(taskName)].push(cost)

    const generation: CategoryCost = {
      mean: byCat['任务类型 1'].length
        ? byCat['任务类型 1'].reduce((a, b) => a + b, 0) / byCat['任务类型 1'].length
        : null,
      covered: byCat['任务类型 1'].length,
      total: totalByCategory['任务类型 1'],
    }
    const retrieval: CategoryCost = {
      mean: byCat['任务类型 2'].length
        ? byCat['任务类型 2'].reduce((a, b) => a + b, 0) / byCat['任务类型 2'].length
        : null,
      covered: byCat['任务类型 2'].length,
      total: totalByCategory['任务类型 2'],
    }
    const taskCosts = Array.from(taskMap.values())
    out.set(model, {
      generation,
      retrieval,
      full_sum: taskCosts.reduce((a, b) => a + b, 0),
      total_covered: taskMap.size,
      total_tasks: allTaskNames.length,
    })
  }
  return out
}

// Same shape but scoped to a single chain (one specific set of run_ids)
// — used by /models/<X>/ history rows so each chain shows its own
// 生成均价 / 检索均价 instead of a misleading sum.
export function computeChainCategoryCost(
  runIdByTask: Record<string, string>,
  tasksByName: Leaderboard['tasks'],
): { generation: CategoryCost; retrieval: CategoryCost; full_sum: number } | null {
  const lookup = new Map<string, LeaderboardRow>()
  for (const [taskName, rows] of Object.entries(tasksByName)) {
    for (const r of rows) lookup.set(`${taskName}::${r.run_id}`, r)
  }
  const taskKeys = Object.keys(runIdByTask)
  const totalByCategory: Record<TaskCategory, number> = { '任务类型 1': 0, '任务类型 2': 0 }
  for (const t of taskKeys) totalByCategory[taskCategory(t)]++

  const costsByCat: Record<TaskCategory, number[]> = { '任务类型 1': [], '任务类型 2': [] }
  let fullSum = 0
  let anyCost = false
  for (const task of taskKeys) {
    const r = lookup.get(`${task}::${runIdByTask[task]}`)
    const c = r?.cost_median_usd
    if (c == null || c <= 0) continue
    anyCost = true
    fullSum += c
    costsByCat[taskCategory(task)].push(c)
  }
  if (!anyCost) return null

  const cat = (name: TaskCategory): CategoryCost => ({
    mean: costsByCat[name].length
      ? costsByCat[name].reduce((a, b) => a + b, 0) / costsByCat[name].length
      : null,
    covered: costsByCat[name].length,
    total: totalByCategory[name],
  })
  return { generation: cat('任务类型 1'), retrieval: cat('任务类型 2'), full_sum: fullSum }
}
