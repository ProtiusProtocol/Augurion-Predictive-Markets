import { useState, useEffect } from 'react'
import algosdk from 'algosdk'

// Hardcoded config - matches deployed localnet contracts
const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  kwTokenAppId: 1003,
  revenueVaultAppId: 1005,
}

interface ClaimantState {
  address: string
  kwBalance: bigint
  grossEntitlement: bigint
  claimedAmount: bigint
  remainingClaimable: bigint
}

interface NetworkStatus {
  connected: boolean
  lastRound: number
  error: string | null
}

export default function ClaimantPreview() {
  const [network, setNetwork] = useState<NetworkStatus>({ connected: false, lastRound: 0, error: null })
  const [claimantState, setClaimantState] = useState<ClaimantState | null>(null)
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [currentEpochId, setCurrentEpochId] = useState<number>(202501)
  const [loading, setLoading] = useState<boolean>(false)

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)

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

  // Validate and format address
  const isValidAddress = (addr: string): boolean => {
    try {
      algosdk.decodeAddress(addr)
      return true
    } catch {
      return false
    }
  }

  // Read claimant state from on-chain
  const readClaimantState = async (address: string, epochId: number) => {
    if (!isValidAddress(address)) {
      setClaimantState(null)
      return
    }

    try {
      setLoading(true)

      // Read kW balance from kWToken
      let kwBalance = 0n
      try {
        const acctInfo = await algodClient.accountAssetInformation(address, CONFIG.kwTokenAppId).do()
        kwBalance = BigInt(acctInfo['asset-holding']['amount'])
      } catch {
        kwBalance = 0n
      }

      // Read entitlements from RevenueVault
      // Entitlements stored in box: 'entitlements:{epochId}:{address}'
      const epochIdBytes = algosdk.encodeUint64(epochId)
      const addrBytes = algosdk.decodeAddress(address).publicKey

      const entitlementKey = new Uint8Array(
        Buffer.concat([
          Buffer.from('entitlements:', 'utf-8'),
          Buffer.from(epochIdBytes),
          addrBytes,
        ])
      )

      const claimedKey = new Uint8Array(
        Buffer.concat([
          Buffer.from('claimed:', 'utf-8'),
          Buffer.from(epochIdBytes),
          addrBytes,
        ])
      )

      let grossEntitlement = 0n
      let claimedAmount = 0n

      try {
        const entitlementBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, entitlementKey).do()
        grossEntitlement = new DataView(entitlementBox.value.buffer).getBigUint64(0, false)
      } catch {
        grossEntitlement = 0n
      }

      try {
        const claimedBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, claimedKey).do()
        claimedAmount = new DataView(claimedBox.value.buffer).getBigUint64(0, false)
      } catch {
        claimedAmount = 0n
      }

      const remainingClaimable = grossEntitlement - claimedAmount

      setClaimantState({
        address,
        kwBalance,
        grossEntitlement,
        claimedAmount,
        remainingClaimable: remainingClaimable > 0n ? remainingClaimable : 0n,
      })
    } catch (err: any) {
      console.error('Failed to read claimant state:', err.message)
      setClaimantState(null)
    } finally {
      setLoading(false)
    }
  }

  // Handle wallet address input and read state
  const handleAddressChange = (addr: string) => {
    setWalletAddress(addr)
    if (isValidAddress(addr)) {
      readClaimantState(addr, currentEpochId)
    } else {
      setClaimantState(null)
    }
  }

  // Refresh on epoch change
  useEffect(() => {
    if (isValidAddress(walletAddress) && network.connected) {
      readClaimantState(walletAddress, currentEpochId)
    }
  }, [currentEpochId, network.connected])

  const getStateDescription = (): string => {
    if (!claimantState) return 'Enter a valid wallet address to view entitlements.'
    if (claimantState.remainingClaimable === 0n) {
      if (claimantState.grossEntitlement === 0n) {
        return `Address has no entitlements for epoch ${currentEpochId}.`
      } else {
        return `Address has ${claimantState.claimedAmount.toString()} µAlgos claimed (full amount). No claimable balance remaining.`
      }
    }
    return `Address has ${claimantState.remainingClaimable.toString()} µAlgos claimable for epoch ${currentEpochId}.`
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Protius Claimant Preview</h1>
      <p style={{ color: '#666' }}>View-only entitlements. No transactions. No signing. Address-based lookup.</p>

      <hr />

      {/* State Description */}
      <section>
        <div style={{
          backgroundColor: '#f0f0f0',
          padding: '12px',
          border: '1px solid #999',
          borderRadius: '4px',
          fontSize: '14px',
          marginBottom: '20px'
        }}>
          <strong>Entitlement State:</strong> {getStateDescription()}
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

      {/* Wallet Input */}
      <section>
        <h2>Wallet Address</h2>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px' }}>
            Address (Algo format):
            <br />
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="Enter Algo address (e.g., ISR5CA...)"
              style={{
                width: '100%',
                padding: '8px',
                marginTop: '5px',
                fontFamily: 'monospace',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </label>
          {walletAddress && !isValidAddress(walletAddress) && (
            <div style={{ color: 'red', fontSize: '11px', marginTop: '5px' }}>
              Invalid address format
            </div>
          )}
          {walletAddress && isValidAddress(walletAddress) && (
            <div style={{ color: 'green', fontSize: '11px', marginTop: '5px' }}>
              ✓ Valid address
            </div>
          )}
        </div>
      </section>

      <hr />

      {/* Epoch Selector */}
      <section>
        <h2>Epoch</h2>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px' }}>
            Epoch ID:{' '}
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
      </section>

      <hr />

      {/* Claimant State */}
      <section>
        <h2>Entitlements</h2>
        {claimantState ? (
          <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td><strong>Address</strong></td>
                <td style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                  {claimantState.address}
                </td>
              </tr>
              <tr>
                <td><strong>Epoch</strong></td>
                <td>{currentEpochId}</td>
              </tr>
              <tr>
                <td><strong>kW Balance</strong></td>
                <td>{claimantState.kwBalance.toString()} kW</td>
              </tr>
              <tr>
                <td><strong>Gross Entitlement (µAlgos)</strong></td>
                <td>{claimantState.grossEntitlement.toString()}</td>
              </tr>
              <tr>
                <td><strong>Claimed Amount (µAlgos)</strong></td>
                <td>{claimantState.claimedAmount.toString()}</td>
              </tr>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <td><strong>Remaining Claimable (µAlgos)</strong></td>
                <td style={{ color: claimantState.remainingClaimable > 0n ? '#2e7d32' : '#999' }}>
                  <strong>{claimantState.remainingClaimable.toString()}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>
            {walletAddress && !isValidAddress(walletAddress)
              ? 'Invalid address. Please enter a valid Algo address.'
              : 'Enter a valid wallet address above to view entitlements.'}
          </p>
        )}
      </section>

      <hr />

      {/* Claim Button (Disabled) */}
      <section>
        <h2>Claim</h2>
        <button
          disabled={true}
          title="Claiming is not available in preview mode"
          style={{
            padding: '10px 20px',
            backgroundColor: '#f5f5f5',
            color: '#999',
            border: '1px solid #ddd',
            cursor: 'not-allowed',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          Claim (Disabled — Preview Only)
        </button>
        <p style={{ fontSize: '11px', color: '#999', marginTop: '10px' }}>
          This screen displays entitlements only. Claims must be made through the full application.
        </p>
      </section>

      <hr />

      {/* Footer */}
      <footer style={{ fontSize: '11px', color: '#999', marginTop: '30px' }}>
        <p>
          This view shows your exact entitlement from the Protius Protocol.
          All data is read directly from the Algorand blockchain.
          No estimation. No rounding. This is what you are owed.
        </p>
      </footer>
    </div>
  )
}
