# PPA Contract Integration Guide

## Quick Start

This guide shows how to integrate the PPA contract into your existing Protius platform.

## Step 1: Build the Contract

```bash
cd smart_contracts
algokit compile ppa_contract/contract.algo.ts
```

This generates:
- `artifacts/ppa_contract/PPAContract.approval.teal`
- `artifacts/ppa_contract/PPAContract.clear.teal`
- `artifacts/ppa_contract/PPAContractClient.ts`

## Step 2: Deploy to LocalNet

```typescript
import { deployPPAContract, initializePPAContract } from './ppa_contract/deploy-config'

// Deploy
const ppa = await deployPPAContract()
console.log('PPA App ID:', ppa.appId)

// Initialize with existing contracts
await initializePPAContract(
  ppa.appId,
  PROJECT_REGISTRY_ADDRESS,
  KWH_RECEIPT_ADDRESS,
  TREASURY_ADDRESS,
  0 // 0 = ALGO, or ASA ID for other currencies
)
```

## Step 3: Create Your First PPA Agreement

```typescript
import { createPPAgreement } from './ppa_contract/deploy-config'

const agreementId = await createPPAgreement(
  ppa.appId,
  'BUYER_ADDRESS_HERE',
  120_000,  // $0.12/kWh (assuming 1 ALGO = $1)
  1,        // Start at epoch 1
  60,       // End at epoch 60 (5 years)
  50_000,   // Min 50,000 kWh/month
  100_000   // Max 100,000 kWh/month
)

console.log('Agreement ID:', agreementId)
```

## Step 4: Monthly Workflow

### A. Record Production (Existing Process)
```typescript
// Your existing oracle records production to KWhReceipt
await kwhReceiptClient.recordProduction({
  intervalId,
  epochId: 10,
  kWhAmount: 100_000
})
```

### B. Allocate to PPA Buyers
```typescript
import { allocateProduction } from './ppa_contract/deploy-config'

// Get total generation
const totalKWh = await kwhReceiptClient.getEpochTotal(10)

// Allocate to PPA buyer
await allocateProduction(
  ppa.appId,
  10,         // epochId
  agreementId,
  75_000,     // allocate 75,000 kWh
  totalKWh    // total generation
)

// Remaining: 25,000 kWh will go to RevenueVault
```

### C. Buyer Pays (Buyer Side)
```typescript
import { settlePayment } from './ppa_contract/deploy-config'

// Buyer settles their allocation
await settlePayment(
  ppa.appId,
  agreementId,
  10,                    // epochId
  TREASURY_ADDRESS,
  9_000_000_000         // 75,000 kWh * 120,000 = 9 billion micro-ALGOs
)
```

### D. Distribute Remaining (Existing Process)
```typescript
// Calculate remaining revenue
const [ppaKWh, ppaRevenue] = await ppaClient.getEpochSummary(10)
const remainingKWh = totalKWh - ppaKWh

// Your existing vault distribution for remaining kWh
await revenueVaultClient.depositNetRevenue(
  10,
  remainingRevenue  // From market sales of remaining kWh
)
```

## Step 5: Add to Web UI

### Display PPA Status
```typescript
// In your operator console
const [buyer, price, start, end, status] = await ppaClient.getAgreement(agreementId)

const displayData = {
  buyer,
  pricePerKWh: price / 1_000_000, // Convert to ALGO
  duration: `${start}-${end}`,
  status: ['Active', 'Terminated', 'Completed'][status]
}
```

### Allocation Form
```typescript
// In your monthly settlement UI
const totalGeneration = await kwhReceiptClient.getEpochTotal(epochId)

// Show allocation form
<AllocationForm
  totalGeneration={totalGeneration}
  agreements={activeAgreements}
  onSubmit={async (allocations) => {
    for (const alloc of allocations) {
      await allocateProduction(
        ppaAppId,
        epochId,
        alloc.agreementId,
        alloc.kWhAmount,
        totalGeneration
      )
    }
  }}
/>
```

