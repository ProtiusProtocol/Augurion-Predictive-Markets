# Protius Protocol — Operator Console Guide
### Complete Field-by-Field Reference · v0.3.0 · Updated 26 Feb 2026

---

## What We Built — Full Session Log

1. **Financial Close Management** (prior session) — FC status table, precondition check, 🔒 Close FC (`closeFCWithAllocation`), and ⚡ Force Close FC (`finalizeFinancialCloseSimple`). Already live on TestNet.
2. **Browser Deploy Pipeline** (today) — `contractArtifacts.ts`, `web/src/artifacts/` directory, and the `deployAndRegister()` button — deploys all 4 contracts and initialises the registry entirely from the browser. Deployed to TestNet as PROTIUS-001.

---

### 1. Financial Close Management — Detail (prior session)

Built the FC lifecycle UI in `OperatorConsole.tsx`. Already live on TestNet.

| Component | Description |
|-----------|-------------|
| **FC Status table** | Reads `fcOpen`, `fcFinalized`, `transfersEnabled`, `investorMintedAmount`, `totalSupply` live from KWToken on-chain |
| **Precondition check** | Computes expected investor allocation (`installedAcKw − platform share in BPS`) and shows PASS/FAIL before you attempt to close |
| **🔒 Close FC** | Calls `closeFCWithAllocation()` → `closeFinancialClose` ARC-4 method. Finalises investor token allocations while respecting all `invest()` calls made during the open window. Disabled if FC not open or already finalised. |
| **⚡ Force Close FC** | Calls `finalizeFinancialCloseSimple()`. Bypasses the `investorMintedAmount` precondition entirely. Assigns 100% of the investor allocation to a single address you specify. Use only to override existing `invest()` positions. |

**FC form fields:** Installed AC kW · Platform kW BPS · Treasury Address · Single Investor Address (Force Close only)

---

### 2. Browser Deploy Pipeline — Detail (today)

These three additions make it possible to deploy every Protius contract and activate a project entirely from the browser — no terminal, no CLI tools needed.

### Step 1 — `web/src/contractArtifacts.ts` (new file)
Bundles the compiled TEAL source for all 4 Protius contracts into the Vite build using `?raw` imports.  
Each entry in the `ARTIFACTS` record contains:
- The approval-program TEAL source (as a string)
- The clear-program TEAL source
- The AVM schema: `globalInts`, `globalBytes`, `localInts`, `localBytes`
- `fundAlgo` — how many ALGO to send to the new app account after creation

```
ARTIFACTS.projectRegistry  →  globalInts=12, globalBytes=7,  fundAlgo=2
ARTIFACTS.kwToken          →  globalInts=7,  globalBytes=5,  fundAlgo=2
ARTIFACTS.revenueVault     →  globalInts=4,  globalBytes=5,  fundAlgo=2
ARTIFACTS.kwhReceipt       →  globalInts=1,  globalBytes=3,  fundAlgo=2
```

### Step 2 — `web/src/artifacts/` (new directory, 8 files)
Copied all 8 TEAL files (4 approval + 4 clear programs) into `web/src/artifacts/` so they sit inside Vercel's build root.  
The original files live in `smart_contracts/*/artifacts/` — outside Vercel's resolution boundary — so they could not be imported directly.  
Files:
```
ProjectRegistry.approval.teal   ProjectRegistry.clear.teal
KWToken.approval.teal           KWToken.clear.teal
RevenueVault.approval.teal      RevenueVault.clear.teal
KWhReceipt.approval.teal        KWhReceipt.clear.teal
```

### Step 3 — `deployAndRegister()` function + Deploy button in `OperatorConsole.tsx`
Added to the Project Approval Queue section.  
When clicked, it executes the following sequence entirely in-browser, signing each transaction with the hardcoded admin mnemonic:

| Step | What happens |
|------|-------------|
| Compile | Calls `algodClient.compile(tealSource)` for all 8 programs (approval + clear × 4) |
| [1/4] | `makeApplicationCreateTxn` → deploys ProjectRegistry → funds with 2 ALGO |
| [2/4] | Same → deploys KWToken → funds with 2 ALGO |
| [3/4] | Same → deploys RevenueVault → funds with 2 ALGO |
| [4/4] | Same → deploys KWhReceipt → funds with 2 ALGO |
| Wire  | Calls `setContracts(kwToken, kwhReceipt, revenueVault)` on ProjectRegistry (ARC-4 selector `0x85e0368f`) |
| Init  | Calls `init_registry(projectId, capacity, ...)` on ProjectRegistry (selector `0x2bce98eb`) |
| Auto  | Auto-fills the 4 App ID fields in the approval card |
| Store | Calls `projectStore.approve()` and dispatches `protius:project-approved` event |

