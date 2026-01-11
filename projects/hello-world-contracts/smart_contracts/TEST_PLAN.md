# Protius V1 Core — End-to-End Test Plan

## Overview

This document outlines how to test Protius V1 Core contracts (ProjectRegistry, kWToken, kWhReceipt, RevenueVault) and the SDK operational workflows on localnet.

**Test Duration:** ~15 minutes  
**Environment:** LocalNet (AlgoKit)  
**Prerequisites:** Docker, AlgoKit CLI

---

## Phase 1: Environment Setup (5 minutes)

### 1.1 Start LocalNet

```bash
algokit localnet start
```

**Expected Output:**
```
✅ Localnet started
algod running: http://localhost:4001
kmd running: http://localhost:4002
```

**Verify Status:**
```bash
curl -s http://localhost:4001/health | jq .
```

### 1.2 Create Deployer Account

```bash
algokit project run deploy
```

This will use the `DEPLOYER_MNEMONIC` environment variable or generate a new account.

**Set Environment:**
```bash
export DEPLOYER_MNEMONIC="your-mnemonic-here"
export OPERATOR_MNEMONIC="operator-mnemonic-here"
export CLAIMANT_MNEMONIC="claimant-mnemonic-here"
```

### 1.3 Fund Accounts (via KMD)

```bash
# Fund deployer (if not already funded)
algokit localnet console

# Inside console:
accounts = get_accounts()
transfer(accounts[0], "deployer-address", 100 * 1000000)  # 100 ALGO
transfer(accounts[0], "operator-address", 10 * 1000000)   # 10 ALGO
transfer(accounts[0], "claimant-address", 5 * 1000000)    # 5 ALGO
```

---

## Phase 2: Deploy Protius V1 Core Contracts (5 minutes)

Deploy in this order (contracts have dependencies):

### 2.1 Deploy ProjectRegistry

```bash
cd smart_contracts
npx ts-node index.ts project_registry
```

**Expected Output:**
```
=== Deploying ProjectRegistry ===
...
ProjectRegistry App ID: 1001
Funded app 1001 with 5 ALGO
```

**Save App ID:** `export REGISTRY_ID=1001`

### 2.2 Deploy kW Token

```bash
npx ts-node index.ts kw_token
```

**Expected Output:**
```
=== Deploying kW Token ===
...
kW Token App ID: 1002
Funded app 1002 with 5 ALGO
```

**Save App ID:** `export KW_TOKEN_ID=1002`

### 2.3 Deploy kWh Receipt

```bash
npx ts-node index.ts kwh_receipt
```

**Expected Output:**
```
=== Deploying kWh Receipt ===
...
kWh Receipt App ID: 1003
Funded app 1003 with 10 ALGO
```

**Save App ID:** `export KWH_RECEIPT_ID=1003`

### 2.4 Deploy RevenueVault

```bash
npx ts-node index.ts revenue_vault
```

**Expected Output:**
```
=== Deploying RevenueVault ===
...
RevenueVault App ID: 1004
Funded app 1004 with 10 ALGO
```

**Save App ID:** `export VAULT_ID=1004`

---

## Phase 3: Initialize Contracts (2 minutes)

### 3.1 Update `sdk/src/config/project.ts`

```typescript
export const LOCALNET_CONFIG: ProtiusProjectConfig = {
  projectId: 'TestProject',
  registryAppId: 1001n,           // Use actual IDs from deployment
  kwTokenAppId: 1002n,
  kwhReceiptAppId: 1003n,
  revenueVaultAppId: 1004n,
  installedAcKw: 5000n,
  treasuryAddress: 'treasury-address',
  platformKwhRateBps: 500n,       // 5%
}
```

### 3.2 Initialize ProjectRegistry

```bash
cd sdk
npx ts-node -e "
import { RegistryClient } from './src/clients/registry.client.ts'
// Initialize registry
"
```

---

## Phase 4: Test Operator Workflow (2 minutes)

### 4.1 Create Monthly Epoch

```bash
npm run operator:epoch -- \
  --epochId 202501 \
  --netRevenue 1000000 \
  --accrualFile ./outputs/accrual_202501.json
```

**Expected Output:**
```
=== Protius Monthly Epoch Execution ===
Epoch ID: 202501
Net Revenue: 1000000
...
=== Execution Complete ===
Epoch ID: 202501
Transactions: 8
  [1] TXID001
  [2] TXID002
  ...
```

### 4.2 Verify Epoch State

```bash
# View epoch state (future enhancement)
algokit localnet console
app_state = get_app_global_state(1004)
print(app_state['epoch_202501_status'])
```

---

## Phase 5: Test Claimant Workflow (1 minute)

### 5.1 Claim Revenue

```bash
npm run claimant:claim -- --epochId 202501
```

**Expected Output:**
```
=== Protius Claim ===
Epoch ID: 202501
Claimant: claimant-address
...
Claimable: 50000000
Claim successful
Transaction ID: CLAIMTXID
```

### 5.2 Verify Funds Received

```bash
# Check claimant balance
algokit localnet console
balance = get_account_info('claimant-address')
print(f"ALGO balance: {balance['amount']} microALGOs")
```

---

## Phase 6: Validation Checklist

- [ ] All 4 contracts deployed successfully
- [ ] Contract app IDs saved and configured in SDK
- [ ] Operator epoch execution completed with 8+ transactions
- [ ] Epoch marked as settled with entitlements anchored
- [ ] Claimant claim executed without errors
- [ ] Claimant received distributed amount
- [ ] No rejection errors in transaction logs

---

## Troubleshooting

### Localnet Not Running

```bash
algokit localnet status
algokit localnet start
```

### Account Not Funded

```bash
# Fund via KMD
algokit localnet fund <address> 100
```

### Contract Deployment Fails

```bash
# Ensure environment variables set
echo $DEPLOYER_MNEMONIC

# Rebuild artifacts
cd smart_contracts
npm run build
```

### SDK Script Errors

```bash
# Check config matches deployed app IDs
cat sdk/src/config/project.ts

# Verify SDK dependencies
cd sdk
npm install
npm run build
```

---

## Expected Final State

**After successful test:**

1. ✅ 4 Protius V1 Core contracts running on localnet
2. ✅ Admin executed one complete monthly epoch (201 operations)
3. ✅ Claimant claimed their distribution
4. ✅ All transactions atomic and confirmed
5. ✅ No assertion failures or runtime errors

---

## Next Steps

- [ ] Run integration tests (vitest)
- [ ] Deploy to testnet
- [ ] Load real production parameters (PEO, accrual data)
- [ ] Performance testing under load
