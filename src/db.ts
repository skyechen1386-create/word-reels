import { generateUnits, makeImageUnit, mergeProgress, normalizeEntry } from './logic'
import type { Backup, ReviewLog, ReviewUnit, WordEntry } from './types'
import type { AcquisitionProgress } from './acquisition/acquisitionTypes'

const DB_NAME = 'wordreels-6'
const DB_VERSION = 3

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('units')) {
        const store = db.createObjectStore('units', { keyPath: 'id' })
        store.createIndex('entryId', 'entryId'); store.createIndex('dueAt', 'dueAt'); store.createIndex('angle', 'angle')
      }
      if (!db.objectStoreNames.contains('logs')) {
        const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true })
        store.createIndex('reviewedAt', 'reviewedAt'); store.createIndex('unitId', 'unitId')
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      // v2：图片联想角度所需的本地图片存储，key 为 entryId，存原始 Blob，完全离线。
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'entryId' })
      // v3：语境习得进度，独立于 FSRS 学习单元
      if (!db.objectStoreNames.contains('acquisitionProgress')) {
        const store = db.createObjectStore('acquisitionProgress', { keyPath: 'entryId' })
        store.createIndex('completedAt', 'completedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error) })
const finished = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) })

export async function allEntries(): Promise<WordEntry[]> { const db = await database(); return request(db.transaction('entries').objectStore('entries').getAll()) }
export async function allUnits(): Promise<ReviewUnit[]> { const db = await database(); return request(db.transaction('units').objectStore('units').getAll()) }
export async function allLogs(): Promise<ReviewLog[]> { const db = await database(); return request(db.transaction('logs').objectStore('logs').getAll()) }
export async function allAcquisitionProgress(): Promise<AcquisitionProgress[]> { const db = await database(); return request(db.transaction('acquisitionProgress').objectStore('acquisitionProgress').getAll()) }

export async function importEntries(rawCards: Record<string, unknown>[]) {
  const db = await database(); let added = 0; let updated = 0; let unitCount = 0
  for (const raw of rawCards) {
    const entry = normalizeEntry(raw)
    const existing = await request<WordEntry | undefined>(db.transaction('entries').objectStore('entries').get(entry.id))
    const oldUnits = await request<ReviewUnit[]>(db.transaction('units').objectStore('units').index('entryId').getAll(entry.id))
    const oldImageUnit = oldUnits.find(item => item.angle === 'image')
    const units = mergeProgress(generateUnits(entry), oldUnits)
    if (oldImageUnit) units.push(mergeProgress([makeImageUnit(entry)], oldUnits)[0]) // 图片角度不由 generateUnits 生成，仅在此词条已上传过图片时才保留并刷新其 prompt
    const tx = db.transaction(['entries', 'units'], 'readwrite')
    tx.objectStore('entries').put({ ...entry, createdAt: existing?.createdAt || entry.createdAt })
    oldUnits.filter(old => !units.some(unit => unit.id === old.id)).forEach(old => tx.objectStore('units').delete(old.id))
    units.forEach(unit => tx.objectStore('units').put(unit)); await finished(tx)
    existing ? updated++ : added++; unitCount += units.length
  }
  return { added, updated, unitCount }
}

/**
 * 分批导入，避免 UI 卡顿
 * 大量词卡导入时推荐使用这个版本
 */