**Live deployment (TestNet, PROTIUS-001):**
- ProjectRegistry App ID: 756074148
- KWToken App ID: 756198809
- RevenueVault App ID: 756074359
- KWhReceipt App ID: 756074340

**Production URL:** https://web-psi-wheat-78.vercel.app

---

## Project Lifecycle: DRAFT → FUNDED

After Deploy & Register completes, the project is in **DRAFT** state.  
Full path to equity investment:

```
DRAFT
  → REGISTERED    (operator clicks transition in Project Status Panel)
  → FC OPEN       (operator opens Financial Close round — investors call invest() on KWToken)
  → FUNDED        (operator clicks "Close FC" after investors have committed)
  → UNDER_CONSTRUCTION
  → COMMISSIONING
  → OPERATING     (revenue epochs begin)
```

---

---

# Complete Field-by-Field Console Guide

**URL:** https://web-psi-wheat-78.vercel.app  
**File:** `web/src/OperatorConsole.tsx`  
**Access:** Operator-only. Admin mnemonic is hardcoded in the file.

---

## Section 1 — Project Lifecycle Status Panel

Component: `ProjectStatusPanel` (top of page, above the hr divider)

This panel reads the **ProjectRegistry** global state on-chain and displays the current project state with colour-coded status and transition buttons.

### States

| Value | Name | Color | Meaning |
|----|----|----|----|
| 0 | DRAFT | grey | Contracts deployed, registry initialised. Parameters set but not yet validated. |
| 1 | REGISTERED | blue | Project officially registered. Financial Close round can be opened. |
| 2 | FUNDED | green | FC closed. Investor tokens minted. Construction may begin. |
| 3 | UNDER_CONSTRUCTION | orange | Physical build in progress. |
| 4 | COMMISSIONING | yellow | System integration & testing. |
| 5 | OPERATING | green (bright) | Live. Revenue epochs active. |
| 6 | SUSPENDED | red | Operations paused. |
| 7 | EXITED | dark grey | Project closed out. |

### Fields read from chain

| Field | Source | Description |
|----|----|----|
| `projectState` | ProjectRegistry global int | Current state enum value (0–7) |
| `stateEnteredAt` | ProjectRegistry global int | Unix timestamp of last transition |
| `lastStateTransition` | ProjectRegistry global int | Round number of last transition tx |
| `operator` | ProjectRegistry global bytes | Algorand address of the registered operator |

### Transition Buttons

Shown only when a valid transition exists from the current state. Each button calls `transitionState(newState)` on-chain.  
Auto-refreshes every **10 seconds**.

---

## Section 2 — Protocol State Banner

A grey bar directly below the Project Status Panel.

```
Protocol State: <summary line>
```

The summary is generated by `getProtocolSummary()` and reflects the current epoch state in plain English, e.g.:

- `"Epoch 202501 is OPEN. Ready to be closed."`
- `"Epoch 202501 is CLOSED. Ready to deposit revenue."`
- `"Epoch 202501 has 30000000 µAlgos deposited. Ready to compute entitlements."`
- `"Epoch 202501 is SETTLED with revenuePerKw = 30000 µAlgos/kW."`

---

## Section 3 — Network Status

**Connected to:** Algorand TestNet via AlgoNode (`https://testnet-api.algonode.cloud:443`)  
Auto-refreshes every **5 seconds**.

| Field | Description |
|----|----|
| **Algod** | Server URL and port from `CONFIG.algodServer` / `CONFIG.algodPort` |
| **Connected** | Green ✓ Connected or Red ✗ Disconnected |
| **Last Round** | Most recent confirmed round number |
| **Error** | (Only shown if connection fails) Error message from algod |

---

## Section 4 — Project Management

> **Warning banner:** "Testing Tool Only — Production projects must come from Infrapilot with a completed PEO."

This section lets you manually initialize a project in the deployed ProjectRegistry.  
Used for **local/TestNet testing only**. In production, projects arrive via the Registration form (Section 5).

### Fields

