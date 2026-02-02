import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import ProjectStatusPanel from './ProjectStatusPanel'

// Config
const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  ppaContractAppId: 1006, // Update with actual PPA contract app ID
  projectRegistryAppId: 1003,
}

interface PPAAllocation {
  agreementId: number
  epochId: number
  kWhAmount: number
  revenueAmount: number
  pricePerKWh: number
  isPaid: boolean
  dueDate: Date
}

interface AgreementInfo {
  agreementId: number
  buyer: string
  pricePerKWh: number
  startEpoch: number
  endEpoch: number
  status: string
}

export default function BuyerPortal() {
  const [connected, setConnected] = useState(false)
  const [buyerAddress, setBuyerAddress] = useState('')
  const [agreements, setAgreements] = useState<AgreementInfo[]>([])
  const [allocations, setAllocations] = useState<PPAAllocation[]>([])
  const [selectedAllocation, setSelectedAllocation] = useState<PPAAllocation | null>(null)
  const [paying, setPaying] = useState(false)

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)

  // Check connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await algodClient.status().do()
        setConnected(true)
      } catch (error) {
        setConnected(false)
      }
    }
    checkConnection()
  }, [])

  // Load buyer's agreements and allocations
  const loadBuyerData = async () => {
    if (!buyerAddress) {
      alert('Please enter your wallet address')
      return
    }

    try {
      // In production, query PPA contract for buyer's agreements
      // This is a mock example
      const mockAgreements: AgreementInfo[] = [
        {
          agreementId: 1,
          buyer: buyerAddress,
          pricePerKWh: 120_000, // $0.12/kWh
          startEpoch: 202601,
          endEpoch: 202612,
          status: 'Active'
        }
      ]

      const mockAllocations: PPAAllocation[] = [
        {
          agreementId: 1,
          epochId: 202602,
          kWhAmount: 75_000,
          revenueAmount: 9_000_000_000, // micro-ALGOs
          pricePerKWh: 120_000,
          isPaid: false,
          dueDate: new Date('2026-03-15')
        },
        {
          agreementId: 1,
          epochId: 202601,
          kWhAmount: 70_000,
          revenueAmount: 8_400_000_000,
          pricePerKWh: 120_000,
          isPaid: true,
          dueDate: new Date('2026-02-15')
        }
      ]

      setAgreements(mockAgreements)
      setAllocations(mockAllocations)
    } catch (error: any) {
      alert(`Failed to load data: ${error.message}`)
    }
  }

  // Calculate totals
  const unpaidAllocations = allocations.filter(a => !a.isPaid)
  const totalUnpaid = unpaidAllocations.reduce((sum, a) => sum + a.revenueAmount, 0)
  const totalKWhUnpaid = unpaidAllocations.reduce((sum, a) => sum + a.kWhAmount, 0)

  // Format currency
  const formatALGO = (microAlgos: number) => {
    return (microAlgos / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  // Format epoch as readable date
  const formatEpoch = (epochId: number) => {
    const str = epochId.toString()
    const year = str.slice(0, 4)
    const month = str.slice(4, 6)
    const date = new Date(`${year}-${month}-01`)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  // Pay invoice
  const payInvoice = async (allocation: PPAAllocation) => {
    if (!buyerAddress) {
      alert('Please connect your wallet first')
      return
    }

    const confirmed = confirm(
      `💳 CONFIRM PAYMENT\n\n` +
      `Month: ${formatEpoch(allocation.epochId)}\n` +
      `kWh Purchased: ${allocation.kWhAmount.toLocaleString()} kWh\n` +
      `Amount: ${formatALGO(allocation.revenueAmount)} ALGO\n\n` +
      `This will send payment from your wallet.\n` +
      `Continue?`
    )

    if (!confirmed) return

    setPaying(true)
    try {
      // In production, this would:
      // 1. Connect to buyer's wallet (Pera, Defly, etc.)
      // 2. Create payment transaction
      // 3. Group with PPA.settlePayment() call
      // 4. Sign and submit

      alert(
        `✅ DEMO: Payment Submitted\n\n` +
        `In production, this would:\n` +
        `1. Open your wallet (Pera/Defly)\n` +
        `2. Send ${formatALGO(allocation.revenueAmount)} ALGO to project treasury\n` +
        `3. Record payment on blockchain\n` +
        `4. Issue receipt NFT\n\n` +
        `Amount: ${formatALGO(allocation.revenueAmount)} ALGO\n` +
        `For: ${allocation.kWhAmount.toLocaleString()} kWh`
      )

      // Mark as paid in UI
      setAllocations(allocations.map(a => 
        a.epochId === allocation.epochId && a.agreementId === allocation.agreementId
          ? { ...a, isPaid: true }
          : a
      ))
      setSelectedAllocation(null)

    } catch (error: any) {
      alert(`Payment failed: ${error.message}`)
    } finally {
      setPaying(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>⚡ PPA Buyer Portal</h1>
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

      {/* Project State Machine Panel (Read-Only) */}
      <ProjectStatusPanel
        projectRegistryAppId={CONFIG.projectRegistryAppId}
        algodClient={algodClient}
        readOnly={true}
      />

      {/* Wallet Input */}
      <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          Your Wallet Address:
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value)}
            placeholder="Enter your Algorand address"
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '14px',
              border: '2px solid #ddd',
              borderRadius: '4px'
            }}
          />
          <button
            onClick={loadBuyerData}
            disabled={!buyerAddress}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: buyerAddress ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            Load My PPAs
          </button>
        </div>
      </div>

      {agreements.length > 0 && (
        <>
          {/* Agreement Summary */}
          <div style={{ marginBottom: '30px' }}>
            <h2>📋 Your PPA Agreements</h2>
            {agreements.map(agreement => (
              <div
                key={agreement.agreementId}
                style={{
                  padding: '20px',
                  backgroundColor: '#e3f2fd',
                  border: '2px solid #2196F3',
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>
                      Agreement #{agreement.agreementId}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      {formatEpoch(agreement.startEpoch)} - {formatEpoch(agreement.endEpoch)}
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '12px',
                    height: 'fit-content'
                  }}>
                    {agreement.status}
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0d47a1' }}>
                  ${(agreement.pricePerKWh / 1_000_000).toFixed(4)} per kWh
                </div>
              </div>
            ))}
          </div>

          {/* Outstanding Balance */}
          {unpaidAllocations.length > 0 && (
            <div style={{
              padding: '20px',
              backgroundColor: '#fff3cd',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              marginBottom: '30px'
            }}>
              <div style={{ fontSize: '14px', color: '#856404', marginBottom: '5px' }}>
                💰 Total Outstanding Balance
              </div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#856404' }}>
                {formatALGO(totalUnpaid)} ALGO
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                {totalKWhUnpaid.toLocaleString()} kWh across {unpaidAllocations.length} invoice{unpaidAllocations.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Invoices Table */}
          <div>
            <h2>📄 Invoices</h2>
            <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Month</th>
                    <th style={{ padding: '15px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>kWh</th>
                    <th style={{ padding: '15px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Amount (ALGO)</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Due Date</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Status</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd', width: '120px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((allocation) => (
                    <tr key={`${allocation.agreementId}-${allocation.epochId}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '15px', fontWeight: 'bold' }}>
                        {formatEpoch(allocation.epochId)}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>
                        {allocation.kWhAmount.toLocaleString()}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold' }}>
                        {formatALGO(allocation.revenueAmount)}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center', fontSize: '13px' }}>
                        {allocation.dueDate.toLocaleDateString()}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        {allocation.isPaid ? (
                          <span style={{
                            padding: '4px 12px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}>
                            ✓ Paid
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 12px',
                            backgroundColor: '#ff9800',
                            color: 'white',
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}>
                            ⏳ Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        {!allocation.isPaid && (
                          <button
                            onClick={() => payInvoice(allocation)}
                            disabled={paying}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#4CAF50',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold'
                            }}
                          >
                            💳 Pay Now
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Info */}
          <div style={{
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4CAF50',
            borderRadius: '8px',
            fontSize: '13px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#2e7d32' }}>
              💡 How Payment Works
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#2e7d32' }}>
              <li>Click "Pay Now" to open your Algorand wallet (Pera, Defly, etc.)</li>
              <li>Confirm payment in your wallet app</li>
              <li>Payment is recorded on blockchain (immutable proof)</li>
              <li>You'll receive a payment confirmation instantly</li>
              <li>All transactions are transparent and auditable</li>
            </ul>
          </div>
        </>
      )}

      {agreements.length === 0 && buyerAddress && (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          color: '#999'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
          <div style={{ fontSize: '18px' }}>No PPA agreements found for this address</div>
        </div>
      )}
    </div>
  )
}
