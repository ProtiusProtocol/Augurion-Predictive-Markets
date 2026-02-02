import React, { useEffect, useState } from 'react'
import algosdk from 'algosdk'

// Project states matching contract enum
const PROJECT_STATES = {
  0: 'DRAFT',
  1: 'REGISTERED',
  2: 'FUNDED',
  3: 'UNDER_CONSTRUCTION',
  4: 'COMMISSIONING',
  5: 'OPERATING',
  6: 'SUSPENDED',
  7: 'EXITED',
} as const

const STATE_DESCRIPTIONS = {
  DRAFT: 'Project being configured',
  REGISTERED: 'Ready for fundraising',
  FUNDED: 'Financial close achieved',
  UNDER_CONSTRUCTION: 'EPC contractor building',
  COMMISSIONING: 'Testing and grid interconnection',
  OPERATING: 'Commercial operation',
  SUSPENDED: 'Temporarily halted',
  EXITED: 'Decommissioned',
}

const STATE_COLORS = {
  DRAFT: '#6b7280',
  REGISTERED: '#3b82f6',
  FUNDED: '#10b981',
  UNDER_CONSTRUCTION: '#f59e0b',
  COMMISSIONING: '#8b5cf6',
  OPERATING: '#10b981',
  SUSPENDED: '#ef4444',
  EXITED: '#6b7280',
}

interface ProjectStatusPanelProps {
  projectRegistryAppId: number
  algodClient: algosdk.Algodv2
  readOnly?: boolean
}

interface ProjectStateInfo {
  currentState: number
  stateName: string
  stateEnteredAt: number
  lastTransition: number
  operator: string
  isOperational: boolean
}

