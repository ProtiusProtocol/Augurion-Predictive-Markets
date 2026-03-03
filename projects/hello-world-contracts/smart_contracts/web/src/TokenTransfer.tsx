import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import { getWalletAdapter } from './wallet-adapter'
import { CONFIG } from './config'

interface TransferState {
  status: 'idle' | 'connecting' | 'ready' | 'executing' | 'success' | 'error'
  wallet: string
  kwBalance: bigint
  transfersEnabled: boolean
  transfersChecked: boolean
  recipient: string
  amount: string
  txId: string | null
  error: string | null
}

const makeBalBoxName = (address: string): Uint8Array => {
  const pubKey = algosdk.decodeAddress(address).publicKey
  const prefix = new TextEncoder().encode('bal:')
  const key = new Uint8Array(prefix.length + pubKey.length)
  key.set(prefix)
  key.set(pubKey, prefix.length)
  return key
}

export default function TokenTransfer() {
  const [state, setState] = useState<TransferState>({
    status: 'idle',
    wallet: '',
    kwBalance: 0n,
    transfersEnabled: false,
    transfersChecked: false,
    recipient: '',
    amount: '',
    txId: null,
    error: null,
  })

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const walletAdapter = getWalletAdapter()

  // Check if wallet already connected
  useEffect(() => {
    const check = async () => {
      try {
        if (walletAdapter.isConnected()) {
          const accounts = walletAdapter.getAccounts()
          if (accounts.length > 0) {
            const address = accounts[0]
            setState(prev => ({ ...prev, wallet: address, status: 'ready' }))
            await loadOnChainData(address)
            return
          }
        }
        await loadTransfersEnabled()
      } catch {}
    }
    check()
  }, [])

  const loadTransfersEnabled = async () => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.kwTokenAppId).do()
      const gs: any[] = (appInfo.params as any)['global-state'] || (appInfo.params as any).globalState || []
      const entry = gs.find((e: any) => {
        try { return atob(e.key) === 'transfersEnabled' } catch { return false }
      })
      const enabled = entry ? Number(entry.value.uint) === 1 : false
      setState(prev => ({ ...prev, transfersEnabled: enabled, transfersChecked: true }))
    } catch (err: any) {
      setState(prev => ({ ...prev, transfersChecked: true, error: `Failed to read chain: ${err.message}` }))
    }
  }

  const loadOnChainData = async (address: string) => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.kwTokenAppId).do()
      const gs: any[] = (appInfo.params as any)['global-state'] || (appInfo.params as any).globalState || []
      const entry = gs.find((e: any) => {
        try { return atob(e.key) === 'transfersEnabled' } catch { return false }
      })
      const enabled = entry ? Number(entry.value.uint) === 1 : false

      // Read sender balance from bal: box
      let balance = 0n
      try {
        const boxName = makeBalBoxName(address)
        const box = await algodClient.getApplicationBoxByName(CONFIG.kwTokenAppId, boxName).do()
        balance = new DataView(box.value.buffer).getBigUint64(0, false)
      } catch {}

      setState(prev => ({
        ...prev,
        transfersEnabled: enabled,
        transfersChecked: true,
        kwBalance: balance,
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, transfersChecked: true, error: `Failed to read chain: ${err.message}` }))
    }
  }

  const connectWallet = async () => {
    setState(prev => ({ ...prev, status: 'connecting', error: null }))
    try {
      const accounts = await walletAdapter.connect()
      const address = Array.isArray(accounts) ? accounts[0] : accounts
      setState(prev => ({ ...prev, wallet: address, status: 'ready' }))
      await loadOnChainData(address)
    } catch (err: any) {
      setState(prev => ({ ...prev, status: 'idle', error: `Wallet connection failed: ${err.message}` }))
    }
  }

  const disconnectWallet = async () => {
    try { await walletAdapter.disconnect() } catch {}
    setState(prev => ({
      ...prev,
      status: 'idle',
      wallet: '',
      kwBalance: 0n,
      txId: null,
      error: null,
    }))
  }

  const executeTransfer = async () => {
    if (!state.wallet || !state.recipient || !state.amount) return
    const amountKw = BigInt(state.amount)
    if (amountKw <= 0n) return
    if (amountKw > state.kwBalance) {
      setState(prev => ({ ...prev, error: 'Amount exceeds your balance.' }))
      return
    }

    setState(prev => ({ ...prev, status: 'executing', error: null, txId: null }))

    try {
      // Validate recipient address
      algosdk.decodeAddress(state.recipient) // throws if invalid

      const sp = await algodClient.getTransactionParams().do()

      // ARC-4 selector for transfer(address,uint64)string = 0x6c1ecf24
      const selector = new Uint8Array([0x6c, 0x1e, 0xcf, 0x24])
      // address arg = index 1 in accounts array
      const addrArg = new Uint8Array([1])
      // uint64 amount
      const amountArg = new Uint8Array(8)
      new DataView(amountArg.buffer).setBigUint64(0, amountKw)

      const txn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: state.wallet,
        appIndex: CONFIG.kwTokenAppId,
        appArgs: [selector, addrArg, amountArg],
        accounts: [state.recipient],
        boxes: [
          { appIndex: 0, name: makeBalBoxName(state.wallet) },
          { appIndex: 0, name: makeBalBoxName(state.recipient) },
        ],
        suggestedParams: sp,
      } as any)

      const txnBytes = algosdk.encodeUnsignedTransaction(txn)
      const signedBytes = await walletAdapter.signTransaction([txnBytes])

      const result = await algodClient.sendRawTransaction(signedBytes).do()
      const txId = (result as any).txid || (result as any).txId

      await algosdk.waitForConfirmation(algodClient, txId, 8)

      setState(prev => ({ ...prev, status: 'success', txId }))
      // Refresh balance
      await loadOnChainData(state.wallet)
    } catch (err: any) {
      setState(prev => ({ ...prev, status: 'ready', error: err.message }))
    }
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

  const canTransfer =
    state.status === 'ready' &&
    state.transfersEnabled &&
    state.kwBalance > 0n &&
    state.recipient.length === 58 &&
    Number(state.amount) > 0 &&
    BigInt(state.amount || '0') <= state.kwBalance

  return (
    <div style={{ fontFamily: 'monospace', padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <h1>🔁 kW Token Transfer</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Transfer kW tokens to another investor. Requires Financial Close to be finalized and transfers enabled.
      </p>

      {/* Network gate */}
      {state.transfersChecked && !state.transfersEnabled && (
        <div style={{ background: '#fff3e0', border: '1px solid #e6a020', borderRadius: '6px', padding: '14px', marginBottom: '20px' }}>
          <strong>⛔ Transfers not yet enabled</strong>
          <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
            The operator must finalize the Financial Close before peer-to-peer transfers are allowed.
          </p>
        </div>
      )}

      {state.transfersChecked && state.transfersEnabled && (
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '6px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px' }}>
          ✅ Transfers are enabled on this contract.
        </div>
      )}

      {/* Wallet connection */}
      {!state.wallet ? (
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={connectWallet}
            disabled={state.status === 'connecting'}
            style={{
              padding: '12px 24px',
              background: '#1a6b2a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            {state.status === 'connecting' ? '⏳ Connecting…' : '🔌 Connect Pera Wallet'}
          </button>
        </div>
      ) : (
        <div style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: '6px', padding: '12px 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Connected wallet</div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all' }}>{state.wallet}</div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '18px' }}>{state.kwBalance.toString()} kW</span>
            <span style={{ color: '#888', fontSize: '12px' }}>your balance</span>
            <button
              onClick={disconnectWallet}
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Transfer form */}
      {state.wallet && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={labelStyle}>
            Recipient Address
            <input
              type="text"
              value={state.recipient}
              onChange={e => setState(prev => ({ ...prev, recipient: e.target.value.trim(), error: null }))}
              placeholder="ALGO address (58 chars)"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Amount (kW tokens)
            <input
              type="number"
              min="1"
              max={state.kwBalance.toString()}
              value={state.amount}
              onChange={e => setState(prev => ({ ...prev, amount: e.target.value, error: null }))}
              placeholder={`max ${state.kwBalance.toString()} kW`}
              style={inputStyle}
            />
          </label>

          {state.error && (
            <div style={{ color: '#c00', background: '#fff0f0', border: '1px solid #fcc', borderRadius: '4px', padding: '10px' }}>
              ❌ {state.error}
            </div>
          )}

          {state.status === 'success' && state.txId && (
            <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontWeight: 700, color: '#1a6b2a', marginBottom: '6px' }}>✅ Transfer confirmed!</div>
              <div style={{ fontSize: '13px' }}>
                Transaction:{' '}
                <a
                  href={`https://testnet.explorer.perawallet.app/tx/${state.txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {state.txId.slice(0, 12)}…
                </a>
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#555' }}>
                New balance: <strong>{state.kwBalance.toString()} kW</strong>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, status: 'ready', txId: null, recipient: '', amount: '' }))}
                style={{ marginTop: '10px', padding: '8px 16px', cursor: 'pointer' }}
              >
                Make Another Transfer
              </button>
            </div>
          )}

          {state.status !== 'success' && (
            <button
              onClick={executeTransfer}
              disabled={!canTransfer || state.status === 'executing'}
              style={{
                padding: '14px',
                background: canTransfer ? '#1a3a8a' : '#aaa',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                cursor: canTransfer ? 'pointer' : 'not-allowed',
                fontWeight: 700,
              }}
            >
              {state.status === 'executing'
                ? '⏳ Waiting for Pera Wallet…'
                : `🔁 Transfer ${state.amount || '0'} kW`}
            </button>
          )}

          {!state.transfersEnabled && state.transfersChecked && (
            <p style={{ fontSize: '12px', color: '#999' }}>
              Transfer button will activate once the operator enables transfers via Financial Close finalization.
            </p>
          )}
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '16px', fontSize: '12px', color: '#888' }}>
        <p>KWToken App ID: {CONFIG.kwTokenAppId}</p>
        <p>
          <a href={`https://testnet.explorer.perawallet.app/application/${CONFIG.kwTokenAppId}/`} target="_blank" rel="noopener noreferrer">
            View contract on explorer
          </a>
        </p>
      </div>
    </div>
  )
}