| Field | Default | Description |
|----|----|----|----|
| **PEO Number** | (empty) | Project Entry Object unique identifier. Auto-generated if blank. |
| **PEO File** | (none) | Attach a `.pdf`, `.doc`, `.docx`, or `.json` PEO document. Shown with green confirmation when attached. |
| **Project ID** | `PROTIUS-001` | String identifier stored in the registry (e.g. `DROMBEG-001`). Immutable after init. |
| **Installed AC Capacity (kW)** | `1000` | Total AC-side nameplate capacity of the solar plant in kilowatts. Stored as integer. |
| **Treasury Address** | (empty → admin) | Algorand address that receives the platform's kW fee share. Defaults to the admin account if blank. |
| **Platform kW Fee (BPS)** | `500` | Basis points of capacity allocated to the platform. `500` = 5%. Range 0–10000. |
| **Platform kWh Rate (BPS)** | `100` | Basis points applied per kWh for the platform fee. `100` = 1%. Range 0–10000. |
| **Admin Address** | hardcoded | Pre-filled with `LOCAL_ADMIN_ADDRESS`. The account that signs all transactions. |

### Button: 🚀 Initialize Project

- **Enabled when:** network connected, Project ID not empty, Capacity not empty, no action in progress
- **Disabled when:** any field missing, loading state active
- **On click:** Calls `initializeProject()` → `init_registry` ARC-4 call on ProjectRegistry with all form fields encoded as ABI arguments
- **Loading state:** Shows "⏳ Initializing…"

---

## Section 5 — Project Approval Queue

Projects submitted from the **Registration** page (`/register` route) appear here as pending cards.

### Instruction Panel (blue box)

Explains two approval paths:

- **Option A (recommended):** Click the green **Deploy & Register Contracts** button — deploys all 4 contracts from the browser and initialises the registry automatically. No terminal required.
- **Option B (manual):** Deploy contracts separately via terminal, enter the 4 App IDs in the fields, then click **Approve & Initialize On-Chain**.

### Per-Submission Card

Each card shows:

#### Header Row
| Field | Description |
|----|----|
| **Display Name** | Project name (bold, large) |
| **Energy Type · Location · Submitted** | Subtitle line |
| **PENDING badge** | Yellow badge top-right |

#### Metadata Table
| Field | Description |
|----|----|
| **Capacity** | `installedAcKw` kW |
| **Platform kW Fee** | BPS value and percentage (e.g. `500 BPS (5.00%)`) |
| **Platform kWh Rate** | BPS value |
| **Treasury** | Address or `(use admin default)` |
| **Permits** | Permit references or `—` |
| **Description** | Free-text description or `—` |

#### App ID Grid (blue box) — Option B inputs

Four inputs arranged in a 2×2 grid. These are pre-filled automatically after a successful Deploy & Register.

| Input | Description |
|----|----|
| **ProjectRegistry App ID** | Algorand application ID of the deployed ProjectRegistry contract |
| **KWToken App ID** | Algorand application ID of the KWToken contract |
| **RevenueVault App ID** | Algorand application ID of the RevenueVault contract |
| **KWhReceipt App ID** | Algorand application ID of the KWhReceipt contract |

> All 4 must be filled before the **Approve & Initialize On-Chain** button becomes active.

#### One-click Deploy Panel (green box)

| Element | Description |
|----|----|
| **Description text** | "Deploys all 4 contracts from the browser, wires them together, and initialises the registry — no terminal required." |
| **🚀 Deploy & Register Contracts** | Dark green button. Runs `deployAndRegister(sub)`. Disabled while any action is loading. |
| **Loading state** | "⏳ Deploying… (watch Action Log below)" |

**What Deploy & Register does (in order):**

1. Compiles all 8 TEAL programs via `algodClient.compile()`
2. Deploys ProjectRegistry → funds with 2 ALGO
3. Deploys KWToken → funds with 2 ALGO
4. Deploys RevenueVault → funds with 2 ALGO
5. Deploys KWhReceipt → funds with 2 ALGO
6. Calls `setContracts(kwToken, kwhReceipt, revenueVault)` on ProjectRegistry
7. Calls `init_registry(...)` on ProjectRegistry with submission parameters
8. Auto-fills the 4 App ID inputs above
9. Marks submission as APPROVED in `projectStore` (localStorage)
10. Dispatches `protius:project-approved` browser event

#### Action Buttons Row

| Button | Condition to enable | Description |
|----|----|---|
| **✅ Approve & Initialize On-Chain** | All 4 App IDs filled, no loading | Sends `init_registry` call with manually entered App IDs |
| **❌ Reject** | No loading | Moves submission to REJECTED in localStorage |
| **⬇️ Export Config** | Always | Downloads a `.json` deploy-config file for the submission |

