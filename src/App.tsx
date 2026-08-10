import { useCallback, useEffect, useMemo, useState } from 'react'
import { allEntries, allUnits, clearLearningData, createBackup, getSetting, importEntries, removeEntry, restoreBackup, saveReview, setSetting } from './db'
import { angleLabels, extractCards, schedule, secureShuffle } from './logic'
import type { Backup, Rating, ReviewUnit, StudyAngle, WordEntry } from './types'

type View = 'review' | 'library' | 'transfer' | 'settings'
const angles = Object.keys(angleLabels) as StudyAngle[]
const ratings: Array<{ value: Rating; key: string; label: string; hint: string }> = [
  { value: 1, key: '1', label: '不会', hint: '10分钟' }, { value: 2, key: '2', label: '混淆', hint: '6小时' },
  { value: 3, key: '3', label: '提示后会', hint: '1天' }, { value: 4, key: '4', label: '勉强想起', hint: '缩短间隔' },
  { value: 5, key: '5', label: '稳定答出', hint: '延长间隔' },
]

const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value)
const download = (name: string, value: string) => { const url = URL.createObjectURL(new Blob([value], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }

function Badges({ entry }: { entry: WordEntry }) {
  const grammar = entry.grammar || {}
  return <div className="badges">{[grammar.pos, grammar.level, grammar.article, ...(entry.tags || []).slice(0, 4)].map(text).filter(Boolean).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="entry-section"><h3>{title}</h3>{children}</section>
}

function FullEntry({ entry, focus }: { entry: WordEntry; focus?: ReviewUnit }) {
  const grammar = entry.grammar || {}; const ranked = entry.rankedMeanings || []; const parts = entry.wordBuilding?.parts || []
  const connections = Array.isArray(entry.connectionMemory) ? entry.connectionMemory : entry.connectionMemory?.links || []
  const forms = grammar.forms && typeof grammar.forms === 'object' ? Object.entries(grammar.forms as Record<string, unknown>) : []
  return <article className="flash-answer">
    <div className="answer-head"><div><span>德语</span><small>完整词条解释</small></div><em>{focus ? angleLabels[focus.angle] : '词条详情'}</em></div>
    <h1>{entry.displayForm}</h1><Badges entry={entry} />
    {focus && <section className="flash-focus"><span>本卡答案 · {angleLabels[focus.angle]}</span><strong>{focus.answer}</strong>{focus.answerDetail && <p>{focus.answerDetail}</p>}</section>}
    <div className="entry-grid">
      <Section title="字典直释"><p className="meaning-line">{entry.dictionaryMeaning?.directZh?.join('；') || entry.definition?.zh || '暂无'}</p></Section>
      {forms.length > 0 && <Section title="语法与主要形式"><div className="detail-list">{forms.map(([key, value]) => <p key={key}><b>{key}</b><span>{text(value)}</span></p>)}</div></Section>}
      {ranked.length > 0 && <Section title="常用义排名与多义语境"><div className="rank-list">{ranked.sort((a, b) => a.rank - b.rank).map(item => <article key={item.rank}><i>{item.rank}</i><div><strong>{item.zh}</strong>{item.de && <p className="de-line">{item.de}</p>}{item.usageZh && <p>{item.usageZh}</p>}{item.contexts?.map((context, index) => <div className="context" key={index}><span>{context.sceneZh}</span>{context.patternDe && <b>{context.patternDe}</b>}{context.exampleDe && <p>{context.exampleDe}<small>{context.exampleZh}</small></p>}</div>)}</div></article>)}</div></Section>}
      {(entry.definition?.de || entry.definition?.zh) && <Section title="德语解释"><p className="de-line">{entry.definition?.de}</p><p>{entry.definition?.zh}</p></Section>}
      {(entry.coreAssociation?.de || entry.coreAssociation?.zh) && <Section title="德语核心联想"><p className="de-line">{entry.coreAssociation?.de}</p><p>{entry.coreAssociation?.zh}</p></Section>}
      {(entry.pronunciation?.display || entry.pronunciation?.syllables?.length) && <Section title="拼读分段"><p className="syllables">{entry.pronunciation?.display || entry.pronunciation?.syllables?.join(' · ')}</p>{entry.pronunciation?.ipa && <p>IPA：{entry.pronunciation.ipa}</p>}{entry.pronunciation?.notesZh?.map((note, i) => <small className="block" key={i}>{note}</small>)}</Section>}
      {parts.length > 0 && <Section title="构词拆解"><div className="parts">{parts.map((part, index) => <span key={index}><b>{part.part}</b><small>{part.meaningZh || part.meaningDe}</small></span>)}</div><p>{entry.wordBuilding?.structureZh}</p>{(entry.wordBuilding?.notesZh || []).map((note, i) => <small className="block" key={i}>{note}</small>)}</Section>}
      {connections.length > 0 && <Section title="联系辅助记忆"><div className="connection-list">{connections.map((item, index) => <p key={index}><b>{item.de || item.title || item.content}</b><span>{item.zh}</span></p>)}</div></Section>}
      {(entry.mnemonic?.zh || entry.mnemonic?.textZh || entry.mnemonic?.de) && <Section title="人为联想"><p className="de-line">{entry.mnemonic?.de}</p><p>{entry.mnemonic?.zh || entry.mnemonic?.textZh}</p>{entry.mnemonic?.warningZh && <small className="warning">{entry.mnemonic.warningZh}</small>}</Section>}
      {(entry.collocations || []).length > 0 && <Section title="固定搭配与例句"><div className="collocations">{entry.collocations?.map((item, index) => <article key={index}><strong>{item.de}</strong><span>{item.zh}</span>{item.exampleDe && <p>{item.exampleDe}<small>{item.exampleZh}</small></p>}</article>)}</div></Section>}
    </div>
  </article>
}

function Review({ entries, units, refresh, enabledAngles }: { entries: WordEntry[]; units: ReviewUnit[]; refresh: () => Promise<void>; enabledAngles: StudyAngle[] }) {
  const [scope, setScope] = useState<'due' | 'all'>('due'); const [selected, setSelected] = useState<StudyAngle[]>(enabledAngles)
  const [queue, setQueue] = useState<ReviewUnit[]>([]); const [index, setIndex] = useState(0); const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState(''); const [started, setStarted] = useState(false); const [shownAt, setShownAt] = useState(Date.now())
  const entryMap = useMemo(() => new Map(entries.map(item => [item.id, item])), [entries]); const unit = queue[index]; const entry = unit ? entryMap.get(unit.entryId) : undefined
  const build = useCallback((nextScope = scope) => {
    const now = Date.now(); const pool = units.filter(item => selected.includes(item.angle) && (nextScope === 'all' || item.dueAt <= now))
    setQueue(secureShuffle(pool)); setIndex(0); setRevealed(false); setTyped(''); setStarted(true); setShownAt(Date.now())
  }, [scope, selected, units])
  const rate = useCallback(async (rating: Rating) => {
    if (!unit || !revealed) return; const reviewedAt = Date.now(); const updated = schedule(unit, rating, reviewedAt)
    await saveReview(updated, { unitId: unit.id, entryId: unit.entryId, angle: unit.angle, rating, responseTimeMs: reviewedAt - shownAt, reviewedAt, dueAt: updated.dueAt })
    setQueue(current => { const next = [...current]; next[index] = updated; if (rating === 1) next.splice(Math.min(next.length, index + 4 + Math.floor(Math.random() * 4)), 0, updated); return next })
    setIndex(value => value + 1); setRevealed(false); setTyped(''); setShownAt(Date.now()); await refresh()
  }, [index, refresh, revealed, shownAt, unit])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (!started || !unit || (event.target as HTMLElement)?.tagName === 'INPUT') return; if (event.key === ' ') { event.preventDefault(); setRevealed(true) } const option = ratings.find(item => item.key === event.key); if (revealed && option) void rate(option.value) }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [rate, revealed, started, unit])
  const toggleAngle = (angle: StudyAngle) => setSelected(current => current.includes(angle) ? current.filter(item => item !== angle) : [...current, angle])
  const totalAvailable = units.filter(item => selected.includes(item.angle) && (scope === 'all' || item.dueAt <= Date.now())).length
  return <main className="page flash-page"><header className="flash-toolbar"><div><span>INDEPENDENT FLASHCARDS</span><h1>词卡复习</h1><p>每轮重新随机 · 多角度独立进度 · 空格翻面 · 1—5评分</p></div><div className="toolbar-actions"><div className="scope"><button className={scope === 'due' ? 'active' : ''} onClick={() => { setScope('due'); setStarted(false) }}>到期词卡</button><button className={scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setStarted(false) }}>全部词卡</button></div><button className="reshuffle" onClick={() => build()}>↻ 新一轮真乱序</button></div></header>
    <div className="angle-filter"><span>复习角度</span><button className={selected.length === enabledAngles.length ? 'active' : ''} onClick={() => setSelected(enabledAngles)}>多角度混合</button>{enabledAngles.map(angle => <button key={angle} className={selected.includes(angle) ? 'active' : ''} onClick={() => toggleAngle(angle)}>{angleLabels[angle]}</button>)}</div>
    {!started ? <section className="start-panel"><div>◇</div><h2>{scope === 'due' ? `${totalAvailable} 个学习单元已到期` : `${totalAvailable} 个学习单元可复习`}</h2><p>每个单词的不同学习角度分别记录进度。</p><button disabled={!selected.length || !totalAvailable} onClick={() => build()}>{totalAvailable ? '开始本轮复习' : '当前范围没有词卡'}</button></section>
      : <><section className="flash-progress"><i><b style={{ width: `${queue.length ? Math.min(100, index / queue.length * 100) : 0}%` }} /></i><span>{Math.min(index + 1, queue.length)} / {queue.length}</span><small>{selected.length} 种角度</small></section>
      <section className="flash-stage">{!unit || !entry ? <div className="finished"><div>✓</div><h2>本轮词卡已经完成</h2><p>低评分卡片已按规则安排重现或提前到期。</p><button onClick={() => build()}>开始新的随机轮次</button></div>
        : !revealed ? <div className="flash-question"><span>{angleLabels[unit.angle]}</span><small>请主动回忆</small><h2>{unit.prompt}</h2>{unit.promptDetail && <p>{unit.promptDetail}</p>}{unit.angle === 'production' && <input value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setRevealed(true) }} placeholder="可选：输入你回忆的德语" autoCapitalize="none" autoComplete="off" />}<button onClick={() => setRevealed(true)}>点击卡片或按空格揭晓</button></div>
        : <>{typed && <div className={`typed-result ${typed.trim().toLocaleLowerCase('de') === unit.answer.trim().toLocaleLowerCase('de') ? 'correct' : 'different'}`}><span>你的输入</span><b>{typed}</b></div>}<FullEntry entry={entry} focus={unit} /></>}</section>
      {unit && revealed && <footer className="ratings">{ratings.map(item => <button key={item.value} className={`rating-${item.value}`} onClick={() => void rate(item.value)}><kbd>{item.key}</kbd><strong>{item.label}</strong><small>{item.hint}</small></button>)}</footer>}</>}
  </main>
}

