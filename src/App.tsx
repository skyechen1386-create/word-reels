import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { allEntries, allLogs, allUnits, clearLearningData, createBackup, getEntryImage, getSetting, importEntries, removeEntry, removeEntryImage, restoreBackup, saveReview, setEntryImage, setEntryNote, setSetting } from './db'
import { angleLabels, extractCards, referenceSentences, schedule, secureShuffle } from './logic'
import { angleAccuracy, dailySeries, fakeMemoryWatch, overallAccuracy, productionTypedComparison, streakDays, todayCount } from './stats'
import type { AnglePreset, Backup, Rating, ReviewLog, ReviewUnit, StudyAngle, WordEntry } from './types'

type View = 'review' | 'library' | 'transfer' | 'settings' | 'stats'
type InteractionMode = 'buttons' | 'gestures'
const angles = Object.keys(angleLabels) as StudyAngle[]
const builtinPresets: AnglePreset[] = [
  { id: 'exam-sprint', name: '考试冲刺', angles: ['recognition', 'production'], builtin: true },
  { id: 'deep-read', name: '精读模式', angles: [...angles], builtin: true },
  { id: 'sound-structure', name: '拼读构词', angles: ['pronunciation', 'word_building'], builtin: true },
]
const ratings: Array<{ value: Rating; key: string; label: string; hint: string }> = [
  { value: 1, key: '1', label: '不会', hint: '10分钟' }, { value: 2, key: '2', label: '混淆', hint: '6小时' },
  { value: 3, key: '3', label: '提示后会', hint: '1天' }, { value: 4, key: '4', label: '勉强想起', hint: '缩短间隔' },
  { value: 5, key: '5', label: '稳定答出', hint: '延长间隔' },
]

const speakGerman = (value: string) => {
  if (!value || !('speechSynthesis' in window)) return
  const utter = new SpeechSynthesisUtterance(value); utter.lang = 'de-DE'
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(utter)
}

