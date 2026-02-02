# PPA (Power Purchase Agreement) Contract Design

## Overview

A PPA contract enables buyers to purchase electricity (kWh) from renewable energy projects at agreed-upon rates, with automated payment settlement based on actual generation.

## Architecture Integration with Protius V1

### Current Protius Stack
1. **ProjectRegistry** - Project configuration and permissions
2. **KWToken** - Equity-like ownership tokens (1 kW = 1 kW installed capacity)
3. **KWhReceipt** - Production recording (SSOT for generation data)
4. **RevenueVault** - Monthly revenue distribution to kW token holders

### New PPA Layer
The PPA contract sits **alongside** RevenueVault as an alternative revenue stream:

```
┌─────────────────────────────────────────────────────────────┐
│                     ProjectRegistry                          │
│              (Project Config + Permissions)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┬─────────────────┐
         │                   │                 │
         ▼                   ▼                 ▼
┌─────────────┐      ┌─────────────┐   ┌─────────────┐
│  KWToken    │      │ KWhReceipt  │   │PPA Contract │◄───New
│ (Ownership) │      │(Production) │   │  (Sales)    │
└─────────────┘      └──────┬──────┘   └──────┬──────┘
                            │                 │
                            │                 │
         ┌──────────────────┴─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Revenue Distribution Layer                  │
│  ┌────────────────────┐      ┌─────────────────────┐   │
│  │  RevenueVault      │      │  PPA Settlement     │   │
│  │  (Token Holders)   │      │  (PPA Buyers)       │   │
│  └────────────────────┘      └─────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## PPA Contract Core Design

### 1. PPA Agreement Structure

Each PPA is a binding agreement between:
- **Seller** (Project/Treasury)
- **Buyer** (Corporate/Utility)
- **Terms** (Price, duration, volume commitments)

### 2. State Management

#### Global State
```typescript
- admin: Account
- projectRegistry: Account
- kwhReceipt: Account
- treasury: Account
- paused: uint64
- currentAgreementId: uint64
```

#### Per-Agreement State (BoxMap)
```typescript
agreementDetails[agreementId] = {
  buyer: Account
  seller: Account (project treasury)
  pricePerKWh: uint64 (micro-ALGOs per kWh)
  startEpoch: uint64
  endEpoch: uint64
  status: uint64 (0=active, 1=terminated, 2=completed)
  
  // Volume commitments (optional)
  minKWhPerEpoch: uint64
  maxKWhPerEpoch: uint64
  
  // Penalties/incentives
  shortfallPenaltyBps: uint64
  overdeliveryBonusBps: uint64
}
```

#### Per-Epoch Settlement State
```typescript
epochAllocations[epochId] = {
  totalKWhGenerated: uint64
  totalKWhAllocated: uint64
  totalRevenue: uint64
  settled: uint64 (0=open, 1=settled)
}

agreementAllocations[agreementId][epochId] = {
  allocatedKWh: uint64
  revenueAmount: uint64
  paid: uint64 (0=unpaid, 1=paid)
  settledAt: uint64 (timestamp)
}
```

### 3. Core Functions

#### Agreement Management
```typescript
createAgreement(
  buyer: Account,
  pricePerKWh: uint64,
  startEpoch: uint64,
  endEpoch: uint64,
  minKWhPerEpoch: uint64,
  maxKWhPerEpoch: uint64
): uint64 // returns agreementId
```

#### Production Allocation
```typescript
allocateProduction(
  epochId: uint64,
  allocations: Array<{agreementId: uint64, kWhAmount: uint64}>
): string
```

#### Payment Settlement
```typescript
settlePayment(
  agreementId: uint64,
  epochId: uint64,
  paymentTxn: PaymentTransaction
): string
```

#### Query Functions
```typescript
getAgreementDetails(agreementId: uint64): AgreementDetails
getEpochAllocation(agreementId: uint64, epochId: uint64): AllocationDetails
getBuyerBalance(buyer: Account): uint64
```

## Transaction Flow

### Phase 1: Agreement Creation
```
Client → PPA.createAgreement()
  ├─ Validates buyer != seller
  ├─ Validates price > 0
  ├─ Validates epoch range
  ├─ Creates agreement box
  └─ Returns agreementId
```

### Phase 2: Monthly Production Allocation
```
Operator → Group Transaction:
  ├─ Txn 1: KWhReceipt.getEpochTotal(epochId) [read-only verify]
  ├─ Txn 2: PPA.allocateProduction(epochId, allocations[])
  │   ├─ Verifies sum(allocations) ≤ epochTotal
  │   ├─ Verifies agreements are active
  │   ├─ Calculates revenue per agreement
  │   └─ Updates allocation boxes
  └─ Txn 3: RevenueVault.depositRemaining(epochId, remaining)
```

### Phase 3: Buyer Payment
```
Buyer → Group Transaction:
  ├─ Txn 1: Payment (buyer → treasury, exact amount)
  ├─ Txn 2: PPA.settlePayment(agreementId, epochId, paymentTxn)
  │   ├─ Verifies payment amount == allocation.revenueAmount
  │   ├─ Verifies payment receiver == treasury
  │   ├─ Marks allocation as paid
  │   └─ Updates buyer payment history
  └─ Returns settlement confirmation
