import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import { getWalletAdapter } from './wallet-adapter'

const CONFIG = {
  algodToken: 'a'.repeat(64),
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
}

interface EntitlementState {
  address: string
  epochId: bigint
  kwBalance: bigint
  grossEntitlement: bigint
  claimedAmount: bigint
  remainingClaimable: bigint
}

interface ClaimExecutionState {
  status: 'idle' | 'reading' | 'ready' | 'confirming' | 'executing' | 'success' | 'error'
  wallet: string
  entitlement: EntitlementState | null
  confirmationChecked: boolean
  txId: string | null
  error: string | null
  preClaimState: EntitlementState | null
  postClaimState: EntitlementState | null
}

/**
 * Phase 4: Claim Execution
 * 
 * Implements Protius Protocol-Level Guarantees (v0.2.0+):
 * 1. FULL REMAINING CLAIM ONLY - No partial claims, no custom amounts
 * 2. IDEMPOTENT - Safe retries via "Already claimed" messages
 * 3. NO PARTIALS - All-or-nothing atomicity enforced by contract
 * 
 * Real wallet-connected claim execution with:
 * - Pre-claim entitlement reading
 * - Explicit user confirmation
 * - Full remaining entitlement claim only
 * - Post-claim state verification
 * - No optimistic UI (only actual blockchain state)
 * - Idempotent safe retries
 */
