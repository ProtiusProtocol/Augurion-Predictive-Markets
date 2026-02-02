# Recording kWh Generation Data - Complete Guide

## Overview

At the end of each generation epoch (typically monthly), you need to record the actual electricity production (kWh) into the blockchain. This data becomes the **Single Source of Truth (SSOT)** for revenue distribution and PPA settlements.

## Current System: How Production Recording Works

### 1. The KWhReceipt Contract

Your existing `KWhReceipt` contract has a function `recordProduction()` that stores generation data:

```typescript
recordProduction(
  epochId: uint64,      // e.g., 202602 (Feb 2026)
  intervalId: uint64,   // Unique identifier for this reading
  kWhAmount: uint64     // Actual kWh generated
): string
```

**Key Constraints:**
- ✅ Each `intervalId` can only be recorded once (prevents duplicates)
- ✅ Cannot add to an epoch that's already settled
- ✅ Only authorized oracle/admin can record
- ✅ Automatically accumulates into epoch total

### 2. Current Recording Methods

#### Option A: Single Interval Recording
```typescript
// Record one reading at a time
await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 1,
  kWhAmount: 100_000  // 100,000 kWh
})
```

#### Option B: Batch Recording (if multiple meters)
```typescript
// Record multiple readings in the same epoch
await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 1,
  kWhAmount: 60_000   // Inverter 1
})

await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 2,
  kWhAmount: 40_000   // Inverter 2
})

// Total for epoch 202602: 100,000 kWh
```

## Recording Workflow (Monthly)

### Step 1: Collect Generation Data
**Sources:**
- Inverter monitoring systems
- SCADA data
- Utility meter readings
- IoT sensors

**Example:** February 2026 (Epoch 202602)
```
Meter 1: 45,230 kWh
Meter 2: 38,450 kWh
Meter 3: 42,100 kWh
Total: 125,780 kWh
```

### Step 2: Record to Blockchain

#### Using TypeScript/JavaScript
```typescript
import { KWhReceiptClient } from './sdk/dist/clients/kwhreceipt.client'

// Initialize client
const kwhReceiptClient = new KWhReceiptClient({
  appId: KWH_RECEIPT_APP_ID,
  algodClient,
  signer: adminAccount
})

// Record each meter reading
const epoch = 202602
const readings = [
  { meter: 1, kWh: 45_230 },
  { meter: 2, kWh: 38_450 },
  { meter: 3, kWh: 42_100 }
]

for (const reading of readings) {
  await kwhReceiptClient.recordProduction({
    epochId: epoch,
    intervalId: reading.meter,
    kWhAmount: reading.kWh
  })
  
  console.log(`✅ Recorded Meter ${reading.meter}: ${reading.kWh} kWh`)
}

// Get total
const total = await kwhReceiptClient.getEpochTotal({ epochId: epoch })
console.log(`📊 Total for epoch ${epoch}: ${total} kWh`)
```

#### Using CLI (AlgoKit)
```bash
# Record production via CLI
algokit goal app call \
  --app-id $KWH_RECEIPT_APP_ID \
  --method "recordProduction(uint64,uint64,uint64)string" \
  --arg 202602 \
  --arg 1 \
  --arg 100000 \
  --from $ADMIN_ADDRESS
```

### Step 3: Verify Recording
```typescript
// Query recorded data
const [epochId, kWh] = await kwhReceiptClient.getReceipt({
  intervalId: 1
})

console.log(`Interval 1: ${kWh} kWh in epoch ${epochId}`)

// Get epoch total
const totalKWh = await kwhReceiptClient.getEpochTotal({
  epochId: 202602
})

console.log(`Total generation: ${totalKWh} kWh`)
```

### Step 4: Settle Epoch
```typescript
// After all recordings are complete, mark epoch as settled
// (Usually done automatically by RevenueVault during settlement)
await kwhReceiptClient.markEpochSettled({
  epochId: 202602
})
```

## Web UI for Production Recording

I'll create a new component for your Protius UI:

