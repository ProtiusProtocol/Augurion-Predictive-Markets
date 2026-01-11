# Protius V1 Core — Operations Runbook

**Operational guide for running Protius V1 Core on localnet.**

---

## Prerequisites

1. **AlgoKit LocalNet Running**
   ```bash
   algokit localnet start
   ```

2. **Contracts Deployed**
   - ProjectRegistry
   - kWToken  
   - kWhReceipt
   - RevenueVault

3. **Environment Variables Set**
   ```bash
   # Admin/Operator private key
   export OPERATOR_MNEMONIC="your operator mnemonic here"
   
   # Claimant/Token holder private key  
   export CLAIMANT_MNEMONIC="your claimant mnemonic here"
   ```

4. **Project Configuration Updated**
   
   Edit `src/config/project.ts` with deployed app IDs:
   ```typescript
   export const LOCALNET_CONFIG: ProtiusProjectConfig = {
     projectId: 'SOLAR-001',
     registryAppId: 1001n,        // Your deployed ProjectRegistry app ID
     kwTokenAppId: 1002n,          // Your deployed kWToken app ID
     kwhReceiptAppId: 1003n,       // Your deployed kWhReceipt app ID
     revenueVaultAppId: 1004n,     // Your deployed RevenueVault app ID
     treasuryAddress: 'TREASURY_ADDR',
     installedAcKw: 5000n,
   }
   ```

---

## Operations

### Financial Close (One-Time Setup)

**When**: Before first epoch. Required to mint kW tokens.

```bash
# Execute financial close
ts-node scripts/operator/01_financial_close.ts \
  --installedAcKw 5000 \
  --peoFile ./data/peo-fc-approved.json
```

**Expected Output**:
- kW asset created
- kW tokens minted to treasury
- Financial close finalized

---

### Monthly Epoch (Recurring)

**When**: Monthly, after accrual report generation.

**Command**:
```bash
npm run operator:epoch -- \
  --epochId 202501 \
  --netRevenue 1000000 \
  --accrualFile ./accruals/202501.json
```

**Steps Executed**:
1. Create epoch (epochId, startDate, endDate, snapshotId)
2. Snapshot kW token balances
3. Anchor accrual report hash
4. Deposit net revenue (group transaction with ALGO payment)
5. Close epoch
6. Compute entitlements off-chain
7. Anchor entitlements hash
8. Batch set entitlements (one per holder)
9. Settle epoch (mark ready for claims)

**Expected Output**:
```
=== Protius Monthly Epoch Execution ===
Epoch ID: 202501
Net Revenue: 1000000
...
=== Execution Complete ===
Epoch ID: 202501
Entitlements Hash: <hash>
Transactions: 10
  [1] TX123...
  [2] TX456...
  ...
```

**Outputs Written**:
- `./sdk/outputs/entitlements-<epochId>.json` — Computed entitlements
- `./sdk/outputs/settlement-<epochId>.json` — Settlement summary

---

### Claim Revenue (Claimant)

**When**: After epoch settled.

**Command**:
```bash
npm run claimant:claim -- --epochId 202501
```

**Steps Executed**:
1. Query viewClaimable(epochId, claimant)
2. If claimable > 0 AND not already claimed:
   - Execute claim transaction
   - Receive ALGO transfer from vault

**Expected Output**:
```
=== Protius Claim ===
Epoch ID: 202501
Claimant: ADDR123...

Checking claimable amount...
Claimable: 45230

Executing claim...
Claim successful!
Transaction ID: TX789...
Claimed: 45230 microALGOs
```

---

## Verification

**Check epoch state**:
```bash
ts-node scripts/query/epoch_state.ts --epochId 202501
```

**Check holder entitlement**:
```bash
ts-node scripts/query/entitlement.ts \
  --epochId 202501 \
  --holder <ADDRESS>
```

---

## Troubleshooting

**"OPERATOR_MNEMONIC not set"**  
→ Export the operator mnemonic as environment variable.

**"App not found"**  
→ Update `src/config/project.ts` with correct app IDs from deployment.

**"Insufficient balance"**  
→ Ensure operator has ALGO for transaction fees.

**"Epoch already exists"**  
→ Use a different epochId (format: YYYYMM).

**"Not authorized"**  
→ Ensure OPERATOR_MNEMONIC matches the admin set during contract initialization.

---

## Architecture Notes

- **Operator** = Admin account (owns all 4 contracts)
- **Claimant** = Any kW token holder
- **No inner transactions** = All operations use client-orchestrated group txns
- **Off-chain compute** = Entitlements computed in SDK, results anchored on-chain
- **Box storage** = Per-holder entitlements stored in RevenueVault boxes

---

## Script Index

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `scripts/operator/01_financial_close.ts` | Mint kW tokens | One-time |
| `scripts/operator/07_full_epoch.ts` | Monthly distribution | Monthly |
| `scripts/claimant/claim.ts` | Claim revenue | As needed |

---

**Questions?** See `README.md` for architecture overview or `IMPLEMENTATION.md` for technical details.
