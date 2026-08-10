import { generateUnits, mergeProgress, normalizeEntry } from './logic'
import type { Backup, ReviewLog, ReviewUnit, WordEntry } from './types'

const DB_NAME = 'wordreels-6'
const DB_VERSION = 1

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

export async function importEntries(rawCards: Record<string, unknown>[]) {
  const db = await database(); let added = 0; let updated = 0; let unitCount = 0
  for (const raw of rawCards) {
    const entry = normalizeEntry(raw)
    const existing = await request<WordEntry | undefined>(db.transaction('entries').objectStore('entries').get(entry.id))
    const oldUnits = await request<ReviewUnit[]>(db.transaction('units').objectStore('units').index('entryId').getAll(entry.id))
    const units = mergeProgress(generateUnits(entry), oldUnits)
    const tx = db.transaction(['entries', 'units'], 'readwrite')
    tx.objectStore('entries').put({ ...entry, createdAt: existing?.createdAt || entry.createdAt })
    oldUnits.filter(old => !units.some(unit => unit.id === old.id)).forEach(old => tx.objectStore('units').delete(old.id))
    units.forEach(unit => tx.objectStore('units').put(unit)); await finished(tx)
    existing ? updated++ : added++; unitCount += units.length
  }
  return { added, updated, unitCount }
}

export async function saveReview(unit: ReviewUnit, log: ReviewLog) {
  const db = await database(); const tx = db.transaction(['units', 'logs'], 'readwrite')
  tx.objectStore('units').put(unit); tx.objectStore('logs').add(log); await finished(tx)
}

export async function removeEntry(entryId: string) {
  const db = await database(); const unitIds = await request<ReviewUnit[]>(db.transaction('units').objectStore('units').index('entryId').getAll(entryId))
  const tx = db.transaction(['entries', 'units'], 'readwrite'); tx.objectStore('entries').delete(entryId); unitIds.forEach(item => tx.objectStore('units').delete(item.id)); await finished(tx)
}

export async function clearLearningData() {
  const db = await database()
  const tx = db.transaction(['entries', 'units', 'logs'], 'readwrite')
  tx.objectStore('entries').clear()
  tx.objectStore('units').clear()
  tx.objectStore('logs').clear()
  await finished(tx)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await database(); const value = await request<{ key: string; value: T } | undefined>(db.transaction('settings').objectStore('settings').get(key)); return value?.value ?? fallback
}
export async function setSetting(key: string, value: unknown) { const db = await database(); const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ key, value }); await finished(tx) }
export async function allSettings() { const db = await database(); const values = await request<Array<{ key: string; value: unknown }>>(db.transaction('settings').objectStore('settings').getAll()); return Object.fromEntries(values.map(item => [item.key, item.value])) }

export async function createBackup(): Promise<Backup> {
  return { schema: 'wordreels-backup-v6', exportedAt: new Date().toISOString(), appVersion: '0.1.1', entries: await allEntries(), units: await allUnits(), logs: await allLogs(), settings: await allSettings() }
}

export async function restoreBackup(backup: Backup) {
  if (backup.schema !== 'wordreels-backup-v6') throw new Error('这不是 WordReels 6 完整备份。')
  const db = await database(); const tx = db.transaction(['entries', 'units', 'logs', 'settings'], 'readwrite')
  for (const name of ['entries', 'units', 'logs', 'settings']) tx.objectStore(name).clear()
  backup.entries.forEach(item => tx.objectStore('entries').put(item)); backup.units.forEach(item => tx.objectStore('units').put(item)); backup.logs.forEach(item => tx.objectStore('logs').put(item))
  Object.entries(backup.settings || {}).forEach(([key, value]) => tx.objectStore('settings').put({ key, value }))
  await finished(tx)
}