export default function ProjectStatusPanel({
  projectRegistryAppId,
  algodClient,
  readOnly = false,
}: ProjectStatusPanelProps) {
  const [stateInfo, setStateInfo] = useState<ProjectStateInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  // Fetch current state from blockchain
  const fetchProjectState = async () => {
    try {
      setLoading(true)
      setError(null)

      const appInfo = await algodClient.getApplicationByID(projectRegistryAppId).do()
      const globalState = appInfo.params['global-state']

      // Parse global state
      let currentState = 0
      let stateEnteredAt = 0
      let lastTransition = 0
      let operator = ''
      let isOperational = false

      for (const item of globalState) {
        const key = Buffer.from(item.key, 'base64').toString()
        
        if (key === 'projectState') {
          currentState = item.value.uint
        } else if (key === 'stateEnteredAt') {
          stateEnteredAt = item.value.uint
        } else if (key === 'lastStateTransition') {
          lastTransition = item.value.uint
        } else if (key === 'operator') {
          operator = algosdk.encodeAddress(Buffer.from(item.value.bytes, 'base64'))
        }
      }

      // Check if operational
      isOperational = currentState === 5 || currentState === 6 // OPERATING or SUSPENDED

      setStateInfo({
        currentState,
        stateName: PROJECT_STATES[currentState as keyof typeof PROJECT_STATES] || 'UNKNOWN',
        stateEnteredAt,
        lastTransition,
        operator,
        isOperational,
      })
    } catch (err) {
      console.error('Error fetching project state:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch project state')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjectState()
    // Refresh every 10 seconds
    const interval = setInterval(fetchProjectState, 10000)
    return () => clearInterval(interval)
  }, [projectRegistryAppId])

  // Get allowed transitions from current state
  const getAllowedTransitions = (currentState: number): number[] => {
    const transitions: Record<number, number[]> = {
      0: [1], // DRAFT -> REGISTERED
      1: [2], // REGISTERED -> FUNDED
      2: [3], // FUNDED -> UNDER_CONSTRUCTION
      3: [4], // UNDER_CONSTRUCTION -> COMMISSIONING
      4: [5], // COMMISSIONING -> OPERATING
      5: [6, 7], // OPERATING -> SUSPENDED or EXITED
      6: [5, 7], // SUSPENDED -> OPERATING or EXITED
    }
    return transitions[currentState] || []
  }

  // Get enabled/disabled actions based on state
  const getStatePermissions = (stateName: string) => {
    const permissions = {
      tokenSaleOpen: ['REGISTERED', 'FUNDED'],
      fcFinalization: ['REGISTERED'],
      codMarking: ['COMMISSIONING'],
      productionRecording: ['OPERATING'],
      ppaAllocation: ['OPERATING'],
      revenueDeposit: ['OPERATING'],
      epochSettlement: ['OPERATING'],
    }

    return {
      enabled: Object.entries(permissions)
        .filter(([_, states]) => states.includes(stateName))
        .map(([action]) => action),
      disabled: Object.entries(permissions)
        .filter(([_, states]) => !states.includes(stateName))
        .map(([action]) => action),
    }
  }

  const handleTransition = async (newState: number) => {
    if (readOnly) return
    
    setTransitioning(true)
    try {
      // This would call the transitionState() method via wallet integration
      // For now, just show alert
      alert(`Transition to ${PROJECT_STATES[newState as keyof typeof PROJECT_STATES]} would be called here`)
      // After successful transition, refresh state
      await fetchProjectState()
    } catch (err) {
      console.error('Transition error:', err)
      alert('Transition failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setTransitioning(false)
    }
  }

  if (loading && !stateInfo) {
    return (
      <div className="project-status-panel loading">
        <p>Loading project state...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="project-status-panel error">
        <h3>⚠️ Error Loading Project State</h3>
        <p>{error}</p>
        <button onClick={fetchProjectState}>Retry</button>
      </div>
    )
  }

  if (!stateInfo) return null

  const permissions = getStatePermissions(stateInfo.stateName)
  const allowedTransitions = getAllowedTransitions(stateInfo.currentState)

  return (
    <div className="project-status-panel">
      <style>{`
        .project-status-panel {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .project-status-panel h3 {
          margin: 0 0 16px 0;
          color: #111827;
          font-size: 18px;
          font-weight: 600;
        }
        .status-current {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        .status-badge {
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 16px;
          color: white;
        }
        .status-details {
          flex: 1;
        }
        .status-details p {
          margin: 4px 0;
          color: #6b7280;
          font-size: 14px;
        }
        .lifecycle-timeline {
          margin: 24px 0;
          padding: 16px;
          background: #f9fafb;
          border-radius: 6px;
        }
        .lifecycle-timeline h4 {
          margin: 0 0 16px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }
        .timeline-states {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .timeline-state {
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          background: #e5e7eb;
          color: #6b7280;
          position: relative;
        }
        .timeline-state.active {
          color: white;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }
        .timeline-state.past {
          background: #d1d5db;
          color: #4b5563;
        }
        .timeline-arrow {
          color: #9ca3af;
          font-size: 12px;
        }
        .permissions-section {
          margin-top: 20px;
        }
        .permissions-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }
        .permissions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
        }
        .permission-item {
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .permission-item.enabled {
          background: #d1fae5;
          color: #065f46;
        }
        .permission-item.disabled {
          background: #fee2e2;
          color: #991b1b;
        }
        .transitions-section {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
        .transitions-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }
        .transition-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .transition-btn {
          padding: 10px 16px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .transition-btn:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
        .transition-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .operational-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          background: #d1fae5;
          color: #065f46;
        }
        .operational-badge.not-operational {
          background: #fee2e2;
          color: #991b1b;
        }
      `}</style>

      <h3>📊 Project Lifecycle Status</h3>

      {/* Current State */}
      <div className="status-current">
        <div
          className="status-badge"
          style={{ backgroundColor: STATE_COLORS[stateInfo.stateName as keyof typeof STATE_COLORS] }}
        >
          {stateInfo.stateName}
        </div>
        <div className="status-details">
          <p>
            <strong>{STATE_DESCRIPTIONS[stateInfo.stateName as keyof typeof STATE_DESCRIPTIONS]}</strong>
          </p>
          <p>Entered at round: {stateInfo.stateEnteredAt.toLocaleString()}</p>
          <p>Last transition: Round {stateInfo.lastTransition.toLocaleString()}</p>
          <p>
            <span className={`operational-badge ${!stateInfo.isOperational ? 'not-operational' : ''}`}>
              {stateInfo.isOperational ? '✓ Operational' : '○ Not Operational'}
            </span>
          </p>
        </div>
      </div>

      {/* Lifecycle Timeline */}
      <div className="lifecycle-timeline">
        <h4>Project Lifecycle</h4>
        <div className="timeline-states">
          {Object.entries(PROJECT_STATES).map(([stateNum, stateName], index) => {
            const num = parseInt(stateNum)
            const isActive = num === stateInfo.currentState
            const isPast = num < stateInfo.currentState
            const bgColor = isActive
              ? STATE_COLORS[stateName]
              : isPast
              ? undefined
              : undefined

            return (
              <React.Fragment key={num}>
                <div
                  className={`timeline-state ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                  style={isActive ? { backgroundColor: bgColor } : {}}
                >
                  {stateName}
                </div>
                {index < Object.keys(PROJECT_STATES).length - 1 && (
                  <span className="timeline-arrow">→</span>
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* State-Aware Permissions */}
      <div className="permissions-section">
        <h4>Available Actions</h4>
        <div className="permissions-grid">
          {permissions.enabled.map((action) => (
            <div key={action} className="permission-item enabled">
              <span>✓</span>
              <span>{action.replace(/([A-Z])/g, ' $1').trim()}</span>
            </div>
          ))}
          {permissions.disabled.map((action) => (
            <div key={action} className="permission-item disabled">
              <span>✗</span>
              <span>{action.replace(/([A-Z])/g, ' $1').trim()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* State Transitions (Admin/Operator only) */}
      {!readOnly && allowedTransitions.length > 0 && (
        <div className="transitions-section">
          <h4>🔄 Available Transitions</h4>
          <div className="transition-buttons">
            {allowedTransitions.map((targetState) => (
              <button
                key={targetState}
                className="transition-btn"
                onClick={() => handleTransition(targetState)}
                disabled={transitioning}
              >
                Transition to {PROJECT_STATES[targetState as keyof typeof PROJECT_STATES]}
              </button>
            ))}
          </div>
        </div>
      )}

      {readOnly && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
          Read-only view. Contact project operator for state changes.
        </p>
      )}
    </div>
  )
}
