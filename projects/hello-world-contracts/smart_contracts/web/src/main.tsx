import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import OperatorConsole from './OperatorConsole'
import ProjectOverview from './ProjectOverview'
import ClaimantPreview from './ClaimantPreview'
import ClaimExecution from './ClaimExecution'
import EquityInvestment from './EquityInvestment'
import ProductionRecording from './ProductionRecording'
import BuyerPortal from './BuyerPortal'

function App() {
  const [screen, setScreen] = useState<'overview' | 'operator' | 'claimant' | 'claim-exec' | 'invest' | 'production' | 'buyer'>('overview')

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
          1. Project Overview
        </button>
        <button 
          onClick={() => setScreen('invest')}
          style={{ 
            background: screen === 'invest' ? '#333' : '#fff',
            color: screen === 'invest' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          2. Equity Investment
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
          3. Claim Notification
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
          4. Claim Execution
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
          🔧 Operator Console
        </button>
        <button 
          onClick={() => setScreen('production')}
          style={{ 
            background: screen === 'production' ? '#333' : '#fff',
            color: screen === 'production' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📊 Production Recording
        </button>
        <button 
          onClick={() => setScreen('buyer')}
          style={{ 
            background: screen === 'buyer' ? '#333' : '#fff',
            color: screen === 'buyer' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ⚡ PPA Buyer Portal
        </button>
      </nav>
      {screen === 'overview' && <ProjectOverview />}
      {screen === 'invest' && <EquityInvestment />}
      {screen === 'claimant' && <ClaimantPreview />}
      {screen === 'claim-exec' && <ClaimExecution />}
      {screen === 'operator' && <OperatorConsole />}
      {screen === 'production' && <ProductionRecording />}
      {screen === 'buyer' && <BuyerPortal />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