---

## Section 6 — Financial Close Management

Controls the KWToken Financial Close lifecycle.

### Header

Shows `CONFIG.kwTokenAppId` (hardcoded TestNet value: `756198809`) and a **Refresh FC Status** button.

### FC Status Table

| Row | Meaning |
|----|----|
| **FC Open** | Whether the financial close window is currently open (investors can call `invest()`) |
| **FC Finalized** | Whether close has been executed and tokens have been allocated |
| **Transfers Enabled** | Whether KW tokens can be transferred between wallets |
| **Investor Minted (kW)** | Total kW minted to investors via `invest()` calls |
| **Total Supply (kW)** | Total issued supply of KW tokens |

### Close FC Form

| Field | Default | Description |
|----|----|---|
| **Installed AC kW** | `1000` | Must match the value used in `init_registry`. Used to compute expected investor allocation. |
| **Platform kW BPS** | `500` | Platform's capacity share in basis points. |
| **Treasury Address** | `LOCAL_ADMIN_ADDRESS` | Receives the platform's kW allocation at close. |

### Precondition Check

Computed inline before the Close button:

```
closeFinancialClose precondition:
  investorMinted = X kW, expected = Y kW  [✅ PASS | ❌ FAIL]
```

Formula: `expected = installedAcKw − (installedAcKw × platformKwBps / 10000)`

### Button: 🔒 Close FC (respects invest() allocations)

- **Enabled when:** FC is open, not yet finalized, no loading
- **On click:** Calls `closeFCWithAllocation()` → `closeFinancialClose` ARC-4 method on KWToken
- **Effect:** Finalizes investor allocations, mints platform share to treasury, disables further `invest()` calls

### Expandable: ⚠️ Force Close FC

Only visible when expanded. Use only to bypass the `investorMintedAmount` precondition.

| Field | Description |
|----|----|
| **Single Investor Address** | Algorand address that receives 100% of the investor allocation |

**Button: ⚡ Force Close FC (override)**  
Calls `finalizeFinancialCloseSimple` — overwrites all existing `invest()` positions from scratch.  
Enabled only when FC is open, not finalized, and investor address is filled.

---

## Section 7 — Epoch State

Reads epoch data from the **RevenueVault** contract boxes.

### Controls

| Control | Description |
|----|----|
| **Epoch ID** (number input) | The epoch to inspect. Default `202501`. Change and click Refresh to view any epoch. |
| **🔄 Refresh State** | Re-reads the epoch box values from RevenueVault |

### Epoch Table

| Field | Color | Description |
|----|----|---|
| **Epoch ID** | — | The numeric epoch identifier |
| **Status** | Blue=OPEN, Orange=CLOSED, Green=SETTLED, Grey=NOT_FOUND | Current lifecycle state of the epoch |
| **Net Deposited** | — | µAlgos held in RevenueVault for this epoch. ✓ shown when > 0 |
| **Revenue per kW** | — | Computed µAlgos per kW. ✓ shown when > 0. Set by `computeEntitlements`. |
| **Report Hash** | — | Base64 string of the anchored production report, or `(not anchored)` |

---

## Section 8 — Action States

A read-only precondition table showing whether each of the 4 epoch actions is currently executable.

| Column | Description |
|----|----|
| **Action** | Action name (1–4) |
| **Status** | Green ✓ READY or grey ⊘ BLOCKED |
| **Precondition** | The on-chain condition that must be true |
| **Reason Disabled** | Plain-English reason why the action is blocked (only shown when blocked) |

### Preconditions

| # | Action | Precondition |
|---|----|----|
| 1 | Create Epoch | Epoch must not exist (`NOT_FOUND`) |
| 2 | Close Epoch | Epoch must be `OPEN` |
| 3 | Deposit Revenue | Epoch must be `CLOSED` and `netDeposited = 0` |
| 4 | Compute Entitlements | Epoch must be `CLOSED`, `netDeposited > 0`, and `revenuePerKw = 0` |

---

## Section 9 — Operator Actions

Four state-gated buttons that advance the epoch lifecycle.  
All buttons disable while any action is loading. Greyed-out buttons show a tooltip with the block reason.