export async function importEntriesBatched(
  rawCards: Record<string, unknown>[],
  onProgress?: (current: number, total: number) => void,
  batchSize: number = 50
) {
  const db = await database()
  let added = 0
  let updated = 0
  let unitCount = 0

  for (let i = 0; i < rawCards.length; i += batchSize) {
    const batch = rawCards.slice(i, Math.min(i + batchSize, rawCards.length))

    for (const raw of batch) {
      const entry = normalizeEntry(raw)
      const existing = await request<WordEntry | undefined>(db.transaction('entries').objectStore('entries').get(entry.id))
      const oldUnits = await request<ReviewUnit[]>(db.transaction('units').objectStore('units').index('entryId').getAll(entry.id))
      const oldImageUnit = oldUnits.find(item => item.angle === 'image')
      const units = mergeProgress(generateUnits(entry), oldUnits)
      if (oldImageUnit) units.push(mergeProgress([makeImageUnit(entry)], oldUnits)[0])
      const tx = db.transaction(['entries', 'units'], 'readwrite')
      tx.objectStore('entries').put({ ...entry, createdAt: existing?.createdAt || entry.createdAt })
      oldUnits.filter(old => !units.some(unit => unit.id === old.id)).forEach(old => tx.objectStore('units').delete(old.id))
      units.forEach(unit => tx.objectStore('units').put(unit))
      await finished(tx)
      existing ? updated++ : added++
      unitCount += units.length
    }

    // 每处理完一批，让出控制权给 UI
    if (onProgress) {
      onProgress(Math.min(i + batchSize, rawCards.length), rawCards.length)
    }

    // 使用 setTimeout 0 让浏览器处理 UI 更新
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  return { added, updated, unitCount }
}

export async function saveReview(unit: ReviewUnit, log: ReviewLog) {
  const db = await database(); const tx = db.transaction(['units', 'logs'], 'readwrite')
  tx.objectStore('units').put(unit); tx.objectStore('logs').add(log); await finished(tx)
}

export async function saveAcquisitionProgress(progress: AcquisitionProgress) {
  const db = await database(); const tx = db.transaction('acquisitionProgress', 'readwrite')
  tx.objectStore('acquisitionProgress').put(progress); await finished(tx)
}

export async function removeEntry(entryId: string) {
  const db = await database(); const unitIds = await request<ReviewUnit[]>(db.transaction('units').objectStore('units').index('entryId').getAll(entryId))
  const tx = db.transaction(['entries', 'units', 'images'], 'readwrite'); tx.objectStore('entries').delete(entryId); unitIds.forEach(item => tx.objectStore('units').delete(item.id)); tx.objectStore('images').delete(entryId); await finished(tx)
}

export async function clearLearningData() {
  const db = await database()
  // logs（复习历史记录）不清空：统计页的打卡天数、正确率趋势等数据依赖它，
  // 即使词库被清空重新导入，这些"复习习惯"数据也应该延续下去。
  const tx = db.transaction(['entries', 'units', 'images', 'acquisitionProgress'], 'readwrite')
  tx.objectStore('entries').clear()
  tx.objectStore('units').clear()
  tx.objectStore('images').clear()
  tx.objectStore('acquisitionProgress').clear()
  await finished(tx)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await database(); const value = await request<{ key: string; value: T } | undefined>(db.transaction('settings').objectStore('settings').get(key)); return value?.value ?? fallback
}
export async function setSetting(key: string, value: unknown) { const db = await database(); const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ key, value }); await finished(tx) }
export async function allSettings() { const db = await database(); const values = await request<Array<{ key: string; value: unknown }>>(db.transaction('settings').objectStore('settings').getAll()); return Object.fromEntries(values.map(item => [item.key, item.value])) }

// ---- 图片联想（本地存储，不联网） ----
export async function getEntryImage(entryId: string): Promise<Blob | undefined> {
  const db = await database()
  const record = await request<{ entryId: string; blob: Blob } | undefined>(db.transaction('images').objectStore('images').get(entryId))
  return record?.blob
}

export async function setEntryImage(entryId: string, blob: Blob) {
  const db = await database()
  const entry = await request<WordEntry | undefined>(db.transaction('entries').objectStore('entries').get(entryId))
  if (!entry) throw new Error('找不到对应的词条。')
  const existingUnit = await request<ReviewUnit | undefined>(db.transaction('units').objectStore('units').get(`${entryId}::image::0`))
  const unit = existingUnit || makeImageUnit(entry)
  const tx = db.transaction(['images', 'units'], 'readwrite')
  tx.objectStore('images').put({ entryId, blob })
  tx.objectStore('units').put(unit)
  await finished(tx)
}

export async function removeEntryImage(entryId: string) {
  const db = await database()
  const tx = db.transaction(['images', 'units'], 'readwrite')
  tx.objectStore('images').delete(entryId)
  tx.objectStore('units').delete(`${entryId}::image::0`)
  await finished(tx)
}

