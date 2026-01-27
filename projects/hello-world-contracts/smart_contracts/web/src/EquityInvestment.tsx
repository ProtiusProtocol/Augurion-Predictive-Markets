import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import { getWalletAdapter } from './wallet-adapter'

const CONFIG = {
  algodToken: 'a'.repeat(64),
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  projectRegistryAppId: 1002,
  kwTokenAppId: 1003,
}

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
  })

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const walletAdapter = getWalletAdapter()

  // Check if wallet is already connected
  useEffect(() => {
    if (walletAdapter.isConnected()) {
      const accounts = walletAdapter.getAccounts()
      if (accounts.length > 0) {
        setState(prev => ({ ...prev, wallet: accounts[0] }))
        loadProjectInfo()
      }
    }
  }, [])

  // Load project information from blockchain
  const loadProjectInfo = async () => {
    try {
      setState(prev => ({ ...prev, status: 'loading' }))

      // Read ProjectRegistry global state
      const registryApp = await algodClient.getApplicationByID(CONFIG.projectRegistryAppId).do()
      const registryState = registryApp.params['global-state'] || []

      // Read kWToken global state
      const kwTokenApp = await algodClient.getApplicationByID(CONFIG.kwTokenAppId).do()
      const kwTokenState = kwTokenApp.params['global-state'] || []

      // Parse state (simplified - in production use proper decoder)
      const getStateValue = (state: any[], key: string): any => {
        const item = state.find((s: any) => {
          const keyBytes = Buffer.from(s.key, 'base64').toString('utf-8')
          return keyBytes === key
        })
        return item ? item.value : null
      }

      const projectInfo: ProjectInfo = {
        projectId: 'PROTIUS-001', // Simplified
        installedAcKw: 1000n, // Would parse from registry
        treasury: '', // Would parse from registry
        platformKwBps: 500n, // Would parse from registry
        platformKwhRateBps: 100n, // Would parse from registry
        fcFinalized: false, // Would parse from kwToken
        fcOpen: true, // Would parse from kwToken
        totalSupply: 0n, // Would parse from kwToken
        availableForInvestment: 1000n, // installedAcKw - totalSupply
      }

      setState(prev => ({ ...prev, projectInfo, status: 'ready', error: null }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: `Failed to load project: ${msg}`, status: 'error' }))
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

      // Read current kW token balance
      try {
        const accountInfo = await algodClient.accountAssetInformation(address, CONFIG.kwTokenAppId).do()
        const balance = BigInt(accountInfo['asset-holding']['amount'] || 0)
        setState(prev => ({ ...prev, currentKwBalance: balance }))
      } catch {
        setState(prev => ({ ...prev, currentKwBalance: 0n }))
      }

      await loadProjectInfo()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: msg, status: 'error' }))
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

      // TODO: This is placeholder logic
      // In production, you would:
      // 1. Create payment transaction (ALGO to project treasury or escrow)
      // 2. Call kWToken.mintAllocation() to mint tokens to investor
      // 3. Group these transactions atomically

      // For now, just log the intent
      console.log('Investment Details:', {
        investor: state.wallet,
        amount: algoMicroalgos.toString(),
        estimatedTokens: state.estimatedKwTokens.toString(),
      })

      // Simulate success
      setState(prev => ({
        ...prev,
        status: 'success',
        txId: 'SIMULATED_TX_' + Date.now(),
        error: null,
      }))
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

          {/* Investment Form */}
          <section style={{ marginBottom: '20px' }}>
            <h2>3. Make Investment</h2>
            
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
          border: '1px solid #4caf50',
          borderRadius: '4px',
          padding: '12px',
          color: '#2e7d32',
          marginTop: '20px'
        }}>
          <strong>✅ Investment Successful!</strong>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
            Transaction ID: <code>{state.txId}</code>
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
            You will receive <strong>{state.estimatedKwTokens.toString()} kW tokens</strong> once the transaction is confirmed.
          </p>
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