```

## Revenue Split Logic

For each epoch:
1. **Total kWh Generated** = KWhReceipt.getEpochTotal(epochId)
2. **PPA Allocated kWh** = sum of all PPA allocations
3. **Remaining kWh** = Total - PPA Allocated
4. **PPA Revenue** = Direct payments from buyers to treasury
5. **Market Revenue** = Remaining kWh × market price → RevenueVault

Example:
```
Epoch 42:
├─ Total generation: 100,000 kWh
├─ PPA allocations:
│   ├─ Buyer A: 60,000 kWh @ $0.12/kWh = $7,200 (paid directly)
│   └─ Buyer B: 30,000 kWh @ $0.10/kWh = $3,000 (paid directly)
├─ Total PPA: 90,000 kWh = $10,200 revenue
├─ Remaining: 10,000 kWh → RevenueVault @ market price
└─ Token holders receive distribution from remaining 10,000 kWh
```

## Payment Mechanics

### Option 1: Direct Payment (Recommended)
- Buyer pays treasury directly via ALGO or ASA transfer
- PPA contract verifies payment in atomic group transaction
- No escrow, minimal state

### Option 2: Escrow-Based
- Buyer pre-funds escrow account
- PPA contract automatically disburses on settlement
- More complex, requires escrow management

### Option 3: Invoice-Based (Hybrid)
- PPA contract generates invoice (allocation recorded)
- Off-chain payment processed
- Operator marks as paid after verification

## Key Constraints

### SSOT Constraints
1. **Post-Epoch Settlement**: Allocations can only be made after KWhReceipt.markEpochSettled()
2. **No Over-Allocation**: sum(PPA allocations) ≤ total epoch generation
3. **Immutable Allocations**: Once allocated and paid, cannot be modified
4. **Active Agreements Only**: Allocations only for agreements within valid epoch range

### Economic Constraints
1. **Price Enforcement**: Payment amount must match allocation.revenueAmount exactly
2. **No Double Payment**: Buyer cannot pay twice for same epoch
3. **No Underpayment**: Full payment required before marking as settled
4. **Currency Consistency**: All agreements use same settlement asset (ALGO or specific ASA)

### Operational Constraints
1. **Oracle Authority**: Only authorized operators can allocate production
2. **Payment Window**: Buyers have N days to settle payment before late penalties
3. **Dispute Resolution**: Admin can override/adjust allocations before payment

## Integration Points

### With KWhReceipt
```typescript
// Client reads total generation
totalKWh = await kwhReceiptClient.getEpochTotal(epochId)

// Operator allocates based on PPA agreements
await ppaClient.allocateProduction(epochId, allocations)
```

### With RevenueVault
```typescript
// After PPA allocations, remaining goes to vault
remaining = totalKWh - ppaAllocated
await revenueVaultClient.depositNetRevenue(epochId, remainingRevenue)
```

### With ProjectRegistry
```typescript
// PPA contract reads treasury address
treasury = await registryClient.getTreasury()

// Validates project is post-COD
isCOD = await registryClient.isCOD()
```

## Security Considerations

1. **Reentrancy**: All state updates before external calls (payment verification)
2. **Integer Overflow**: Use Algorand's Uint64 with explicit bounds checking
3. **Access Control**: Only admin/authorized operators can allocate production
4. **Payment Verification**: Atomic group transaction ensures payment + settlement are linked
5. **Rounding**: Any rounding remainder goes to treasury (deterministic)

## UI/UX Flow

### For Operators (Platform)
1. View active PPA agreements
2. Input monthly allocation per buyer
3. System validates against total generation
4. Approve and submit allocation transaction
5. Monitor payment status per buyer

### For Buyers
1. View active PPA agreement details
2. See monthly allocation (kWh + invoice amount)
3. Submit payment transaction
4. Download payment receipt/proof
5. View payment history

### For Token Holders
1. View total generation vs PPA allocation
2. See remaining kWh available for vault distribution
3. Understand revenue split between PPA and market

## Implementation Phases

### Phase 1: Core PPA Contract (MVP)
- [x] Agreement creation
- [x] Production allocation
- [x] Payment verification
- [x] Basic query functions

### Phase 2: Advanced Features
- [ ] Late payment penalties
- [ ] Overdelivery bonuses
- [ ] Multi-currency support
- [ ] Automated allocation rules

### Phase 3: Analytics & Reporting
- [ ] Historical reporting
- [ ] Payment analytics
- [ ] Agreement performance metrics
- [ ] Integration with accounting systems

## Testing Strategy

### Unit Tests
- Agreement creation validation
- Allocation logic (bounds, constraints)
- Payment verification
- Edge cases (zero allocation, over-allocation)

### Integration Tests
- Full epoch flow (allocation → payment → settlement)
- Multi-buyer scenarios
- Revenue split with RevenueVault
- Dispute resolution workflows

### Audit Requirements
- Sum of payments = sum of allocations (per epoch)
- No double payments
- Allocation ≤ generation (always)
- Payment amounts match agreed prices

## Open Questions

1. **Payment Currency**: ALGO only, or support multiple ASAs?
2. **Late Payment**: Grace period? Automatic penalties?
3. **Shortfall Handling**: What if generation < PPA commitments?
4. **Price Escalation**: Fixed price or CPI-indexed?
5. **Prepayment**: Allow buyers to prepay multiple epochs?

## Next Steps

1. Review design with stakeholders
2. Implement core PPA contract
3. Create TypeScript client
4. Build operator UI for allocations
5. Build buyer portal for payments
6. Integration testing with existing contracts
7. Audit and deploy

---

**Document Version**: 1.0  
**Author**: Protius Platform Team  
**Date**: February 2, 2026  
**Status**: DRAFT - Pending Review
