import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import OperatorConsole from './OperatorConsole'
import ProjectOverview from './ProjectOverview'
import ClaimantPreview from './ClaimantPreview'
import ClaimExecution from './ClaimExecution'

function App() {
  const [screen, setScreen] = useState<'overview' | 'operator' | 'claimant' | 'claim-exec'>('overview')

  return (
    <div>
      <nav style={{ 
        padding: '10px 20px', 
        backgroundColor: '#f5f5f5', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '20px'
      }}>
        <button 
          onClick={() => setScreen('overview')}
          style={{ 
            background: screen === 'overview' ? '#333' : '#fff',
            color: screen === 'overview' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Project Overview
        </button>
        <button 
          onClick={() => setScreen('operator')}
          style={{ 
            background: screen === 'operator' ? '#333' : '#fff',
            color: screen === 'operator' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Operator Console
        </button>
        <button 
          onClick={() => setScreen('claimant')}
          style={{ 
            background: screen === 'claimant' ? '#333' : '#fff',
            color: screen === 'claimant' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Claimant Preview
        </button>
        <button 
          onClick={() => setScreen('claim-exec')}
          style={{ 
            background: screen === 'claim-exec' ? '#333' : '#fff',
            color: screen === 'claim-exec' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Claim Execution
        </button>
      </nav>
      {screen === 'overview' && <ProjectOverview />}
      {screen === 'operator' && <OperatorConsole />}
      {screen === 'claimant' && <ClaimantPreview />}
      {screen === 'claim-exec' && <ClaimExecution />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