function Library({ entries, units, refresh }: { entries: WordEntry[]; units: ReviewUnit[]; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [opened, setOpened] = useState<WordEntry>()
  const filtered = entries.filter(item => `${item.displayForm} ${item.lemma} ${item.dictionaryMeaning?.directZh?.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
  return <main className="page"><header className="page-title"><div><span>WORD LIBRARY</span><h1>词库</h1><p>{entries.length} 个词条 · {units.length} 个独立学习单元</p></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索德语或中文" /></header>{opened ? <div className="detail-wrap"><button className="back" onClick={() => setOpened(undefined)}>← 返回词库</button><FullEntry entry={opened} /><button className="danger" onClick={async () => { if (confirm(`删除 ${opened.displayForm}？`)) { await removeEntry(opened.id); setOpened(undefined); await refresh() } }}>删除此词条</button></div> : <div className="word-list">{filtered.map(entry => <button key={entry.id} onClick={() => setOpened(entry)}><div><strong>{entry.displayForm}</strong><span>{entry.dictionaryMeaning?.directZh?.join('；') || entry.definition?.zh}</span></div><Badges entry={entry} /><em>{units.filter(unit => unit.entryId === entry.id).length} 角度</em></button>)}</div>}</main>
}

function Transfer({ refresh }: { refresh: () => Promise<void> }) {
  const [raw, setRaw] = useState(''); const [message, setMessage] = useState('')
  const importText = async (value: string) => { try { const payload = JSON.parse(value) as unknown; if ((payload as Backup)?.schema === 'wordreels-backup-v6') { await restoreBackup(payload as Backup); setMessage('完整备份已恢复。') } else { const result = await importEntries(extractCards(payload)); setMessage(`导入完成：新增 ${result.added}，更新 ${result.updated}，生成 ${result.unitCount} 个学习单元。`) } await refresh() } catch (error) { setMessage(`导入失败：${(error as Error).message}`) } }
  const clearAll = async () => {
    if (!confirm('将删除全部词条、所有角度进度和复习记录。设置会保留。是否继续？')) return
    if (!confirm('请再次确认：清空后只能通过之前下载的备份恢复。')) return
    await clearLearningData(); setRaw(''); setMessage('词库、学习单元和复习记录已全部清空。'); await refresh()
  }
  return <main className="page"><header className="page-title"><div><span>IMPORT & BACKUP</span><h1>导入与备份</h1><p>支持新版 v3、旧版 v1/v2 词卡和 WordReels 6 完整备份</p></div></header><div className="transfer-grid"><section><h2>导入 JSON</h2><textarea value={raw} onChange={event => setRaw(event.target.value)} placeholder="粘贴词卡 JSON，或选择文件" /><div className="row"><label className="file-button">选择 JSON<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (file) { const value = await file.text(); setRaw(value); await importText(value) } }} /></label><button onClick={() => void importText(raw)} disabled={!raw.trim()}>导入粘贴内容</button></div></section><section><h2>完整备份</h2><p>备份包含词条、各角度复习进度、评分记录和设置，可在其他设备完整恢复。</p><button onClick={async () => download(`WordReels6备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await createBackup(), null, 2))}>下载完整备份</button><small>GitHub Pages 只保存程序。手机中的词库和进度保存在该手机浏览器内。</small><div className="danger-zone"><h3>清空学习数据</h3><p>删除全部词条、学习单元和复习记录，但保留设置。</p><button className="danger" onClick={() => void clearAll()}>清空全部词卡与进度</button></div></section></div>{message && <div className="message">{message}</div>}</main>
}