const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value)
const download = (name: string, value: string) => { const url = URL.createObjectURL(new Blob([value], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }

function Badges({ entry }: { entry: WordEntry }) {
  const grammar = entry.grammar || {}
  return <div className="badges">{[grammar.pos, grammar.level, grammar.article, ...(entry.tags || []).slice(0, 4)].map(text).filter(Boolean).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="entry-section"><h3>{title}</h3>{children}</section>
}

function EntryImage({ entryId, className }: { entryId: string; className?: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let active = true; let objectUrl: string | undefined
    void getEntryImage(entryId).then(blob => {
      if (!active) return
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [entryId])
  if (!url) return null
  return <img className={className} src={url} alt="" />
}

function ImageManager({ entry, refresh }: { entry: WordEntry; refresh: () => Promise<void> }) {
  const [url, setUrl] = useState<string>()
  const load = useCallback(async () => {
    const blob = await getEntryImage(entry.id)
    setUrl(current => { if (current) URL.revokeObjectURL(current); return blob ? URL.createObjectURL(blob) : undefined })
  }, [entry.id])
  useEffect(() => { void load() }, [load])
  const upload = async (file: File) => { await setEntryImage(entry.id, file); await load(); await refresh() }
  const remove = async () => { if (!confirm('删除这张图片？"图片联想"复习角度会一并移除。')) return; await removeEntryImage(entry.id); await load(); await refresh() }
  return <section className="image-manager"><h3>图片联想</h3>
    {url ? <div className="image-preview"><img src={url} alt="" /><button className="danger" onClick={() => void remove()}>删除图片</button></div>
      : <p className="hint">上传一张图片后，会自动生成"图片联想"复习角度：只看图回忆这个词，不显示任何文字提示。</p>}
    <label className="file-button">{url ? '替换图片' : '上传图片'}<input type="file" accept="image/*" onChange={async event => { const file = event.target.files?.[0]; if (file) await upload(file) }} /></label>
  </section>
}

function SentenceCheck({ typed, entry }: { typed: string; entry: WordEntry }) {
  const sentences = useMemo(() => referenceSentences(entry), [entry])
  return <div className="sentence-check">
    {typed && <div className="typed-result"><span>你写的句子</span><b>{typed}</b></div>}
    <div className="reference-sentences"><h3>参考例句（自己对照判断）</h3>
      {sentences.length === 0 ? <p className="hint">这个词暂时没有收录例句，凭语感判断吧。</p> : sentences.map((item, i) => <p key={i}>{item.de}{item.zh && <small>{item.zh}</small>}</p>)}
    </div>
  </div>
}

function FullEntry({ entry, focus, onNoteChange }: { entry: WordEntry; focus?: ReviewUnit; onNoteChange?: (note: string) => void }) {
  const grammar = entry.grammar || {}; const ranked = entry.rankedMeanings || []; const parts = entry.wordBuilding?.parts || []
  const connections = Array.isArray(entry.connectionMemory) ? entry.connectionMemory : entry.connectionMemory?.links || []
  const forms = grammar.forms && typeof grammar.forms === 'object' ? Object.entries(grammar.forms as Record<string, unknown>) : []
  const [note, setNote] = useState(entry.myNote || '')
  useEffect(() => { setNote(entry.myNote || '') }, [entry.id, entry.myNote])
  return <article className="flash-answer">
    <div className="answer-head"><div><span>德语</span><small>完整词条解释</small></div><em>{focus ? angleLabels[focus.angle] : '词条详情'}</em></div>
    <h1>{entry.displayForm}<button className="speak-button" onClick={() => speakGerman(entry.displayForm)} title="朗读">🔊</button></h1><Badges entry={entry} />
    {focus && <section className="flash-focus"><span>本卡答案 · {angleLabels[focus.angle]}</span><strong>{focus.answer}</strong>{focus.answerDetail && <p>{focus.answerDetail}</p>}</section>}
    <div className="entry-grid">
      {onNoteChange && <Section title="我的笔记"><textarea className="my-note" value={note} onChange={event => setNote(event.target.value)} onBlur={() => onNoteChange(note)} placeholder="写点只有你自己看得懂的联想、经历或提示，离开这里会自动保存" rows={3} /></Section>}
      <Section title="字典直释"><p className="meaning-line">{entry.dictionaryMeaning?.directZh?.join('；') || entry.definition?.zh || '暂无'}</p></Section>
      {forms.length > 0 && <Section title="语法与主要形式"><div className="detail-list">{forms.map(([key, value]) => <p key={key}><b>{key}</b><span>{text(value)}</span></p>)}</div></Section>}
      {ranked.length > 0 && <Section title="常用义排名与多义语境"><div className="rank-list">{ranked.sort((a, b) => a.rank - b.rank).map(item => <article key={item.rank}><i>{item.rank}</i><div><strong>{item.zh}</strong>{item.de && <p className="de-line">{item.de}</p>}{item.usageZh && <p>{item.usageZh}</p>}{item.contexts?.map((context, index) => <div className="context" key={index}><span>{context.sceneZh}</span>{context.patternDe && <b>{context.patternDe}</b>}{context.exampleDe && <p>{context.exampleDe}<small>{context.exampleZh}</small></p>}</div>)}</div></article>)}</div></Section>}
      {(entry.definition?.de || entry.definition?.zh) && <Section title="德语解释"><p className="de-line">{entry.definition?.de}</p><p>{entry.definition?.zh}</p></Section>}
      {(entry.coreAssociation?.de || entry.coreAssociation?.zh) && <Section title="德语核心联想"><p className="de-line">{entry.coreAssociation?.de}</p><p>{entry.coreAssociation?.zh}</p></Section>}
      {(entry.pronunciation?.display || entry.pronunciation?.syllables?.length) && <Section title="拼读分段"><p className="syllables">{entry.pronunciation?.display || entry.pronunciation?.syllables?.join(' · ')}</p>{entry.pronunciation?.ipa && <p>IPA：{entry.pronunciation.ipa}</p>}{entry.pronunciation?.notesZh?.map((note, i) => <small className="block" key={i}>{note}</small>)}</Section>}
      {parts.length > 0 && <Section title="构词拆解"><div className="parts">{parts.map((part, index) => <span key={index}><b>{part.part}</b><small>{part.meaningZh || part.meaningDe}</small></span>)}</div><p>{entry.wordBuilding?.structureZh}</p>{(entry.wordBuilding?.notesZh || []).map((note, i) => <small className="block" key={i}>{note}</small>)}</Section>}
      {connections.length > 0 && <Section title="联系辅助记忆"><div className="connection-list">{connections.map((item, index) => <p key={index}><b>{item.de || item.title || item.content}</b><span>{item.zh}</span></p>)}</div></Section>}
      {(entry.mnemonic?.zh || entry.mnemonic?.textZh || entry.mnemonic?.de) && <Section title="人为联想"><p className="de-line">{entry.mnemonic?.de}</p><p>{entry.mnemonic?.zh || entry.mnemonic?.textZh}</p>{entry.mnemonic?.warningZh && <small className="warning">{entry.mnemonic.warningZh}</small>}</Section>}
      {(entry.examples || []).length > 0 && <Section title="例句"><div className="reference-sentences">{entry.examples?.map((example, index) => <p key={index}>{example.de}{example.zh && <small>{example.zh}</small>}</p>)}</div></Section>}
      {(entry.collocations || []).length > 0 && <Section title="固定搭配与例句"><div className="collocations">{entry.collocations?.map((item, index) => {
        const examples = item.examples?.length ? item.examples : item.exampleDe ? [{ de: item.exampleDe, zh: item.exampleZh }] : []
        return <article key={index}><strong>{item.de}</strong><span>{item.zh}</span>{examples.map((example, exampleIndex) => <p key={exampleIndex}>{example.de}<small>{example.zh}</small></p>)}</article>
      })}</div></Section>}
    </div>
  </article>
}

function Review({ entries, units, refresh, onReviewed, enabledAngles }: { entries: WordEntry[]; units: ReviewUnit[]; refresh: () => Promise<void>; onReviewed: (unit: ReviewUnit, log: ReviewLog) => void; enabledAngles: StudyAngle[] }) {
  const [scope, setScope] = useState<'due' | 'all'>('due'); const [selected, setSelected] = useState<StudyAngle[]>(enabledAngles)
  const [queue, setQueue] = useState<ReviewUnit[]>([]); const [index, setIndex] = useState(0); const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState(''); const [started, setStarted] = useState(false); const [shownAt, setShownAt] = useState(Date.now())
  const [tagFilter, setTagFilter] = useState<string[]>([]); const [customPresets, setCustomPresets] = useState<AnglePreset[]>([])
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('buttons'); const [ttsAutoPlay, setTtsAutoPlay] = useState(false)
  const [dragX, setDragX] = useState(0); const [dragLabel, setDragLabel] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null); const dragState = useRef<{ startX: number; startY: number; active: boolean } | null>(null)
  const entryMap = useMemo(() => new Map(entries.map(item => [item.id, item])), [entries]); const unit = queue[index]; const entry = unit ? entryMap.get(unit.entryId) : undefined
  const allTags = useMemo(() => Array.from(new Set(entries.flatMap(item => item.tags || []))).sort((a, b) => a.localeCompare(b, 'de')), [entries])
  useEffect(() => { void getSetting<AnglePreset[]>('customPresets', []).then(setCustomPresets) }, [])
  useEffect(() => { void getSetting<InteractionMode>('reviewInteractionMode', 'buttons').then(setInteractionMode) }, [])
  useEffect(() => { void getSetting<boolean>('ttsAutoPlay', false).then(setTtsAutoPlay) }, [])
  useEffect(() => { void getSetting<StudyAngle[]>('reviewSelectedAngles', enabledAngles).then(setSelected) }, [])
  useEffect(() => { void getSetting<string[]>('reviewTagFilter', []).then(setTagFilter) }, [])
  useEffect(() => { if (revealed && ttsAutoPlay && entry) speakGerman(entry.displayForm) }, [revealed, ttsAutoPlay, entry])
  const matchesTags = useCallback((entryId: string) => {
    if (!tagFilter.length) return true
    const item = entryMap.get(entryId); return tagFilter.every(tag => (item?.tags || []).includes(tag))
  }, [entryMap, tagFilter])
  const availableUnits = useMemo(() => {
    const now = Date.now()
    const selectedAngles = new Set(selected)
    return units.filter(item => selectedAngles.has(item.angle) && matchesTags(item.entryId) && (scope === 'all' || item.dueAt <= now))
  }, [matchesTags, scope, selected, units])
  const build = useCallback(() => {
    setQueue(secureShuffle(availableUnits)); setIndex(0); setRevealed(false); setTyped(''); setStarted(true); setShownAt(Date.now())
  }, [availableUnits])
  const rate = useCallback(async (rating: Rating) => {
    if (!unit || !revealed) return; const reviewedAt = Date.now(); const updated = schedule(unit, rating, reviewedAt)
    const log: ReviewLog = { unitId: unit.id, entryId: unit.entryId, angle: unit.angle, rating, responseTimeMs: reviewedAt - shownAt, reviewedAt, dueAt: updated.dueAt }
    if (unit.angle === 'production') log.typed = !!typed.trim()
    await saveReview(updated, log)
    onReviewed(updated, log)
    setQueue(current => { const next = [...current]; next[index] = updated; if (rating === 1) next.splice(Math.min(next.length, index + 4 + Math.floor(Math.random() * 4)), 0, updated); return next })
    setIndex(value => value + 1); setRevealed(false); setTyped(''); setShownAt(Date.now()); setDragX(0); setDragLabel('')
  }, [index, onReviewed, revealed, shownAt, typed, unit])
  const requestReveal = useCallback(() => {
    if (revealed) return
    if (unit?.angle === 'production' && !typed.trim() && !confirm('确定不试着写写看吗？主动回忆效果更好，但你也可以直接看答案。')) return
    setRevealed(true)
  }, [revealed, typed, unit])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (!started || !unit || (event.target as HTMLElement)?.tagName === 'INPUT' || (event.target as HTMLElement)?.tagName === 'TEXTAREA') return; if (event.key === ' ') { event.preventDefault(); requestReveal() } const option = ratings.find(item => item.key === event.key); if (revealed && option) void rate(option.value) }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [rate, requestReveal, revealed, started, unit])
  const toggleAngle = (angle: StudyAngle) => { const next = selected.includes(angle) ? selected.filter(item => item !== angle) : [...selected, angle]; setSelected(next); void setSetting('reviewSelectedAngles', next) }
  const selectAllAngles = () => { setSelected(enabledAngles); void setSetting('reviewSelectedAngles', enabledAngles) }
  const toggleTag = (tag: string) => { const next = tagFilter.includes(tag) ? tagFilter.filter(item => item !== tag) : [...tagFilter, tag]; setTagFilter(next); void setSetting('reviewTagFilter', next) }
  const clearTags = () => { setTagFilter([]); void setSetting('reviewTagFilter', []) }
  const applyPreset = (preset: AnglePreset) => { const next = preset.angles.filter(angle => enabledAngles.includes(angle)); setSelected(next); void setSetting('reviewSelectedAngles', next) }
  const savePreset = async () => {
    const name = prompt('给这个角度组合起个名字：'); if (!name?.trim()) return
    const preset: AnglePreset = { id: `custom-${Date.now()}`, name: name.trim(), angles: selected }
    const next = [...customPresets, preset]; setCustomPresets(next); await setSetting('customPresets', next)
  }
  const removePreset = async (id: string) => { const next = customPresets.filter(item => item.id !== id); setCustomPresets(next); await setSetting('customPresets', next) }
  const totalAvailable = availableUnits.length
  const bucketFromDx = (dx: number, width: number): Rating => {
    const half = Math.max(60, width / 2); const clamped = Math.max(-half, Math.min(half, dx))
    const ratio = (clamped + half) / (half * 2)
    return (Math.min(4, Math.floor(ratio * 5)) + 1) as Rating
  }
  const onPointerDown = (event: React.PointerEvent) => {
    if (interactionMode !== 'gestures' || !unit) return
    dragState.current = { startX: event.clientX, startY: event.clientY, active: true }
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (interactionMode !== 'gestures' || !dragState.current?.active) return
    const dx = event.clientX - dragState.current.startX; const dy = event.clientY - dragState.current.startY
    if (!revealed) { if (dy < -60) { dragState.current.active = false; requestReveal() }; return }
    setDragX(dx); const width = cardRef.current?.offsetWidth || 300
    setDragLabel(ratings.find(item => item.value === bucketFromDx(dx, width))?.label || '')
  }
  const onPointerUp = () => {
    if (interactionMode !== 'gestures' || !dragState.current?.active) { dragState.current = null; return }
    dragState.current = null
    if (revealed && Math.abs(dragX) > 40) { const width = cardRef.current?.offsetWidth || 300; void rate(bucketFromDx(dragX, width)) }
    else { setDragX(0); setDragLabel('') }
  }
  const stopInputClick = (event: React.MouseEvent) => event.stopPropagation()
  return <main className="page flash-page"><header className="flash-toolbar"><div><span>INDEPENDENT FLASHCARDS</span><h1>词卡复习</h1><p>每轮重新随机 · 多角度独立进度 · 空格翻面 · 1—5评分</p></div><div className="toolbar-actions"><div className="scope"><button className={scope === 'due' ? 'active' : ''} onClick={() => { setScope('due'); setStarted(false) }}>到期词卡</button><button className={scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setStarted(false) }}>全部词卡</button></div><button className="reshuffle" onClick={() => build()}>↻ 新一轮真乱序</button></div></header>
    <button className="filters-toggle" onClick={() => setFiltersOpen(current => !current)}>{filtersOpen ? '收起筛选与角度设置 ▴' : '筛选与角度设置 ▾'}</button>
    {filtersOpen && <div className="filters-panel">
      <div className="preset-row"><span>预设模板</span>{builtinPresets.map(preset => <button key={preset.id} onClick={() => applyPreset(preset)}>{preset.name}</button>)}{customPresets.map(preset => <button key={preset.id} className="preset-custom" onClick={() => applyPreset(preset)}>{preset.name}<i onClick={event => { event.stopPropagation(); void removePreset(preset.id) }}>×</i></button>)}<button className="preset-save" onClick={() => void savePreset()}>+ 保存当前组合</button></div>
      <div className="angle-filter"><span>复习角度</span><button className={selected.length === enabledAngles.length ? 'active' : ''} onClick={selectAllAngles}>多角度混合</button>{enabledAngles.map(angle => <button key={angle} className={selected.includes(angle) ? 'active' : ''} onClick={() => toggleAngle(angle)}>{angleLabels[angle]}</button>)}</div>
      {allTags.length > 0 && <div className="angle-filter tag-filter"><span>标签筛选</span>{allTags.map(tag => <button key={tag} className={tagFilter.includes(tag) ? 'active' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}{tagFilter.length > 0 && <button className="clear-tags" onClick={clearTags}>清除</button>}</div>}
    </div>}
    {!started ? <section className="start-panel"><div>◇</div><h2>{scope === 'due' ? `${totalAvailable} 个学习单元已到期` : `${totalAvailable} 个学习单元可复习`}</h2><p>每个单词的不同学习角度分别记录进度。</p><button disabled={!selected.length || !totalAvailable} onClick={() => build()}>{totalAvailable ? '开始本轮复习' : '当前范围没有词卡'}</button></section>
      : <><section className="flash-progress"><i><b style={{ width: `${queue.length ? Math.min(100, index / queue.length * 100) : 0}%` }} /></i><span>{Math.min(index + 1, queue.length)} / {queue.length}</span><small>{selected.length} 种角度{interactionMode === 'gestures' ? ' · 手势模式' : ''}</small></section>
      <section className={`flash-stage ${interactionMode === 'gestures' ? 'gesture-mode' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {!unit || !entry ? <div className="finished"><div>✓</div><h2>本轮词卡已经完成</h2><p>低评分卡片已按规则安排重现或提前到期。</p><button onClick={() => build()}>开始新的随机轮次</button></div>
        : !revealed
          ? unit.angle === 'image'
            ? <div className="flash-question image-question clickable" onClick={requestReveal}><span>{angleLabels[unit.angle]}</span><small>只看图，请主动回忆</small><EntryImage entryId={unit.entryId} className="question-image" /><input value={typed} onChange={event => setTyped(event.target.value)} onClick={stopInputClick} onKeyDown={event => { if (event.key === 'Enter') requestReveal() }} placeholder="可选：输入你回忆的德语" autoCapitalize="none" autoComplete="off" /><p className="reveal-hint">点击卡片或{interactionMode === 'gestures' ? '上滑' : '按空格'}揭晓</p></div>
            : <div className="flash-question clickable" onClick={requestReveal}><span>{angleLabels[unit.angle]}</span><small>请主动回忆</small><h2>{unit.prompt}</h2>{unit.promptDetail && <p>{unit.promptDetail}</p>}
                {unit.angle === 'production' && <input value={typed} onChange={event => setTyped(event.target.value)} onClick={stopInputClick} onKeyDown={event => { if (event.key === 'Enter') requestReveal() }} placeholder="输入你回忆的德语（建议先试试再看答案）" autoCapitalize="none" autoComplete="off" />}
                {unit.angle === 'sentence' && <textarea className="sentence-input" value={typed} onChange={event => setTyped(event.target.value)} onClick={stopInputClick} placeholder="写一句包含这个词的德语句子" rows={3} />}
                <p className="reveal-hint">点击卡片或{interactionMode === 'gestures' ? '上滑' : '按空格'}揭晓</p>
              </div>
          : <div ref={cardRef} className="gesture-card" style={interactionMode === 'gestures' ? { transform: `translateX(${dragX}px) rotate(${dragX / 24}deg)` } : undefined}>
              {interactionMode === 'gestures' && Math.abs(dragX) > 20 && <div className={`drag-hint ${dragX < 0 ? 'left' : 'right'}`}>{dragLabel}</div>}
              {unit.angle === 'sentence' ? <SentenceCheck typed={typed} entry={entry} />
                : typed && <div className={`typed-result ${typed.trim().toLocaleLowerCase('de') === unit.answer.trim().toLocaleLowerCase('de') ? 'correct' : 'different'}`}><span>你的输入</span><b>{typed}</b></div>}
              {unit.angle === 'image' && <EntryImage entryId={unit.entryId} className="answer-image" />}
              <FullEntry entry={entry} focus={unit} onNoteChange={note => { void setEntryNote(entry.id, note).then(refresh) }} />
            </div>}
      </section>
      {unit && revealed && interactionMode === 'buttons' && <footer className="ratings">{ratings.map(item => <button key={item.value} className={`rating-${item.value}`} onClick={() => void rate(item.value)}><kbd>{item.key}</kbd><strong>{item.label}</strong><small>{item.hint}</small></button>)}</footer>}
      {unit && revealed && interactionMode === 'gestures' && <p className="hint gesture-legend">← 左滑评低分（不会/混淆）　右滑评高分（勉强想起/稳定答出）→</p>}</>}
  </main>
}

function Library({ entries, units, refresh }: { entries: WordEntry[]; units: ReviewUnit[]; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [opened, setOpened] = useState<WordEntry>(); const [tagFilter, setTagFilter] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 50
  const allTags = useMemo(() => Array.from(new Set(entries.flatMap(item => item.tags || []))).sort((a, b) => a.localeCompare(b, 'de')), [entries])
  const unitCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const unit of units) counts.set(unit.entryId, (counts.get(unit.entryId) || 0) + 1)
    return counts
  }, [units])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('de')
    return entries
      .filter(item => `${item.displayForm} ${item.lemma} ${item.dictionaryMeaning?.directZh?.join(' ')}`.toLocaleLowerCase('de').includes(normalizedQuery)
        && tagFilter.every(tag => (item.tags || []).includes(tag)))
      .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
  }, [entries, query, tagFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleEntries = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, filtered])
  const toggleTag = (tag: string) => { setTagFilter(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]); setPage(1) }
  const changeQuery = (value: string) => { setQuery(value); setPage(1) }
  const clearTags = () => { setTagFilter([]); setPage(1) }
  return <main className="page"><header className="page-title"><div><span>WORD LIBRARY</span><h1>词库</h1><p>{entries.length} 个词条 · {units.length} 个独立学习单元</p></div><input value={query} onChange={event => changeQuery(event.target.value)} placeholder="搜索德语或中文" /></header>
    {allTags.length > 0 && <div className="angle-filter tag-filter"><span>标签筛选</span>{allTags.map(tag => <button key={tag} className={tagFilter.includes(tag) ? 'active' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}{tagFilter.length > 0 && <button className="clear-tags" onClick={clearTags}>清除</button>}</div>}
    {opened ? <div className="detail-wrap"><button className="back" onClick={() => setOpened(undefined)}>← 返回词库</button><FullEntry entry={opened} onNoteChange={note => { void setEntryNote(opened.id, note).then(refresh) }} /><ImageManager entry={opened} refresh={refresh} /><button className="danger" onClick={async () => { if (confirm(`删除 ${opened.displayForm}？`)) { await removeEntry(opened.id); setOpened(undefined); await refresh() } }}>删除此词条</button></div> : <>
      <div className="library-summary">显示 {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)}，共 {filtered.length} 条</div>
      <div className="word-list">{visibleEntries.map(entry => <button key={entry.id} onClick={() => setOpened(entry)}><div><strong>{entry.displayForm}</strong><span>{entry.dictionaryMeaning?.directZh?.join('；') || entry.definition?.zh}</span></div><Badges entry={entry} /><em>{unitCounts.get(entry.id) || 0} 角度</em></button>)}</div>
      {pageCount > 1 && <nav className="pagination" aria-label="词库分页"><button disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>← 上一页</button><span>第 {currentPage} / {pageCount} 页</span><button disabled={currentPage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>下一页 →</button></nav>}
    </>}</main>
}

function Transfer({ refresh }: { refresh: () => Promise<void> }) {
  const [raw, setRaw] = useState(''); const [message, setMessage] = useState('')
  const importText = async (value: string) => { try { const payload = JSON.parse(value) as unknown; if ((payload as Backup)?.schema === 'wordreels-backup-v6') { await restoreBackup(payload as Backup); setMessage('完整备份已恢复。') } else { const result = await importEntries(extractCards(payload)); setMessage(`导入完成：新增 ${result.added}，更新 ${result.updated}，生成 ${result.unitCount} 个学习单元。`) } await refresh() } catch (error) { setMessage(`导入失败：${(error as Error).message}`) } }
  const clearAll = async () => {
    if (!confirm('将删除全部词条和各角度学习进度。设置和历史复习统计会保留。是否继续？')) return
    if (!confirm('请再次确认：清空词条与进度后只能通过之前下载的备份恢复；统计页的历史记录不受影响。')) return
    await clearLearningData(); setRaw(''); setMessage('词库和学习单元已清空，复习历史统计已保留。'); await refresh()
  }
  return <main className="page"><header className="page-title"><div><span>IMPORT & BACKUP</span><h1>导入与备份</h1><p>支持新版 v3、旧版 v1/v2 词卡和 WordReels 6 完整备份</p></div></header><div className="transfer-grid"><section><h2>导入 JSON</h2><textarea value={raw} onChange={event => setRaw(event.target.value)} placeholder="粘贴词卡 JSON，或选择文件" /><div className="row"><label className="file-button">选择 JSON<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (file) { const value = await file.text(); setRaw(value); await importText(value) } }} /></label><button onClick={() => void importText(raw)} disabled={!raw.trim()}>导入粘贴内容</button></div></section><section><h2>完整备份</h2><p>备份包含词条、各角度复习进度、评分记录和设置，可在其他设备完整恢复。</p><button onClick={async () => download(`WordReels6备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await createBackup(), null, 2))}>下载完整备份</button><small>GitHub Pages 只保存程序。手机中的词库和进度保存在该手机浏览器内。</small><div className="danger-zone"><h3>清空学习数据</h3><p>删除全部词条和学习单元，但保留设置和复习历史统计。</p><button className="danger" onClick={() => void clearAll()}>清空全部词卡与进度</button></div></section></div>{message && <div className="message">{message}</div>}</main>
}

function Settings({ enabled, onChange }: { enabled: StudyAngle[]; onChange: (angles: StudyAngle[]) => void }) {
  const toggle = (angle: StudyAngle) => { const next = enabled.includes(angle) ? enabled.filter(item => item !== angle) : [...enabled, angle]; onChange(next); void setSetting('enabledAngles', next) }
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('buttons'); const [ttsAutoPlay, setTtsAutoPlay] = useState(false)
  useEffect(() => { void getSetting<InteractionMode>('reviewInteractionMode', 'buttons').then(setInteractionMode) }, [])
  useEffect(() => { void getSetting<boolean>('ttsAutoPlay', false).then(setTtsAutoPlay) }, [])
  const changeMode = async (mode: InteractionMode) => { setInteractionMode(mode); await setSetting('reviewInteractionMode', mode) }
  const changeAutoPlay = async (value: boolean) => { setTtsAutoPlay(value); await setSetting('ttsAutoPlay', value) }
  return <main className="page"><header className="page-title"><div><span>STUDY SETTINGS</span><h1>设置</h1><p>控制默认参与混合复习的角度与交互方式</p></div></header>
    <section className="settings-card"><h2>复习交互方式</h2><div className="scope"><button className={interactionMode === 'buttons' ? 'active' : ''} onClick={() => void changeMode('buttons')}>按钮模式</button><button className={interactionMode === 'gestures' ? 'active' : ''} onClick={() => void changeMode('gestures')}>手势模式</button></div><p className="hint">手势模式下：上滑或点击翻面，翻开后左右滑动评分（滑动距离对应 5 档）。</p></section>
    <section className="settings-card"><h2>德语朗读</h2><label><input type="checkbox" checked={ttsAutoPlay} onChange={event => void changeAutoPlay(event.target.checked)} /><span><b>翻开答案时自动朗读</b><small>始终可以手动点击词条旁的喇叭图标朗读</small></span></label></section>
    <section className="settings-card"><h2>默认复习角度</h2>{angles.map(angle => <label key={angle}><input type="checkbox" checked={enabled.includes(angle)} onChange={() => toggle(angle)} /><span><b>{angleLabels[angle]}</b><small>{angle === 'production' ? '显示中文，主动回忆德语和拼写' : angle === 'image' ? '仅在词条上传过图片时生成该角度' : '该角度有数据时自动生成独立学习单元'}</small></span></label>)}</section>
  </main>
}

function Stats({ logs, units, entries }: { logs: ReviewLog[]; units: ReviewUnit[]; entries: WordEntry[] }) {
  const today = todayCount(logs); const streak = streakDays(logs); const accuracy = overallAccuracy(logs)
  const series = useMemo(() => dailySeries(logs, 30), [logs])
  const byAngle = useMemo(() => angleAccuracy(logs), [logs])
  const typedCompare = useMemo(() => productionTypedComparison(logs), [logs])
  const fakeMemory = useMemo(() => fakeMemoryWatch(units, logs, entries), [units, logs, entries])
  const maxCount = Math.max(1, ...series.map(item => item.count))
  const barColor = (rate: number) => rate >= .7 ? 'good' : rate >= .4 ? 'mid' : 'low'
  return <main className="page"><header className="page-title"><div><span>PROGRESS</span><h1>统计</h1><p>基于 {logs.length} 条复习记录</p></div></header>
    <div className="stats-summary"><div className="stat-card"><b>{today}</b><span>今日已复习</span></div><div className="stat-card"><b>{streak}</b><span>连续打卡天数</span></div><div className="stat-card"><b>{Math.round(accuracy * 100)}%</b><span>总体正确率</span></div></div>
    <section className="stats-block"><h2>最近 30 天</h2>{logs.length === 0 ? <p className="hint">还没有复习记录，开始复习后这里会显示每日趋势。</p> : <div className="stats-chart">{series.map(point => <div key={point.date} className="chart-col" title={`${point.date} · ${point.count} 次 · 正确率 ${Math.round(point.accuracy * 100)}%`}><i className={point.count ? barColor(point.accuracy) : ''} style={{ height: `${point.count ? Math.max(6, point.count / maxCount * 100) : 2}%` }} /></div>)}</div>}</section>
    {byAngle.length > 0 && <section className="stats-block"><h2>各角度正确率</h2><div className="stats-bars">{byAngle.map(item => <div key={item.angle} className="stats-bar-row"><span>{item.label}</span><div className="bar-track"><i className={barColor(item.accuracy)} style={{ width: `${Math.round(item.accuracy * 100)}%` }} /></div><small>{Math.round(item.accuracy * 100)}% · {item.count}次</small></div>)}</div></section>}
    {(typedCompare.typed.count > 0 || typedCompare.skipped.count > 0) && <section className="stats-block"><h2>中→德：主动输入 vs 直接看答案</h2><div className="stats-bars"><div className="stats-bar-row"><span>主动输入后揭晓</span><div className="bar-track"><i className={barColor(typedCompare.typed.accuracy)} style={{ width: `${Math.round(typedCompare.typed.accuracy * 100)}%` }} /></div><small>{Math.round(typedCompare.typed.accuracy * 100)}% · {typedCompare.typed.count}次</small></div><div className="stats-bar-row"><span>直接看答案</span><div className="bar-track"><i className={barColor(typedCompare.skipped.accuracy)} style={{ width: `${Math.round(typedCompare.skipped.accuracy * 100)}%` }} /></div><small>{Math.round(typedCompare.skipped.accuracy * 100)}% · {typedCompare.skipped.count}次</small></div></div></section>}
    <section className="stats-block"><h2>虚假记忆提醒</h2><p className="hint">连续多次秒答"稳定答出"、且从未真正被难住过的卡片，可能只是因为总在到期时出现，没经历过极限间隔的考验。</p>{fakeMemory.length === 0 ? <p className="hint">暂无符合条件的词卡。</p> : <div className="fake-memory-list">{fakeMemory.map((item, i) => <div key={i} className="fake-memory-item"><strong>{item.displayForm}</strong><span>{item.label}</span><small>{item.reps} 次复习 · {item.daysSinceReview} 天未复习</small></div>)}</div>}</section>
  </main>
}

export default function App() {
  const [view, setView] = useState<View>('review'); const [entries, setEntries] = useState<WordEntry[]>([]); const [units, setUnits] = useState<ReviewUnit[]>([]); const [logs, setLogs] = useState<ReviewLog[]>([]); const [enabled, setEnabled] = useState<StudyAngle[]>(angles)
  const refresh = useCallback(async () => { setEntries(await allEntries()); setUnits(await allUnits()); setLogs(await allLogs()) }, [])
  const onReviewed = useCallback((updated: ReviewUnit, log: ReviewLog) => {
    setUnits(current => current.map(unit => unit.id === updated.id ? updated : unit))
    setLogs(current => [...current, log])
  }, [])
  const dueUnitCount = useMemo(() => {
    const now = Date.now()
    return units.reduce((count, unit) => count + (unit.dueAt <= now ? 1 : 0), 0)
  }, [units])
  useEffect(() => { void refresh(); void getSetting<StudyAngle[]>('enabledAngles', angles).then(setEnabled) }, [refresh])
  const nav: Array<{ id: View; icon: string; label: string }> = [{ id: 'review', icon: '▱', label: '今日复习' }, { id: 'stats', icon: '▤', label: '统计' }, { id: 'library', icon: '⌕', label: '词库' }, { id: 'transfer', icon: '⇅', label: '导入与备份' }, { id: 'settings', icon: '⚙', label: '设置' }]
  return <div className="app"><aside><div className="brand"><i>W</i><div><b>WordReels</b><span>GERMAN · v6</span></div></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav><footer><span>{entries.length} 词条</span><small>{dueUnitCount} 到期单元</small></footer></aside><div className="mobile-nav">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</div><section className="content">{view === 'review' && <Review entries={entries} units={units} refresh={refresh} onReviewed={onReviewed} enabledAngles={enabled} />}{view === 'stats' && <Stats logs={logs} units={units} entries={entries} />}{view === 'library' && <Library entries={entries} units={units} refresh={refresh} />}{view === 'transfer' && <Transfer refresh={refresh} />}{view === 'settings' && <Settings enabled={enabled} onChange={setEnabled} />}</section></div>
}
