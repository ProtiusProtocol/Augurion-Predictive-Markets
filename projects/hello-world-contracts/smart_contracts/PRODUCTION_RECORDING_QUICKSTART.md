# Production Recording - Quick Reference

## What Is This?

At the end of each month (generation epoch), you need to record the actual electricity production (kWh) from your solar project to the blockchain. This becomes the **source of truth** for:
- PPA buyer allocations
- Revenue distribution to token holders
- Audit compliance

## Three Ways to Input kWh Data

### 1. 🖥️ Web UI (Easiest)
Open your Protius UI and click **"📊 Production Recording"**

**Steps:**
1. Enter epoch ID (e.g., `202602` for February 2026)
2. Add meter readings:
   - Meter 1: 45,230 kWh
   - Meter 2: 38,450 kWh
   - Meter 3: 42,100 kWh
3. Review total: 125,780 kWh
4. Click "Record to Blockchain"
5. Confirm transaction in your wallet

**Features:**
- ✅ CSV import for bulk readings
- ✅ Real-time validation
- ✅ Epoch status checking
- ✅ Activity log
- ✅ No coding required

### 2. 💻 TypeScript/JavaScript
Use the SDK for automated recording:

```typescript
import { KWhReceiptClient } from './sdk/dist/clients/kwhreceipt.client'

const client = new KWhReceiptClient({
  appId: 1004,
  algodClient,
  signer: adminAccount
})

// Record each meter
await client.recordProduction({
  epochId: 202602,
  intervalId: 1,    // Meter 1
  kWhAmount: 45_230
})

await client.recordProduction({
  epochId: 202602,
  intervalId: 2,    // Meter 2
  kWhAmount: 38_450
})

// Get total
const total = await client.getEpochTotal({ epochId: 202602 })
console.log(`Total: ${total} kWh`)
```

### 3. 🤖 Automated (Production)
Set up automated recording from your monitoring system:

```typescript
// Cron job runs monthly
import cron from 'node-cron'

cron.schedule('1 0 1 * *', async () => {
  // Fetch from inverter API
  const readings = await fetchFromSolarEdge(siteId, lastMonth)
  
  // Record to blockchain
  for (const meter of readings) {
    await client.recordProduction({
      epochId: meter.epoch,
      intervalId: meter.id,
      kWhAmount: meter.kWh
    })
  }
})
```

## Monthly Workflow

```
Day 1-28: Solar panels generate electricity
    ↓
Day 29: Collect meter readings from inverters
    ↓
Day 30: 📊 RECORD TO BLOCKCHAIN (this step!)
    ↓
    [Example: 100,000 kWh recorded for epoch 202602]
    ↓
Day 31: Allocate to PPA buyers
    ↓
    [75,000 kWh → PPA Buyer A @ $0.12/kWh]
    [25,000 kWh → Token holders via RevenueVault]
    ↓
Day 32-35: PPA buyer pays invoice
    ↓
Day 36+: Token holders claim their revenue share
```

## Important Rules

### ✅ Do's
- Record within 1-2 days of month end
- Verify readings match utility bills
- Use unique meter IDs for each reading
- Keep off-chain backup of all data

### ❌ Don'ts
- Don't record estimated values (must be actual)
- Don't modify after recording (it's immutable)
- Don't record to settled epochs
- Don't skip verification before submitting

## Data Format

### CSV Import Format
```csv
Meter ID,kWh
1,45230
2,38450
3,42100
```

### Epoch ID Format
Use `YYYYMM` format:
- January 2026 → `202601`
- February 2026 → `202602`
- December 2026 → `202612`

## What Happens After Recording?

Once production is recorded:

1. **Total is locked** for that epoch
2. **Operator allocates** to PPA buyers:
   ```
   Total: 100,000 kWh
   ├─ PPA Buyer: 75,000 kWh @ $0.12/kWh = $9,000
   └─ Token holders: 25,000 kWh → RevenueVault
   ```
3. **PPA buyer pays** invoice directly to treasury
4. **Token holders claim** their share from vault

## Troubleshooting

### "IntervalAlreadyRecorded"
**Problem:** Trying to record same meter twice  
**Solution:** Each meter ID can only be used once per epoch

### "EpochAlreadySettled"
**Problem:** Epoch is closed  
**Solution:** Cannot add more data to closed epochs

### "NotAdmin"
**Problem:** Unauthorized account  
**Solution:** Use admin/oracle wallet configured in contract

### "InvalidKWhAmount"
**Problem:** Amount is 0 or negative  
**Solution:** Enter positive kWh value

## Where Is the Data Stored?

- **On-Chain**: Algorand blockchain (immutable, auditable)
- **Contract**: KWhReceipt (App ID: 1004)
- **Box Storage**: Epoch totals and individual readings
- **Query Anytime**: Read historical data via SDK

## Integration with PPA Contract

After recording, the PPA contract uses this data:

```typescript
// 1. Get recorded total
const totalKWh = await kwhReceiptClient.getEpochTotal({ epochId: 202602 })

// 2. Allocate to PPA buyer
await ppaClient.allocateProduction({
  epochId: 202602,
  agreementId: 1,
  kWhAmount: 75_000,
  expectedTotalGeneration: totalKWh  // ← Uses recorded data
})
```

## Quick Access

**Web UI:** http://localhost:8080 → "📊 Production Recording"  
**Documentation:** [PRODUCTION_RECORDING_GUIDE.md](PRODUCTION_RECORDING_GUIDE.md)  
**Component:** [web/src/ProductionRecording.tsx](web/src/ProductionRecording.tsx)

---

**Need Help?**  
- Check the detailed guide: `PRODUCTION_RECORDING_GUIDE.md`
- Review the UI code: `web/src/ProductionRecording.tsx`
- Test on localnet before mainnet!
