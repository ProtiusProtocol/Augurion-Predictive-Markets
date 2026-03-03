# TestNet Deployment Guide — Protius Smart Contracts

**Created:** February 21, 2026  
**Project:** hello-world-contracts (Augurion-Predictive-Markets)  
**Status:** ❌ NOT YET DEPLOYED — Ready for deployment

---

## Table of Contents

1. [Current Status](#current-status)
2. [Deployment Architecture](#deployment-architecture)
3. [Prerequisites](#prerequisites)
4. [Deployment Order](#deployment-order)
5. [Step-by-Step Instructions](#step-by-step-instructions)
6. [Vercel Environment Configuration](#vercel-environment-configuration)
7. [Verification & Testing](#verification--testing)
8. [TestNet Explorer Links](#testnet-explorer-links)

---

## Current Status

### Deployment Summary

| Item | Status |
|------|--------|
| Deploy scripts | ✅ Present (5 contracts ready) |
| TestNet App IDs | ❌ Missing |
| `.env.testnet` | ❌ Not created |
| AlgoKit config | ✅ Configured in `.algokit.toml` |
| Deployer setup | ❌ Requires manual setup |

### What Exists

- **5 Smart Contracts** ready to deploy:
  - ProjectRegistry
  - KWToken (Equity staking)
  - kWhReceipt (Production tracking)
  - RevenueVault (Settlement)
  - PPA Contract (Buyer portal)

- **Deployment Scripts**: Each contract has its own `deploy-config.ts`
- **AlgoKit Integration**: Full support for multi-network deployment
- **Frontend**: Already deployed to Vercel (https://web-psi-wheat-78.vercel.app), currently hardcoded for LocalNet

### What's Missing

- TestNet deployment execution (not yet run)
- `.env.testnet` file with deployer credentials
- TestNet App IDs in Vercel environment variables

---

## Deployment Architecture

### Key Files

| File | Purpose |
|------|---------|
| `smart_contracts/index.ts` | Entry point; auto-discovers & executes all `deploy-config.ts` files |
| `smart_contracts/kw_token/deploy-config.ts` | Deploy script for KWToken |
| `smart_contracts/project_registry/deploy-config.ts` | Deploy script for ProjectRegistry |
| `smart_contracts/kwh_receipt/deploy-config.ts` | Deploy script for kWhReceipt |
| `smart_contracts/revenue_vault/deploy-config.ts` | Deploy script for RevenueVault |
| `smart_contracts/ppa_contract/deploy-config.ts` | Deploy script for PPA Contract |
| `package.json` | Contains `deploy:ci` script |
| `.algokit.toml` | AlgoKit configuration with TestNet settings |

### Deployment Method

```bash
# Load TestNet environment and deploy
npm run deploy:ci [optional-contract-name]

# Examples:
npm run deploy:ci                  # Deploy all contracts
npm run deploy:ci project_registry # Deploy only ProjectRegistry
npm run deploy:ci kw_token         # Deploy only KWToken
```

**Behind the scenes:**
- `npm run deploy:ci` runs: `ts-node --transpile-only -r dotenv/config smart_contracts/index.ts`
- Loads `.env.testnet` file automatically via `-r dotenv/config`
- Uses `AlgorandClient.fromEnvironment()` to connect to TestNet
- Uses `DEPLOYER_MNEMONIC` from environment to derive deployer account

---

## Prerequisites

### 1. Testnet ALGO Funding
- **Get free ALGO**: https://dispenser.algorand.org/
- **Amount needed**: Minimum ~5 ALGO per contract (~25–30 ALGO total recommended)

### 2. Deployer Account Setup
- Create a **new TestNet-only account** (do NOT use production/mainnet accounts)
- **Get the 25-word mnemonic** from your wallet
- **Fund it** with TestNet ALGO from the dispenser

### 3. Software Requirements
- **Node.js**: v22.0+ (check: `node --version`)
- **npm**: v9.0+ (check: `npm --version`)
- **AlgoKit CLI**: v2.6.0+ (check: `algokit --version`)

### 4. Verify Prerequisites

```powershell
# Check Node.js
node --version
# Expected: v22.x.x or higher

# Check npm
npm --version
# Expected: v9.x.x or higher

# Check AlgoKit
algokit --version
# Expected: 2.6.0 or higher

# If missing, install:
# AlgoKit: https://github.com/algorandfoundation/algokit-cli
```

---

## Deployment Order

### Dependency Chain

```
ProjectRegistry (base; no dependencies)
    ↓
KWToken (depends on ProjectRegistry for config SSOT)
    ↓
kWhReceipt (depends on ProjectRegistry)
    ↓
RevenueVault (depends on all above for settlement)
    ↓
PPA Contract (market contracts; can deploy after ProjectRegistry)
```

### Why This Order?

1. **ProjectRegistry first**: It's the single source of truth (SSOT) for platform configuration
2. **KWToken, kWhReceipt second**: Both reference ProjectRegistry for operational parameters
3. **RevenueVault third**: Needs all other app IDs to initialize settlement logic
4. **PPA Contract last**: Independent but can reference others after they're deployed

---

## Step-by-Step Instructions

### Step 1: Create `.env.testnet` File

Navigate to the project root (parent of `smart_contracts/`) and create `.env.testnet`:

**File path**: `projects/hello-world-contracts/.env.testnet`

**Content:**
```env
# Algorand TestNet Configuration
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_PORT=443
ALGOD_TOKEN=
INDEXER_SERVER=https://testnet-idx.algonode.cloud
INDEXER_PORT=443
INDEXER_TOKEN=

# Deployer Account (TestNet mnemonic)
DEPLOYER_MNEMONIC="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24 word25"
```

**Critical Notes:**
- Replace the mnemonic with your actual TestNet account's 25-word seed phrase
- Account must have at least 25 ALGO balance
- **DO NOT commit** this file (already in `.gitignore`)
- Keep this file **local only**

### Step 2: Deploy ProjectRegistry

```powershell
# Navigate to smart_contracts directory
cd projects/hello-world-contracts/smart_contracts

# Set environment to use .env.testnet
$env:DOTENV_CONFIG_PATH = "../.env.testnet"

# Deploy ONLY ProjectRegistry (must be first)
npm run deploy:ci project_registry
```

**Expected Output:**
```
=== Deploying ProjectRegistry ===
Deployer: [your-testnet-address]
Deploying contract...
✅ Operation: create
✅ Funded app with 5 ALGO

🎉 ProjectRegistry App ID: 1234567
   App Address: ABC...XYZ
```

**⚠️ IMPORTANT**: Save the App ID (e.g., `1234567`). This is your `VITE_PROJECT_REGISTRY_APP_ID`.

### Step 3: Deploy KWToken

```powershell
npm run deploy:ci kw_token
```

**Expected Output:**
```
=== Deploying kW Token ===
Note: Ensure ProjectRegistry is deployed first
Deploying contract...
✅ Operation: create
✅ Funded kW Token app 1234568 with 10 ALGO

kW Token deployed with App ID: 1234568
```

**Save**: `1234568` as `VITE_KW_TOKEN_APP_ID`.

### Step 4: Deploy kWhReceipt

```powershell
npm run deploy:ci kwh_receipt
```

**Expected Output:**
```
=== Deploying kWh Receipt ===
Deploying contract...
✅ Funded kWh Receipt app 1234569 with 10 ALGO

kWh Receipt deployed with App ID: 1234569
```

**Save**: `1234569` as `VITE_KWH_RECEIPT_APP_ID`.

### Step 5: Deploy RevenueVault

```powershell
npm run deploy:ci revenue_vault
```

**Expected Output:**
```
=== Deploying RevenueVault ===
Deploying contract...
✅ Funded RevenueVault app 1234570 with 10 ALGO

RevenueVault deployed with App ID: 1234570
```

**Save**: `1234570` as `VITE_REVENUE_VAULT_APP_ID`.

### Step 6: Deploy PPA Contract

```powershell
npm run deploy:ci ppa_contract
```

**Expected Output:**
```
Deploying PPA Contract...
Deployer: [your-address]
✅ PPA Contract deployed!
App ID: 1234571
App Address: [appAddress]
```

**Save**: `1234571` as `VITE_PPA_CONTRACT_APP_ID`.

---

## Vercel Environment Configuration

### Step 1: Collect All App IDs

After all 5 contracts are deployed, you should have:

| Variable | Value (Example) |
|----------|---|
| `VITE_PROJECT_REGISTRY_APP_ID` | `1234567` |
| `VITE_KW_TOKEN_APP_ID` | `1234568` |
| `VITE_KWH_RECEIPT_APP_ID` | `1234569` |
| `VITE_REVENUE_VAULT_APP_ID` | `1234570` |
| `VITE_PPA_CONTRACT_APP_ID` | `1234571` |

### Step 2: Set Vercel Environment Variables

1. **Open Vercel Dashboard**: https://vercel.com
2. **Select Project**: `web` (https://vercel.com/giorgio-mauros-projects/web)
3. **Go to**: Settings → Environment Variables
4. **Add these variables** (for Production environment):

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_ALGOD_SERVER` | `https://testnet-api.algonode.cloud` | TestNet endpoint |
| `VITE_ALGOD_PORT` | (leave blank) | Uses 443 default for HTTPS |
| `VITE_ALGOD_TOKEN` | (leave blank) | Public endpoint (no token needed) |
| `VITE_PROJECT_REGISTRY_APP_ID` | `1234567` | From Step 2 |
| `VITE_KW_TOKEN_APP_ID` | `1234568` | From Step 3 |
| `VITE_KWH_RECEIPT_APP_ID` | `1234569` | From Step 4 |
| `VITE_REVENUE_VAULT_APP_ID` | `1234570` | From Step 5 |
| `VITE_PPA_CONTRACT_APP_ID` | `1234571` | From Step 6 |

### Step 3: Redeploy on Vercel

After saving environment variables, trigger a redeployment:

```powershell
cd projects/hello-world-contracts/smart_contracts/web

# Redeploy to production with new env vars
vercel --prod
```

**Expected Output:**
```
✨ Preview: https://web-??????-???.vercel.app [?]
✅ Production: https://web-psi-wheat-78.vercel.app
```

The frontend will now connect to TestNet with your deployed contracts.

---

## Verification & Testing

### Test 1: Verify Contracts Deployed

Visit AlgoExplorer and confirm app state exists:

```
ProjectRegistry:   https://testnet.explorer.perawallet.app/application/1234567
KWToken:           https://testnet.explorer.perawallet.app/application/1234568
kWhReceipt:        https://testnet.explorer.perawallet.app/application/1234569
RevenueVault:      https://testnet.explorer.perawallet.app/application/1234570
PPA Contract:      https://testnet.explorer.perawallet.app/application/1234571
```

**Expected:**
- Each page shows "Created by [your-deployer-address]"
- Global state is visible
- App address is shown

### Test 2: Verify Frontend Connects

1. **Open**: https://web-psi-wheat-78.vercel.app/invest
2. **Click**: "Connect Wallet" (top right)
3. **Select**: Pera Wallet
4. **Choose**: TestNet network
5. **Expected**: Should load project info, NOT show network error

**Success Indicators:**
- ✅ Pera Wallet connection succeeds
- ✅ ProjectRegistry data loads (project name, treasury, etc.)
- ✅ KWToken balance displayed
- ✅ No "Cannot reach http://127.0.0.1:4001" errors

### Test 3: Test Transaction Flow

1. **Connect** wallet with TestNet ALGO
2. **Enter** investment amount (e.g., 10 ALGO)
3. **Click**: "Execute Investment"
4. **Sign** transaction in Pera Wallet
5. **Expected**: Transaction succeeds, kW tokens issued

---

## TestNet Explorer Links

### Template Format

```
https://testnet.explorer.perawallet.app/application/{APP_ID}
```

### Your Deployed Contracts (after deployment)

| Contract | Explorer Link |
|----------|---|
| **ProjectRegistry** | `https://testnet.explorer.perawallet.app/application/1234567` |
| **KWToken** | `https://testnet.explorer.perawallet.app/application/1234568` |
| **kWhReceipt** | `https://testnet.explorer.perawallet.app/application/1234569` |
| **RevenueVault** | `https://testnet.explorer.perawallet.app/application/1234570` |
| **PPA Contract** | `https://testnet.explorer.perawallet.app/application/1234571` |

Replace the numbers with your actual App IDs.

---

## Troubleshooting

### Error: "Cannot find module 'dotenv'"

**Cause**: dotenv package not installed

**Fix**:
```powershell
npm install
```

### Error: "DEPLOYER_MNEMONIC not found"

**Cause**: `.env.testnet` file missing or not in correct location

**Fix**:
1. Verify `.env.testnet` exists in `projects/hello-world-contracts/`
2. Verify `DEPLOYER_MNEMONIC=...` is set
3. Verify the full 25-word mnemonic is present

### Error: "Insufficient funds"

**Cause**: Deployer account has less than 5 ALGO

**Fix**:
1. Go to: https://dispenser.algorand.org/
2. Enter your deployer address
3. Request more TestNet ALGO
4. Wait for confirmation (~30 seconds)
5. Retry deployment

### Error: "App already exists"

**Cause**: Contract already deployed with this name

**Fix**:
```powershell
# Deploy with replace mode (overwrites existing)
npm run deploy:ci [contract-name]

# Output will show: ✅ Operation: replace
```

---

## Quick Reference Commands

### All Deployments at Once

```powershell
cd projects/hello-world-contracts/smart_contracts
$env:DOTENV_CONFIG_PATH = "../.env.testnet"
npm run deploy:ci
```

This deploys **all 5 contracts** in order (registry → kw_token → kwh_receipt → revenue_vault → ppa_contract).

### Deploy Single Contract

```powershell
npm run deploy:ci project_registry
npm run deploy:ci kw_token
npm run deploy:ci kwh_receipt
npm run deploy:ci revenue_vault
npm run deploy:ci ppa_contract
```

### Check AlgoKit Version

```powershell
algokit --version
```

### View Current Environment

```powershell
# Windows PowerShell only (Linux/Mac use `env` or `printenv`)
Get-ChildItem Env:
```

---

## Summary Checklist

- [ ] Created `.env.testnet` with deployer mnemonic
- [ ] Verified deployer account has 25+ ALGO
- [ ] Deployed ProjectRegistry (saved App ID)
- [ ] Deployed KWToken (saved App ID)
- [ ] Deployed kWhReceipt (saved App ID)
- [ ] Deployed RevenueVault (saved App ID)
- [ ] Deployed PPA Contract (saved App ID)
- [ ] Set all 5 + 3 env vars on Vercel
- [ ] Ran `vercel --prod` to redeploy frontend
- [ ] Verified contracts on AlgoExplorer
- [ ] Tested wallet connection on Vercel
- [ ] Tested investment transaction flow

---

## Next Steps

1. **Fund TestNet Account**: Get 25+ ALGO from dispenser
2. **Create `.env.testnet`**: Add your mnemonic
3. **Deploy Contracts**: Follow Step 2-6 above
4. **Configure Vercel**: Add environment variables
5. **Test Frontend**: Verify Vercel connects to TestNet
6. **Monitor on AlgoExplorer**: Watch transaction confirmations

---

**Document**: TESTNET_DEPLOYMENT_GUIDE.md  
**Last Updated**: February 21, 2026  
**Status**: Ready for deployment  
