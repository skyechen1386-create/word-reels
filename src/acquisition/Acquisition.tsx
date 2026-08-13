import React, { useState, useEffect } from 'react'
import { allEntries, saveAcquisitionProgress, getCachedAcquisitionStats, getRandomReadyEntry } from '../db'
import { extractContextMaterial, classifyAllMaterials } from './acquisitionAdapter'
import { createAcquisitionProgress } from './acquisitionLogic'
import type { ContextMaterial, AcquisitionSession, AcquisitionProgress } from './acquisitionTypes'
import type { WordEntry } from '../types'
import ContextStage from './stages/ContextStage'
import RevealStage from './stages/RevealStage'
import RecallStage from './stages/RecallStage'

export default function Acquisition() {
  const [stats, setStats] = useState<{ classA: number; classB: number; classC: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AcquisitionSession | null>(null)
  const [materials, setMaterials] = useState<Map<string, ContextMaterial> | null>(null)
  const [isComputing, setIsComputing] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const allEntriesData = await allEntries()

        // 先尝试从缓存读取统计信息（快速显示）
        const cachedStats = await getCachedAcquisitionStats()
        if (cachedStats) {
          setStats(cachedStats)
        } else {
          // 缓存缺失时，显示加载中提示
          setStats(null)
        }

        // 立即显示界面，不阻塞 UI
        setLoading(false)

        // 后台计算统计和材料（不阻塞 UI）
        setIsComputing(true)
        const classified = await classifyAllMaterials(allEntriesData)
        setStats({
          classA: classified.classA,
          classB: classified.classB,
          classC: classified.classC,
        })
        setMaterials(classified.materials)
        setIsComputing(false)
      } catch (err) {
        console.error('Failed to initialize acquisition:', err)
        setLoading(false)
      }
    }
    init()
  }, [])

  const startSession = async (entryId?: string) => {
    try {
      let selectedId = entryId

      // 如果没有指定词条，随机选择一个
      if (!selectedId) {
        if (!materials || materials.size === 0) {
          // 回退方案：从数据库随机获取
          const allEntriesData = await allEntries()
          const ready = allEntriesData.filter(e => {
            const mat = extractContextMaterial(e)
            return mat && (mat.class === 'A' || mat.class === 'B')
          })

          if (ready.length === 0) return

          const randomEntry = ready[Math.floor(Math.random() * ready.length)]
          selectedId = randomEntry.id
        } else {
          const entries = Array.from(materials.keys())
          selectedId = entries[Math.floor(Math.random() * entries.length)]
        }
      }

      if (!materials?.has(selectedId)) return

      const material = materials.get(selectedId)!
      const maxAttempts = material.class === 'A' ? 4 : 3
      const newSession: AcquisitionSession = {
        entryId: selectedId,
        material,
        stage: 'guessing',
        currentAttempt: 1,
        maxAttempts,
        currentContextIndex: 0,
        guessRecords: [],
        normalListenCount: 0,
        slowListenCount: 0,
      }
      setSession(newSession)
    } catch (err) {
      console.error('Failed to start session:', err)
    }
  }

  const handleCorrectGuess = () => {
    if (!session) return
    setSession({
      ...session,
      stage: 'reveal',
    })
  }

  const handleRevealAnswer = () => {
    if (!session) return
    setSession({
      ...session,
      stage: 'reveal',
    })
  }

  const handleContinueToSentence = () => {
    if (!session) return
    setSession({
      ...session,
      stage: 'confirm_sentence',
    })
  }

  const handleSentenceConfirmed = async (sentence: string, correct: boolean) => {
    if (!session) return
    const updatedSession = {
      ...session,
      confirmedSentence: sentence,
    }
    const progress = createAcquisitionProgress(updatedSession, correct ? 'correct' : 'incorrect')
    await saveAcquisitionProgress(progress)
    setSession(null)
  }

  if (loading) {
    return (
      <main className="page">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ marginBottom: '12px', fontSize: '16px', color: '#f2f6fd' }}>加载中...</div>
          <div style={{ fontSize: '12px', color: '#7ce1d7' }}>正在准备词库数据</div>
        </div>
      </main>
    )
  }

  if (session) {
    if (session.stage === 'guessing') {
      return <ContextStage session={session} onCorrectGuess={handleCorrectGuess} onRevealAnswer={handleRevealAnswer} setSession={setSession} />
    }
    if (session.stage === 'reveal') {
      return <RevealStage session={session} onContinue={handleContinueToSentence} />
    }
    if (session.stage === 'confirm_sentence') {
      return <RecallStage session={session} onSubmit={handleSentenceConfirmed} />
    }
  }

  return (
    <main className="page">
      <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
        <div className="page-title" style={{ marginBottom: '24px' }}>
          <div>
            <span>CONTEXT ACQUISITION</span>
            <h1>语境习得</h1>
            <p>通过丰富的语境和多轮猜测，理解并掌握新词</p>
          </div>
        </div>

        {isComputing && (
          <div className="message" style={{ marginBottom: '20px', borderColor: '#4a8a7e' }}>
            ⏳ 后台计算中（大词库首次初始化）...
          </div>
        )}

        <div className="stats-summary" style={{ marginBottom: '20px' }}>
          {stats ? (
            <>
              <div className="stat-card">
                <b>{stats.classA}</b>
                <span>完整流程</span>
              </div>
              <div className="stat-card">
                <b>{stats.classB}</b>
                <span>简化流程</span>
              </div>
              <div className="stat-card">
                <b>{stats.classC}</b>
                <span>待处理</span>
              </div>
            </>
          ) : (
            <div className="message" style={{ marginBottom: '0', width: '100%' }}>
              📊 统计信息加载中...
            </div>
          )}
        </div>

        {stats && (
          <>
            <div className="message" style={{ marginBottom: '20px' }}>
              ✓ {stats.classA + stats.classB} 个词条已准备好进行语境习得学习
            </div>

            <div className="settings-card" style={{ maxWidth: '100%', margin: '0 0 24px' }}>
              <h2>学习流程</h2>
              <p style={{ margin: '8px 0', color: '#9aabc1', fontSize: '12px', lineHeight: '1.6' }}>
                <b>1. 多轮语境猜测</b> — 通过不同场景的例句逐步理解词义，无中文翻译<br />
                <b>2. 词卡详情</b> — 猜对后查看完整的定义、例句和用法<br />
                <b>3. 造句验证</b> — 用固定搭配造句，验证真正掌握了这个词
              </p>
            </div>

            <button
              onClick={() => startSession()}
              className="reshuffle"
              style={{ width: '100%', padding: '12px 16px', fontSize: '13px', marginTop: '0' }}
            >
              开始学习 — 随机选择一个词
            </button>
          </>
        )}
      </div>
    </main>
  )
}
