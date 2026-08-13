import React, { useMemo } from 'react'
import type { ContextMaterial } from './acquisitionTypes'

interface Props {
  material: ContextMaterial
  className?: string
}

export default function SceneIllustration({ material, className = '' }: Props) {
  const sceneType = useMemo(() => {
    const tags = material.tags || []
    const grammar = material.grammar as Record<string, unknown> | undefined
    const pos = String(grammar?.pos || '')

    // 标签匹配
    for (const tag of tags) {
      if (tag.includes('邀请')) return 'invitation'
      if (tag.includes('商店')) return 'shopping'
      if (tag.includes('医疗')) return 'medical'
      if (tag.includes('办公')) return 'office'
      if (tag.includes('学校')) return 'school'
      if (tag.includes('旅行')) return 'travel'
      if (tag.includes('家')) return 'home'
    }

    // 词性匹配
    if (pos.includes('Verb')) return 'action'
    if (pos.includes('Nomen')) return 'object'
    if (pos.includes('Adj')) return 'quality'

    return null
  }, [material])

  if (!sceneType) return null

  return <div className={`scene-illustration ${className}`}>{renderScene(sceneType)}</div>
}

function renderScene(type: string): React.ReactNode {
  const commonProps = { viewBox: '0 0 200 150', className: 'scene-svg' }

  switch (type) {
    case 'invitation':
      return (
        <svg {...commonProps}>
          <rect x="50" y="40" width="100" height="70" fill="#fff8dc" stroke="#d4a574" strokeWidth="2" rx="4" />
          <text x="100" y="60" textAnchor="middle" fontSize="16" fontWeight="bold">
            邀请
          </text>
          <circle cx="70" cy="100" r="8" fill="#ff6b6b" />
          <circle cx="100" cy="100" r="8" fill="#ff6b6b" />
          <circle cx="130" cy="100" r="8" fill="#ff6b6b" />
        </svg>
      )
    case 'shopping':
      return (
        <svg {...commonProps}>
          <rect x="40" y="50" width="35" height="40" fill="#e8f5e9" stroke="#4caf50" strokeWidth="2" rx="3" />
          <rect x="85" y="50" width="35" height="40" fill="#e8f5e9" stroke="#4caf50" strokeWidth="2" rx="3" />
          <rect x="130" y="50" width="35" height="40" fill="#e8f5e9" stroke="#4caf50" strokeWidth="2" rx="3" />
          <circle cx="57" cy="70" r="6" fill="#fdd835" />
          <circle cx="102" cy="70" r="6" fill="#fdd835" />
          <circle cx="147" cy="70" r="6" fill="#fdd835" />
        </svg>
      )
    case 'medical':
      return (
        <svg {...commonProps}>
          <rect x="60" y="40" width="80" height="70" fill="#ffe0e0" stroke="#ef5350" strokeWidth="2" rx="4" />
          <g transform="translate(100, 75)">
            <rect x="-15" y="-2" width="30" height="4" fill="#ef5350" />
            <rect x="-2" y="-15" width="4" height="30" fill="#ef5350" />
          </g>
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            医疗
          </text>
        </svg>
      )
    case 'office':
      return (
        <svg {...commonProps}>
          <rect x="40" y="50" width="80" height="60" fill="#e3f2fd" stroke="#2196f3" strokeWidth="2" rx="3" />
          <rect x="50" y="60" width="20" height="15" fill="#2196f3" />
          <rect x="80" y="60" width="20" height="15" fill="#2196f3" />
          <rect x="110" y="60" width="20" height="15" fill="#2196f3" />
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            办公
          </text>
        </svg>
      )
    case 'school':
      return (
        <svg {...commonProps}>
          <polygon points="100,30 160,80 40,80" fill="#fff9c4" stroke="#fbc02d" strokeWidth="2" />
          <rect x="70" y="85" width="20" height="25" fill="#fbc02d" stroke="#f57f17" strokeWidth="1" />
          <rect x="95" y="85" width="20" height="25" fill="#fbc02d" stroke="#f57f17" strokeWidth="1" />
          <rect x="75" y="92" width="8" height="8" fill="#f57f17" />
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            学校
          </text>
        </svg>
      )
    case 'travel':
      return (
        <svg {...commonProps}>
          <circle cx="100" cy="70" r="35" fill="#ffccbc" stroke="#ff7043" strokeWidth="2" />
          <text x="100" y="77" textAnchor="middle" fontSize="24">
            🧳
          </text>
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            旅行
          </text>
        </svg>
      )
    case 'home':
      return (
        <svg {...commonProps}>
          <polygon points="100,35 155,85 145,85 145,110 55,110 55,85 45,85" fill="#ffccbc" stroke="#d7ccc8" strokeWidth="2" />
          <rect x="80" y="65" width="20" height="15" fill="#81c784" />
          <rect x="105" y="65" width="20" height="15" fill="#81c784" />
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            家
          </text>
        </svg>
      )
    case 'action':
      return (
        <svg {...commonProps}>
          <circle cx="60" cy="70" r="20" fill="#64b5f6" opacity="0.8" />
          <circle cx="140" cy="70" r="20" fill="#81c784" opacity="0.8" />
          <path d="M 80 70 L 120 70" stroke="#666" strokeWidth="2" markerEnd="url(#arrowhead)" />
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#666" />
            </marker>
          </defs>
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            动作
          </text>
        </svg>
      )
    case 'object':
      return (
        <svg {...commonProps}>
          <rect x="50" y="50" width="100" height="50" fill="#c8e6c9" stroke="#558b2f" strokeWidth="2" rx="3" />
          <circle cx="70" cy="75" r="8" fill="#558b2f" />
          <circle cx="100" cy="75" r="8" fill="#558b2f" />
          <circle cx="130" cy="75" r="8" fill="#558b2f" />
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            物品
          </text>
        </svg>
      )
    case 'quality':
      return (
        <svg {...commonProps}>
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#ffb74d', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#ff7043', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <circle cx="100" cy="70" r="35" fill="url(#grad)" />
          <text x="100" y="80" textAnchor="middle" fontSize="28" fontWeight="bold" fill="#fff">
            ✓
          </text>
          <text x="100" y="130" textAnchor="middle" fontSize="12" fill="#666">
            特性
          </text>
        </svg>
      )
    default:
      return null
  }
}
