import React from 'react'
import type { AcquisitionSession } from '../acquisitionTypes'

interface Props {
  session: AcquisitionSession
  onContinue: () => void
}

export default function RevealStage({ session, onContinue }: Props) {
  const { material, guessRecords } = session
  const { lemma, primaryZh, coreDe, contexts, tags, pronunciation } = material
  const grammarPos = material.grammar && typeof material.grammar === 'object' && 'pos' in material.grammar
    ? String((material.grammar as Record<string, unknown>).pos)
    : null

  const correctRecord = guessRecords.find(r => r.correct)

  return (
    <main className="page">
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div className="flash-answer">
          <div className="answer-head">
            <div>
              <span style={{ fontSize: '13px' }}>✓ 答案揭晓</span>
            </div>
          </div>

          <h1 style={{ marginTop: '12px' }}>{lemma}</h1>

          <div className="badges" style={{ marginBottom: '18px' }}>
            <span>{primaryZh}</span>
            {grammarPos && <span>{grammarPos}</span>}
            {tags && tags.length > 0 && <span>{tags[0]}</span>}
          </div>

          {pronunciation?.display && (
            <div style={{ color: '#7ce1d7', fontSize: '12px', marginBottom: '12px' }}>
              {pronunciation.display}
            </div>
          )}

          {coreDe && (
            <div className="flash-focus" style={{ marginTop: '16px' }}>
              <span>德语定义</span>
              <p style={{ margin: '8px 0 0', color: '#e2e9f5' }}>{coreDe}</p>
            </div>
          )}

          {/* 例句展示 */}
          <div className="entry-section" style={{ gridColumn: 'auto', marginTop: '12px' }}>
            <h3>例句与翻译</h3>
            <div className="detail-list">
              {contexts.map((context, idx) => (
                <p
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '8px',
                    margin: idx === 0 ? '6px 0' : '12px 0 6px',
                    paddingTop: idx === 0 ? '0' : '12px',
                    borderTop: idx === 0 ? 'none' : '1px solid #29394f',
                  }}
                >
                  <b>场景 {idx + 1}</b>
                  <span style={{ color: '#dfe8f5', fontSize: '13px', fontWeight: '400', textAlign: 'left' }}>
                    {context.de}
                  </span>
                  {context.zh && (
                    <span style={{ color: '#71d9cf', fontSize: '12px', textAlign: 'left' }}>
                      {context.zh}
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>

          {/* 猜测历史 */}
          {guessRecords.length > 0 && (
            <div className="entry-section" style={{ gridColumn: 'auto', marginTop: '12px' }}>
              <h3>你的学习过程</h3>
              <div className="detail-list">
                {guessRecords.map((record, idx) => (
                  <p
                    key={idx}
                    style={{
                      margin: '8px 0',
                      padding: '8px',
                      borderRadius: '6px',
                      background: record.correct ? '#1a3a36' : '#2a1a1a',
                      borderLeft: `3px solid ${record.correct ? '#4a8a7e' : '#6b4c4c'}`,
                    }}
                  >
                    <span style={{ color: '#7ce1d7', fontSize: '11px', fontWeight: 'bold' }}>
                      第 {record.attempt} 次：
                    </span>
                    <span style={{ color: '#dfe8f5', fontSize: '12px', marginLeft: '6px' }}>
                      "{record.input}"
                    </span>
                    {record.correct && (
                      <span style={{ color: '#7ce1d7', fontSize: '11px', marginLeft: '8px' }}>✓ 正确！</span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 学习统计 */}
          {(session.normalListenCount > 0 || session.slowListenCount > 0) && (
            <div className="settings-card" style={{ maxWidth: '100%', margin: '16px 0' }}>
              <h3 style={{ marginTop: '0' }}>学习统计</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#7ce1d7' }}>🔊</span>
                  <span style={{ color: '#91a0b5', marginLeft: '6px' }}>
                    正常速度：{session.normalListenCount} 次
                  </span>
                </div>
                <div>
                  <span style={{ color: '#7ce1d7' }}>🐢</span>
                  <span style={{ color: '#91a0b5', marginLeft: '6px' }}>
                    慢速：{session.slowListenCount} 次
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onContinue}
          className="reshuffle"
          style={{ width: '100%', padding: '10px 14px', marginTop: '12px' }}
        >
          进入主动回忆 (造句验证)
        </button>
      </div>
    </main>
  )
}
