import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import { getWalletAdapter } from './wallet-adapter'
import { CONFIG } from './config'
import { DEFAULT_PROJECT } from './projects'

interface ProjectInfo {
  projectId: string
  installedAcKw: bigint
  treasury: string
  platformKwBps: bigint
  platformKwhRateBps: bigint
  fcFinalized: boolean
  fcOpen: boolean
  totalSupply: bigint
  availableForInvestment: bigint
}

interface InvestmentState {
  status: 'idle' | 'loading' | 'ready' | 'confirming' | 'executing' | 'success' | 'error'
  wallet: string
  projectInfo: ProjectInfo | null
  investmentAmount: string // ALGO amount
  estimatedKwTokens: bigint
  currentKwBalance: bigint
  error: string | null
  txId: string | null
  asaId: number // ASA ID of the kW token (different from App ID)
  fcFinalisedAt: number | null // unix timestamp from ProjectRegistry
}

/**
 * Equity Investment Interface
 * 
 * Allows users to:
 * 1. Connect wallet
 * 2. View project details
 * 3. Enter investment amount (in ALGO)
 * 4. See estimated kW tokens to receive
 * 5. Complete investment transaction
 * 
 * NOTE: This is for the Financial Close (FC) period ONLY.
 * After FC is finalized, no new investments are accepted.
 * Secondary market trading happens via transfer() after FC.
 */
