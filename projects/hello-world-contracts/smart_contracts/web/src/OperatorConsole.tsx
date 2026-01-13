import { useState, useEffect } from 'react'
import algosdk from 'algosdk'

// Hardcoded config - matches deployed localnet contracts
const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  revenueVaultAppId: 1005,
  adminAddress: 'ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA',
  adminMnemonic: 'elephant edge panel cushion oblige hurt toilet ridge lift great light hybrid domain foster clap fault screen index judge seed town idle powder able vessel'
}

interface EpochState {
  epochId: number
  status: 'NOT_FOUND' | 'OPEN' | 'CLOSED' | 'SETTLED'
  netDeposited: bigint
  revenuePerKw: bigint
  reportHash: string | null
}

interface NetworkStatus {
  connected: boolean
  lastRound: number
  error: string | null
}

export default function OperatorConsole() {
  const [network, setNetwork] = useState<NetworkStatus>({ connected: false, lastRound: 0, error: null })
  const [epochState, setEpochState] = useState<EpochState | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number>(202501)
  const [loading, setLoading] = useState<string | null>(null)
  const [actionLog, setActionLog] = useState<string[]>([])

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const adminAccount = algosdk.mnemonicToSecretKey(CONFIG.adminMnemonic)

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

  // Read epoch state
  const readEpochState = async (epochId: number) => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.revenueVaultAppId).do()
      const globalState = appInfo.params['global-state'] || []

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
      log(`❌ Failed to read epoch state: ${err.message}`)
      setEpochState(null)
    }
  }

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setActionLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 20))
  }

  const executeAction = async (actionName: string, action: () => Promise<void>) => {
    setLoading(actionName)
    try {
      await action()
      await readEpochState(currentEpochId) // Re-read state after action
    } catch (err: any) {
      log(`❌ ${actionName} failed: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  const createEpoch = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    // Simple app call to createEpoch
    const methodSelector = new Uint8Array(Buffer.from('createEpoch(uint64,uint64,uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)
    const startBytes = algosdk.encodeUint64(1735689600) // 2025-01-01
    const endBytes = algosdk.encodeUint64(1738367999) // 2025-01-31

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes, startBytes, endBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do()
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    log(`✅ createEpoch(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  const closeEpoch = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    const methodSelector = new Uint8Array(Buffer.from('closeEpoch(uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do()
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    log(`✅ closeEpoch(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  const depositRevenue = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    const revenueAmount = 30000000 // 30 ALGO in microAlgos
    const appAddress = algosdk.getApplicationAddress(CONFIG.revenueVaultAppId)

    // Payment transaction
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: adminAccount.addr,
      to: appAddress,
      amount: revenueAmount,
      suggestedParams,
    })

    // App call transaction
    const methodSelector = new Uint8Array(Buffer.from('depositNetRevenue(uint64,uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)
    const amountBytes = algosdk.encodeUint64(revenueAmount)

    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes, amountBytes],
      suggestedParams,
    })

    // Group transactions
    const txnGroup = [payTxn, appCallTxn]
    algosdk.assignGroupID(txnGroup)

    const signedGroup = txnGroup.map(txn => txn.signTxn(adminAccount.sk))
    const { txId } = await algodClient.sendRawTransaction(signedGroup).do()
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    log(`✅ depositRevenue(${currentEpochId}, ${revenueAmount}µA) → ${txId.slice(0, 8)}`)
  }

  const computeEntitlements = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    const methodSelector = new Uint8Array(Buffer.from('computeRevenuePerKw(uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const { txId } = await algodClient.sendRawTransaction(signedTxn).do()
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    log(`✅ computeEntitlements(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  // Initial load
  useEffect(() => {
    if (network.connected) {
      readEpochState(currentEpochId)
    }
  }, [network.connected, currentEpochId])

  // Action button states
  const canCreateEpoch = epochState?.status === 'NOT_FOUND'
  const canCloseEpoch = epochState?.status === 'OPEN'
  const canDepositRevenue = epochState?.status === 'CLOSED' && epochState.netDeposited === 0n
  const canComputeEntitlements = epochState?.status === 'CLOSED' && epochState.netDeposited > 0n && epochState.revenuePerKw === 0n

  const getButtonDisabledReason = (action: string): string | null => {
    if (!network.connected) return 'Network not connected'
    if (!epochState) return 'Loading epoch state...'
    
    switch (action) {
      case 'create':
        if (epochState.status !== 'NOT_FOUND') return `Epoch already exists (status: ${epochState.status})`
        return null
      case 'close':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'OPEN') return `Epoch not OPEN (status: ${epochState.status})`
        return null
      case 'deposit':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'CLOSED') return `Epoch not CLOSED (status: ${epochState.status})`
        if (epochState.netDeposited > 0n) return 'Revenue already deposited (idempotent)'
        return null
      case 'compute':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'CLOSED' && epochState.status !== 'SETTLED') return `Epoch not CLOSED (status: ${epochState.status})`
        if (epochState.netDeposited === 0n) return 'No revenue deposited yet'
        if (epochState.revenuePerKw > 0n) return 'Entitlements already computed (idempotent)'
        return null
      default:
        return null
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

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Protius Protocol Control UI</h1>
      <p style={{ color: '#666' }}>Phase 1: Operator Console (state-gated actions only)</p>
      
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
        <h2>Network Status</h2>
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

      {/* Epoch State */}
      <section>
        <h2>Epoch State</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Epoch ID:{' '}
            <input 
              type="number" 
              value={currentEpochId} 
              onChange={(e) => setCurrentEpochId(Number(e.target.value))}
              style={{ padding: '4px', width: '100px' }}
            />
          </label>
          {' '}
          <button onClick={() => readEpochState(currentEpochId)}>
            🔄 Refresh State
          </button>
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
                <td><strong>Net Deposited</strong></td>
                <td>{epochState.netDeposited.toString()} µAlgos {epochState.netDeposited > 0n && '✓'}</td>
              </tr>
              <tr>
                <td><strong>Revenue per kW</strong></td>
                <td>{epochState.revenuePerKw.toString()} µAlgos {epochState.revenuePerKw > 0n && '✓'}</td>
              </tr>
              <tr>
                <td><strong>Report Hash</strong></td>
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

      {/* Action Disable Reasons Table */}
      <section>
        <h2>Action States</h2>
        <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '20px' }}>
          <thead style={{ backgroundColor: '#f5f5f5' }}>
            <tr>
              <th style={{ textAlign: 'left' }}>Action</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Precondition</th>
              <th style={{ textAlign: 'left' }}>Reason Disabled (if any)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1. Create Epoch</strong></td>
              <td style={{ color: canCreateEpoch ? 'green' : '#999' }}>
                {canCreateEpoch ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must not exist (NOT_FOUND)</td>
              <td>{!canCreateEpoch && getButtonDisabledReason('create')}</td>
            </tr>
            <tr>
              <td><strong>2. Close Epoch</strong></td>
              <td style={{ color: canCloseEpoch ? 'green' : '#999' }}>
                {canCloseEpoch ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be OPEN</td>
              <td>{!canCloseEpoch && getButtonDisabledReason('close')}</td>
            </tr>
            <tr>
              <td><strong>3. Deposit Revenue</strong></td>
              <td style={{ color: canDepositRevenue ? 'green' : '#999' }}>
                {canDepositRevenue ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be CLOSED, netDeposited = 0</td>
              <td>{!canDepositRevenue && getButtonDisabledReason('deposit')}</td>
            </tr>
            <tr>
              <td><strong>4. Compute Entitlements</strong></td>
              <td style={{ color: canComputeEntitlements ? 'green' : '#999' }}>
                {canComputeEntitlements ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be CLOSED, revenue deposited, not yet computed</td>
              <td>{!canComputeEntitlements && getButtonDisabledReason('compute')}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <hr />

      {/* Operator Actions */}
      <section>
        <h2>Operator Actions</h2>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          Click an action button to execute. Disabled buttons explain why. Protocol state auto-refreshes every 5 seconds or after each action.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <button 
              onClick={() => executeAction('CREATE_EPOCH', createEpoch)}
              disabled={!canCreateEpoch || loading !== null}
              title={getButtonDisabledReason('create') || 'Create new epoch'}
              style={{ 
                padding: '10px 20px', 
                cursor: canCreateEpoch && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canCreateEpoch ? '#e8f5e9' : '#f5f5f5',
                color: canCreateEpoch ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'CREATE_EPOCH' ? '⏳ Creating...' : '1. Create Epoch'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('CLOSE_EPOCH', closeEpoch)}
              disabled={!canCloseEpoch || loading !== null}
              title={getButtonDisabledReason('close') || 'Close epoch for settlement'}
              style={{ 
                padding: '10px 20px', 
                cursor: canCloseEpoch && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canCloseEpoch ? '#e8f5e9' : '#f5f5f5',
                color: canCloseEpoch ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'CLOSE_EPOCH' ? '⏳ Closing...' : '2. Close Epoch'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('DEPOSIT_REVENUE', depositRevenue)}
              disabled={!canDepositRevenue || loading !== null}
              title={getButtonDisabledReason('deposit') || 'Deposit net revenue (grouped txn)'}
              style={{ 
                padding: '10px 20px', 
                cursor: canDepositRevenue && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canDepositRevenue ? '#e8f5e9' : '#f5f5f5',
                color: canDepositRevenue ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'DEPOSIT_REVENUE' ? '⏳ Depositing...' : '3. Deposit Revenue (30 ALGO)'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('COMPUTE_ENTITLEMENTS', computeEntitlements)}
              disabled={!canComputeEntitlements || loading !== null}
              title={getButtonDisabledReason('compute') || 'Compute revenuePerKw on-chain'}
              style={{ 
                padding: '10px 20px', 
                cursor: canComputeEntitlements && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canComputeEntitlements ? '#e8f5e9' : '#f5f5f5',
                color: canComputeEntitlements ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'COMPUTE_ENTITLEMENTS' ? '⏳ Computing...' : '4. Compute Entitlements'}
            </button>
          </div>
        </div>
      </section>

      <hr />

      {/* Action Log */}
      <section>
        <h2>Action Log (Local)</h2>
        <p style={{ fontSize: '12px', color: '#666' }}>
          All actions executed locally. Each action shows timestamp, result, and transaction ID.
        </p>
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '12px', 
          height: '250px', 
          overflowY: 'scroll',
          fontFamily: 'monospace',
          fontSize: '12px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          {actionLog.length === 0 ? (
            <div style={{ color: '#999' }}>No actions yet. Protocol state will auto-refresh.</div>
          ) : (
            actionLog.map((entry, idx) => (
              <div key={idx} style={{ marginBottom: '4px', lineHeight: '1.4' }}>
                {entry}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
