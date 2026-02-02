# Complete Flow: Production → PPA Buyer Payment

## 🔄 End-to-End Workflow

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONTH: February 2026                          │
│                    EPOCH: 202602                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Solar Panels Generate Electricity                      │
│  ─────────────────────────────────────────                      │
│  Day 1-28: Project produces 125,000 kWh                         │
│  • Meter 1: 45,000 kWh                                          │
│  • Meter 2: 38,000 kWh                                          │
│  • Meter 3: 42,000 kWh                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Operator Records Production (📊 YOU)                   │
│  ─────────────────────────────────────────────────              │
│  Day 29: Use Production Recording UI                            │
│  → Open: http://localhost:8080 → "📊 Production Recording"     │
│  → Enter epoch: 202602                                          │
│  → Add meter readings                                           │
│  → Submit to blockchain                                         │
│                                                                  │
│  ✅ Result: 125,000 kWh recorded to KWhReceipt contract        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Operator Allocates to PPA Buyers                       │
│  ─────────────────────────────────────────                      │
│  Day 30: Use Operator Console                                   │
│                                                                  │
│  await ppaClient.allocateProduction({                           │
│    epochId: 202602,                                             │
│    agreementId: 1,        // Company A                          │
│    kWhAmount: 75_000,                                           │
│    expectedTotalGeneration: 125_000                             │
│  })                                                             │
│                                                                  │
│  await ppaClient.allocateProduction({                           │
│    epochId: 202602,                                             │
│    agreementId: 2,        // Company B                          │
│    kWhAmount: 30_000,                                           │
│    expectedTotalGeneration: 125_000                             │
│  })                                                             │
│                                                                  │
│  ✅ Result:                                                     │
│  • Company A: 75,000 kWh @ $0.12 = $9,000                      │
│  • Company B: 30,000 kWh @ $0.10 = $3,000                      │
│  • Remaining: 20,000 kWh → Token holders                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: PPA Contract Calculates Invoices (⚙️ AUTOMATIC)       │
│  ─────────────────────────────────────────────────              │
│  Smart contract automatically computes:                         │
│                                                                  │
│  Company A Invoice:                                             │
│  ├─ kWh: 75,000                                                │
│  ├─ Price: $0.12/kWh (120,000 micro-ALGOs)                    │
│  └─ Total: 9,000,000,000 micro-ALGOs ($9,000)                 │
│                                                                  │
│  Company B Invoice:                                             │
│  ├─ kWh: 30,000                                                │
│  ├─ Price: $0.10/kWh (100,000 micro-ALGOs)                    │
│  └─ Total: 3,000,000,000 micro-ALGOs ($3,000)                 │
│                                                                  │
│  ✅ Result: Invoices ready on blockchain                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Buyer Views Invoice (⚡ BUYER PORTAL)                  │
│  ─────────────────────────────────────────                      │
│  Day 31: Company A logs into Buyer Portal                       │
│  → Open: Buyer Portal URL (or your platform)                    │
│  → Enter wallet address                                         │
│  → Sees invoice:                                                │
│                                                                  │
│  ┌────────────────────────────────────────────┐               │
│  │ 📄 Invoice - February 2026                 │               │
│  │                                             │               │
│  │ kWh Purchased: 75,000 kWh                  │               │
│  │ Price: $0.12/kWh                           │               │
│  │ Total Due: $9,000.00                       │               │
│  │ Due Date: March 15, 2026                   │               │
│  │                                             │               │
│  │        [💳 Pay Now]                        │               │
│  └────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Buyer Pays Invoice (💳 BUYER ACTION)                   │
│  ─────────────────────────────────────────                      │
│  Day 32: Company A clicks "Pay Now"                             │
│  1. Opens Pera Wallet (or Defly, etc.)                         │
│  2. Confirms payment of 9,000 ALGO                             │
│  3. Wallet signs transaction                                    │
│  4. Atomic group transaction:                                   │
│     • Txn 0: Payment (Company A → Treasury, 9,000 ALGO)       │
│     • Txn 1: PPA.settlePayment(agreementId, epochId)          │
│  5. Submitted to blockchain                                     │
│                                                                  │
│  ✅ Result: Payment recorded, invoice marked paid              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: Payment Verification (⚙️ AUTOMATIC)                    │
│  ─────────────────────────────────────────                      │
│  PPA smart contract verifies:                                   │
│  ✅ Payment amount = 9,000 ALGO (exact)                        │
│  ✅ Payment receiver = Project Treasury                        │
│  ✅ Payment sender = Company A (buyer)                         │
│  ✅ Invoice exists and unpaid                                  │
│                                                                  │
│  If all checks pass:                                            │
│  → Marks invoice as PAID                                       │
│  → Records timestamp                                            │
│  → Updates payment history                                      │
│  → Emits payment confirmation event                            │
│                                                                  │
│  ✅ Result: Payment complete, audit trail created              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: Treasury Receives Funds                                │
│  ─────────────────────────────────────────                      │
│  Project treasury balance increases:                            │
│  • Company A: +9,000 ALGO                                       │
│  • Company B: +3,000 ALGO (when they pay)                      │
│  • Total PPA Revenue: 12,000 ALGO                              │
│                                                                  │
│  ✅ Result: Direct revenue to project                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 9: Remaining kWh → Token Holders                          │
│  ─────────────────────────────────────────                      │
│  Day 33: Operator deposits remaining revenue                    │
│  • Remaining kWh: 20,000 kWh (125k - 75k - 30k)                │
│  • Market price: $0.15/kWh                                      │
│  • Revenue: $3,000                                              │
│                                                                  │
│  await revenueVaultClient.depositNetRevenue({                  │
│    epochId: 202602,                                             │
│    netAmount: 3_000_000_000  // micro-ALGOs                    │
│  })                                                             │
│                                                                  │
│  ✅ Result: Token holders can claim their share                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  FINAL RESULT: Complete Revenue Distribution                    │
│  ─────────────────────────────────────────────────              │
│  Total Generation: 125,000 kWh                                  │
│                                                                  │
│  Revenue Split:                                                 │
│  ├─ PPA Sales: 105,000 kWh = $12,000 (80%)                    │
│  │   ├─ Company A: 75,000 kWh @ $0.12 = $9,000               │
│  │   └─ Company B: 30,000 kWh @ $0.10 = $3,000               │
│  │                                                              │
│  └─ Token Holders: 20,000 kWh = $3,000 (20%)                  │
│      └─ Distributed based on kW token ownership                │
│                                                                  │
│  Total Project Revenue: $15,000                                 │
│  ✅ All payments on-chain, transparent, auditable              │
└─────────────────────────────────────────────────────────────────┘
```

## 💡 Key Points for Buyers

### What Buyers See
1. **Transparent Allocation**: Exact kWh purchased each month
2. **Fixed Pricing**: Agreed price per kWh (e.g., $0.12)
3. **Clear Invoices**: Auto-calculated from blockchain data
4. **Simple Payment**: One-click payment via wallet
5. **Instant Confirmation**: Payment recorded on-chain immediately

### Buyer Experience
```
Login → See Invoice → Click Pay → Confirm in Wallet → Done
```

### Benefits for Buyers
- ✅ **Fixed Pricing**: Hedge against energy price volatility
- ✅ **Green Energy**: Direct from renewable source
- ✅ **Transparent**: All data verifiable on blockchain
- ✅ **Simple**: No complex contracts or paperwork
- ✅ **Fast**: Payment settles instantly

## 🔧 Technical Implementation

### For Operators (You)

#### 1. Record Production
```typescript
// Use the UI at: http://localhost:8080 → "📊 Production Recording"
// Or via code:
await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 1,
  kWhAmount: 125_000
})
```

#### 2. Allocate to Buyers
```typescript
// In Operator Console or via code:
await ppaClient.allocateProduction({
  epochId: 202602,
  agreementId: 1,
  kWhAmount: 75_000,
  expectedTotalGeneration: 125_000
})
```

### For Buyers

#### 1. View Invoices
```
Open: Buyer Portal (⚡ PPA Buyer Portal tab)
Enter: Wallet address
See: All invoices for their agreements
```

#### 2. Pay Invoice
```typescript
// Automatic when clicking "Pay Now":
// 1. Wallet app opens
// 2. User confirms payment
// 3. Atomic transaction:
//    - Payment: Buyer → Treasury
//    - Settlement: PPA.settlePayment()
// 4. Done!
```

## 📊 Data Flow

```
KWhReceipt (Production SSOT)
        ↓
   [Total: 125k kWh]
        ↓
PPA Contract (Allocation)
        ↓
   [Company A: 75k]
   [Company B: 30k]
   [Remaining: 20k]
        ↓
    ┌───────┴────────┐
    ↓                ↓
PPA Payments    RevenueVault
(Direct to      (To Token
 Treasury)       Holders)
```

## 🎯 Summary

**The complete flow is:**

1. **You** record production (📊 Production Recording UI)
2. **You** allocate to PPA buyers (Operator Console)
3. **PPA Contract** calculates invoices (automatic)
4. **Buyers** view invoices (⚡ Buyer Portal)
5. **Buyers** pay via wallet (one click)
6. **Payment** verified on-chain (automatic)
7. **Treasury** receives funds (instant)
8. **Remaining** goes to token holders (via existing flow)

Everything is:
- ✅ On-chain (transparent)
- ✅ Automated (smart contracts)
- ✅ Auditable (immutable records)
- ✅ Simple (clean UIs for all parties)

---

**Next Steps:**
1. Try the Buyer Portal: http://localhost:8080 → "⚡ PPA Buyer Portal"
2. Test the complete flow on localnet
3. Deploy to production when ready!
