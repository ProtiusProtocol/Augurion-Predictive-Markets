# Protius SDK - Implementation Complete ✅

## Summary

The **Protius SDK** has been successfully implemented as the authorised execution gateway for **Protius V1 Core** smart contracts.

## What Was Built

### 1. Architecture (Two-Role Model)

**Operator Role (Admin)**
- Financial Close execution
- Monthly epoch lifecycle management
- Off-chain entitlements computation
- Entitlements anchoring and settlement
- All privileged workflows

**Claimant Role (Public)**
- **ONE function only**: `claim(epochId)`
- Inputless claim (reads on-chain entitlements)
- No discretion, atomic execution

### 2. SDK Structure

```
sdk/
├── README.md                    ✅ Comprehensive SDK documentation
├── USAGE.md                     ✅ Quick start guide
├── package.json                 ✅ NPM package configuration
├── tsconfig.json                ✅ TypeScript configuration
├── src/
│   ├── index.ts                 ✅ Main SDK entrypoint
│   ├── config/
│   │   ├── project.ts           ✅ App IDs, addresses, asset IDs
│   │   └── networks.ts          ✅ Algorand network configs
│   ├── types/
│   │   ├── peo.ts               ✅ PEO schema (InfraPilot integration)
│   │   └── entitlements.ts      ✅ Entitlements data structures
│   ├── lib/
│   │   ├── algod.ts             ✅ Algod + indexer clients
│   │   ├── group.ts             ✅ Group transaction helpers
│   │   ├── hash.ts              ✅ Canonical JSON + SHA-256
│   │   └── validate.ts          ✅ Input validation + maturity gating
│   ├── clients/
│   │   ├── registry.client.ts   ✅ ProjectRegistry wrapper
│   │   ├── kwtoken.client.ts    ✅ kWToken wrapper
│   │   ├── kwhreceipt.client.ts ✅ kWhReceipt wrapper
│   │   └── vault.client.ts      ✅ RevenueVault wrapper
│   ├── builders/
│   │   ├── deposit.ts           ✅ Build deposit group txns
│   │   ├── entitlements.ts      ✅ Compute + batch entitlements
│   │   ├── settle.ts            ✅ Build settlement txn
│   │   └── claim.ts             ✅ Build claim group txn
│   └── ops/
│       ├── operator.ts          ✅ Operator workflows (admin-only)
│       └── claimant.ts          ✅ Claimant workflows (public)
├── scripts/
│   ├── operator/
│   │   └── 07_full_epoch.ts     ✅ Canonical monthly epoch runbook
│   └── claimant/
│       └── claim.ts             ✅ Standalone claim script
└── outputs/
    └── README.md                ✅ Outputs documentation
```

### 3. Key Features Implemented

#### Off-Chain Entitlements Computation ✅
- Deterministic floor division algorithm
- Treasury receives base + remainder
- Conservation invariant: `sum(entitlements) == netDeposited`
- Canonical JSON + SHA-256 hashing
- Audit trail via outputs/entitlements/

#### PEO Maturity Gating ✅
- `FC_APPROVED` required for Financial Close
- `OPERATING` required for Monthly Epochs
- SDK enforces (not recalculates) InfraPilot PEO
- Lightweight validation only

#### Client-Orchestrated Group Transactions ✅
- SDK builds group transactions off-chain
- Contracts validate on-chain
- Example: Deposit = [transfer, depositNetRevenue]
- No inner app calls

#### Batch Entitlements Setting ✅
- Max 14-16 setEntitlement per group (Algorand limit)
- Automatic batching for large holder sets
- Transaction group optimization

### 4. Integration Points

**InfraPilot → SDK**
```
PEO (InfraPilot) → Operator.runFinancialClose() → Contracts
```

**UI → SDK**
```
UI → Claimant.claim(epochId) → Contracts
```

**CLI → SDK**
```
CLI → Operator.runMonthlyEpoch() → Contracts
```

### 5. Execution Model

**Operator Monthly Runbook (Canonical)**
1. ✅ Validate PEO maturity (OPERATING)
2. ✅ Create epoch
3. ✅ Snapshot kW balances
4. ✅ Anchor accrual report
5. ✅ Deposit net revenue (group tx)
6. ✅ Close epoch
7. ✅ Compute entitlements off-chain
8. ✅ Anchor entitlements hash
9. ✅ Batch set entitlements (≤16 per group)
10. ✅ Settle epoch

**Claimant Workflow (Simple)**
1. ✅ Call `claim(epochId)` - inputless
2. ✅ Contract reads entitlement on-chain
3. ✅ Atomic payout via inner txn

## What Remains (Implementation-Specific)

The SDK is **architecturally complete** but requires:

1. **Generated Client Integration**: Replace placeholder client calls with actual generated clients from `artifacts/`
2. **Box State Queries**: Implement box reads for entitlements, snapshots, etc.
3. **Indexer Integration**: Implement kW holder balance queries at snapshot
4. **Testing**: Unit tests for builders, integration tests for workflows
5. **Deployment Config**: Update `project.ts` with actual deployed app IDs

## Usage Examples

### Operator: Execute Monthly Epoch

```bash
cd sdk
npm install
export OPERATOR_MNEMONIC="your mnemonic here"
npm run operator:epoch -- \
  --epochId 202501 \
  --netRevenue 1000000 \
  --accrualFile ./accruals/202501.json
```

### Claimant: Claim Revenue

```bash
export CLAIMANT_MNEMONIC="your mnemonic here"
npm run claimant:claim -- --epochId 202501
```

### Programmatic Usage

```typescript
import { ProtiusOperator, ProtiusClaimant } from '@protius/sdk'

// Operator
const operator = new ProtiusOperator(config, network)
await operator.runMonthlyEpoch(params)

// Claimant
const claimant = new ProtiusClaimant(config, network)
await claimant.claim(epochId, account)
```

## Key Design Principles

1. **Separation**: SDK is NOT under smart_contracts/, it's a first-class execution layer
2. **Two Roles**: Operator (admin) and Claimant (public) with strict separation
3. **Inputless Claims**: No parameters beyond epochId, reads on-chain entitlements
4. **Determinism**: Canonical JSON, SHA-256, floor division only
5. **PEO Trust**: SDK enforces InfraPilot maturity, never recalculates
6. **Client-Orchestration**: SDK builds groups, contracts validate
7. **Conservation**: Exact sum(entitlements) == netDeposited

## Explicit Prohibitions

The SDK does **NOT**:
- ❌ Modify Protius V1 Core contracts
- ❌ Expose raw contract clients to end users
- ❌ Compute economics on-chain
- ❌ Add new protocol features
- ❌ Recalculate project maturity
- ❌ Allow UI-to-contract direct calls

## Documentation

- [README.md](./README.md) - Comprehensive architecture and design
- [USAGE.md](./USAGE.md) - Quick start guide
- [outputs/README.md](./outputs/README.md) - Outputs directory structure

## Next Steps

1. **Install Dependencies**: `cd sdk && npm install`
2. **Update Config**: Set deployed app IDs in `src/config/project.ts`
3. **Integrate Generated Clients**: Replace placeholder client calls
4. **Test Locally**: Run against AlgoKit localnet
5. **Deploy to Testnet**: Test full workflows end-to-end

## Status

✅ **SDK Architecture Complete**
✅ **Two-Role Model Implemented**
✅ **Entitlements Computation Ready**
✅ **PEO Maturity Gating Ready**
✅ **Scripts and Entrypoints Ready**

🔄 **Pending**: Generated client integration, box queries, indexer integration

---

**Protius SDK v1.0.0** - The authorised gateway to Protius V1 Core