export default function EquityInvestment() {
  const [state, setState] = useState<InvestmentState>({
    status: 'idle',
    wallet: '',
    projectInfo: null,
    investmentAmount: '',
    estimatedKwTokens: 0n,
    currentKwBalance: 0n,
    error: null,
    txId: null,
    asaId: 0,
    fcFinalisedAt: null,
  })

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const walletAdapter = getWalletAdapter()

  // Fetch fcFinalisedAt timestamp from ProjectRegistry on mount
  useEffect(() => {
    const fetchFcTimestamp = async () => {
      try {
        const app = await algodClient.getApplicationByID(DEFAULT_PROJECT.registryAppId).do()
        const gs: any[] = (app.params as any)['global-state'] || []
        const entry = gs.find((e: any) => {
          try { return atob(e.key) === 'fcFinalisedAt' } catch { return false }
        })
        const ts = entry ? Number(entry.value.uint) : 0
        setState(prev => ({ ...prev, fcFinalisedAt: ts > 0 ? ts : null }))
      } catch { /* silent — not critical */ }
    }
    fetchFcTimestamp()
  }, [])

  // Check if wallet is already connected
  useEffect(() => {
    if (walletAdapter.isConnected()) {
      const accounts = walletAdapter.getAccounts()
      if (accounts.length > 0) {
        const address = accounts[0]
        setState(prev => ({ ...prev, wallet: address }))
        loadProjectInfo().then(() => loadInvestorBalance(address))
      }
    }
  }, [])

  // Helper: decode global state from algosdk response (handles both old and new API formats)
  const parseGlobalState = (rawState: any[]): Record<string, any> => {
    const result: Record<string, any> = {}
    if (!Array.isArray(rawState)) return result
    for (const item of rawState) {
      try {
        const key = Buffer.from(item.key, 'base64').toString('utf-8')
        const val = item.value
        if (val.type === 1 || val.type === 'bytes') {
          result[key] = Buffer.from(val.bytes || '', 'base64')
        } else {
          result[key] = val.uint ?? val
        }
      } catch { /* skip unparseable entries */ }
    }
    return result
  }

  // Load project information from blockchain
  const loadProjectInfo = async (preserveStatus = false) => {
    try {
      if (!preserveStatus) setState(prev => ({ ...prev, status: 'loading' }))

      // Read kWToken global state to get the ASA ID
      const kwTokenApp = await algodClient.getApplicationByID(CONFIG.kwTokenAppId).do()
      const kwRaw = kwTokenApp.params?.['global-state'] ?? kwTokenApp.params?.globalState ?? []
      const kwState = parseGlobalState(kwRaw)

      // The ASA ID is stored in the contract's global state as 'asset_id'
      const asaId = Number(kwState['asset_id'] ?? 0)

      const projectInfo: ProjectInfo = {
        projectId: 'PROTIUS-001',
        installedAcKw: 1000n,
        treasury: '',
        platformKwBps: 500n,
        platformKwhRateBps: 100n,
        fcFinalized: false,
        fcOpen: true,
        totalSupply: 0n,
        availableForInvestment: 1000n,
      }

      setState(prev => ({
        ...prev,
        projectInfo,
        error: null,
        asaId,
        // Don't overwrite success/error status when called after investment
        status: preserveStatus ? prev.status : 'ready',
      }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!preserveStatus) setState(prev => ({ ...prev, error: `Failed to load project: ${msg}`, status: 'error' }))
    }
  }

  // Read investor's kW token balance from on-chain box storage
  const loadInvestorBalance = async (address: string) => {
    if (!address) return
    try {
      const investorPubKey = algosdk.decodeAddress(address).publicKey
      const balPrefix = new TextEncoder().encode('bal:')
      const boxName = new Uint8Array(balPrefix.length + investorPubKey.length)
      boxName.set(balPrefix, 0)
      boxName.set(investorPubKey, balPrefix.length)

      const boxResult = await algodClient.getApplicationBoxByName(CONFIG.kwTokenAppId, boxName).do()
      // Box value is 8 bytes big-endian uint64
      const valueBytes: Uint8Array = (boxResult as any).value
      const balance = BigInt('0x' + Buffer.from(valueBytes).toString('hex'))
      setState(prev => ({ ...prev, currentKwBalance: balance }))
    } catch {
      // Box doesn't exist yet = 0 balance
      setState(prev => ({ ...prev, currentKwBalance: 0n }))
    }
  }

  // Connect wallet
  const connectWallet = async () => {
    try {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
      
      const accounts = await walletAdapter.connect()
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts connected')
      }

      const address = accounts[0]
      setState(prev => ({ ...prev, wallet: address }))

      await loadProjectInfo()
      await loadInvestorBalance(address)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: msg, status: 'error' }))
    }
  }

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      await walletAdapter.disconnect()
      setState(prev => ({
        ...prev,
        wallet: '',
        projectInfo: null,
        currentKwBalance: 0n,
        status: 'idle',
        error: null,
        txId: null,
      }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: msg }))
    }
  }

  // Calculate estimated kW tokens based on investment amount
  const calculateEstimatedTokens = (algoAmount: string): bigint => {
    if (!algoAmount || !state.projectInfo) return 0n

    // Simplified calculation:
    // In production, this would be based on:
    // - Price per kW token (set during FC)
    // - Platform fees
    // - Available supply
    
    const algoMicroalgos = BigInt(Math.floor(parseFloat(algoAmount) * 1_000_000))
    
    // Example: 1 ALGO = 10 kW tokens (adjust based on your economics)
    const kwTokens = algoMicroalgos / 100_000n // 0.1 ALGO per kW token
    
    return kwTokens
  }

  // Handle investment amount change
  const handleAmountChange = (amount: string) => {
    setState(prev => ({
      ...prev,
      investmentAmount: amount,
      estimatedKwTokens: calculateEstimatedTokens(amount)
    }))
  }

  // Execute investment
  const executeInvestment = async () => {
    if (!state.wallet || !state.projectInfo || !state.investmentAmount) {
      setState(prev => ({ ...prev, error: 'Missing required fields', status: 'error' }))
      return
    }

    try {
      setState(prev => ({ ...prev, status: 'executing', error: null }))

      const suggestedParams = await algodClient.getTransactionParams().do()
      const algoMicroalgos = BigInt(Math.floor(parseFloat(state.investmentAmount) * 1_000_000))

      // Debug log for App ID
      console.log('CONFIG.kwTokenAppId:', CONFIG.kwTokenAppId)
      console.log('state.wallet:', state.wallet)

      if (!state.wallet) {
        throw new Error('Wallet not connected - please connect your wallet first')
      }

      // Get contract address as string
      const contractAddress = algosdk.getApplicationAddress(CONFIG.kwTokenAppId).toString()
      console.log('contractAddress:', contractAddress)

      // Create payment transaction to KWToken contract (algosdk v3: sender/receiver)
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: state.wallet,
        receiver: contractAddress,
        amount: Number(algoMicroalgos),
        suggestedParams,
      } as any)

      // Create app call transaction to KWToken.invest()
      // ARC-4 ABI method selector for invest()string = 0x7b78bbc1
      const methodSelector = new Uint8Array([0x7b, 0x78, 0xbb, 0xc1])

      // Box reference for the investor's balance: key = "bal:" + address public key
      const investorPubKey = algosdk.decodeAddress(state.wallet).publicKey
      const balPrefix = new TextEncoder().encode('bal:')
      const balBoxName = new Uint8Array(balPrefix.length + investorPubKey.length)
      balBoxName.set(balPrefix, 0)
      balBoxName.set(investorPubKey, balPrefix.length)

      const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: state.wallet,
        appIndex: CONFIG.kwTokenAppId,
        appArgs: [methodSelector],
        boxes: [{ appIndex: 0, name: balBoxName }],
        suggestedParams,
      } as any)

      // Group transactions atomically
      const txnGroup = algosdk.assignGroupID([paymentTxn, appCallTxn])

      // Convert grouped transactions to bytes
      const txnGroupBytes = txnGroup.map(txn => algosdk.encodeUnsignedTransaction(txn))

      // Sign transactions with wallet
      const signedTxnBytes = await walletAdapter.signTransaction(txnGroupBytes)

      // Submit to network (algodClient expects concatenated signed transactions)
      const sendResult = await algodClient.sendRawTransaction(signedTxnBytes).do()
      // algosdk v3 returns { txid } lowercase; v2 returns { txId }
      const txId = (sendResult as any).txid || (sendResult as any).txId

      // Wait for confirmation
      console.log('Waiting for confirmation, txId:', txId)
      await algosdk.waitForConfirmation(algodClient, txId, 8)

      setState(prev => ({
        ...prev,
        status: 'success',
        txId: txId,
        error: null,
      }))

      // Reload balance from chain (preserveStatus=true keeps 'success' visible)
      setTimeout(() => {
        loadProjectInfo(true)
        loadInvestorBalance(state.wallet)
      }, 2000)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: `Investment failed: ${msg}`, status: 'error' }))
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>💰 Equity Investment</h1>
      <p style={{ color: '#666' }}>
        Purchase kW tokens to gain equity participation in the project and receive revenue dividends.
      </p>

      <hr />

      {/* Project Information Panel */}
      <section style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px', padding: '16px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>📋 Project Information</h2>
        <table border={0} cellPadding="6" style={{ width: '100%', fontSize: '13px' }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 'bold', width: '220px', color: '#555' }}>Project</td>
              <td>{DEFAULT_PROJECT.name} — {DEFAULT_PROJECT.location}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', color: '#555' }}>Expected COD Date</td>
              <td>{DEFAULT_PROJECT.expectedCodDate
                ? new Date(DEFAULT_PROJECT.expectedCodDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                : '—'}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', color: '#555' }}>Provisional Acceptance</td>
              <td>
                {DEFAULT_PROJECT.expectedCodDate
                  ? (() => {
                      const paOffset = DEFAULT_PROJECT.provisionalAcceptanceOffsetDays ?? 30
                      const paDate = new Date(DEFAULT_PROJECT.expectedCodDate)
                      paDate.setDate(paDate.getDate() + paOffset)
                      return `${paDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} (COD + ${paOffset} days)`
                    })()
                  : '—'}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', color: '#555' }}>Equity Claim Available</td>
              <td>
                {DEFAULT_PROJECT.expectedCodDate
                  ? (() => {
                      const paOffset = DEFAULT_PROJECT.provisionalAcceptanceOffsetDays ?? 30
                      const claimDate = new Date(DEFAULT_PROJECT.expectedCodDate)
                      claimDate.setDate(claimDate.getDate() + paOffset + 30)
                      return `${claimDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} (Provisional Acceptance + 30 days)`
                    })()
                  : 'Available 30 days after Provisional Acceptance'}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', color: '#555' }}>Project Manager</td>
              <td>{DEFAULT_PROJECT.managerName ?? '—'}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 'bold', color: '#555' }}>Manager Contact</td>
              <td>
                {DEFAULT_PROJECT.managerContact
                  ? <a href={`mailto:${DEFAULT_PROJECT.managerContact}`} style={{ color: '#1565c0' }}>{DEFAULT_PROJECT.managerContact}</a>
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Warning Banner */}
      <div style={{ 
        backgroundColor: '#e3f2fd', 
        border: '2px solid #2196f3',
        borderRadius: '4px',
        padding: '12px',
        marginBottom: '20px'
      }}>
        <strong>ℹ️ Financial Close Period</strong>
        <p style={{ fontSize: '12px', margin: '8px 0 0 0' }}>
          Investments are only accepted during the <strong>Financial Close (FC)</strong> period.
          After FC is finalized, tokens can only be acquired via secondary market transfers.
        </p>
      </div>

      {/* Wallet Connection */}
      <section style={{ marginBottom: '20px' }}>
        <h2>1. Wallet Connection</h2>
        {!state.wallet ? (
          <button
            onClick={connectWallet}
            disabled={state.status === 'loading'}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2196f3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: state.status === 'loading' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            {state.status === 'loading' ? '⏳ Connecting...' : '🔗 Connect Wallet'}
          </button>
        ) : (
          <div style={{ backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
            <strong>Connected Wallet:</strong> <code>{state.wallet}</code>
            <br />
            <strong>Current kW Balance:</strong> {state.currentKwBalance.toString()} kW
            <br /><br />
            <button
              onClick={disconnectWallet}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f44336',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              🔌 Disconnect Wallet
            </button>
          </div>
        )}
      </section>

      <hr />

      {/* Project Information */}
      {state.projectInfo && (
        <>
          <section style={{ marginBottom: '20px' }}>
            <h2>2. Project Details</h2>
            <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td><strong>Project ID</strong></td>
                  <td>{state.projectInfo.projectId}</td>
                </tr>
                <tr>
                  <td><strong>Total Capacity</strong></td>
                  <td>{state.projectInfo.installedAcKw.toString()} kW</td>
                </tr>
                <tr>
                  <td><strong>Available for Investment</strong></td>
                  <td>{state.projectInfo.availableForInvestment.toString()} kW tokens</td>
                </tr>
                <tr>
                  <td><strong>FC Status</strong></td>
                  <td style={{ color: state.projectInfo.fcOpen ? 'green' : 'red' }}>
                    {state.projectInfo.fcOpen ? '✓ Open for Investment' : '✗ Closed'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Platform Fee</strong></td>
                  <td>{(Number(state.projectInfo.platformKwBps) / 100).toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </section>

          <hr />

          {/* Your Holdings */}
          {state.wallet && (
            <section style={{ marginBottom: '20px' }}>
              <h2>3. Your Holdings</h2>
              <div style={{
                backgroundColor: state.currentKwBalance > 0n ? '#e8f5e9' : '#f5f5f5',
                border: `1px solid ${state.currentKwBalance > 0n ? '#4caf50' : '#ccc'}`,
                borderRadius: '4px',
                padding: '16px',
              }}>
                <table border={0} cellPadding="6" style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 'bold', width: '200px' }}>kW Token Balance</td>
                      <td style={{ fontSize: '20px', color: state.currentKwBalance > 0n ? '#2e7d32' : '#666' }}>
                        <strong>{state.currentKwBalance.toString()} kW</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Wallet</td>
                      <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{state.wallet}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Transaction History</td>
                      <td>
                        <a
                          href={`https://testnet.explorer.perawallet.app/address/${state.wallet}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1565c0', fontSize: '13px' }}
                        >
                          View on Pera Explorer →
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Contract</td>
                      <td>
                        <a
                          href={`https://testnet.explorer.perawallet.app/application/${CONFIG.kwTokenAppId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1565c0', fontSize: '13px' }}
                        >
                          App ID {CONFIG.kwTokenAppId} →
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <hr />

          {/* Investment Form */}
          <section style={{ marginBottom: '20px' }}>
            <h2>4. Make Investment</h2>
            
            {!state.projectInfo.fcOpen ? (
              <div style={{ backgroundColor: '#ffebee', padding: '12px', borderRadius: '4px', color: '#c62828' }}>
                ⚠️ Financial Close is finalized. No new investments are accepted.
              </div>
            ) : (
              <div style={{ backgroundColor: '#f9f9f9', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                    Investment Amount (ALGO):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={state.investmentAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    disabled={!state.wallet || state.status === 'executing'}
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      fontSize: '16px',
                      fontFamily: 'monospace'
                    }}
                    placeholder="e.g., 100"
                  />
                </div>

                {state.investmentAmount && (
                  <div style={{ 
                    backgroundColor: '#e8f5e9', 
                    padding: '12px', 
                    borderRadius: '4px',
                    marginBottom: '15px'
                  }}>
                    <strong>Estimated kW Tokens:</strong> {state.estimatedKwTokens.toString()} kW
                    <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
                      This represents your equity share in the project's installed capacity.
                    </p>
                  </div>
                )}

                <button
                  onClick={executeInvestment}
                  disabled={
                    !state.wallet || 
                    !state.investmentAmount || 
                    state.status === 'executing' ||
                    state.estimatedKwTokens === 0n
                  }
                  style={{
                    padding: '12px 24px',
                    backgroundColor: state.wallet && state.investmentAmount ? '#4caf50' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: state.wallet && state.investmentAmount ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    width: '100%'
                  }}
                >
                  {state.status === 'executing' ? '⏳ Processing Investment...' : '💰 Invest Now'}
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Error Display */}
      {state.error && (
        <div style={{ 
          backgroundColor: '#ffebee', 
          border: '1px solid #f44336',
          borderRadius: '4px',
          padding: '12px',
          color: '#c62828',
          marginTop: '20px'
        }}>
          <strong>❌ Error:</strong> {state.error}
        </div>
      )}

      {/* Success Display */}
      {state.status === 'success' && state.txId && (
        <div style={{ 
          backgroundColor: '#e8f5e9', 
          border: '2px solid #4caf50',
          borderRadius: '4px',
          padding: '16px',
          color: '#2e7d32',
          marginTop: '20px'
        }}>
          <strong style={{ fontSize: '16px' }}>✅ Investment Successful!</strong>
          <p style={{ margin: '8px 0 4px 0', fontSize: '13px' }}>
            Transaction ID:{' '}
            <a
              href={`https://testnet.explorer.perawallet.app/tx/${state.txId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1b5e20', fontFamily: 'monospace', fontSize: '12px' }}
            >
              {state.txId}
            </a>
          </p>
          <p style={{ margin: '4px 0 12px 0', fontSize: '13px' }}>
            You invested and received <strong>{state.estimatedKwTokens.toString()} kW tokens</strong> representing your equity share.
          </p>
          <button
            onClick={() => setState(prev => ({ ...prev, status: 'ready', txId: null, investmentAmount: '', estimatedKwTokens: 0n }))}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Make Another Investment
          </button>
        </div>
      )}

      <hr style={{ marginTop: '30px' }} />

      {/* Info Footer */}
      <footer style={{ fontSize: '11px', color: '#999' }}>
        <p>
          <strong>How it works:</strong> Your ALGO investment is converted to kW tokens representing 
          equity share in the project's installed capacity. You will receive proportional revenue 
          dividends based on your kW token balance during each settlement epoch.
        </p>
        <p>
          <strong>Note:</strong> This is a placeholder interface. Production implementation requires 
          integration with actual FC economics, payment processing, and token minting smart contracts.
        </p>
      </footer>
    </div>
  )
}
