import type { ReviewLog, ReviewUnit, StudyAngle, WordEntry } from './types'
import { angleLabels } from './logic'

const DAY = 86_400_000

const dayKey = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayCount(logs: ReviewLog[]): number {
  const key = dayKey(Date.now())
  return logs.filter(item => dayKey(item.reviewedAt) === key).length
}

export function streakDays(logs: ReviewLog[]): number {
  if (!logs.length) return 0
  const days = new Set(logs.map(item => dayKey(item.reviewedAt)))
  let streak = 0
  let cursor = Date.now()
  // 今天还没复习也不算断，从今天或最近一次开始往前数连续天数
  if (!days.has(dayKey(cursor))) cursor -= DAY
  while (days.has(dayKey(cursor))) { streak += 1; cursor -= DAY }
  return streak
}

export function overallAccuracy(logs: ReviewLog[]): number {
  if (!logs.length) return 0
  return logs.filter(item => item.rating >= 3).length / logs.length
}

export interface DailyPoint { date: string; count: number; accuracy: number }
export function dailySeries(logs: ReviewLog[], days = 30): DailyPoint[] {
  const buckets = new Map<string, ReviewLog[]>()
  for (const log of logs) {
    const key = dayKey(log.reviewedAt)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(log)
  }
  const output: DailyPoint[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const ts = Date.now() - i * DAY
    const key = dayKey(ts)
    const bucket = buckets.get(key) || []
    output.push({
      date: key,
      count: bucket.length,
      accuracy: bucket.length ? bucket.filter(item => item.rating >= 3).length / bucket.length : 0,
    })
  }
  return output
}

export interface AngleAccuracy { angle: StudyAngle; label: string; count: number; accuracy: number }
export function angleAccuracy(logs: ReviewLog[]): AngleAccuracy[] {
  const angles = Object.keys(angleLabels) as StudyAngle[]
  return angles.map(angle => {
    const items = logs.filter(log => log.angle === angle)
    return {
      angle, label: angleLabels[angle], count: items.length,
      accuracy: items.length ? items.filter(item => item.rating >= 3).length / items.length : 0,
    }
  }).filter(item => item.count > 0)
}

export interface TypedComparison { typed: { count: number; accuracy: number }; skipped: { count: number; accuracy: number } }
export function productionTypedComparison(logs: ReviewLog[]): TypedComparison {
  const items = logs.filter(log => log.angle === 'production')
  const typed = items.filter(item => item.typed)
  const skipped = items.filter(item => !item.typed)
  const rate = (list: ReviewLog[]) => list.length ? list.filter(item => item.rating >= 3).length / list.length : 0
  return { typed: { count: typed.length, accuracy: rate(typed) }, skipped: { count: skipped.length, accuracy: rate(skipped) } }
}

export interface FakeMemoryItem { entryId: string; displayForm: string; angle: StudyAngle; label: string; reps: number; daysSinceReview: number }
export function fakeMemoryWatch(units: ReviewUnit[], logs: ReviewLog[], entries: WordEntry[], tailLength = 3): FakeMemoryItem[] {
  const entryMap = new Map(entries.map(item => [item.id, item]))
  const logsByUnit = new Map<string, ReviewLog[]>()
  for (const log of logs) {
    if (!logsByUnit.has(log.unitId)) logsByUnit.set(log.unitId, [])
    logsByUnit.get(log.unitId)!.push(log)
  }
  const now = Date.now()
  const output: FakeMemoryItem[] = []
  for (const unit of units) {
    const history = (logsByUnit.get(unit.id) || []).sort((a, b) => a.reviewedAt - b.reviewedAt)
    if (history.length < tailLength || unit.reps < tailLength) continue
    const tail = history.slice(-tailLength)
    const neverStruggled = !history.some(item => item.rating <= 3)
    if (tail.every(item => item.rating === 5) && neverStruggled) {
      const entry = entryMap.get(unit.entryId)
      if (!entry) continue
      output.push({
        entryId: unit.entryId, displayForm: entry.displayForm, angle: unit.angle, label: angleLabels[unit.angle],
        reps: unit.reps, daysSinceReview: unit.lastReviewAt ? Math.floor((now - unit.lastReviewAt) / DAY) : 0,
      })
    }
  }
  return output.sort((a, b) => b.daysSinceReview - a.daysSinceReview).slice(0, 30)
}