### Buyer Payment Portal
```typescript
// Buyer-facing UI
const [kWh, revenue, isPaid] = await ppaClient.getAllocation(agreementId, epochId)

if (!isPaid) {
  <PaymentButton
    amount={revenue}
    onPay={async () => {
      await settlePayment(ppaAppId, agreementId, epochId, treasury, revenue)
    }}
  />
}
```

## Integration Points Summary

### 1. With Existing Contracts
```
KWhReceipt (no changes needed)
    ↓
PPA Allocation (new)
    ↓
RevenueVault (receives remaining only)
```

### 2. Monthly Workflow
```
Day 1-28: Production recorded to KWhReceipt
Day 29:   Operator allocates kWh to PPA buyers
Day 30:   Buyers pay their invoices
Day 31:   Remaining revenue → RevenueVault → Token holders
```

### 3. Revenue Split Example
```
Month 10: 100,000 kWh generated

PPA Sales:
├─ Buyer A: 60,000 kWh @ $0.12 = $7,200
├─ Buyer B: 25,000 kWh @ $0.10 = $2,500
└─ Total PPA: 85,000 kWh = $9,700 (direct to treasury)

Market Sales:
└─ Remaining: 15,000 kWh @ $0.15 = $2,250 (to token holders)

Total Revenue: $11,950
├─ PPA: $9,700 (81%)
└─ Token Holders: $2,250 (19%)
```

## Testing Integration

```bash
# Start localnet
algokit localnet start

# Run PPA tests
npm test ppa_contract/contract.spec.ts

# Run integration tests
npm test integration.spec.ts
```

## Common Scenarios

### Scenario 1: Single Large Buyer
```typescript
// Corporate buyer takes 80% of production
await createPPAgreement(appId, corporateBuyer, 110_000, 1, 60, 80_000, 90_000)
// Remaining 20% → token holders
```

### Scenario 2: Multiple Small Buyers
```typescript
// 3 buyers, 30k kWh each
for (const buyer of [buyer1, buyer2, buyer3]) {
  await createPPAgreement(appId, buyer, 120_000, 1, 60, 25_000, 35_000)
}
// Remaining 10k kWh → token holders
```

### Scenario 3: Seasonal Variation
```typescript
// Summer agreement: higher commitment
await createPPAgreement(appId, buyer, 120_000, 6, 9, 100_000, 120_000)

// Winter agreement: lower commitment  
await createPPAgreement(appId, buyer, 120_000, 12, 3, 50_000, 70_000)
```

## Monitoring & Analytics

### Key Metrics to Track
```typescript
// PPA utilization rate
const utilizationRate = ppaAllocatedKWh / totalGenerationKWh

// Average PPA price
const avgPpaPrice = totalPpaRevenue / totalPpaKWh

// Market vs PPA revenue split
const ppaShare = ppaRevenue / totalRevenue
```

### Dashboard Queries
```typescript
// Get all active agreements
const agreements = []
for (let i = 1; i <= currentAgreementId; i++) {
  const [buyer, price, start, end, status] = await ppaClient.getAgreement(i)
  if (status === 0) { // Active
    agreements.push({ id: i, buyer, price, start, end })
  }
}

// Get epoch performance
const [allocatedKWh, revenue, settled] = await ppaClient.getEpochSummary(epochId)
```

## Troubleshooting

### Issue: "ExceedsTotalGeneration"
**Cause:** Sum of PPA allocations > actual generation  
**Solution:** Check total from KWhReceipt before allocating

### Issue: "InvalidPaymentAmount"
**Cause:** Buyer payment doesn't match calculated revenue  
**Solution:** Verify `kWhAmount * pricePerKWh` calculation

### Issue: "EpochAlreadySettled"
**Cause:** Trying to allocate after epoch is settled  
**Solution:** Check epoch status before allocation

## Next Steps

1. **Deploy to TestNet**: Test with real assets
2. **Add UI Components**: Build operator and buyer portals
3. **Integrate Analytics**: Add PPA metrics to dashboard
4. **Set Up Monitoring**: Track payment compliance
5. **Audit**: Security review before mainnet

## Support

Questions? Open an issue or contact the Protius team.

## Appendix: Full Code Example

See [examples/ppa-full-workflow.ts](examples/ppa-full-workflow.ts) for complete working example.