function Settings({ enabled, onChange }: { enabled: StudyAngle[]; onChange: (angles: StudyAngle[]) => void }) {
  const toggle = (angle: StudyAngle) => { const next = enabled.includes(angle) ? enabled.filter(item => item !== angle) : [...enabled, angle]; onChange(next); void setSetting('enabledAngles', next) }
  return <main className="page"><header className="page-title"><div><span>STUDY SETTINGS</span><h1>设置</h1><p>控制默认参与混合复习的角度</p></div></header><section className="settings-card"><h2>默认复习角度</h2>{angles.map(angle => <label key={angle}><input type="checkbox" checked={enabled.includes(angle)} onChange={() => toggle(angle)} /><span><b>{angleLabels[angle]}</b><small>{angle === 'production' ? '显示中文，主动回忆德语和拼写' : '该角度有数据时自动生成独立学习单元'}</small></span></label>)}</section></main>
}

export default function App() {
  const [view, setView] = useState<View>('review'); const [entries, setEntries] = useState<WordEntry[]>([]); const [units, setUnits] = useState<ReviewUnit[]>([]); const [enabled, setEnabled] = useState<StudyAngle[]>(angles)
  const refresh = useCallback(async () => { setEntries(await allEntries()); setUnits(await allUnits()) }, [])
  useEffect(() => { void refresh(); void getSetting<StudyAngle[]>('enabledAngles', angles).then(setEnabled) }, [refresh])
  const nav: Array<{ id: View; icon: string; label: string }> = [{ id: 'review', icon: '▱', label: '今日复习' }, { id: 'library', icon: '⌕', label: '词库' }, { id: 'transfer', icon: '⇅', label: '导入与备份' }, { id: 'settings', icon: '⚙', label: '设置' }]
  return <div className="app"><aside><div className="brand"><i>W</i><div><b>WordReels</b><span>GERMAN · v6</span></div></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav><footer><span>{entries.length} 词条</span><small>{units.filter(item => item.dueAt <= Date.now()).length} 到期单元</small></footer></aside><div className="mobile-nav">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</div><section className="content">{view === 'review' && <Review entries={entries} units={units} refresh={refresh} enabledAngles={enabled} />}{view === 'library' && <Library entries={entries} units={units} refresh={refresh} />}{view === 'transfer' && <Transfer refresh={refresh} />}{view === 'settings' && <Settings enabled={enabled} onChange={setEnabled} />}</section></div>
}
