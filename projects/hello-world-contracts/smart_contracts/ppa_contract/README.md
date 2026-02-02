# PPA (Power Purchase Agreement) Contract

## Overview

The PPA Contract enables renewable energy projects to sell electricity directly to corporate buyers through bilateral Power Purchase Agreements, with automated payment settlement and allocation tracking on the Algorand blockchain.

## Key Features

- **Agreement Management**: Create and manage bilateral PPA agreements with fixed pricing
- **Production Allocation**: Allocate monthly generation (kWh) to specific buyers
- **Payment Verification**: Atomic transaction verification ensures payment matches allocation
- **Revenue Tracking**: Complete audit trail of all PPA transactions
- **Integration**: Seamlessly integrates with existing Protius contracts (KWhReceipt, RevenueVault, ProjectRegistry)

## Architecture

### Revenue Flow
```
Total Monthly Generation (kWh)
    ├─> PPA Allocations (direct buyer payments to treasury)
    │   ├─> Buyer A: X kWh @ $Y/kWh
    │   ├─> Buyer B: X kWh @ $Y/kWh
    │   └─> ...
    └─> Remaining kWh → RevenueVault (distributed to token holders)
```

### Contract Integration
```
ProjectRegistry (Config)
    ↓
KWhReceipt (Generation Data) ──→ PPA Contract (Allocations)
    ↓                                   ↓
RevenueVault (Remaining) ←──────────────┘
```

## Core Functions

### 1. Agreement Management

#### Create Agreement
```typescript
createAgreement(
  buyer: Account,
  pricePerKWh: uint64,        // micro-ALGOs per kWh
  startEpoch: uint64,
  endEpoch: uint64,
  minKWhPerEpoch: uint64,     // 0 = no minimum
  maxKWhPerEpoch: uint64      // 0 = no maximum
): uint64                      // returns agreementId
```

**Example:**
```typescript
// Create 5-year PPA at $0.12/kWh (120,000 micro-ALGOs)
const agreementId = await ppaClient.createAgreement({
  buyer: 'BUYER_ADDRESS',
  pricePerKWh: 120_000,
  startEpoch: 1,
  endEpoch: 60,              // 60 months
  minKWhPerEpoch: 50_000,    // minimum 50,000 kWh/month
  maxKWhPerEpoch: 100_000    // maximum 100,000 kWh/month
})
```

#### Terminate Agreement
```typescript
terminateAgreement(agreementId: uint64): string
```

### 2. Production Allocation

#### Allocate Production
```typescript
allocateProduction(
  epochId: uint64,
  agreementId: uint64,
  kWhAmount: uint64,
  expectedTotalGeneration: uint64
): string
```

**Constraints:**
- Epoch must not be settled
- Agreement must be active and within valid epoch range
- kWh amount must be within agreement min/max bounds (if set)
- Total allocations cannot exceed actual generation

**Example:**
```typescript
// Month 5: Total generation = 100,000 kWh
// Allocate 75,000 kWh to Buyer A
await ppaClient.allocateProduction({
  epochId: 5,
  agreementId: 1,
  kWhAmount: 75_000,
  expectedTotalGeneration: 100_000
})

// Remaining 25,000 kWh goes to RevenueVault
```

#### Settle Epoch
```typescript
settleEpoch(epochId: uint64): string
```

Marks epoch as complete (no more allocations allowed).

### 3. Payment Settlement

#### Settle Payment
```typescript
settlePayment(
  agreementId: uint64,
  epochId: uint64
): string
```

**Atomic Group Transaction:**
```
Txn 0: Payment (buyer → treasury, exact revenue amount)
Txn 1: settlePayment() call (verifies payment)
```

**Example:**
```typescript
// Buyer pays for allocated 75,000 kWh @ 120,000 micro-ALGOs/kWh
// Total payment: 9,000,000,000 micro-ALGOs (9,000 ALGO)

const payment = makePaymentTxn({
  from: buyerAddress,
  to: treasuryAddress,
  amount: 9_000_000_000 // micro-ALGOs
})

await ppaClient.settlePayment(
  { agreementId: 1, epochId: 5 },
  { payment }
)
```

### 4. Query Functions

#### Get Allocation
```typescript
getAllocation(agreementId: uint64, epochId: uint64): 
  [kWhAmount: uint64, revenueAmount: uint64, isPaid: uint64]
```

#### Get Epoch Summary
```typescript
getEpochSummary(epochId: uint64): 
  [totalKWhAllocated: uint64, totalRevenue: uint64, isSettled: uint64]
```

#### Get Agreement
```typescript
getAgreement(agreementId: uint64): 
  [buyer: Account, pricePerKWh: uint64, startEpoch: uint64, 
   endEpoch: uint64, status: uint64]
```

## Workflow Examples

### Example 1: Simple PPA Flow

