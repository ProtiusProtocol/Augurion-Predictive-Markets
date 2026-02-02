import { useState, useEffect } from 'react'
import algosdk from 'algosdk'

// Config - adjust to match your deployment
const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  kwhReceiptAppId: 1004, // Update with your actual app ID
}

interface MeterReading {
  id: number
  meterId: string
  kWhAmount: number
  recorded: boolean
}

interface EpochData {
  epochId: number
  totalKWh: number
  meterCount: number
  settled: boolean
}

export default function ProductionRecording() {
  const [connected, setConnected] = useState(false)
  const [epochId, setEpochId] = useState(getCurrentEpochId())
  const [readings, setReadings] = useState<MeterReading[]>([
    { id: 1, meterId: '1', kWhAmount: 0, recorded: false }
  ])
  const [recording, setRecording] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [epochData, setEpochData] = useState<EpochData | null>(null)
  const [log, setLog] = useState<string[]>([])

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)

  // Generate current epoch ID (YYYYMM format)
  function getCurrentEpochId(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}${month}`
  }

  // Check network connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await algodClient.status().do()
        setConnected(true)
      } catch (error) {
        setConnected(false)
        console.error('Network connection failed:', error)
      }
    }
    checkConnection()
    const interval = setInterval(checkConnection, 10000)
    return () => clearInterval(interval)
  }, [])

  // Load epoch data
  const loadEpochData = async () => {
    if (!connected) return

    setVerifying(true)
    try {
      const epochIdNum = Number(epochId)
      const epochIdBytes = algosdk.encodeUint64(epochIdNum)
      
      // Try to read epoch total box
      const totalKey = new Uint8Array(
        Buffer.concat([
          Buffer.from('epoch_kwh:', 'utf-8'),
          Buffer.from(epochIdBytes)
        ])
      )

      const settledKey = new Uint8Array(
        Buffer.concat([
          Buffer.from('epoch_settled:', 'utf-8'),
          Buffer.from(epochIdBytes)
        ])
      )

      let totalKWh = 0
      let settled = false
      let meterCount = 0

      try {
        const totalBox = await algodClient
          .getApplicationBoxByName(CONFIG.kwhReceiptAppId, totalKey)
          .do()
        totalKWh = Number(new DataView(totalBox.value.buffer).getBigUint64(0, false))
      } catch (e) {
        // Epoch not found - that's OK for new epochs
      }

      try {
        const settledBox = await algodClient
          .getApplicationBoxByName(CONFIG.kwhReceiptAppId, settledKey)
          .do()
        const settledValue = new DataView(settledBox.value.buffer).getBigUint64(0, false)
        settled = settledValue === 1n
      } catch (e) {
        // Not settled
      }

      setEpochData({
        epochId: epochIdNum,
        totalKWh,
        meterCount,
        settled
      })

      addLog(`✅ Loaded epoch ${epochId}: ${totalKWh} kWh recorded${settled ? ' (SETTLED)' : ''}`)
    } catch (error: any) {
      addLog(`❌ Failed to load epoch data: ${error.message}`)
    } finally {
      setVerifying(false)
    }
  }

  // Add meter reading row
  const addMeter = () => {
    const newId = readings.length + 1
    setReadings([
      ...readings,
      { id: newId, meterId: newId.toString(), kWhAmount: 0, recorded: false }
    ])
  }

  // Remove meter reading row
  const removeMeter = (id: number) => {
    if (readings.length === 1) return // Keep at least one
    setReadings(readings.filter(r => r.id !== id))
  }

  // Update meter reading
  const updateReading = (id: number, field: 'meterId' | 'kWhAmount', value: string | number) => {
    setReadings(readings.map(r => 
      r.id === id ? { ...r, [field]: value } : r
    ))
  }

  // Calculate total
  const totalKWh = readings.reduce((sum, r) => sum + (r.kWhAmount || 0), 0)

  // Add log message
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 20))
  }

  // Record production to blockchain
  const recordProduction = async () => {
    if (!connected) {
      alert('❌ Not connected to Algorand network')
      return
    }

    if (epochData?.settled) {
      alert('❌ This epoch is already settled. Cannot add more readings.')
      return
    }

    if (totalKWh === 0) {
      alert('❌ Total kWh must be greater than 0')
      return
    }

    // Validate readings
    const invalidReadings = readings.filter(r => !r.meterId || r.kWhAmount <= 0)
    if (invalidReadings.length > 0) {
      alert('❌ All meter readings must have a valid ID and positive kWh amount')
      return
    }

    // Confirm before recording
    const confirmed = confirm(
      `⚠️ CONFIRM PRODUCTION RECORDING\n\n` +
      `Epoch: ${epochId}\n` +
      `Meters: ${readings.length}\n` +
      `Total kWh: ${totalKWh.toLocaleString()}\n\n` +
      `This data is IMMUTABLE once recorded.\n` +
      `Are you sure all readings are correct?`
    )

    if (!confirmed) return

    setRecording(true)
    addLog(`🔄 Starting production recording for epoch ${epochId}...`)

    try {
      // NOTE: This is a placeholder for the actual transaction logic
      // In production, you need to:
      // 1. Connect to user's wallet (Pera, Defly, etc.)
      // 2. Build and sign transactions
      // 3. Submit to blockchain

      addLog(`⚠️ DEMO MODE: Would record ${readings.length} meter readings`)
      
      for (const reading of readings) {
        // In production, call kwhReceiptClient.recordProduction({
        //   epochId: Number(epochId),
        //   intervalId: Number(reading.meterId),
        //   kWhAmount: reading.kWhAmount
        // })
        
        addLog(`  📊 Meter ${reading.meterId}: ${reading.kWhAmount} kWh`)
        
        // Mark as recorded in UI
        updateReading(reading.id, 'kWhAmount', reading.kWhAmount)
      }

      addLog(`✅ Successfully recorded ${totalKWh} kWh for epoch ${epochId}`)
      
      alert(`✅ SUCCESS!\n\nRecorded ${totalKWh.toLocaleString()} kWh for epoch ${epochId}`)

      // Reload epoch data
      await loadEpochData()

    } catch (error: any) {
      console.error('Recording failed:', error)
      addLog(`❌ Recording failed: ${error.message}`)
      alert(`❌ Recording failed: ${error.message}`)
    } finally {
      setRecording(false)
    }
  }

  // Import from CSV
  const importFromCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(l => l.trim())
        
        // Skip header if present
        const dataLines = lines[0].toLowerCase().includes('meter') ? lines.slice(1) : lines
        
        const imported = dataLines.map((line, index) => {
          const [meterId, kWh] = line.split(',').map(s => s.trim())
          return {
            id: index + 1,
            meterId: meterId || `${index + 1}`,
            kWhAmount: parseFloat(kWh) || 0,
            recorded: false
          }
        }).filter(r => r.kWhAmount > 0)

        if (imported.length > 0) {
          setReadings(imported)
          addLog(`📁 Imported ${imported.length} meter readings from CSV`)
        }
      } catch (error: any) {
        addLog(`❌ CSV import failed: ${error.message}`)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📊 Production Recording</h2>
        <div style={{
          padding: '8px 12px',
          borderRadius: '4px',
          backgroundColor: connected ? '#4CAF50' : '#f44336',
          color: 'white',
          fontSize: '12px'
        }}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      {/* Epoch Input */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          Epoch ID (YYYYMM):
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={epochId}
            onChange={(e) => setEpochId(e.target.value)}
            placeholder="202602"
            style={{ 
              padding: '8px 12px', 
              fontSize: '16px',
              border: '2px solid #ddd',
              borderRadius: '4px',
              width: '150px'
            }}
          />
          <button
            onClick={loadEpochData}
            disabled={verifying || !epochId}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {verifying ? '⏳ Loading...' : '🔍 Load Epoch Data'}
          </button>
        </div>

        {epochData && (
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            <div>Current Total: {epochData.totalKWh.toLocaleString()} kWh</div>
            {epochData.settled && (
              <div style={{ color: '#f44336', fontWeight: 'bold' }}>⚠️ EPOCH SETTLED - No more recordings allowed</div>
            )}
          </div>
        )}
      </div>

      {/* Meter Readings */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>Meter Readings</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{
              padding: '8px 16px',
              backgroundColor: '#FF9800',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              📁 Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={importFromCSV}
                style={{ display: 'none' }}
              />
            </label>
            <button
              onClick={addMeter}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              + Add Meter
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Meter ID</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>kWh Amount</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '80px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading) => (
                <tr key={reading.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <input
                      type="text"
                      value={reading.meterId}
                      onChange={(e) => updateReading(reading.id, 'meterId', e.target.value)}
                      placeholder="Meter ID"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <input
                      type="number"
                      value={reading.kWhAmount || ''}
                      onChange={(e) => updateReading(reading.id, 'kWhAmount', Number(e.target.value))}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        textAlign: 'right'
                      }}
                    />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button
                      onClick={() => removeMeter(reading.id)}
                      disabled={readings.length === 1}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: readings.length === 1 ? 'not-allowed' : 'pointer',
                        opacity: readings.length === 1 ? 0.5 : 1
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Summary */}
      <div style={{
        padding: '20px',
        backgroundColor: '#e3f2fd',
        border: '2px solid #2196F3',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '14px', color: '#1976d2', marginBottom: '5px' }}>
          Total Generation for Epoch {epochId}
        </div>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#0d47a1' }}>
          {totalKWh.toLocaleString()} kWh
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
          {readings.length} meter{readings.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Record Button */}
      <button
        onClick={recordProduction}
        disabled={!connected || recording || !epochId || totalKWh === 0 || epochData?.settled}
        style={{
          width: '100%',
          padding: '16px',
          fontSize: '18px',
          fontWeight: 'bold',
          backgroundColor: recording ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: recording || !connected || epochData?.settled ? 'not-allowed' : 'pointer',
          marginBottom: '20px'
        }}
      >
        {recording ? '⏳ Recording to Blockchain...' : '✅ Record Production to Blockchain'}
      </button>

      {/* Warnings */}
      <div style={{
        padding: '15px',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '8px',
        fontSize: '13px',
        marginBottom: '20px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Important:</div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Each meter ID can only be recorded once per epoch</li>
          <li>Data is <strong>immutable</strong> once recorded to blockchain</li>
          <li>Verify all readings before submitting</li>
          <li>Total will be used for PPA allocations and revenue distribution</li>
          <li>Cannot record to epochs that are already settled</li>
        </ul>
      </div>

      {/* Activity Log */}
      <div>
        <h3>Activity Log</h3>
        <div style={{
          padding: '10px',
          backgroundColor: '#1e1e1e',
          color: '#00ff00',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '8px',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {log.length === 0 ? (
            <div style={{ color: '#666' }}>No activity yet...</div>
          ) : (
            log.map((msg, i) => <div key={i}>{msg}</div>)
          )}
        </div>
      </div>

      {/* CSV Format Help */}
      <details style={{ marginTop: '20px', fontSize: '13px', color: '#666' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          📄 CSV Import Format
        </summary>
        <pre style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '10px', 
          borderRadius: '4px',
          overflow: 'auto'
        }}>
{`Meter ID,kWh
1,45230
2,38450
3,42100`}
        </pre>
      </details>
    </div>
  )
}