### ProductionRecording.tsx
```typescript
import { useState } from 'react'
import { KWhReceiptClient } from '../sdk/dist/clients/kwhreceipt.client'

interface MeterReading {
  meterId: number
  kWhAmount: number
  timestamp: Date
}

export default function ProductionRecording() {
  const [epochId, setEpochId] = useState('')
  const [readings, setReadings] = useState<MeterReading[]>([
    { meterId: 1, kWhAmount: 0, timestamp: new Date() }
  ])
  const [recording, setRecording] = useState(false)
  const [totalKWh, setTotalKWh] = useState<number>(0)

  const addMeter = () => {
    setReadings([
      ...readings,
      { meterId: readings.length + 1, kWhAmount: 0, timestamp: new Date() }
    ])
  }

  const updateReading = (index: number, kWhAmount: number) => {
    const updated = [...readings]
    updated[index].kWhAmount = kWhAmount
    setReadings(updated)
    
    // Update total
    const total = updated.reduce((sum, r) => sum + r.kWhAmount, 0)
    setTotalKWh(total)
  }

  const recordProduction = async () => {
    setRecording(true)
    
    try {
      // Initialize client (use your actual config)
      const client = new KWhReceiptClient({
        appId: KWH_RECEIPT_APP_ID,
        algodClient,
        signer: adminAccount
      })

      // Record each meter
      for (const reading of readings) {
        if (reading.kWhAmount > 0) {
          await client.recordProduction({
            epochId: Number(epochId),
            intervalId: reading.meterId,
            kWhAmount: reading.kWhAmount
          })
          
          console.log(`✅ Recorded Meter ${reading.meterId}`)
        }
      }

      alert(`✅ Successfully recorded ${totalKWh} kWh for epoch ${epochId}`)
      
      // Reset form
      setReadings([{ meterId: 1, kWhAmount: 0, timestamp: new Date() }])
      setTotalKWh(0)
      
    } catch (error) {
      console.error('Recording failed:', error)
      alert(`❌ Recording failed: ${error.message}`)
    } finally {
      setRecording(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>📊 Record Production Data</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <label>
          Epoch ID (YYYYMM):
          <input
            type="text"
            value={epochId}
            onChange={(e) => setEpochId(e.target.value)}
            placeholder="202602"
            style={{ marginLeft: '10px', padding: '5px' }}
          />
        </label>
      </div>

      <h3>Meter Readings</h3>
      {readings.map((reading, index) => (
        <div key={index} style={{ marginBottom: '10px' }}>
          <label>
            Meter {reading.meterId}:
            <input
              type="number"
              value={reading.kWhAmount || ''}
              onChange={(e) => updateReading(index, Number(e.target.value))}
              placeholder="kWh"
              style={{ marginLeft: '10px', padding: '5px', width: '150px' }}
            />
            kWh
          </label>
        </div>
      ))}

      <button onClick={addMeter} style={{ marginBottom: '20px' }}>
        + Add Meter
      </button>

      <div style={{ 
        padding: '15px', 
        backgroundColor: '#f0f0f0', 
        marginBottom: '20px',
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        Total Generation: {totalKWh.toLocaleString()} kWh
      </div>

      <button
        onClick={recordProduction}
        disabled={!epochId || totalKWh === 0 || recording}
        style={{
          padding: '10px 20px',
          backgroundColor: recording ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: recording ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {recording ? '⏳ Recording...' : '✅ Record to Blockchain'}
      </button>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p>⚠️ Important:</p>
        <ul>
          <li>Each meter can only be recorded once per epoch</li>
          <li>Data is immutable once recorded</li>
          <li>Verify all readings before submitting</li>
          <li>Total will be used for PPA allocations and revenue distribution</li>
        </ul>
      </div>
    </div>
  )
}
```

## Integration with PPA Contract

After recording production, you can allocate to PPA buyers:

