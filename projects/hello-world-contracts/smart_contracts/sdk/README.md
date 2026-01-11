# Protius SDK

**The authorised execution gateway for Protius V1 Core**

## Architecture

The Protius SDK is the **only** entry point into Protius V1 Core smart contracts. It enforces two distinct roles with strict separation of concerns:

### Operator Role (Admin)

**Primary SDK user.** Executes all privileged workflows:

- ✅ Financial Close execution
- ✅ Monthly epoch lifecycle management
- ✅ Accrual report anchoring
- ✅ Net revenue deposits
- ✅ Off-chain entitlements computation
- ✅ Entitlements hash anchoring and batch setting
- ✅ Epoch settlement

**Access Control**: Requires admin private key

**Execution Environment**: Controlled operator environment (AlgoKit container, CLI, InfraPilot integration)

### Claimant Role (Public)

**Limited SDK user.** Exposed to **one action only**:

```typescript
claim(epochId: bigint)
```

**Constraints**:
- ❌ No parameters beyond `epochId`
- ❌ No balance inputs
- ❌ No discretion
- ✅ Reads immutable on-chain entitlements
- ✅ Executes atomic claim + payout

**Access Control**: Any kW token holder with entitlement

---

## Execution Model

### Client-Orchestrated Group Transactions

Protius V1 Core uses **client-orchestrated group transactions**, NOT inner app calls.

**What this means**:
1. SDK queries contract state off-chain
2. SDK constructs group transactions with validated inputs
3. SDK submits atomic transaction groups
4. Contracts verify inputs on-chain

**Example: Deposit Net Revenue**

```typescript
// Group Transaction:
// [0] Asset/ALGO transfer (depositor → vault, amount = netRevenue)
// [1] RevenueVault.depositNetRevenue(epochId, amount)
//
// SDK orchestrates. Contracts validate.
```

---

## Project Structure

```
/sdk
  README.md                  ← You are here
  src/
    index.ts                 ← SDK entrypoint (exports Operator + Claimant APIs)
    config/
      project.ts             ← App IDs, addresses, asset IDs
      networks.ts            ← Algorand network configs
    types/
      peo.ts                 ← PEO schema (InfraPilot contract)
      entitlements.ts        ← Entitlements data structures
    lib/
      algod.ts               ← Algod + indexer clients
      group.ts               ← Group transaction helpers
      hash.ts                ← Canonical JSON + SHA-256
      validate.ts            ← Input validation
    clients/
      registry.client.ts     ← ProjectRegistry wrapper
      kwtoken.client.ts      ← kWToken wrapper
      kwhreceipt.client.ts   ← kWhReceipt wrapper
      vault.client.ts        ← RevenueVault wrapper
    builders/
      deposit.ts             ← Build deposit group txns
      entitlements.ts        ← Compute + batch entitlements
      settle.ts              ← Build settlement txn
      claim.ts               ← Build claim group txn
    ops/
      operator.ts            ← Operator workflows (admin-only)
      claimant.ts            ← Claimant workflows (public)
  scripts/
    operator/
      07_full_epoch.ts       ← Canonical monthly epoch runbook
    claimant/
      claim.ts               ← Standalone claim script
  outputs/
    entitlements/            ← Off-chain computation outputs
    accruals/                ← Accrual report artifacts
```

---

## Usage

### Operator Workflows

```typescript
import { ProtiusOperator } from './src/ops/operator'

const operator = new ProtiusOperator(config)

// Execute Financial Close
await operator.runFinancialClose(peo)

// Monthly epoch execution
await operator.runMonthlyEpoch({
  epochId: 202501n,
  accrualReport: reportData,
  netRevenue: 100000n,
})
```

### Claimant Workflow

```typescript
import { ProtiusClaimant } from './src/ops/claimant'

const claimant = new ProtiusClaimant(config)

// Claim distributable revenue (inputless)
const result = await claimant.claim(202501n)
```

---

## Maturity Gating

The SDK enforces **InfraPilot-determined** project maturity. It does NOT recalculate or rescore projects.

| SDK Action | Required PEO Maturity | Enforcement |
|------------|----------------------|-------------|
| Financial Close | `FC_APPROVED` | Assert PEO stage before execution |
| Monthly Epoch | `OPERATING` | Assert PEO stage before execution |
| Claim | N/A | Verify epoch state = `SETTLED` on-chain |

**Rationale**: InfraPilot is the SSOT for project maturity. SDK trusts and enforces, never recomputes.

---

## Entitlements Computation

All entitlements are computed **off-chain** by the SDK Operator.

### Algorithm (Deterministic)

```
Given:
  netDeposited (R)
  platformKwhRateBps (alpha)
  kW holder set with balances at snapshotId

Compute:
  treasuryBase = floor(R * alpha / 10000)
  remainingForKw = R - treasuryBase
  
  For each holder H:
    baseShare[H] = floor(remainingForKw * holderKw[H] / totalKw)
  
  remainder = R - treasuryBase - sum(all baseShares)
  
  entitlements[Treasury] = baseShare[Treasury] + treasuryBase + remainder
  entitlements[Others] = baseShare[Others]
  
Assert:
  sum(all entitlements) == R exactly
```

### Outputs

- Canonical JSON (sorted keys, stable)
- SHA-256 hash
- Written to `/sdk/outputs/entitlements/{epochId}.json`

---

## Explicit Prohibitions

**The SDK does NOT**:
- ❌ Modify Protius V1 Core contracts
- ❌ Expose raw contract clients to end users
- ❌ Compute economics on-chain
- ❌ Add new protocol features
- ❌ Recalculate project maturity
- ❌ Allow UI-to-contract direct calls

**The SDK IS**:
- ✅ The only execution gateway
- ✅ Operator-first, claimant-second
- ✅ Deterministic and auditable
- ✅ Compatible with InfraPilot PEO
- ✅ AlgoKit container-native

---

## Integration Points

### InfraPilot → SDK

InfraPilot PEO output feeds SDK Operator workflows:

```
PEO (InfraPilot) → Operator.runFinancialClose() → Contracts
```

### UI → SDK

UIs call SDK, never contracts directly:

```
UI → Claimant.claim(epochId) → Contracts
```

### CLI → SDK

Operator scripts invoke SDK programmatically:

```
CLI → Operator.runMonthlyEpoch() → Contracts
```

---

## Development

### Build

```bash
npm run build
```

### Run Operator Script

```bash
npm run operator:epoch
```

### Run Claimant Script

```bash
npm run claimant:claim -- --epochId 202501
```

---

## Support

For SDK integration questions, contact the Protius engineering team.

**Protius V1 Core Contracts**: Frozen and versioned. See `/smart_contracts` for contract source.
