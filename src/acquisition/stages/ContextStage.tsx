import React, { useState, useEffect } from 'react'
import { incrementListenCount } from '../acquisitionLogic'
import type { AcquisitionSession, GuessRecord } from '../acquisitionTypes'

interface Props {
  session: AcquisitionSession
  onCorrectGuess: () => void
  onRevealAnswer: () => void
  setSession: (session: AcquisitionSession) => void
}

export default function ContextStage({ session, onCorrectGuess, onRevealAnswer, setSession }: Props) {
  const [input, setInput] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const currentContext = session.material.contexts[session.currentContextIndex]
  const isMaxAttemptsReached = session.currentAttempt >= session.maxAttempts

  // 自动朗读当前例句（每次 currentContextIndex 改变时）
  useEffect(() => {
    const timer = setTimeout(() => handleSpeak('normal'), 300)
    return () => clearTimeout(timer)
  }, [session.currentContextIndex])

  const handleSpeak = (speed: 'normal' | 'slow') => {
    if (!currentContext?.de) return
    setIsSpeaking(true)
    incrementListenCount(session, speed)
    setSession(session)

    const utterance = new SpeechSynthesisUtterance(currentContext.de)
    utterance.lang = 'de-DE'
    utterance.rate = speed === 'normal' ? 0.9 : 0.65
    utterance.onend = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  const evaluateGuess = (userInput: string): boolean => {
    const cleaned = userInput.toLowerCase().trim()
    const targetCleaned = session.material.primaryZh.toLowerCase().trim()

    // 精确匹配
    if (cleaned === targetCleaned) return true

    // 简单的字符级关键词匹配（中文）
    const keywords = targetCleaned.split('').filter(c => c.length > 0)
    const inputKeywords = cleaned.split('').filter(c => c.length > 0)
    const matchCount = keywords.filter(kw => inputKeywords.includes(kw)).length

    return matchCount >= keywords.length * 0.6 // 至少60%匹配
  }

  const handleSubmit = () => {
    const isCorrect = evaluateGuess(input)

    const newRecord: GuessRecord = {
      attempt: session.currentAttempt,
      input,
      correct: isCorrect,
      timestamp: Date.now(),
      contextUsed: session.currentContextIndex,
      hintsShown: showHint ? ['动作'] : [],
    }

    const newRecords = [...session.guessRecords, newRecord]

    if (isCorrect) {
      // 猜对了，跳到词卡详情
      const updatedSession = {
        ...session,
        guessRecords: newRecords,
        lastGuessCorrect: true,
        stage: 'reveal' as const,
      }
      setSession(updatedSession)
      onCorrectGuess()
    } else if (isMaxAttemptsReached) {
      // 达到尝试上限，公布答案
      const updatedSession = {
        ...session,
        guessRecords: newRecords,
        lastGuessCorrect: false,
        stage: 'reveal' as const,
      }
      setSession(updatedSession)
      onRevealAnswer()
    } else {
      // 猜错，继续下一个例句
      const nextContextIndex = Math.min(
        session.currentContextIndex + 1,
        session.material.contexts.length - 1
      )

      const updatedSession = {
        ...session,
        guessRecords: newRecords,
        currentAttempt: session.currentAttempt + 1,
        currentContextIndex: nextContextIndex,
        lastGuessCorrect: false,
      }

      setSession(updatedSession)
      setInput('')
      setShowHint(false)
    }
  }

  const getProgressLabel = () => {
    return `第 ${session.currentAttempt}/${session.maxAttempts} 次尝试 • 场景 ${session.currentContextIndex + 1}`
  }

  // 将句子按字符分割，找出目标词的位置并加粗
  // 支持可分动词（如 "ablehnen" → "lehne...ab"）
  const renderHighlightedSentence = () => {
    if (!currentContext?.de) return null

    const sentence = currentContext.de
    const lemma = session.material.lemma.toLowerCase()
    const sentenceLower = sentence.toLowerCase()

    // 尝试多种匹配方式
    let matchStart = -1
    let matchEnd = -1
    let highlights: Array<{ start: number; end: number }> = []

    // 1. 直接匹配（大多数动词）
    const directMatch = sentenceLower.indexOf(lemma)
    if (directMatch !== -1) {
      highlights.push({ start: directMatch, end: directMatch + lemma.length })
    } else {
      // 2. 可分动词匹配（如 "ablehnen" → "lehne" + "ab"）
      // 尝试找词根和前缀/后缀分离的情况
      const words = sentence.split(/\s+/)
      let charPos = 0

      for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
        const word = words[wordIdx]
        const wordStart = charPos

        // 检查这个词是否包含动词词根
        for (let i = 1; i < lemma.length; i++) {
          const root = lemma.substring(i) // "lehnen"
          const prefix = lemma.substring(0, i) // "ab"

          if (word.toLowerCase().startsWith(root.toLowerCase())) {
            // 找到词根，记录这个词的位置
            const rootStart = wordStart
            const rootEnd = wordStart + root.length
            highlights.push({ start: rootStart, end: rootEnd })

            // 在句子后面寻找前缀
            for (let j = wordIdx + 1; j < words.length; j++) {
              const laterWord = words[j].toLowerCase()
              if (laterWord.includes(prefix.toLowerCase())) {
                // 计算这个词在完整句子中的位置
                let laterPos = sentence.indexOf(words[j], wordStart)
                const prefixInWord = laterWord.indexOf(prefix.toLowerCase())
                if (laterPos !== -1) {
                  highlights.push({ start: laterPos + prefixInWord, end: laterPos + prefixInWord + prefix.length })
                }
              }
            }
            break
          }
        }

        charPos += word.length + 1 // +1 for space
      }
    }

    // 如果没有找到任何匹配，加粗第一个词
    if (highlights.length === 0) {
      const words = sentence.split(/(\s+)/)
      return (
        <span>
          {words.map((word, idx) => {
            if (idx === 0 && word.trim()) {
              return (
                <b key={idx} style={{ color: '#7ce1d7', backgroundColor: '#1a4a47', padding: '2px 6px', borderRadius: '4px' }}>
                  {word}
                </b>
              )
            }
            return <span key={idx}>{word}</span>
          })}
        </span>
      )
    }

    // 渲染加粗的句子
    const highlightStyle = { color: '#7ce1d7', backgroundColor: '#1a4a47', padding: '2px 6px', borderRadius: '4px' }
    const parts: React.ReactNode[] = []
    let lastEnd = 0

    for (const { start, end } of highlights.sort((a, b) => a.start - b.start)) {
      if (start > lastEnd) {
        parts.push(sentence.substring(lastEnd, start))
      }
      parts.push(
        <b key={`highlight-${start}-${end}`} style={highlightStyle}>
          {sentence.substring(start, end)}
        </b>
      )
      lastEnd = end
    }

    if (lastEnd < sentence.length) {
      parts.push(sentence.substring(lastEnd))
    }

    return <span>{parts}</span>
  }

  // 生成提示内容
  const getHintContent = () => {
    const lemma = session.material.lemma
    const primaryZh = session.material.primaryZh

    // 简单的场景描述
    const hints: Record<number, string> = {
      0: '第一个场景：想象一个日常场景，这个词常出现在这种情况下。',
      1: '第二个场景：这个词可能涉及某种行为或动作。',
      2: '第三个场景：考虑这个词在不同上下文中的使用。',
      3: '第四个场景：这个词的含义已经在多个例子中反复出现了。',
    }

    return hints[session.currentContextIndex] || '注意观察这个词在这个句子中的角色。'
  }

  return (
    <main className="page">
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          <span style={{ padding: '5px 9px', border: '1px solid #3d716c', borderRadius: '99px', color: '#7ce1d7', background: '#12302f', fontSize: '11px' }}>
            {getProgressLabel()}
          </span>
        </div>

        <div className="flash-stage" style={{ minHeight: 'auto', maxWidth: 'none', border: 'none', background: 'transparent', boxShadow: 'none' }}>
          <div className="flash-question" style={{ height: 'auto', minHeight: '0', padding: '0' }}>
            <p style={{ margin: '0 0 20px', color: '#91a0b5', fontSize: '13px' }}>
              这个句子中加粗的词是什么意思？
            </p>

            {/* 德语句子 - 加粗目标词 */}
            <p style={{ maxWidth: '720px', margin: '0 0 16px', color: '#f2f6fd', fontSize: '22px', lineHeight: '1.6', letterSpacing: '-0.5px', fontWeight: '500' }}>
              {renderHighlightedSentence()}
            </p>

            {/* 朗读按钮 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', justifyContent: 'center' }}>
              <button
                onClick={() => handleSpeak('normal')}
                disabled={isSpeaking}
                className="speak-button"
                style={{ width: '38px', height: '38px' }}
                title="朗读整句"
              >
                🔊
              </button>
              <button
                onClick={() => handleSpeak('slow')}
                disabled={isSpeaking}
                className="speak-button"
                style={{ width: '38px', height: '38px' }}
                title="慢速朗读"
              >
                🐢
              </button>
            </div>

            {/* 动作/场景线索显示 */}
            {showHint && (
              <div className="flash-focus" style={{ marginBottom: '16px' }}>
                <span>💡 场景提示</span>
                <p style={{ margin: '8px 0 0', color: '#e2e9f5', fontSize: '12px' }}>
                  {getHintContent()}
                </p>
              </div>
            )}

            {/* 用户输入 - 移动端友好 */}
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入词义（中文）…"
              style={{
                width: 'min(460px, 90%)',
                margin: '0 auto 20px',
                display: 'block',
                padding: '14px 14px',
                minHeight: '44px',
                border: '1px solid #38516d',
                borderRadius: '9px',
                outline: 'none',
                color: '#eef5ff',
                background: '#081220',
                textAlign: 'center',
                cursor: 'text',
                fontSize: 'clamp(13px, 4vw, 16px)',
                boxSizing: 'border-box',
              }}
              onKeyPress={e => e.key === 'Enter' && handleSubmit()}
            />

            {/* 按钮组 - 移动端友好 */}
            <div style={{ display: 'grid', gap: '8px', margin: '0' }}>
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="reshuffle"
                style={{
                  padding: '14px 14px',
                  minHeight: '44px',
                  width: '100%',
                  opacity: input.trim() ? 1 : 0.35,
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 'clamp(13px, 4vw, 15px)',
                  fontWeight: '500',
                }}
              >
                提交答案
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {!isMaxAttemptsReached && (
                  <button
                    onClick={() => setShowHint(!showHint)}
                    className="scope"
                    style={{
                      padding: '12px 10px',
                      minHeight: '44px',
                      border: '1px solid #29384f',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: 'clamp(11px, 3vw, 12px)',
                    }}
                  >
                    <span style={{ color: '#8fa1ba' }}>
                      {showHint ? '✓ 有提示' : '要提示'}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => {
                    const updatedSession = {
                      ...session,
                      stage: 'reveal' as const,
                    }
                    setSession(updatedSession)
                    onRevealAnswer()
                  }}
                  className="back"
                  style={{
                    padding: '12px 10px',
                    minHeight: '44px',
                    border: '1px solid #29384f',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: 'clamp(11px, 3vw, 12px)',
                    color: '#8fa1ba',
                  }}
                >
                  跳过
                </button>
              </div>
            </div>

            {/* 反馈消息 */}
            {session.lastGuessCorrect === false && !isMaxAttemptsReached && (
              <div className="message" style={{ marginTop: '16px', marginBottom: '0' }}>
                ✗ 不对。继续尝试下一个场景...
              </div>
            )}

            {isMaxAttemptsReached && (
              <div className="message" style={{ marginTop: '16px', marginBottom: '0', borderColor: '#6b4c4c' }}>
                达到最大尝试次数。显示答案...
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