```typescript
// 1. Record production (Oracle/Operator)
await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 1,
  kWhAmount: 100_000
})

// 2. Get total generation
const totalKWh = await kwhReceiptClient.getEpochTotal({ epochId: 202602 })
console.log(`Total: ${totalKWh} kWh`)

// 3. Allocate to PPA buyers (Operator)
await ppaClient.allocateProduction({
  epochId: 202602,
  agreementId: 1,
  kWhAmount: 75_000,              // Allocate 75k to PPA buyer
  expectedTotalGeneration: totalKWh
})

// 4. Remaining goes to vault (25k kWh)
const [ppaAllocated] = await ppaClient.getEpochSummary({ epochId: 202602 })
const remaining = totalKWh - ppaAllocated
console.log(`Remaining for token holders: ${remaining} kWh`)
```

## Automated Recording (IoT Integration)

For production systems, automate the recording:

```typescript
// Example: Hourly cron job
import cron from 'node-cron'

// Run at end of each month (1st day, 00:01)
cron.schedule('1 0 1 * *', async () => {
  console.log('🔄 Recording monthly production...')
  
  // Get previous month's data from SCADA/monitoring system
  const lastMonth = getPreviousMonth()
  const meterData = await fetchMeterData(lastMonth)
  
  // Record to blockchain
  for (const meter of meterData) {
    await kwhReceiptClient.recordProduction({
      epochId: lastMonth.epochId,
      intervalId: meter.id,
      kWhAmount: meter.totalKWh
    })
  }
  
  console.log('✅ Monthly recording complete')
  
  // Trigger notifications for PPA allocations
  await notifyOperatorForPPAAllocation(lastMonth.epochId)
})
```

## Data Sources & Integration

### Common Integration Points

1. **Inverter APIs** (SolarEdge, SMA, Huawei, etc.)
```typescript
// Example: SolarEdge API
const response = await fetch(
  `https://monitoringapi.solaredge.com/site/${siteId}/energy?` +
  `timeUnit=MONTH&startDate=${startDate}&endDate=${endDate}&api_key=${apiKey}`
)
const data = await response.json()
const totalKWh = data.energy.values[0].value
```

2. **SCADA Systems**
```typescript
// Poll SCADA endpoint
const scadaData = await fetchSCADAData(projectId, monthStart, monthEnd)
const totalKWh = scadaData.meters.reduce((sum, m) => sum + m.kWh, 0)
```

3. **Manual Entry** (via Web UI)
- Operator enters meter readings manually
- Validates against expected range
- Requires confirmation before recording

## Best Practices

### ✅ Do's
- Record production data within 1-2 days of month end
- Verify data against utility bills
- Keep off-chain backup of all recordings
- Use sequential `intervalId`s for auditing
- Record each meter/inverter separately for transparency

### ❌ Don'ts
- Don't record until all meters are read
- Don't record estimated/projected values
- Don't modify recorded data (it's immutable)
- Don't skip verification step
- Don't record to settled epochs

## Troubleshooting

### Error: "IntervalAlreadyRecorded"
**Cause:** Trying to record the same `intervalId` twice  
**Solution:** Use a unique `intervalId` for each reading

### Error: "EpochAlreadySettled"
**Cause:** Trying to add data to a closed epoch  
**Solution:** Record before epoch settlement, or open a new epoch

### Error: "NotAdmin"
**Cause:** Unauthorized account trying to record  
**Solution:** Use admin/oracle account configured in contract

### Error: "InvalidKWhAmount"
**Cause:** Trying to record 0 or negative kWh  
**Solution:** Verify meter reading is positive

## Summary: Complete Monthly Workflow

```
Day 1-28: Generation happens (inverters producing)
    ↓
Day 29: Collect meter data
    ↓
Day 30: Operator records to KWhReceipt contract
    ↓
    [100,000 kWh recorded]
    ↓
Day 31: Operator allocates to PPA buyers
    ↓
    [75,000 kWh → PPA Buyer A]
    ↓
    [Remaining 25,000 kWh → RevenueVault]
    ↓
Day 32-35: PPA buyer pays invoice
    ↓
Day 35: Operator deposits remaining revenue to vault
    ↓
Day 36+: Token holders claim their share
```

## Next Steps

1. **Add ProductionRecording.tsx to your web UI**
2. **Test recording on localnet**
3. **Set up automated data collection from inverters**
4. **Create operator runbook for monthly process**
5. **Implement notifications/alerts for recording deadlines**

Need help implementing any of these steps? Let me know!
