import { useState, useEffect } from 'react'
import algosdk from 'algosdk'

// Hardcoded config - matches deployed localnet contracts
const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  registryAppId: 1002,
  kwTokenAppId: 1003,
  kwhReceiptAppId: 1004,
  revenueVaultAppId: 1005,
}

interface EpochState {
  epochId: number
  status: 'NOT_FOUND' | 'OPEN' | 'CLOSED' | 'SETTLED'
  netDeposited: bigint
  revenuePerKw: bigint
  reportHash: string | null
}

interface RegistryState {
  projectId: bigint | null
  installedAcKw: bigint | null
  treasury: string | null
  codDate: bigint | null
  fcFinalized: boolean | null
  kwTokenAddr: string | null
  kwhReceiptAddr: string | null
  revenueVaultAddr: string | null
}

interface NetworkStatus {
  connected: boolean
  lastRound: number
  error: string | null
}

export default function ProjectOverview() {
  const [network, setNetwork] = useState<NetworkStatus>({ connected: false, lastRound: 0, error: null })
  const [epochState, setEpochState] = useState<EpochState | null>(null)
  const [registryState, setRegistryState] = useState<RegistryState | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number>(202501)
  const [loading, setLoading] = useState<boolean>(false)

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)

  // Export state as JSON
  const exportSnapshot = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      network: {
        algodServer: CONFIG.algodServer,
        algodPort: CONFIG.algodPort,
        connected: network.connected,
        lastRound: network.lastRound,
      },
      contracts: {
        registry: CONFIG.registryAppId,
        kwToken: CONFIG.kwTokenAppId,
        kwhReceipt: CONFIG.kwhReceiptAppId,
        revenueVault: CONFIG.revenueVaultAppId,
      },
      project: registryState ? {
        projectId: registryState.projectId?.toString() || null,
        installedAcKw: registryState.installedAcKw?.toString() || null,
        treasury: registryState.treasury || null,
        codDate: registryState.codDate?.toString() || null,
        fcFinalized: registryState.fcFinalized,
        registeredContracts: {
          kwToken: registryState.kwTokenAddr || null,
          kwhReceipt: registryState.kwhReceiptAddr || null,
          revenueVault: registryState.revenueVaultAddr || null,
        },
      } : null,
      epoch: epochState ? {
        epochId: epochState.epochId,
        status: epochState.status,
        netDeposited: epochState.netDeposited.toString(),
        revenuePerKw: epochState.revenuePerKw.toString(),
        reportHash: epochState.reportHash || null,
      } : null,
    }

    const jsonString = JSON.stringify(snapshot, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `protius-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Read network status
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const status = await algodClient.status().do()
        setNetwork({ connected: true, lastRound: status['last-round'], error: null })
      } catch (err: any) {
        setNetwork({ connected: false, lastRound: 0, error: err.message })
      }
    }
    checkNetwork()
    const interval = setInterval(checkNetwork, 5000)
    return () => clearInterval(interval)
  }, [])

  // Read registry state
  const readRegistryState = async () => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.registryAppId).do()
      const globalState = appInfo.params['global-state'] || []

      let projectId: bigint | null = null
      let installedAcKw: bigint | null = null
      let treasury: string | null = null
      let codDate: bigint | null = null
      let fcFinalized: boolean | null = null
      let kwTokenAddr: string | null = null
      let kwhReceiptAddr: string | null = null
      let revenueVaultAddr: string | null = null

      // Parse global state
      for (const entry of globalState) {
        const key = Buffer.from(entry.key, 'base64').toString('utf-8')
        const value = entry.value

        if (key === 'project_id' && value.type === 2) {
          projectId = BigInt(value.uint)
        } else if (key === 'installed_ac_kw' && value.type === 2) {
          installedAcKw = BigInt(value.uint)
        } else if (key === 'treasury' && value.type === 1) {
          treasury = Buffer.from(value.bytes, 'base64').toString('utf-8')
        } else if (key === 'cod_date' && value.type === 2) {
          codDate = BigInt(value.uint)
        } else if (key === 'fc_finalised' && value.type === 2) {
          fcFinalized = value.uint === 1n
        } else if (key === 'kw_token' && value.type === 1) {
          kwTokenAddr = Buffer.from(value.bytes, 'base64').toString('utf-8')
        } else if (key === 'kwh_receipt' && value.type === 1) {
          kwhReceiptAddr = Buffer.from(value.bytes, 'base64').toString('utf-8')
        } else if (key === 'revenue_vault' && value.type === 1) {
          revenueVaultAddr = Buffer.from(value.bytes, 'base64').toString('utf-8')
        }
      }

      setRegistryState({
        projectId,
        installedAcKw,
        treasury,
        codDate,
        fcFinalized,
        kwTokenAddr,
        kwhReceiptAddr,
        revenueVaultAddr,
      })
    } catch (err: any) {
      console.error('Failed to read registry state:', err.message)
      setRegistryState(null)
    }
  }

  // Read epoch state
  const readEpochState = async (epochId: number) => {
    try {
      setLoading(true)
      const appInfo = await algodClient.getApplicationByID(CONFIG.revenueVaultAppId).do()

      // Read boxes for epoch-specific data
      const epochIdBytes = algosdk.encodeUint64(epochId)

      const statusKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_status:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const hashKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_hash:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const netKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_net_deposited:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const revKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_rev_kw:', 'utf-8'), Buffer.from(epochIdBytes)]))

      let status: 'NOT_FOUND' | 'OPEN' | 'CLOSED' | 'SETTLED' = 'NOT_FOUND'
      let netDeposited = 0n
      let revenuePerKw = 0n
      let reportHash: string | null = null

      try {
        const statusBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, statusKey).do()
        const statusValue = new DataView(statusBox.value.buffer).getBigUint64(0, false)
        if (statusValue === 1n) status = 'OPEN'
        else if (statusValue === 2n) status = 'CLOSED'
      } catch {}

      try {
        const hashBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, hashKey).do()
        reportHash = Buffer.from(hashBox.value).toString('base64')
      } catch {}

      try {
        const netBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, netKey).do()
        netDeposited = new DataView(netBox.value.buffer).getBigUint64(0, false)
      } catch {}

      try {
        const revBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, revKey).do()
        revenuePerKw = new DataView(revBox.value.buffer).getBigUint64(0, false)
        if (revenuePerKw > 0n) status = 'SETTLED'
      } catch {}

      setEpochState({ epochId, status, netDeposited, revenuePerKw, reportHash })
    } catch (err: any) {
      console.error('Failed to read epoch state:', err.message)
      setEpochState(null)
    } finally {
      setLoading(false)
    }
  }

  // Generate protocol summary
  const getProtocolSummary = (): string => {
    if (!epochState) return 'Epoch state loading...'
    if (epochState.status === 'NOT_FOUND') return `Epoch ${epochState.epochId} does not exist yet.`
    if (epochState.status === 'OPEN') return `Epoch ${epochState.epochId} is OPEN. Ready to be closed.`
    if (epochState.status === 'CLOSED' && epochState.netDeposited === 0n) return `Epoch ${epochState.epochId} is CLOSED. Ready to deposit revenue.`
    if (epochState.status === 'CLOSED' && epochState.netDeposited > 0n && epochState.revenuePerKw === 0n) return `Epoch ${epochState.epochId} has ${epochState.netDeposited.toString()} µAlgos deposited. Ready to compute entitlements.`
    if (epochState.status === 'SETTLED') return `Epoch ${epochState.epochId} is SETTLED with revenuePerKw = ${epochState.revenuePerKw.toString()} µAlgos/kW.`
    return `Epoch ${epochState.epochId} state: ${epochState.status}`
  }

  // Initial load
  useEffect(() => {
    if (network.connected) {
      readEpochState(currentEpochId)
      readRegistryState()
    }
  }, [network.connected, currentEpochId])

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Protius Protocol Overview</h1>
      <p style={{ color: '#666' }}>Read-only system state view. No actions. No wallets. All data from on-chain.</p>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={exportSnapshot}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #999',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'normal'
          }}
        >
          Export Snapshot (JSON)
        </button>
      </div>

      <hr />

      {/* Protocol Summary */}
      <section>
        <div style={{
          backgroundColor: '#f0f0f0',
          padding: '12px',
          border: '1px solid #999',
          borderRadius: '4px',
          fontSize: '14px',
          marginBottom: '20px'
        }}>
          <strong>Protocol State:</strong> {getProtocolSummary()}
        </div>
      </section>

      {/* Network Status */}
      <section>
        <h2>Network</h2>
        <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td><strong>Algod</strong></td>
              <td>{CONFIG.algodServer}:{CONFIG.algodPort}</td>
            </tr>
            <tr>
              <td><strong>Connected</strong></td>
              <td style={{ color: network.connected ? 'green' : 'red' }}>
                {network.connected ? '✓ Connected' : '✗ Disconnected'}
              </td>
            </tr>
            <tr>
              <td><strong>Last Round</strong></td>
              <td>{network.lastRound}</td>
            </tr>
            {network.error && (
              <tr>
                <td><strong>Error</strong></td>
                <td style={{ color: 'red' }}>{network.error}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <hr />

      {/* Contracts */}
      <section>
        <h2>Contracts</h2>
        <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ backgroundColor: '#f5f5f5' }}>
            <tr>
              <th style={{ textAlign: 'left' }}>Contract</th>
              <th style={{ textAlign: 'left' }}>App ID</th>
              <th style={{ textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>ProjectRegistry</strong></td>
              <td>{CONFIG.registryAppId}</td>
              <td style={{ color: registryState ? 'green' : '#999' }}>
                {registryState ? '✓ Deployed' : 'Loading...'}
              </td>
            </tr>
            <tr>
              <td><strong>kWToken</strong></td>
              <td>{CONFIG.kwTokenAppId}</td>
              <td style={{ color: registryState?.kwTokenAddr ? 'green' : '#999' }}>
                {registryState?.kwTokenAddr ? '✓ Registered' : 'Not registered'}
              </td>
            </tr>
            <tr>
              <td><strong>kWhReceipt</strong></td>
              <td>{CONFIG.kwhReceiptAppId}</td>
              <td style={{ color: registryState?.kwhReceiptAddr ? 'green' : '#999' }}>
                {registryState?.kwhReceiptAddr ? '✓ Registered' : 'Not registered'}
              </td>
            </tr>
            <tr>
              <td><strong>RevenueVault</strong></td>
              <td>{CONFIG.revenueVaultAppId}</td>
              <td style={{ color: registryState?.revenueVaultAddr ? 'green' : '#999' }}>
                {registryState?.revenueVaultAddr ? '✓ Registered' : 'Not registered'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <hr />

      {/* Project State */}
      <section>
        <h2>Project</h2>
        {registryState ? (
          <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td><strong>Project ID</strong></td>
                <td>{registryState.projectId?.toString() || '(not set)'}</td>
              </tr>
              <tr>
                <td><strong>Installed AC (kW)</strong></td>
                <td>{registryState.installedAcKw?.toString() || '(not set)'}</td>
              </tr>
              <tr>
                <td><strong>Treasury</strong></td>
                <td style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                  {registryState.treasury || '(not set)'}
                </td>
              </tr>
              <tr>
                <td><strong>COD Date (Unix)</strong></td>
                <td>{registryState.codDate?.toString() || '(not set)'}</td>
              </tr>
              <tr>
                <td><strong>FC Finalized</strong></td>
                <td>
                  {registryState.fcFinalized === null ? '(not set)' : registryState.fcFinalized ? '✓ Yes' : '✗ No'}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>Loading project state...</p>
        )}
      </section>

      <hr />

      {/* Epoch State */}
      <section>
        <h2>Epoch State</h2>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px' }}>
            View Epoch ID:{' '}
            <input
              type="number"
              value={currentEpochId}
              onChange={(e) => setCurrentEpochId(Number(e.target.value))}
              style={{ padding: '4px', width: '100px' }}
              disabled={loading}
            />
          </label>
          {loading && <span style={{ marginLeft: '10px', color: '#999' }}>Reading...</span>}
        </div>

        {epochState ? (
          <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td><strong>Epoch ID</strong></td>
                <td>{epochState.epochId}</td>
              </tr>
              <tr>
                <td><strong>Status</strong></td>
                <td style={{
                  color: epochState.status === 'SETTLED' ? 'green' :
                    epochState.status === 'CLOSED' ? 'orange' :
                      epochState.status === 'OPEN' ? 'blue' : 'gray'
                }}>
                  <strong>{epochState.status}</strong>
                </td>
              </tr>
              <tr>
                <td><strong>Net Deposited (µAlgos)</strong></td>
                <td>{epochState.netDeposited.toString()}</td>
              </tr>
              <tr>
                <td><strong>Revenue per kW (µAlgos)</strong></td>
                <td>{epochState.revenuePerKw.toString()}</td>
              </tr>
              <tr>
                <td><strong>Report Hash (Base64)</strong></td>
                <td style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                  {epochState.reportHash || '(not anchored)'}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>Loading epoch state...</p>
        )}
      </section>

      <hr />

      {/* Footer */}
      <footer style={{ fontSize: '11px', color: '#999', marginTop: '30px' }}>
        <p>
          This view represents the actual on-chain state of the Protius Protocol.
          All data is read directly from the Algorand blockchain. No simulation, no off-chain cache.
        </p>
      </footer>
    </div>
  )
}
