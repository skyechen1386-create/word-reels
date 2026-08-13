import React, { useState } from 'react'
import type { AcquisitionSession } from '../acquisitionTypes'

interface Props {
  session: AcquisitionSession
  onSubmit: (sentence: string, correct: boolean) => void
}

export default function RecallStage({ session, onSubmit }: Props) {
  const [sentence, setSentence] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'partial' | 'skip' | null>(null)

  const { material } = session
  const { recallPattern, recallZh, primaryZh, lemma } = material

  const handleSubmit = () => {
    if (!sentence.trim()) {
      setFeedback('skip')
      setSubmitted(true)
      return
    }

    // 简单检查：用户输入的句子是否包含目标词
    const containsWord = sentence.toLowerCase().includes(lemma.toLowerCase())
    const containsPattern = recallPattern && sentence.toLowerCase().includes(recallPattern.toLowerCase().split('/')[0].toLowerCase())

    if (containsWord || containsPattern) {
      setFeedback('correct')
    } else {
      setFeedback('partial')
    }

    setSubmitted(true)
  }

  const handleConfirm = () => {
    const isCorrect = feedback === 'correct'
    onSubmit(sentence, isCorrect)
  }

  const handleSkip = () => {
    onSubmit('', false)
  }

  return (
    <main className="page">
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div className="flash-answer">
          <div className="answer-head">
            <div>
              <span style={{ fontSize: '13px' }}>主动回忆</span>
            </div>
          </div>

          {!submitted ? (
            <>
              <p style={{ margin: '16px 0 8px', color: '#91a0b5', fontSize: '13px' }}>
                用这个词和搭配造句，验证你真正掌握了它的用法：
              </p>

              <div style={{ marginBottom: '16px', padding: '12px 14px', background: '#0f2126', border: '1px solid #29394f', borderRadius: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px', alignItems: 'start' }}>
                  <span style={{ fontSize: '12px', color: '#7ce1d7', fontWeight: 'bold' }}>词：</span>
                  <span style={{ color: '#dfe8f5' }}>{lemma} ({primaryZh})</span>

                  {recallPattern && (
                    <>
                      <span style={{ fontSize: '12px', color: '#7ce1d7', fontWeight: 'bold', marginTop: '8px' }}>搭配：</span>
                      <span style={{ color: '#dfe8f5', marginTop: '8px' }}>{recallPattern}</span>
                    </>
                  )}

                  {recallZh && (
                    <>
                      <span style={{ fontSize: '12px', color: '#7ce1d7', fontWeight: 'bold', marginTop: '8px' }}>意思：</span>
                      <span style={{ color: '#71d9cf', fontSize: '12px', marginTop: '8px' }}>{recallZh}</span>
                    </>
                  )}
                </div>
              </div>

              <textarea
                value={sentence}
                onChange={e => setSentence(e.target.value)}
                placeholder="请输入你造的句子（用德语）…"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '12px 14px',
                  border: '1px solid #38516d',
                  borderRadius: '8px',
                  outline: 'none',
                  color: '#eef5ff',
                  background: '#081220',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  marginBottom: '16px',
                  resize: 'none',
                }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={handleSubmit}
                  disabled={!sentence.trim()}
                  className="reshuffle"
                  style={{
                    padding: '10px 14px',
                    opacity: sentence.trim() ? 1 : 0.35,
                    cursor: sentence.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  提交造句
                </button>
                <button
                  onClick={handleSkip}
                  className="back"
                  style={{ padding: '10px 14px', margin: '0' }}
                >
                  跳过
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="flash-focus"
                style={{
                  marginTop: '20px',
                  borderColor:
                    feedback === 'correct' ? '#4a8a7e' : feedback === 'partial' ? '#6b7d3e' : '#666',
                }}
              >
                <span>
                  {feedback === 'correct' && '✓ 很好！正确使用了这个词'}
                  {feedback === 'partial' && '◐ 造句有效，但可能还需要完善'}
                  {feedback === 'skip' && '○ 跳过了主动回忆阶段'}
                </span>
                {sentence && (
                  <div style={{ marginTop: '8px', color: '#93a7b7', fontSize: '12px' }}>
                    <p style={{ margin: '0 0 4px' }}>
                      你的句子：
                      <br />
                      <span style={{ color: '#dfe8f5', marginTop: '4px', display: 'block' }}>"{sentence}"</span>
                    </p>
                  </div>
                )}
              </div>

              {feedback !== 'skip' && (
                <div className="settings-card" style={{ maxWidth: '100%', margin: '16px 0', padding: '12px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#91a0b5' }}>
                    你同意这个评价吗？
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={handleConfirm}
                      className="back"
                      style={{ padding: '8px 10px', fontSize: '11px', margin: '0' }}
                    >
                      是的，同意
                    </button>
                    <button
                      onClick={() => {
                        setSubmitted(false)
                        setFeedback(null)
                        setSentence('')
                      }}
                      className="back"
                      style={{ padding: '8px 10px', fontSize: '11px', margin: '0' }}
                    >
                      重新造句
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirm}
                className="reshuffle"
                style={{ width: '100%', padding: '10px 14px', marginTop: '12px' }}
              >
                {feedback === 'correct' ? '完成学习 🎉' : '完成阶段'}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