export default function ClaimExecution() {
  const [state, setState] = useState<ClaimExecutionState>({
    status: 'idle',
    wallet: '',
    entitlement: null,
    confirmationChecked: false,
    txId: null,
    error: null,
    preClaimState: null,
    postClaimState: null,
  })

  // Constants (from web/src/main.tsx config)
  const KW_TOKEN_ID = 1003n
  const REVENUE_VAULT_ID = 1005n

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const walletAdapter = getWalletAdapter()

  // Check if wallet is already connected on component mount
  useEffect(() => {
    if (walletAdapter.isConnected()) {
      const accounts = walletAdapter.getAccounts()
      if (accounts.length > 0) {
        setState(prev => ({ ...prev, wallet: accounts[0] }))
      }
    }
  }, [])

  /**
   * Read entitlement state (reuses logic from ClaimantPreview)
   */
  const readEntitlementState = async (address: string, epochId: string): Promise<EntitlementState | null> => {
    try {
      // Validate address format
      if (!address || address.length !== 58) {
        throw new Error('Invalid Algo address format')
      }

      const epoch = BigInt(epochId)

      // Read kW balance from kWToken
      const accountInfo = await algodClient.accountInformation(address).do()
      let kwBalance = 0n
      if (accountInfo.assets) {
        const kwAsset = accountInfo.assets.find((a: any) => a['asset-id'] === Number(KW_TOKEN_ID))
        if (kwAsset) {
          kwBalance = BigInt(kwAsset.amount)
        }
      }

      // Read entitlements/{epochId}/{address} box
      const entitlementsKey = `entitlements:${epoch}:${address}`
      let grossEntitlement = 0n
      try {
        const entitlementsBox = await algodClient
          .getApplicationBoxByName(Number(REVENUE_VAULT_ID), Buffer.from(entitlementsKey))
          .do()
        if (entitlementsBox.value) {
          const decoded = new TextDecoder().decode(entitlementsBox.value)
          grossEntitlement = BigInt(decoded || '0')
        }
      } catch (e) {
        // Box not found = 0 entitlement
        grossEntitlement = 0n
      }

      // Read claimed/{epochId}/{address} box
      const claimedKey = `claimed:${epoch}:${address}`
      let claimedAmount = 0n
      try {
        const claimedBox = await algodClient
          .getApplicationBoxByName(Number(REVENUE_VAULT_ID), Buffer.from(claimedKey))
          .do()
        if (claimedBox.value) {
          const decoded = new TextDecoder().decode(claimedBox.value)
          claimedAmount = BigInt(decoded || '0')
        }
      } catch (e) {
        // Box not found = 0 claimed
        claimedAmount = 0n
      }

      // Compute remaining claimable
      const remainingClaimable = grossEntitlement > claimedAmount 
        ? grossEntitlement - claimedAmount 
        : 0n

      return {
        address,
        epochId: epoch,
        kwBalance,
        grossEntitlement,
        claimedAmount,
        remainingClaimable,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: `Read error: ${msg}`, status: 'error' }))
      return null
    }
  }

  /**
   * Connect wallet and read entitlement state
   */
  const connectWallet = async () => {
    try {
      setState(prev => ({ ...prev, status: 'reading', error: null }))
      
      // Connect via Pera Wallet
      const accounts = await walletAdapter.connect()
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts connected')
      }

      const address = accounts[0]
      setState(prev => ({
        ...prev,
        wallet: address,
        confirmationChecked: false,
        txId: null,
        postClaimState: null,
      }))

      // Read current entitlement state
      const entitlement = await readEntitlementState(address, '202501')
      if (entitlement) {
        setState(prev => ({
          ...prev,
          entitlement,
          preClaimState: entitlement,
          status: 'ready',
          error: null,
        }))
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: msg, status: 'error' }))
    }
  }

  /**
   * Execute claim via wallet-signed transaction
   */
  const executeClaim = async () => {
    if (!state.wallet || !state.entitlement || state.entitlement.remainingClaimable === 0n) {
      setState(prev => ({
        ...prev,
        error: 'No claimable amount available',
        status: 'error',
      }))
      return
    }

    try {
      setState(prev => ({ ...prev, status: 'executing', error: null }))

      // Get suggested params
      const suggestedParams = await algodClient.getTransactionParams().do()

      // Build claim transaction
      // Note: In production, use generated RevenueVaultClient
      const claimTxn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: state.wallet,
        appIndex: Number(REVENUE_VAULT_ID),
        appArgs: [Buffer.from('claim'), algosdk.encodeUint64(state.entitlement.epochId)],
        suggestedParams,
      })

      // Encode transaction for signing
      const encodedTxn = algosdk.encodeUnsignedTransaction(claimTxn)
      
      // Sign via Pera Wallet
      const signedTxns = await walletAdapter.signTransaction([encodedTxn])
      
      if (!signedTxns || signedTxns.length === 0) {
        throw new Error('Transaction signing failed')
      }

      // Submit signed transaction
      const txResult = await algodClient.sendRawTransaction(signedTxns[0]).do()
      const txId = txResult.txid
      setState(prev => ({ ...prev, txId, status: 'confirming' }))
      
      // Wait for confirmation
      await algosdk.waitForConfirmation(algodClient, txId, 4)
      
      // Re-read post-claim state
      const postClaim = await readEntitlementState(state.wallet, '202501')
      if (postClaim) {
        setState(prev => ({
          ...prev,
          postClaimState: postClaim,
          status: 'success',
        }))
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({
        ...prev,
        error: msg,
        status: 'error',
      }))
    }
  }

  /**
   * Retry failed claim (idempotent)
   */
  const retryReadEntitlements = async () => {
    if (!state.wallet) return
    try {
      setState(prev => ({ ...prev, status: 'reading', error: null }))
      const entitlement = await readEntitlementState(state.wallet, '202501')
      if (entitlement) {
        setState(prev => ({
          ...prev,
          entitlement,
          status: 'ready',
        }))
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setState(prev => ({ ...prev, error: msg, status: 'error' }))
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Phase 4: Claim Execution</h2>
      <p style={{ color: '#666' }}>Wallet-connected real claim execution with full entitlement reading and state verification</p>

      {/* Wallet Connection Section */}
      <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px' }}>
        <h3>1. Wallet Connection</h3>
        <div style={{ marginBottom: '10px' }}>
          <strong>Connected Wallet:</strong> {state.wallet || '(not connected)'}
        </div>
        <button
          onClick={connectWallet}
          disabled={state.status === 'reading' || state.status === 'executing'}
          style={{
            padding: '8px 16px',
            backgroundColor: state.wallet ? '#888' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {state.wallet ? `Reconnect Wallet` : `Connect Wallet`}
        </button>
      </div>

      {/* Pre-Claim Entitlement State */}
      {state.entitlement && (
        <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px' }}>
          <h3>2. Pre-Claim Entitlement State (Read from Blockchain)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Wallet Address</td>
                <td>{state.entitlement.address}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Epoch ID</td>
                <td>{state.entitlement.epochId.toString()}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>kW Token Balance</td>
                <td>{state.entitlement.kwBalance.toString()}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Gross Entitlement</td>
                <td>{state.entitlement.grossEntitlement.toString()} microAlgo</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Already Claimed</td>
                <td>{state.entitlement.claimedAmount.toString()} microAlgo</td>
              </tr>
              <tr style={{ backgroundColor: '#f0f8ff', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>🎯 Remaining Claimable</td>
                <td style={{ fontWeight: 'bold', color: '#007bff' }}>
                  {state.entitlement.remainingClaimable.toString()} microAlgo
                </td>
              </tr>
            </tbody>
          </table>

          {state.entitlement.remainingClaimable === 0n && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              ✓ Fully claimed. No remaining entitlement.
            </div>
          )}
        </div>
      )}

      {/* Claim Execution Section */}
      {state.entitlement && state.entitlement.remainingClaimable > 0n && (
        <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px' }}>
          <h3>3. Claim Execution</h3>
          
          {/* Explicit Confirmation Checkbox */}
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffe6e6', border: '1px solid #ff6666', borderRadius: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                checked={state.confirmationChecked}
                onChange={(e) => setState(prev => ({ ...prev, confirmationChecked: e.target.checked }))}
              />
              <span>
                <strong>I understand:</strong>
                <br />
                - I will claim {state.entitlement.remainingClaimable.toString()} microAlgo (full remaining entitlement)
                <br />
                - No partial claims or custom amounts allowed
                <br />
                - Transaction will be signed by my wallet and submitted to blockchain
                <br />
                - Cannot undo once confirmed
              </span>
            </label>
          </div>

          {/* Claim Button */}
          <button
            onClick={executeClaim}
            disabled={!state.confirmationChecked || state.status === 'executing' || state.status === 'confirming'}
            style={{
              padding: '10px 20px',
              backgroundColor: state.confirmationChecked ? '#28a745' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: state.confirmationChecked ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            {state.status === 'executing' || state.status === 'confirming'
              ? `${state.status === 'confirming' ? 'Confirming...' : 'Executing...'}`
              : `Execute Claim (${state.entitlement.remainingClaimable.toString()} microAlgo)`}
          </button>
        </div>
      )}

      {/* Transaction Status */}
      {state.txId && (
        <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px' }}>
          <h3>4. Transaction Submitted</h3>
          <div style={{ marginBottom: '10px' }}>
            <strong>Transaction ID:</strong> <code>{state.txId}</code>
          </div>
          <div style={{ padding: '10px', backgroundColor: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '4px' }}>
            ⏳ Waiting for blockchain confirmation...
          </div>
        </div>
      )}

      {/* Post-Claim State */}
      {state.postClaimState && (
        <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px' }}>
          <h3>5. Post-Claim State (Read from Blockchain)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Field</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Before</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>After</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Already Claimed</td>
                <td>{state.preClaimState?.claimedAmount.toString()}</td>
                <td>{state.postClaimState.claimedAmount.toString()}</td>
                <td style={{ color: '#28a745', fontWeight: 'bold' }}>
                  +{(state.postClaimState.claimedAmount - (state.preClaimState?.claimedAmount || 0n)).toString()}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>Remaining Claimable</td>
                <td style={{ color: '#007bff' }}>{state.preClaimState?.remainingClaimable.toString()}</td>
                <td style={{ color: '#007bff' }}>{state.postClaimState.remainingClaimable.toString()}</td>
                <td style={{ color: '#ff6666', fontWeight: 'bold' }}>
                  {state.postClaimState.remainingClaimable > 0n
                    ? `-${(state.preClaimState?.remainingClaimable || 0n) - state.postClaimState.remainingClaimable}`
                    : '✓ Fully claimed'}
                </td>
              </tr>
            </tbody>
          </table>

          {state.postClaimState.remainingClaimable === 0n && (
            <div style={{ padding: '10px', backgroundColor: '#d4edda', border: '1px solid #28a745', borderRadius: '4px' }}>
              ✅ Claim successful! Full entitlement claimed.
            </div>
          )}
        </div>
      )}

      {/* Success State */}
      {state.status === 'success' && (
        <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#d4edda', border: '1px solid #28a745', borderRadius: '4px' }}>
          <h3>✅ Claim Complete</h3>
          <p>
            Transaction ID: <code>{state.txId}</code>
          </p>
          <p>
            Amount claimed: {((state.postClaimState?.claimedAmount || 0n) - (state.preClaimState?.claimedAmount || 0n)).toString()} microAlgo
          </p>
        </div>
      )}

      {/* Error State */}
      {state.error && (
        <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px' }}>
          <h3>❌ Error</h3>
          <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{state.error}</code>
          {state.status === 'error' && state.wallet && (
            <div style={{ marginTop: '15px' }}>
              <button
                onClick={retryReadEntitlements}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                🔄 Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status Indicator */}
      <div style={{ marginTop: '30px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px' }}>
        <strong>Status:</strong> {state.status} | <strong>Wallet:</strong> {state.wallet || 'not connected'}
      </div>
    </div>
  )
}