| # | Button label | Calls | Effect |
|---|----|----|---|
| 1 | **Create Epoch** | `createEpoch()` | Opens a new epoch in RevenueVault. Status → OPEN |
| 2 | **Close Epoch** | `closeEpoch()` | Freezes the epoch. Status → CLOSED. No more deposits can be attached to this epoch. |
| 3 | **Deposit Revenue (30 ALGO)** | `depositRevenue()` | Sends a grouped transaction: payment of net revenue + `depositRevenue` ARC-4 call. Sets `netDeposited`. |
| 4 | **Compute Entitlements** | `computeEntitlements()` | Divides `netDeposited` by total kW capacity on-chain. Stores `revenuePerKw`. Status → SETTLED. |

Each button shows "⏳ [Action]ing…" while its transaction is in-flight.

---

## Section 10 — Action Log

A scrollable terminal-style output panel (250 px height, monospace font).

| Element | Description |
|----|----|
| **Initial state** | "No actions yet. Protocol state will auto-refresh." |
| **Each entry** | One line per log step, appended by `log(message)` calls inside action functions |
| **Includes** | Timestamps, step labels (`[1/4]`), transaction IDs (first 8 chars), success/error messages |
| **Scroll** | `overflowY: scroll` — always scrollable regardless of entry count |

### Example log output for Deploy & Register

```
[12:34:01] DEPLOY_drombeg1: started
🚀 [1/4] Deploying ProjectRegistry...
   Compiling 12u/7b contract...
   App 756074148 deployed & funded 2 ALGO
🚀 [2/4] Deploying KWToken...
   Compiling 7u/5b contract...
   App 756198809 deployed & funded 2 ALGO
🚀 [3/4] Deploying RevenueVault...
   Compiling 4u/5b contract...
   App 756074359 deployed & funded 2 ALGO
🚀 [4/4] Deploying KWhReceipt...
   Compiling 1u/3b contract...
   App 756074340 deployed & funded 2 ALGO
🔗 Wiring contracts via setContracts...
✅ setContracts OK
📋 Calling init_registry...
✅ init_registry OK (txId: ABCD1234...)
🎉 All done! ProjectRegistry App ID: 756074148
[12:34:45] DEPLOY_drombeg1: completed
```

---

## Config Reference

File: `web/src/config.ts`

| Key | Value | Description |
|----|----|---|
| `algodServer` | `https://testnet-api.algonode.cloud` | AlgoNode TestNet endpoint |
| `algodPort` | `443` | HTTPS port |
| `algodToken` | `""` | No auth token required for AlgoNode |
| `projectRegistryAppId` | `756074148` | PROTIUS-001 ProjectRegistry (TestNet) |
| `kwTokenAppId` | `756198809` | PROTIUS-001 KWToken (TestNet) |
| `revenueVaultAppId` | `756074359` | PROTIUS-001 RevenueVault (TestNet) |
| `kwhReceiptAppId` | `756074340` | PROTIUS-001 KWhReceipt (TestNet) |

---

## ARC-4 Method Selectors

| Method | Selector (hex) | Contract | Description |
|----|----|----|----|
| `init_registry` | `0x2bce98eb` | ProjectRegistry | Initialise project parameters |
| `setContracts` | `0x85e0368f` | ProjectRegistry | Wire KWToken, KWhReceipt, RevenueVault addresses |
| `transitionState` | — | ProjectRegistry | Move project to a new lifecycle state |
| `closeFinancialClose` | — | KWToken | Finalise FC respecting invest() allocations |
| `finalizeFinancialCloseSimple` | — | KWToken | Force-close FC with single investor override |
| `createEpoch` | — | RevenueVault | Open a new revenue epoch |
| `closeEpoch` | — | RevenueVault | Close epoch for settlement |
| `depositRevenue` | — | RevenueVault | Deposit net revenue into the epoch |
| `computeEntitlements` | — | RevenueVault | Calculate revenuePerKw and settle epoch |

---

## Key Files

| File | Description |
|----|----|
| `web/src/OperatorConsole.tsx` | Main console — all sections described in this guide |
| `web/src/ProjectStatusPanel.tsx` | Project lifecycle (DRAFT→OPERATING) state machine panel |
| `web/src/contractArtifacts.ts` | TEAL bundles + AVM schemas for in-browser deployment |
| `web/src/artifacts/*.teal` | Copied TEAL source files inside Vite build boundary |
| `web/src/projectStore.ts` | localStorage store for pending/approved/rejected submissions |
| `web/src/config.ts` | App IDs and algod endpoint config |
| `web/src/ProjectRegistration.tsx` | Investor-facing form that submits to the approval queue |

---

*Last updated: 26 Feb 2026*