export async function setEntryNote(entryId: string, note: string) {
  const db = await database()
  const entry = await request<WordEntry | undefined>(db.transaction('entries').objectStore('entries').get(entryId))
  if (!entry) throw new Error('找不到对应的词条。')
  const tx = db.transaction('entries', 'readwrite')
  tx.objectStore('entries').put({ ...entry, myNote: note, updatedAt: Date.now() })
  await finished(tx)
}

// ---- Blob <-> Base64（用于把图片一起放进 JSON 备份，保持离线可用） ----
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer(); const bytes = new Uint8Array(buffer)
  let binary = ''; const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  return btoa(binary)
}
function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function createBackup(): Promise<Backup> {
  const db = await database()
  const imageRecords = await request<Array<{ entryId: string; blob: Blob }>>(db.transaction('images').objectStore('images').getAll())
  const images = await Promise.all(imageRecords.map(async item => ({ entryId: item.entryId, base64: await blobToBase64(item.blob), type: item.blob.type || 'image/jpeg' })))
  return {
    schema: 'wordreels-backup-v6',
    exportedAt: new Date().toISOString(),
    appVersion: '0.1.1',
    entries: await allEntries(),
    units: await allUnits(),
    logs: await allLogs(),
    settings: await allSettings(),
    images,
    acquisitionProgress: await allAcquisitionProgress(),
  }
}

export async function restoreBackup(backup: Backup) {
  if (backup.schema !== 'wordreels-backup-v6') throw new Error('这不是 WordReels 6 完整备份。')
  const db = await database(); const tx = db.transaction(['entries', 'units', 'logs', 'settings', 'images', 'acquisitionProgress'], 'readwrite')
  for (const name of ['entries', 'units', 'logs', 'settings', 'images', 'acquisitionProgress']) {
    if (db.objectStoreNames.contains(name)) tx.objectStore(name).clear()
  }
  backup.entries.forEach(item => tx.objectStore('entries').put(item))
  backup.units.forEach(item => tx.objectStore('units').put(item))
  backup.logs.forEach(item => tx.objectStore('logs').put(item))
  Object.entries(backup.settings || {}).forEach(([key, value]) => tx.objectStore('settings').put({ key, value }))
  ;(backup.images || []).forEach(item => tx.objectStore('images').put({ entryId: item.entryId, blob: base64ToBlob(item.base64, item.type) }))
  ;(backup.acquisitionProgress || []).forEach(item => tx.objectStore('acquisitionProgress').put(item))
  await finished(tx)
}

// ---- 语境习得优化（大规模词库支持） ----
/** 缓存统计信息，避免重复计算 */
let cachedAcquisitionStats: { classA: number; classB: number; classC: number; timestamp: number } | null = null

export async function clearAcquisitionCache() {
  cachedAcquisitionStats = null
  await setSetting('acquisitionStatsCache', null)
}

export async function getCachedAcquisitionStats() {
  // 内存缓存优先
  if (cachedAcquisitionStats && Date.now() - cachedAcquisitionStats.timestamp < 3600000) {
    return cachedAcquisitionStats
  }

  // 尝试数据库缓存（避免频繁重算）
  const cached = await getSetting<{ classA: number; classB: number; classC: number; timestamp: number } | null>('acquisitionStatsCache', null)
  if (cached && Date.now() - cached.timestamp < 86400000) { // 24小时内有效
    cachedAcquisitionStats = cached
    return cached
  }

  return null
}

export async function setCachedAcquisitionStats(stats: { classA: number; classB: number; classC: number }) {
  const withTimestamp = { ...stats, timestamp: Date.now() }
  cachedAcquisitionStats = withTimestamp
  await setSetting('acquisitionStatsCache', withTimestamp)
}

/** 获取随机一个已准备好的词条（高效方式，避免加载所有词条） */
export async function getRandomReadyEntry(hasContextsChecker: (entry: WordEntry) => boolean): Promise<WordEntry | null> {
  const entries = await allEntries()
  const ready = entries.filter(hasContextsChecker)
  if (ready.length === 0) return null
  return ready[Math.floor(Math.random() * ready.length)]
}

