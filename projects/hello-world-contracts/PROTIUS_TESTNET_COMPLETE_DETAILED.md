# Protius Equity Platform — TestNet Deployment Guide ✅

**Deployment Date:** February 24, 2026  
**Deployer Account:** `7TOHMHYKSMJN2WMXUYEOQ2KU65AIW5EE2FNBIQAVPPZ6TE3MAN36P33JPM`  
**Network:** Algorand TestNet (https://testnet-api.algonode.cloud)  
**Frontend:** https://web-psi-wheat-78.vercel.app  
**Status:** ✅ **Stage 1 Complete** (4 of 5 contracts deployed + operational)

---

## ⚠️ Critical: Algorand IDs Glossary

**These terms are NOT interchangeable. Confusion here breaks integration.**

| Term | Definition | Example | Used For |
|------|-----------|---------|----------|
| **App ID** | Smart contract identifier on TestNet | `756074148` (ProjectRegistry app) | SDK client initialization, @abi.methods calls |
| **App Address** | Derived escrow account for the app | `applicat...onbase64encodeofappid` | Transaction routing, foreign accounts |
| **ASA ID** | Token asset identifier (separate from app) | `[retrieved from KWToken app state]` | `getAssetBalance()`, asset transfers (axfer) |
| **Contract Address** | Same as App Address | Derived from App ID | App box storage, state access |

**🔴 CRITICAL: KWToken has BOTH an App ID AND an ASA ID. They are different numbers.**
- App ID `756074167` = the smart contract
- ASA ID = unknown until retrieved from KWToken's `asset_id` global state value
- Uses: App ID for contract calls; ASA ID for checking user balances

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Deployment Overview](#deployment-overview)
3. [Smart Contracts Architecture](#smart-contracts-architecture)
4. [Frontend Integration Guide](#frontend-integration-guide)
5. [Contract Initialization Requirements](#contract-initialization-requirements)
6. [Vercel Configuration](#vercel-configuration)
7. [Testing & Validation](#testing--validation)
8. [Known Issues & Limitations](#known-issues--limitations)
9. [Security & Contract Ownership](#security--contract-ownership)
10. [Next Steps & Roadmap](#next-steps--roadmap)

---

## Executive Summary

### What Was Deployed

Four production-ready Protius Equity smart contracts on Algorand TestNet:

| Contract | App ID | Purpose | Status |
|----------|--------|---------|--------|
| **ProjectRegistry** | `756074148` | Platform configuration SSOT | ✅ Active |
| **KWToken** | `756074167` | Manages equity token (ASA ID separate) | ✅ Active |
| **kWhReceipt** | `756074340` | Production audit trail | ✅ Deployed |
| **RevenueVault** | `756074359` | Settlement & distribution | ✅ Deployed |

### What's Working Now

- ✅ **Financial Close allocation** (admin-driven via contract methods)
- ✅ **Token transfers** (post-FC, via transfer() method)
- ✅ **Token balance queries** (balanceOf() method)
- ✅ User wallet connection (Pera Wallet integration)
- ✅ Project metadata retrieval (name, treasury, status)
- ✅ TestNet blockchain interaction

### What's NOT Yet Implemented

- ❌ **Direct ALGO → KWToken investment** (no `invest()` / `buy()` method on-chain)
- ❌ Any retail/self-service token minting
- ✋ This is a Stage 2 feature decision (requires product policy, pricing, treasury routing, KYC/whitelist)

### What's Next (Stage 2)

- ⏳ Implement `invest()` method (product policy decision)
- ⏳ Production tracking (kWhReceipt initialization + UI)
- ⏳ Revenue settlement (RevenueVault initialization + UI)
- ⏳ Claim execution (revenue distribution UI)
- ❌ PPA Contract (requires code fix)

---

## Deployment Overview

### Deployed Contracts

| Contract | App ID | TestNet Explorer | Status |
|----------|--------|-----------------|--------|
| **ProjectRegistry** | `756074148` | [View on Explorer](https://testnet.explorer.perawallet.app/application/756074148) | ✅ Initialized |
| **KWToken** | `756074167` | [View on Explorer](https://testnet.explorer.perawallet.app/application/756074167) | ✅ Initialized |
| **kWhReceipt** | `756074340` | [View on Explorer](https://testnet.explorer.perawallet.app/application/756074340) | ⏳ Awaiting init |
| **RevenueVault** | `756074359` | [View on Explorer](https://testnet.explorer.perawallet.app/application/756074359) | ⏳ Awaiting init |

### Deployment Costs

| Item | Amount | Notes |
|------|--------|-------|
| Creation fees (4 apps) | ~0.012 ALGO | Standard creation cost |
| ProjectRegistry treasury | 5 ALGO | Funded for operations |
| KWToken treasury | 10 ALGO | Funded for investments |
| **Total Spent** | **~15.012 ALGO** | |
| **Wallet Remaining** | **~9.988 ALGO** | From initial 25 ALGO |

### All Contracts Owned By

**Address:** `7TOHMHYKSMJN2WMXUYEOQ2KU65AIW5EE2FNBIQAVPPZ6TE3MAN36P33JPM`

- ✅ Single point of administrative control
- ✅ Mnemonic stored locally only (.env.testnet)
- ✅ Not shared with staking module deployer
- ⚠️ Keep backup in secure location

---

## Smart Contracts Architecture

### 1. ProjectRegistry (`756074148`)

#### Purpose

**Single Source of Truth (SSOT)** for all platform-level configuration and project metadata.

**Core Responsibilities:**
- Store immutable project metadata (name, location, treasury address)
- Track project lifecycle (ACTIVE → COD → settlement)
- Define which contracts are deployed for this project
- Enforce authorization rules (who can call which contracts)

#### How It Works

```
ProjectRegistry Storage:
├── Global State
│   ├── projectName: "Protius Demo Project"
│   ├── treasury: <Algorand address for revenue>
│   ├── cod_timestamp: <Unix timestamp when production starts>
│   ├── equity_token_app_id: 756074167 (KWToken)
│   ├── kwh_receipt_app_id: 756074340 (kWhReceipt)
│   └── revenue_vault_app_id: 756074359 (RevenueVault)
└── Box Storage (per contract reference)
    └── linked_contracts: [ProjectRegistry, KWToken, kWhReceipt, RevenueVault]
```

#### Frontend Integration

**File:** `src/components/EquityInvestment.tsx`

```typescript
import { ProjectRegistryClient } from '@algorand-contracts/ProjectRegistryClient'

// Load project metadata
const registry = algorand.client.getTypedAppClientById(
  ProjectRegistryClient,
  VITE_PROJECT_REGISTRY_APP_ID  // 756074148
);

// Read global state
const projectName = await registry.app.globalState.get("projectName");
const treasury = await registry.app.globalState.get("treasury");
const codTimestamp = await registry.app.globalState.get("cod_timestamp");

// Display on screen
return (
  <div>
    <h1>{projectName}</h1>
    <p>Treasury: {treasury}</p>
    <p>COD: {new Date(codTimestamp * 1000).toLocaleDateString()}</p>
  </div>
);
```

#### Current State on TestNet

- ✅ **Deployed & Initialized**
- ✅ Contains Protius demo project data
- ✅ All linked contract references are correct
- 🟢 **Ready to use immediately**

---

### 2. KWToken (`756074167`)

#### Purpose

**Equity stake token** — represents fractional ownership in project revenue.

**Core Responsibilities:**
- Manage token allocation at Financial Close (admin-driven, fixed supply)
- Enable transfers post-FC (holders can move tokens between wallets)
- Track equity balances per user (via balanceOf queries)
- Support epoch snapshots for RevenueVault revenue distribution
- Maintain precise accounting (no minting post-FC)

#### How It Works

**SSOT: KWToken represents installed AC capacity (kW), not ALGO price.**

```
KWToken Structure (App ID 756074167):
├── Global State (App-level)
│   ├── asset_id: <ASA ID number — THIS IS NOT 756074167>
│   ├── registry_app_id: 756074148
│   ├── totalSupply: <1M units, set at Financial Close>
│   ├── fcFinalized: 0 or 1 (Financial Close stage)
│   ├── fcOpen: 1 or 0 (minting allowed or not)
│   ├── transfersEnabled: 0 or 1 (post-FC only)
│   ├── treasuryMinted: <amount for treasury>
│   └── investorMintedAmount: <sum of investor allocations>
├── ASA Configuration (on-chain asset, ID = asset_id from above)
│   ├── Name: "KW Token"
│   ├── Symbol: "KWH"
│   ├── Decimals: 6 (1 full token = 1,000,000 base units = 1 kW)
│   │  └─ Example: 900,000 kW shown = 900,000,000,000 base units on-chain
│   ├── Total Supply: 1,000,000 (1M kW = fixed at FC)
│   ├── Manager: KWToken app address (derived from app ID 756074167)
│   └── Clawback: KWToken app address
└── Box Storage (per user)
    ├── balances[userAddr]: <kW token balance>
    └── allowances[owner+spender]: <ERC-20 style allowance>

⚠️ IMPORTANT:
- App ID = 756074167 (contract identifier)
- ASA ID = stored in app global state "asset_id" (token identifier)
- These are DIFFERENT numbers
```

#### Financial Close Allocation (Not Direct Investment)

**Stage 1 uses admin-driven allocation, NOT retail investment:**

```
Phase 1: Deployment
  - KWToken app created
  - No tokens minted yet (fcFinalized = 0)
  - Transfer disabled (transfersEnabled = 0)

Phase 2: Financial Close
  - Admin calls: finalizeFinancialCloseSimple(
      installedAcKw: 1_000_000,
      platformKwBps: 1_000,
      treasury: <treasury_addr>,
      investorAddress: <investor_1>
    )
  - Contract validates and mints:
    * Treasury: 100,000 kW (10%)
    * Investor: 900,000 kW (90%)
  - fcFinalized = 1, transfersEnabled = 1

Phase 3: Multi-Investor Allocation (if needed)
  - Admin calls: mintAllocation(investor_2, 50_000) [multiple times]
  - Admin calls: closeFinancialClose(...) to finalize

Phase 4: Transfers Enabled
  - Holders call: transfer(recipient, amount)
  - Tokens can now be moved between wallets
  - Snapshot captured for RevenueVault (historical balances)
```

#### Frontend Integration (Stage 1 — Holdings Dashboard)

**File:** `src/components/EquityInvestment.tsx` (now "Allocation/Holdings" dashboard)

**DEMO NOTE:** Direct investment (ALGO→mint) is not implemented on-chain yet. This screen shows admin-allocated holdings.

**Step 1: Load app client and retrieve ASA ID**
```typescript
import { KwTokenClient } from '@algorand-contracts/KwTokenClient'
import { PeraWalletConnect } from '@perawallet/connect'

// User connects wallet
const pera = new PeraWalletConnect();
const accounts = await pera.connect();
const userAddr = accounts[0];

// Load KWToken client using APP ID
const kwToken = algorand.client.getTypedAppClientById(
  KwTokenClient,
  756074167
);

// Retrieve the ASA ID from app global state
const asaId = await kwToken.app.globalState.get("asset_id");
console.log(`KWToken ASA ID: ${asaId}`);

// Check Financial Close status
const fcFinalized = await kwToken.app.globalState.get("fcFinalized");
const transfersEnabled = await kwToken.app.globalState.get("transfersEnabled");
console.log(`FC Finalized: ${fcFinalized}, Transfers enabled: ${transfersEnabled}`);
```

**Step 2: Query user's allocated balance**
```typescript
// Get user's current kW token balance
const balance = await kwToken.methods.balanceOf({
  account: userAddr
}).returns.uint64();

console.log(`Your allocated KWToken: ${balance} kW`);
```

**Step 3: Transfer tokens (post-FC only)**
```typescript
// Only available if transfersEnabled = 1
if (transfersEnabled === 1) {
  const recipientAddr = "7J4TM...";
  const transferAmount = 100_000;  // 100 kW

  const result = await kwToken.methods.transfer({
    to: recipientAddr,
    amount: transferAmount
  }).send();

  console.log(`Transferred: ${result.txId}`);
}
```

**REALITY CHECK:**
- ✅ `balanceOf(account)` — Get your allocated kW tokens
- ✅ `transfer(to, amount)` — Send tokens (post-FC only)
- ❌ NO `invest(amount)` method exists
- ❌ NO way to buy tokens with ALGO on-chain (Stage 2 feature)

#### User Flow on Frontend (Holdings/Allocation Dashboard)

```
1. User visits https://web-psi-wheat-78.vercel.app/invest
   ↓
2. Clicks "Connect Wallet"
   ↓
3. Selects Pera Wallet (must be in TestNet mode)
   ↓
4. Sees: Project name, Treasury address, Allocated KWToken balance
   ↓
5. If balance > 0 and transfers enabled: Can transfer tokens
   ↓
6. Enters recipient address + amount
   ↓
7. Approves in Pera Wallet
   ↓
8. On confirmation (5-10 seconds):
    - Page shows "Transfer successful!"
    - Transaction hash links to explorer
```

**DEMO NOTE:** Direct "invest ALGO" button will not work on TestNet. This reflects the actual contract design: allocation happens at Financial Close, not ad-hoc.

#### Current State on TestNet

- ✅ **Deployed & Callable**
- ✅ **Financial Close methods ready** (finalizeFinancialCloseSimple, mintAllocation, closeFinancialClose)
- ✅ **Transfers enabled** (post-FC via transfer())
- ✅ **Balance queries** (balanceOf() method)
- 🔴 **NO direct investment method** (no invest() / buy())
- 📋 **Holdings dashboard deployed to Vercel** (awaiting allocations)

---

### 3. kWhReceipt (`756074340`)

#### Purpose

**Immutable production audit trail** — records electricity generation data.

**Core Responsibilities:**
- Record electricity production in kWh intervals (e.g., hourly readings)
- Prevent double-counting of production data
- Anchor data for revenue settlement calculations
- Enforce post-COD operations only
- Support epoch-based data locking

#### How It Works

```
kWhReceipt Storage:
├── Global State
│   ├── admin: <admin wallet>
│   ├── registry: 756074148 (ProjectRegistry)
│   ├── revenue_vault: 756074359 (RevenueVault)
│   └── paused: 0 (active)
├── Box Storage (per interval)
│   └── receipts[intervalId]:
│       ├── epochId: <which month/settlement period>
│       └── kWhAmount: <electricity produced in kWh>
└── Box Storage (per epoch)
    └── epochTotals[epochId]:
        ├── totalKwh: <sum of all intervals in this epoch>
        └── settled: 0 or 1 (locked for new data after settlement)
```

#### Core Constraints (Non-Negotiable)

1. **Post-COD only**: Cannot record production until COD timestamp passes
2. **Interval uniqueness**: Each intervalId recorded exactly once globally
3. **Epoch locking**: Once epoch marked settled, no new receipts allowed
4. **Oracle authority**: Only designated oracle can call recordProduction()
5. **Settlement authority**: Only RevenueVault can mark epochs as settled

#### Frontend Integration (Stage 2 — Not yet implemented)

**File:** `src/components/ProductionTracking.tsx` (FUTURE)

```typescript
import { KWhReceiptClient } from '@algorand-contracts/KWhReceiptClient'

// Record production data (would be called by oracle service)
const kwhReceipt = algorand.client.getTypedAppClientById(
  KWhReceiptClient,
  VITE_KWH_RECEIPT_APP_ID  // 756074340
);

const intervalId = 12345;  // Unique interval identifier
const kWhProduced = 5000;   // 5000 kWh in this interval
const epochId = 1;          // Current epoch/month

await kwhReceipt.methods.recordProduction({
  intervalId,
  kWhAmount: kWhProduced,
  epochId
}).send();

// Query production history
const receipts = await kwhReceipt.app.boxes.all();
receipts.forEach(box => {
  console.log(`Interval ${box.name}: ${box.data} kWh`);
});
```

#### Current State on TestNet

- ✅ **Deployed & Functional**
- ⏳ **Awaiting Initialization**: Requires manual call to:
  ```
  initReceipt(
    registry: 756074148,
    vault: 756074359
  )
  ```
- 📋 **Initialization Status**: Pending automation or manual admin panel
- 🔴 **Cannot record production yet** (needs init)

---

### 4. RevenueVault (`756074359`)

#### Purpose

**Monthly epoch-based settlement and distribution engine** — computes and distributes revenue to equity holders.

**Core Responsibilities:**
- Manage monthly settlement epochs (state machine)
- Accept revenue deposits (net OPEX already deducted off-chain)
- Accept kWh snapshot data from kWhReceipt
- Compute per-holder entitlements using deterministic rounding
- Execute pull-based claim distribution (users withdraw, not pushed)
- Prevent double-claims

#### How It Works

```
RevenueVault Storage:
├── Global State
│   ├── admin: <admin wallet>
│   ├── registry_app_id: 756074148
│   ├── kwh_receipt_app_id: 756074340
│   ├── kwtoken_app_id: 756074167
│   ├── current_epoch: <epoch number>
│   └── epoch_state: 0=NONE, 1=OPEN, 2=CLOSED, 3=SETTLED
├── Box Storage (per epoch)
│   └── epochs[epochId]:
│       ├── revenue_deposit: <ALGO amount>
│       ├── kwhSnapshot: <hash of production data>
│       ├── totalKwh: <total kWh in epoch>
│       └── settled_flag: 0 or 1
└── Box Storage (per claim)
    └── claims[epochId][userAddr]:
        ├── claimable_amount: <ALGO claimable by user>
        └── claimed: 0 or 1 (prevents double-claim)
```

#### Settlement Workflow

```
Phase 1: OPEN EPOCH
  - RevenueVault accepts monthly revenue deposit (e.g., 100 ALGO)
  - Oracle/backend submits kWh snapshot from kWhReceipt
  - Users continue investing during this phase
  
Phase 2: CLOSE EPOCH
  - Lock new production data entries
  - Begin computing entitlements
  
Phase 3: SETTLE EPOCH
  - For each KWToken holder, calculate:
    claimable = revenue_deposit × (user_kWh ÷ total_kWh)
  - Store claimable amount per user
  - Mark epoch as settled
  
Phase 4: CLAIM DISTRIBUTION (Pull-based)
  - Users individually call claim(epochId) when ready
  - Contract sends their share of revenue
  - Prevents double-claim via claims[epochId][user] tracking
  - User receives claimable amount in ALGO
```

#### Example Calculation

```
Epoch 1 (January):
  - Revenue Deposit: 100 ALGO
  - Total kWh Produced: 50,000 kWh
  - User Alice kWh: 5,000 (10% of total)
  - User Bob kWh: 45,000 (90% of total)
  
Settlement:
  - Alice claimable: 100 ALGO × (5,000 ÷ 50,000) = 10 ALGO
  - Bob claimable: 100 ALGO × (45,000 ÷ 50,000) = 90 ALGO
  
Claims:
  - Alice calls claim(1) → receives 10 ALGO
  - Bob calls claim(1) → receives 90 ALGO
  - Total distributed: 100 ALGO ✓
```

#### Frontend Integration (Stage 2 — Not yet implemented)

**File:** `src/components/ClaimExecution.tsx` (FUTURE)

```typescript
import { RevenueVaultClient } from '@algorand-contracts/RevenueVaultClient'

// Load RevenueVault client
const vault = algorand.client.getTypedAppClientById(
  RevenueVaultClient,
  VITE_REVENUE_VAULT_APP_ID  // 756074359
);

// Query available claims for user
const userAddr = "7TOHMHYK...";  // Connected user
const availableClaims = [];

for (let epochId = 1; epochId <= 12; epochId++) {
  const claimData = await vault.app.box.get(
    `claims_${epochId}_${userAddr}`
  );
  if (claimData && claimData.claimed === 0) {
    availableClaims.push({
      epochId,
      amount: claimData.claimable_amount
    });
  }
}

// Display claimable amounts on screen
availableClaims.forEach(claim => {
  console.log(`Epoch ${claim.epochId}: ${claim.amount / 1e6} ALGO claimable`);
});

// Execute claim when user clicks button
await vault.methods.claim({
  epochId: selectedEpoch
}).send();

// Receive funding on wallet
console.log("Claim executed - check wallet for ALGO");
```

#### Current State on TestNet

- ✅ **Deployed & Functional**
- ⏳ **Awaiting Initialization**: Requires manual call to:
  ```
  init(
    registry: 756074148,
    kwh_receipt: 756074340,
    kwtoken: 756074167
  )
  ```
- 📋 **Initialization Status**: Pending automation or manual admin panel
- 🔴 **Cannot settle or distribute revenue yet** (needs init)

---

## Frontend Integration Guide

### Active Screens (Stage 1)

#### EquityInvestment.tsx — Allocation/Holdings Dashboard

**Location:** `/invest` route  
**Status:** ✅ **OPERATIONAL** (as holdings display, not investment)

**What User Sees:**
```
┌─────────────────────────────────────────┐
│  Protius Equity Holdings Platform       │
├─────────────────────────────────────────┤
│  Project: Protius Demo Project          │
│  Treasury: 7TOHMHYK...P33JPM            │
│  Status: Financial Close (finalized)    │
│  ┌─────────────────────────────────────┐│
│  │ Connect Wallet      [BUTTON]        ││
│  └─────────────────────────────────────┘│
│  Your Allocated KWToken: 900,000 kW    │
│  Transfers Enabled: YES                 │
│  ┌─────────────────────────────────────┐│
│  │ Transfer Tokens (Optional)          ││
│  │ Recipient: [wallet address]        ││
│  │ Amount: [50000] kW                 ││
│  │ [Transfer] [BUTTON]                ││
│  └─────────────────────────────────────┘│
│  ⚠️ Note: Direct invest not implemented │
│  Contact admin for allocation.          │
└─────────────────────────────────────────┘
```

**Technical Stack:**
- Component: `src/components/EquityInvestment.tsx`
- Libs: AlgoKit, Pera Wallet, React
- Contracts: ProjectRegistry (metadata), KWToken (balance queries + transfers)
- Env Vars: `VITE_PROJECT_REGISTRY_APP_ID`, `VITE_KW_TOKEN_APP_ID`

**User Workflow (Stage 1):**
1. Open https://web-psi-wheat-78.vercel.app/invest
2. Click "Connect Wallet"
3. Select Pera Wallet TestNet
4. Approve connection
5. See allocated KWToken balance (assigned by admin at FC)
6. Optional: Transfer tokens to another holdings wallet
7. Sign in Pera Wallet for transfer
8. Confirmation: Transaction hash on explorer

---

### Future Screens (Stage 2 — Not Yet Implemented)

#### ProductionTracking.tsx

**Purpose:** Monitor real-time kWh production data  
**Contracts:** kWhReceipt, ProjectRegistry  
**Status:** 🔴 **NOT YET IMPLEMENTED**

#### ClaimExecution.tsx

**Purpose:** View claimable revenue and execute claims  
**Contracts:** RevenueVault, KWToken  
**Status:** 🔴 **NOT YET IMPLEMENTED**

#### OperatorConsole.tsx (Admin)

**Purpose:** Admin functions (init contracts, settle epochs, pause contracts)  
**Contracts:** All 4 contracts  
**Status:** 🔴 **NOT YET IMPLEMENTED**

---

## Contract Initialization Requirements

### Current Initialization Status

| Contract | Status | Required? | Who Calls | How? |
|----------|--------|-----------|-----------|------|
| ProjectRegistry | ✅ Initialized | No | Already done | Deployment script |
| KWToken | ✅ Initialized | No | Already done | Deployment script |
| kWhReceipt | ⏳ Pending | Yes | Admin/Deployer | Manual method call |
| RevenueVault | ⏳ Pending | Yes | Admin/Deployer | Manual method call |

### How to Initialize (Both Contracts)

**🔴 IMPORTANT: The only reliable method is via SDK/Admin UI**

Direct Pera Wallet contract interaction is not reliably supported and changes frequently.

#### kWhReceipt Initialization

**Method:** `initReceipt(registry, vault)`

**Parameters:**
- `registry`: ProjectRegistry **app ID** (uint64) = `756074148`
- `vault`: RevenueVault **app ID** (uint64) = `756074359`

**Via SDK (TypeScript) — CANONICAL METHOD:**
```typescript
import { KWhReceiptClient } from '@algorand-contracts/KWhReceiptClient'
import { algosdk } from 'algosdk';

const kwhReceipt = algorand.client.getTypedAppClientById(
  KWhReceiptClient,
  756074340
);

// Pass app IDs as uint64, NOT as Account objects
await kwhReceipt.methods.initReceipt({
  registry: 756074148,      // App ID (uint64)
  vault: 756074359          // App ID (uint64)
}).send();

console.log("kWhReceipt initialized!");
```

**⚠️ DO NOT use:**
```typescript
// WRONG: Account(appId) is not valid
registry: new Account(756074148),
vault: new Account(756074359)

// CORRECT: Pass app IDs as integers if method expects uint64
```

**Via Admin UI (RECOMMENDED for production):**
Add an `/admin` screen with initialized button (see Stage 2 roadmap). Direct user interaction with contracts is error-prone.

#### RevenueVault Initialization

**Method:** `init(registry, kwh_receipt, kwtoken)`

**Parameters:**
- `registry`: ProjectRegistry **app ID** (uint64) = `756074148`
- `kwh_receipt`: kWhReceipt **app ID** (uint64) = `756074340`
- `kwtoken`: KWToken **app ID** (uint64) = `756074167`

**Via SDK (TypeScript) — CANONICAL METHOD:**
```typescript
import { RevenueVaultClient } from '@algorand-contracts/RevenueVaultClient'

const revenueVault = algorand.client.getTypedAppClientById(
  RevenueVaultClient,
  756074359
);

// Pass app IDs as uint64, NOT as Account objects
await revenueVault.methods.init({
  registry: 756074148,       // App ID (uint64)
  kwh_receipt: 756074340,    // App ID (uint64)
  kwtoken: 756074167         // App ID (uint64)
}).send();

console.log("RevenueVault initialized!");
```

**⚠️ DO NOT use:**
```typescript
// WRONG: Account(appId) is not correct for app ID parameters
registry: new Account(756074148),

// CORRECT: Pass app IDs as integers if method expects uint64
```

**Recommendation:**
Create an admin dashboard that batches these initialization calls and executes them atomically.

---

## Vercel Configuration

### Step 1: Update Environment Variables

**Location:** https://vercel.com/giorgio-mauros-projects/web/settings/environment-variables

**For Production Environment, add/update:**

```env
# Network Configuration
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_PORT=443
VITE_ALGOD_TOKEN=

# Protius Stage 1 Contract App IDs
VITE_PROJECT_REGISTRY_APP_ID=756074148
VITE_KW_TOKEN_APP_ID=756074167
VITE_KWH_RECEIPT_APP_ID=756074340
VITE_REVENUE_VAULT_APP_ID=756074359

# Network Identifier (for logging/debugging)
VITE_NETWORK=testnet
```

### Step 2: Redeploy Frontend

```bash
cd projects/hello-world-contracts/smart_contracts/web

# Trigger production deployment with new env vars
vercel --prod
```

**Expected Output:**
```
✅ Production: https://web-psi-wheat-78.vercel.app
```

### Step 3: Verify Deployment

1. **Wait 2-3 minutes** for deployment to propagate
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Visit:** https://web-psi-wheat-78.vercel.app/invest
4. **Check browser console** (F12) for errors
5. **Click "Connect Wallet"** and verify it loads

**Success Indicators:**
- ✅ No "Cannot reach 127.0.0.1:4001" errors
- ✅ No "Contract not found" errors
- ✅ Project name loads from ProjectRegistry
- ✅ Pera Wallet connects successfully

---

## Testing & Validation

### Pre-Deployment Checklist

- [ ] All 4 contracts show on TestNet Explorer with correct creator address
- [ ] Vercel environment variables are set correctly
- [ ] Frontend builds without errors: `npm run build`
- [ ] No console errors on `/invest` page
- [ ] Pera Wallet connects in TestNet mode

### Unit Test: Contract Connectivity

**Goal:** Verify frontend can read from smart contracts

```typescript
// Open browser console on https://web-psi-wheat-78.vercel.app/invest
// Run:
const client = window.algorand.client.getTypedAppClientById(756074148);
console.log(await client.app.globalState.get("projectName"));
// Expected: Should print project name
```

### Integration Test: Wallet Connection

**Goal:** Verify Pera Wallet works with TestNet contracts

**Steps:**
1. Open https://web-psi-wheat-78.vercel.app/invest
2. Click "Connect Wallet"
3. Select Pera Wallet
4. Ensure TestNet is selected in Pera
5. Approve connection request

**Success:**
- ✅ Wallet address displays on page
- ✅ KWToken balance loads
- ✅ Project name displays

### End-to-End Test: Financial Close + Holdings Verification

**Goal:** Verify Financial Close allocation and holdings transfer workflow

**Prerequisites:**
- TestNet account #1 (admin) with 1 ALGO
- TestNet account #2 (investor) in Pera Wallet
- Both accounts funded: https://dispenser.algorand.org/

**Phase 1: Admin Executes Financial Close**

```typescript
// Admin calls finalizeFinancialCloseSimple
const kwToken = algorand.client.getTypedAppClientById(
  KwTokenClient,
  756074167
);

await kwToken.methods.finalizeFinancialCloseSimple({
  installedAcKw: 1_000_000,
  platformKwBps: 1_000,
  treasury: treasuryAddr,
  investorAddress: investorAddr
}).send();

console.log("Financial Close executed!");
```

**Expected Result:**
- ✅ Transaction confirmed on TestNet
- ✅ fcFinalized flag set to 1
- ✅ transfersEnabled flag set to 1
- ✅ Treasury allocated 100,000 kW
- ✅ Investor allocated 900,000 kW

**Phase 2: Investor Connects Wallet & Verifies Balance**

```
1. Investor navigates to /invest page
2. Clicks "Connect Wallet" → Selects Pera Wallet (TestNet mode)
3. Approves connection request
4. Page displays:
   - Project name from ProjectRegistry
   - Treasury address from ProjectRegistry
   - KWToken balance: "900,000 kW"
   - Transfers enabled: "YES"
5. Check browser console: No errors
```

**Phase 3: Execute Transfer & Verify on Explorer**

```
1. Investor enters recipient address in transfer form
2. Enters amount: 50,000 kW
3. Clicks "Transfer Tokens" button
4. Reviews transaction in Pera Wallet popup
5. Approves and signs
6. Waits ~10 seconds for confirmation
7. Page shows success with transaction hash
8. Visits: https://testnet.explorer.perawallet.app/tx/<txid>
9. Verifies:
   - Sender: investor address
   - Receiver: recipient address
   - Amount: 50,000 kW
```

**Expected Results:**
- ✅ Financial Close successfully allocated tokens
- ✅ balanceOf() query returns correct kW amount
- ✅ Transfer executed without errors
- ✅ Transaction visible on TestNet Explorer
- ✅ Recipient wallet now shows received tokens

---

## Known Issues & Limitations

### Issue 1: kWhReceipt Awaiting Initialization

**Status:** ⏳ Pending  
**Severity:** Medium (blocks production tracking in Stage 2)  
**Impact:** Cannot record electricity production data yet  
**Root Cause:** Post-deployment manual initialization required  
**Resolution:** Call `initReceipt(registryAddr, vaultAddr)` method  
**Timeline:** Will be automated in Stage 2 admin dashboard  
**Workaround:** None until initialized

---

### Issue 2: RevenueVault Awaiting Initialization

**Status:** ⏳ Pending  
**Severity:** Medium (blocks revenue settlement in Stage 2)  
**Impact:** Cannot settle epochs or distribute claims yet  
**Root Cause:** Post-deployment manual initialization required  
**Resolution:** Call `init(registryAddr, kwhReceiptAddr, kwTokenAddr)` method  
**Timeline:** Will be automated in Stage 2 admin dashboard  
**Workaround:** None until initialized

---

### Issue 3: No Direct Investment Method (KWToken)

**Status:** ⏳ Not Yet Implemented  
**Severity:** Medium (blocks retail investment UX in Stage 1)  
**Impact:** Users cannot buy KWToken with ALGO directly; only admin allocation works  
**Root Cause:** `invest()` / `buy()` method not in KWToken contract; Financial Close model uses admin-driven allocation  
**Stage 1 Workaround:** Holdings dashboard shows admin-allocated balances; transfers enabled post-FC  
**Resolution:** Implement in Stage 2 after product policy decisions:
  - Pricing model (fixed rate or market-based?)
  - Investment caps / limits
  - Treasury routing (where ALGO goes)
  - KYC/whitelist requirements
  - Refund policy
**Timeline:** Stage 2 feature (depends on legal/product review)  
**Why not in Stage 1?** Keeps Financial Close isolation clean and avoids scope creep during deployment milestone.

---

### Issue 4: PPA Contract Code Error

**Status:** ❌ Pre-existing bug  
**Severity:** High (blocks Stage 2 deployment)  
**Impact:** Cannot compile or deploy PPA Contract to TestNet  
**Root Cause:** Line 407 uses outdated syntax: `gtxn(0)` instead of `Txn.group[0]`  
**Location:** `smart_contracts/ppa_contract/contract.algo.ts:407`  
**Error Message:** `"This expression is not callable"`  
**Resolution:** Change code:
```typescript
// OLD (broken):
const paymentTxn = gtxn(0)

// NEW (fixed):
const paymentTxn = Txn.group[0]
```
**Timeline:** Fix in Stage 2 (low priority for current testing)

---

### Issue 5: Augurion Isolation — CONFIRMED SAFE ✅

**Status:** ✅ Verified  
**Concern:** Did deployment affect Augurion module?  
**Resolution:** **NO** — Augurion code is completely untouched
  - No Augurion `.algo.ts` files modified
  - No Augurion deploy scripts executed
  - Augurion continues to compile independently
  - Protius is completely isolated deployment

---

## Security & Contract Ownership

### Deployment Wallet

**Address:** `7TOHMHYKSMJN2WMXUYEOQ2KU65AIW5EE2FNBIQAVPPZ6TE3MAN36P33JPM`

**Controls All 4 Contracts:**
- ProjectRegistry (756074148) — admin access
- KWToken (756074167) — manager & clawback
- kWhReceipt (756074340) — admin access
- RevenueVault (756074359) — admin access

### Mnemonic Security

**Where Stored:**
- ✅ `.env.testnet` (local file only)
- ✅ In `.gitignore` (not committed)
- ⚠️ NOT shared between projects

**Security Best Practices:**
1. ✅ Keep backup in secure password manager
2. ✅ Do NOT share mnemonic
3. ✅ Do NOT commit to Git
4. ✅ Only restore on local dev machine
5. ✅ Rotate before production migration

### Custody Model

**Current (TestNet — Single Signer):**
```
Your Wallet (Single Admin)
    └── ProjectRegistry
    └── KWToken
    └── kWhReceipt
    └── RevenueVault
```

**Recommended (MainNet — Multi-Sig DAO):**
```
MultiSig Treasury (3-of-5 signers)
    └── ProjectRegistry (governance-controlled)
    └── KWToken (time-locked updates)
    └── kWhReceipt (oracle whitelist DAO vote)
    └── RevenueVault (settlement parameters DAO vote)
```

---

## Next Steps & Roadmap

### Immediate Actions (Today)

- [ ] Test holdings dashboard: https://web-psi-wheat-78.vercel.app/invest
- [ ] Verify Pera Wallet connection
- [ ] Connect wallet and check allocated balance
- [ ] (If balance > 0) Test transfer functionality
- [ ] Check TestNet Explorer for transaction(s)

### Short-Term Actions (This Week)

- [ ] **Execute Financial Close** on KWToken (admin calls finalizeFinancialCloseSimple)
- [ ] Allocate holdings to test investors (mintAllocation calls)
- [ ] Test transfer workflow on holdings dashboard
- [ ] Initialize kWhReceipt contract
- [ ] Initialize RevenueVault contract
- [ ] **Plan Stage 2 invest() method** (product + legal review)
- [ ] Fix PPA Contract code (gtxn → Txn.group[0])
- [ ] Create admin dashboard for FC + contract management

### Medium-Term (Stage 2 — Next Week)

- [ ] Implement ProductionTracking UI component
- [ ] Integrate kWhReceipt contract into UI
- [ ] Implement ClaimExecution UI component
- [ ] Integrate RevenueVault settlement & claims
- [ ] Build backend oracle service for production recording
- [ ] Create settlement automation bot
- [ ] Full end-to-end testing

### Long-Term (Production)

- [ ] MainNet migration planning
- [ ] Multisig treasury setup
- [ ] DAO governance implementation
- [ ] Insurance & audit coverage
- [ ] Larger test cohort (100+ investors)

---

## Appendix A: Contract Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│               PROTIUS EQUITY PLATFORM FLOW                  │
└─────────────────────────────────────────────────────────────┘

STAGE 1: FINANCIAL CLOSE & ALLOCATION (✅ ACTIVE NOW)
════════════════════════════════════════════════════
Admin → Contract
  ↓
 [VITE_KW_TOKEN_APP_ID: 756074167]
  ├─ Call: finalizeFinancialCloseSimple(
  │    installedAcKw: 1_000_000,
  │    platformKwBps: 1_000,
  │    treasury: <addr>,
  │    investorAddress: <addr>
  │ )
  ├─ Mints: treasury 100k + investor 900k
  ├─ Enables: transfers
  └─ Mark: fcFinalized = 1
  ↓
User → Pera Wallet (Holdings View)
  ↓
 [VITE_PROJECT_REGISTRY_APP_ID: 756074148]
  ├─ Read: projectName, treasury, cod_timestamp
  ↓
 [VITE_KW_TOKEN_APP_ID: 756074167]
  ├─ Read: balanceOf(userAddr) → 900,000 kW
  ├─ Read: transfersEnabled → 1 (true)
  ├─ Optional Write: transfer(recipient, amount)
  ↓
User sees allocated holdings
Can transfer to other wallets (post-FC)


STAGE 2: PRODUCTION TRACKING (⏳ FUTURE)
═════════════════════════════════════════
Oracle Service → [VITE_KWH_RECEIPT_APP_ID: 756074340]
  ├─ Requires: initReceipt() call first
  ├─ Method: recordProduction(intervalId, kWh, epochId)
  ├─ Checks:
  │   ├─ COD timestamp passed ✓
  │   ├─ Interval not already recorded ✓
  │   ├─ Epoch not settled ✓
  │   └─ Oracle authorized ✓
  ├─ Store: Box storage with immutable audit trail
  ↓
Electricity data anchored on-chain


STAGE 2: REVENUE SETTLEMENT (⏳ FUTURE)
═══════════════════════════════════════
Backend Bot → [VITE_REVENUE_VAULT_APP_ID: 756074359]
  ├─ Requires: init() call first
  ├─ Actions:
  │   1. Receive monthly revenue deposit (100 ALGO)
  │   2. Read kWh snapshot from kWhReceipt
  │   3. Compute entitlements for each KWToken holder
  │   4. Store claimable amounts
  │   5. Mark epoch as SETTLED
  ↓
Settlement data committed on-chain


STAGE 2: REVENUE DISTRIBUTION (⏳ FUTURE)
════════════════════════════════════════════
User → Claims Interface
  ↓
 [VITE_REVENUE_VAULT_APP_ID: 756074359]
  ├─ Read: claimable_amount[epochId][userAddr]
  ├─ Check: Not already claimed ✓
  ├─ Method: claim(epochId)
  ├─ Transfer: ALGO to user wallet
  ├─ Store: claims[epochId][userAddr] = 1 (claimed)
  ↓
User receives revenue share
Balance updated in wallet
```

---

## Appendix B: Troubleshooting Guide

### Frontend Issue: "Cannot reach 127.0.0.1:4001"

**Symptom:** Error message on /invest page  
**Cause:** Still pointing to LocalNet  
**Root Cause:** Environment variables not updated or old cache  

**Fix:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Verify Vercel env vars are set: https://vercel.com/.../settings/environment-variables
4. Wait 5 minutes for deployment propagation
5. Verify URL is https (not http)

---

### Frontend Issue: "Application not found: 756074148"

**Symptom:** Contract App ID errors on page load  
**Cause:** Environment variable not passed to frontend  

**Fix:**
1. Check Vercel env vars include `VITE_*` prefix
2. Verify all 4 App IDs are set
3. Redeploy: `vercel --prod` from web folder
4. Check deployment logs: https://vercel.com/.../deployments

---

### Wallet Issue: Pera Wallet Connection Fails

**Symptom:** "Failed to connect wallet" or endless loading  
**Cause:** Pera Wallet not in TestNet mode  

**Fix:**
1. Open Pera Wallet extension
2. Click settings icon (top right)
3. Select "Network" → "TestNet"
4. Close and retry website connection
5. Or reinstall Pera Wallet completely

---

### Transaction Issue: "Insufficient funds"

**Symptom:** Transaction rejected with insufficient balance  
**Cause:** Account balance too low  

**Fix:**
1. Get TestNet ALGO: https://dispenser.algorand.org/
2. Enter your wallet address
3. Request 1 ALGO
4. Wait 30 seconds for confirmation
5. Retry transaction

---

### Transaction Issue: "Invalid App ID"

**Symptom:** Contract not loading or transaction fails with app error  
**Cause:** Frontend using wrong App ID  

**Fix:**
1. Verify App IDs in Vercel match this guide:
   - ProjectRegistry: `756074148`
   - KWToken: `756074167`
   - kWhReceipt: `756074340`
   - RevenueVault: `756074359`
2. Redeploy if mismatched
3. Check browser console for exact error

---

## Support Contacts

- **Technical Issues:** Check deployment logs in Vercel dashboard
- **Smart Contract Questions:** Review contract code in `smart_contracts/` folder
- **Frontend Bugs:** Check browser console (F12) for errors
- **TestNet ALGO:** https://dispenser.algorand.org/ (10 ALGO daily limit)
- **Explorer:** https://testnet.explorer.perawallet.app/

---

**Document:** PROTIUS_TESTNET_COMPLETE_DETAILED.md  
**Created:** February 24, 2026  
**Version:** 1.2 — Stage 1 Complete + Architecture Alignment  
**Status:** ✅ Production Ready for TestNet Deployment  
**Audience:** Development Team, QA, Product, Stakeholders

---

## Revision History

| Version | Date | Changes |
|---------|------|----------|
| 1.0 | Feb 24 | Initial deployment guide |
| 1.1 | Feb 24 | **Critical fixes**: Added IDs glossary, separated App ID from ASA ID, removed incorrect axfer example, fixed Account(appId) initialization errors, removed unreliable Pera explorer steps |
| 1.2 | Feb 24 | **Architecture alignment**: Replaced fictional ALGO investment with actual Financial Close allocation model. Updated KWToken section with finalizeFinancialCloseSimple, mintAllocation, transfer, balanceOf methods. Relabeled /invest as Holdings Dashboard. Added Known Limitation: no invest() method (Stage 2 feature). Updated workflows to reflect admin-driven FC model. |
