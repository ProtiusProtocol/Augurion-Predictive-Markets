import { useState } from 'react'
import { projectStore, EnergyType } from './projectStore'

const ENERGY_TYPES: EnergyType[] = ['Solar', 'Wind', 'Hydro', 'Geothermal', 'Battery Storage', 'Other']

interface FormState {
  displayName: string
  energyType: EnergyType
  location: string
  installedAcKw: string
  platformKwBps: string
  platformKwhRateBps: string
  treasuryAddress: string
  permits: string
  description: string
}

const EMPTY: FormState = {
  displayName: '',
  energyType: 'Solar',
  location: '',
  installedAcKw: '',
  platformKwBps: '500',
  platformKwhRateBps: '100',
  treasuryAddress: '',
  permits: '',
  description: '',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  fontFamily: 'monospace',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontWeight: 600,
  fontSize: '13px',
}

const row2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
}

export default function ProjectRegistration() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [submissionId, setSubmissionId] = useState('')
  const [error, setError] = useState('')

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validate = (): string => {
    if (!form.displayName.trim()) return 'Project name is required.'
    if (!form.location.trim()) return 'Location is required.'
    const kw = Number(form.installedAcKw)
    if (!kw || kw <= 0) return 'Installed AC capacity must be a positive number.'
    const bps = Number(form.platformKwBps)
    if (isNaN(bps) || bps < 0 || bps > 10000) return 'Platform kW fee must be 0–10000 BPS.'
    const rateBps = Number(form.platformKwhRateBps)
    if (isNaN(rateBps) || rateBps < 0 || rateBps > 10000) return 'Platform kWh rate must be 0–10000 BPS.'
    if (form.treasuryAddress && form.treasuryAddress.length !== 58) return 'Treasury address must be a valid 58-char Algorand address (or leave empty to use admin).'
    return ''
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    const sub = projectStore.submit({
      displayName: form.displayName.trim(),
      energyType: form.energyType,
      location: form.location.trim(),
      installedAcKw: Number(form.installedAcKw),
      platformKwBps: Number(form.platformKwBps),
      platformKwhRateBps: Number(form.platformKwhRateBps),
      treasuryAddress: form.treasuryAddress.trim(),
      permits: form.permits.trim(),
      description: form.description.trim(),
    })
    setSubmissionId(sub.submissionId)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ fontFamily: 'monospace', padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
        <h1>✅ Project Submitted</h1>
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '16px' }}>
            Your project has been submitted for review.
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#555' }}>
            The Protius admin team will review your submission and contact you.
            Once approved, the project will be initialized on-chain and made available for investment.
          </p>
          <p style={{ margin: '0', fontSize: '12px', color: '#888' }}>
            Submission ID: <strong>{submissionId}</strong>
          </p>
        </div>
        <button
          onClick={() => { setSubmitted(false); setForm(EMPTY); setSubmissionId('') }}
          style={{ padding: '10px 20px', cursor: 'pointer', fontFamily: 'monospace' }}
        >
          Submit Another Project
        </button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <h1>📋 Project Registration</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Submit your renewable energy project for review. Once approved by the Protius admin,
        the project will be initialized on the Algorand blockchain and opened for investment.
      </p>

      <div style={{ background: '#e8f0fe', border: '1px solid #90a8e0', borderRadius: '6px', padding: '12px 16px', marginBottom: '24px', fontSize: '13px' }}>
        ℹ️ Fields marked with <strong>*</strong> are required. Treasury address is optional — defaults to admin if left blank.
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Basic info */}
        <fieldset style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px' }}>
          <legend style={{ fontWeight: 700, padding: '0 8px' }}>🏷️ Project Identity</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={labelStyle}>
              Project Name *
              <input style={inputStyle} type="text" value={form.displayName} onChange={set('displayName')} placeholder="e.g. PROTIUS-002 Broken Hill Solar" />
            </label>
            <div style={row2}>
              <label style={labelStyle}>
                Energy Type *
                <select style={inputStyle} value={form.energyType} onChange={set('energyType')}>
                  {ENERGY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Location *
                <input style={inputStyle} type="text" value={form.location} onChange={set('location')} placeholder="e.g. Broken Hill, NSW, Australia" />
              </label>
            </div>
            <label style={labelStyle}>
              Project Description
              <textarea
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                value={form.description}
                onChange={set('description')}
                placeholder="Briefly describe the project, technology, and expected output…"
              />
            </label>
          </div>
        </fieldset>

        {/* Technical parameters */}
        <fieldset style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px' }}>
          <legend style={{ fontWeight: 700, padding: '0 8px' }}>⚡ Technical Parameters</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={labelStyle}>
              Installed AC Capacity (kW) *
              <input style={inputStyle} type="number" min="1" value={form.installedAcKw} onChange={set('installedAcKw')} placeholder="e.g. 1000" />
            </label>
            <div style={row2}>
              <label style={labelStyle}>
                Platform kW Fee (BPS, 0–10000) *
                <input style={inputStyle} type="number" min="0" max="10000" value={form.platformKwBps} onChange={set('platformKwBps')} />
                {(() => {
                  const kw = Number(form.installedAcKw)
                  const bps = Number(form.platformKwBps)
                  const pct = (bps / 100).toFixed(2)
                  if (kw > 0 && bps >= 0) {
                    const platformKw = (kw * bps / 10000).toFixed(2)
                    const investorKw = (kw - Number(platformKw)).toFixed(2)
                    return (
                      <span style={{ fontSize: '11px', color: '#0a6b2a', fontWeight: 400 }}>
                        {pct}% → <strong>{platformKw} kW</strong> to platform, <strong>{investorKw} kW</strong> to investors
                      </span>
                    )
                  }
                  return <span style={{ fontSize: '11px', color: '#888', fontWeight: 400 }}>{pct}% of capacity goes to platform</span>
                })()}
              </label>
              <label style={labelStyle}>
                Platform kWh Rate (BPS, 0–10000) *
                <input style={inputStyle} type="number" min="0" max="10000" value={form.platformKwhRateBps} onChange={set('platformKwhRateBps')} />
                {(() => {
                  const pct = (Number(form.platformKwhRateBps) / 100).toFixed(2)
                  return (
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 400 }}>
                      {pct}% of each epoch's revenue goes to platform treasury
                    </span>
                  )
                })()}
              </label>
            </div>
          </div>
        </fieldset>

        {/* Financial / compliance */}
        <fieldset style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px' }}>
          <legend style={{ fontWeight: 700, padding: '0 8px' }}>💰 Financial & Compliance</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={labelStyle}>
              Treasury Address (Algorand)
              <input style={inputStyle} type="text" value={form.treasuryAddress} onChange={set('treasuryAddress')} placeholder="58-char Algorand address, or leave empty to use admin" />
            </label>
            <label style={labelStyle}>
              Permits & Regulatory References
              <textarea
                style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                value={form.permits}
                onChange={set('permits')}
                placeholder="Grid connection permit #, environmental approval #, any relevant regulatory references…"
              />
            </label>
          </div>
        </fieldset>

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #fcc', borderRadius: '4px', padding: '10px', color: '#c00' }}>
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          style={{
            padding: '14px',
            background: '#1a3a8a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          🚀 Submit Project for Review
        </button>
      </form>
    </div>
  )
}