```typescript
// 1. Deploy and initialize
const ppa = await deployPPAContract()
await initializePPAContract(
  ppa.appId,
  registryAddress,
  kwhReceiptAddress,
  treasuryAddress
)

// 2. Create agreement
const agreementId = await createPPAgreement(
  ppa.appId,
  'CORPORATE_BUYER_ADDRESS',
  120_000,  // $0.12/kWh
  1,        // start epoch 1
  60        // end epoch 60 (5 years)
)

// 3. Monthly allocation (by operator)
await allocateProduction(
  ppa.appId,
  5,        // epoch 5
  agreementId,
  75_000,   // allocate 75,000 kWh
  100_000   // total generation
)

// 4. Buyer payment
await settlePayment(
  ppa.appId,
  agreementId,
  5,
  treasuryAddress,
  9_000_000_000  // payment amount
)
```

### Example 2: Multiple Buyers

```typescript
// Month 10: 200,000 kWh generated

// Buyer A: 100,000 kWh @ $0.12/kWh
await allocateProduction(ppa.appId, 10, agreementId1, 100_000, 200_000)

// Buyer B: 60,000 kWh @ $0.10/kWh
await allocateProduction(ppa.appId, 10, agreementId2, 60_000, 200_000)

// Total PPA: 160,000 kWh = $22,000 direct revenue
// Remaining: 40,000 kWh → RevenueVault for token holders
```

## Economics

### Price Structure
- **Fixed Price**: Set at agreement creation (e.g., $0.12/kWh)
- **Micro-ALGO Units**: 1 ALGO = 1,000,000 micro-ALGOs
- **Example**: $0.12/kWh = 120,000 micro-ALGOs/kWh (assuming 1 ALGO = $1)

### Revenue Distribution
1. **PPA Revenue**: Direct payments from buyers to project treasury
2. **Market Revenue**: Remaining kWh sold via RevenueVault to token holders
3. **Platform Fee**: Managed by ProjectRegistry (separate from PPA)

### Payment Terms
- **Settlement Window**: Payments due within epoch (typically 30 days)
- **Penalty Structure**: TBD (late fees, shortfall penalties)
- **Currency**: ALGO or specified ASA

## Integration Guide

### With KWhReceipt
```typescript
// 1. Get total generation for epoch
const totalKWh = await kwhReceiptClient.getEpochTotal(epochId)

// 2. Allocate to PPAs
await ppaClient.allocateProduction(epochId, agreementId, kWhAmount, totalKWh)

// 3. Calculate remaining
const remaining = totalKWh - totalAllocated
```

### With RevenueVault
```typescript
// After PPA allocations
const [ppaAllocated, ppaRevenue, settled] = await ppaClient.getEpochSummary(epochId)

// Deposit remaining to vault
const remainingKWh = totalGeneration - ppaAllocated
const remainingRevenue = remainingKWh * marketPrice

await revenueVaultClient.depositNetRevenue(epochId, remainingRevenue)
```

### With ProjectRegistry
```typescript
// Read treasury address
const treasury = await registryClient.getTreasury()

// Verify project is operational
const isCOD = await registryClient.isCOD()
```

## Security Considerations

1. **Atomic Payments**: Payment and settlement are grouped atomically
2. **No Over-Allocation**: Contract enforces total allocations ≤ generation
3. **Idempotent Settlement**: Cannot pay twice for same allocation
4. **Access Control**: Only admin can create agreements and allocate production
5. **Immutable Pricing**: Once allocated, pricing cannot be changed

## Deployment

### Prerequisites
```bash
# Install dependencies
npm install @algorandfoundation/algokit-utils

# Set environment variables
export DEPLOYER_MNEMONIC="your mnemonic..."
export BUYER_MNEMONIC="buyer mnemonic..."
```

### Deploy Contract
```bash
# Build contract
algokit compile ppa_contract/contract.algo.ts

# Deploy
ts-node ppa_contract/deploy-config.ts

# Initialize
# (see deploy-config.ts for initialization examples)
```

## Testing

See [contract.spec.ts](contract.spec.ts) for comprehensive test suite:
- Agreement creation validation
- Allocation bounds checking
- Payment verification
- Multi-buyer scenarios
- Edge cases

## Roadmap

### Phase 1 (Current)
- [x] Core agreement management
- [x] Production allocation
- [x] Payment settlement
- [x] Basic query functions

### Phase 2 (Next)
- [ ] Late payment penalties
- [ ] Shortfall/overdelivery adjustments
- [ ] Multi-currency support (additional ASAs)
- [ ] Agreement amendments
- [ ] Automated allocation rules

### Phase 3 (Future)
- [ ] Dynamic pricing (time-of-use)
- [ ] Demand response integration
- [ ] RECs (Renewable Energy Certificates)
- [ ] Carbon credit tracking

## Support

For issues or questions:
- GitHub: [protius-platform](https://github.com/protius-platform)
- Docs: [docs.protius.io](https://docs.protius.io)
- Email: support@protius.io

## License

MIT License - see LICENSE file for details
