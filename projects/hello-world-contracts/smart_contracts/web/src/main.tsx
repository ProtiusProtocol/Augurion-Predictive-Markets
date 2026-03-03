import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import OperatorConsole from './OperatorConsole'
import ProjectOverview from './ProjectOverview'
import ClaimantPreview from './ClaimantPreview'
import ClaimExecution from './ClaimExecution'
import EquityInvestment from './EquityInvestment'
import TokenTransfer from './TokenTransfer'
import ProductionRecording from './ProductionRecording'
import BuyerPortal from './BuyerPortal'
import ProjectRegistration from './ProjectRegistration'
import { PROJECTS, ProjectEntry, DEFAULT_PROJECT } from './projects'
import { setActiveProjectIds } from './config'
import { projectStore } from './projectStore'

function buildProjectList(): ProjectEntry[] {
  const approved = projectStore.getApproved().map(s => ({
    id: s.submissionId,
    name: s.displayName,
    location: `${s.location} \u2013 ${s.installedAcKw} kW ${s.energyType}`,
    registryAppId: s.registryAppId!,
    kwTokenAppId: s.kwTokenAppId!,
    revenueVaultAppId: s.revenueVaultAppId!,
    kwhReceiptAppId: s.kwhReceiptAppId!,
  } as ProjectEntry))
  return [...PROJECTS, ...approved]
}

function App() {
  const [screen, setScreen] = useState<'overview' | 'operator' | 'claimant' | 'claim-exec' | 'invest' | 'transfer' | 'production' | 'buyer' | 'register'>('overview')
  const [projectList, setProjectList] = useState<ProjectEntry[]>(() => buildProjectList())
  const [selectedProject, setSelectedProject] = useState<ProjectEntry>(DEFAULT_PROJECT)

  // Refresh project list when a new project is approved on-chain
  useEffect(() => {
    const handler = () => setProjectList(buildProjectList())
    window.addEventListener('protius:project-approved', handler)
    return () => window.removeEventListener('protius:project-approved', handler)
  }, [])

  const handleProjectChange = (id: string) => {
    const p = projectList.find(p => p.id === id) ?? DEFAULT_PROJECT
    setActiveProjectIds(p)
    setSelectedProject(p)
  }

  return (
    <div>
      <nav style={{ 
        padding: '10px 20px', 
        backgroundColor: '#f5f5f5', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Project selector */}
        {projectList.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>PROJECT:</span>
            <select
              value={selectedProject.id}
              onChange={e => handleProjectChange(e.target.value)}
              style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '13px', border: '1px solid #aaa', borderRadius: '4px' }}
            >
              {projectList.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.location ? ` — ${p.location}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        {projectList.length === 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', padding: '6px 10px', background: '#e8f0fe', borderRadius: '4px', fontSize: '13px' }}>
            <span style={{ fontWeight: 700 }}>{selectedProject.name}</span>
            {selectedProject.location && <span style={{ color: '#555' }}>— {selectedProject.location}</span>}
          </div>
        )}
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
          onClick={() => setScreen('transfer')}
          style={{ 
            background: screen === 'transfer' ? '#333' : '#fff',
            color: screen === 'transfer' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔁 Token Transfer
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
        <button 
          onClick={() => setScreen('register')}
          style={{ 
            background: screen === 'register' ? '#333' : '#fff',
            color: screen === 'register' ? '#fff' : '#333',
            border: '1px solid #ddd',
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📋 Register Project
        </button>
      </nav>
      {screen === 'overview' && <ProjectOverview key={selectedProject.id} />}
      {screen === 'invest' && <EquityInvestment key={selectedProject.id} />}
      {screen === 'transfer' && <TokenTransfer key={selectedProject.id} />}
      {screen === 'claimant' && <ClaimantPreview />}
      {screen === 'claim-exec' && <ClaimExecution />}
      {screen === 'operator' && <OperatorConsole key={selectedProject.id} />}
      {screen === 'production' && <ProductionRecording />}
      {screen === 'buyer' && <BuyerPortal />}
      {screen === 'register' && <ProjectRegistration />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
