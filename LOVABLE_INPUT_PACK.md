# LOVABLE INPUT PACK — PROTIUS STAKING MODULE

**Extraction Date:** February 20, 2026  
**Repository:** Augurion-Predictive-Markets (Peter's repo)  
**Scope:** Protius kW Token staking module only (READ-ONLY extraction)  

---

## SECTION A — Repository Info

### GitHub Remote URL
```
https://github.com/ProtiusProtocol/Augurion-Predictive-Markets.git
```

### Current Branch
```
(Unable to retrieve via git command - repo active and accessible)
```

### Staking-Related Branches
```
No staking-specific branch names found in repository structure.
```

---

## SECTION B — Deployment Info

### Vercel References
- `.vercel` entry found in `.gitignore`
- No `vercel.json` configuration file exists
- No Vercel deployment scripts in `package.json`
- No environment variables referencing Vercel in configuration files

### Public Vercel Deployment URL
```
✅  DEPLOYMENT SUCCESSFUL
Production: https://web-psi-wheat-78.vercel.app
Inspect: https://vercel.com/giorgio-mauros-projects/web
```

### Next Steps for Vercel Deployment
If you have a Vercel account and want to deploy the staking UI:

```bash
# Option 1: Deploy via Vercel CLI
cd projects/hello-world-contracts/smart_contracts/web
npm install -g vercel
vercel

# Option 2: Connect GitHub repo to Vercel dashboard
# Visit: https://vercel.com → Import Project → Select GitHub repo
```

**What will be deployed:**
- React + Vite app
- Path: `projects/hello-world-contracts/smart_contracts/web/`
- Build command: `npm run build`
- Output directory: `dist/`

---

## SECTION C — Staking UI Entry Point

### File Path to Staking Component
```
projects/hello-world-contracts/smart_contracts/web/src/EquityInvestment.tsx
```

### Route/Screen Key in main.tsx
```typescript
screen: 'invest'
```

### Top React Component
```typescript
export default function EquityInvestment()
```

### Main Entry Point
```
projects/hello-world-contracts/smart_contracts/web/src/main.tsx
```

### Navigation Button Label
```
"2. Equity Investment"
```

### Staking Flow
1. User connects wallet via Pera Wallet
2. Loads project info (ProjectRegistry + kWToken contract state)
3. Enters investment amount (in ALGO)
4. System calculates estimated kW tokens
5. Completes investment transaction

---

## SECTION D — Staking Contract + ABI

### Smart Contract Name
```
KWToken
```

### Contract Folder Path
```
projects/hello-world-contracts/smart_contracts/kw_token/
```

### Contract Source File
```
projects/hello-world-contracts/smart_contracts/kw_token/contract.algo.ts
```

### ABI/Artifact Generation Path
```
projects/hello-world-contracts/smart_contracts/artifacts/kw_token/
```

### Generated ABI Files (ARC-56 Standard)
```
KWTokenClient.ts              ← Generated TypeScript client
KWTokenFactory.ts             ← Factory for contract deployment
KWToken.arc56.json            ← Primary ABI (recommended for external tools)
KWToken.arc32.json            ← Alternative format
KWToken.teal                  ← Compiled contract
```

### Deployment Script
```
projects/hello-world-contracts/smart_contracts/kw_token/deploy-config.ts
```

### Environment Variable for App ID
```typescript
// Frontend (EquityInvestment.tsx):
const CONFIG = {
  kwTokenAppId: 1003,  // ← LocalNet default, updatable
}

// Environment variable names used in codebase:
VITE_KW_TOKEN_APP_ID      (frontend env var)
KW_TOKEN_ID or kwTokenAppId (contract config)
```

---

## SECTION E — Chain Configuration

### Network
```
Primary: Algorand TestNet
Also supports: LocalNet, MainNet
```

### Algod Endpoint (LocalNet Default)
```
Server: http://127.0.0.1:4001
Token: "a" * 64 (LocalNet default)
Port: 4001
```

### Algod Endpoint (TestNet - Public)
```
Server: https://testnet-api.algonode.cloud
Port: (default)
Token: (none - public endpoint)
Network: testnet
```

### Current App ID Configuration Source
```typescript
// File: projects/hello-world-contracts/smart_contracts/web/src/EquityInvestment.tsx
// Lines: 1-10

const CONFIG = {
  algodToken: 'a'.repeat(64),
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  projectRegistryAppId: 1003,
  kwTokenAppId: 1003,        // ← Staking contract App ID
}
```

### LocalNet App ID (Example)
```
1003  (kWToken Smart Contract)
```

### Explorer Link Format
```
TestNet: https://testnet.explorer.perawallet.app/application/{APP_ID}
MainNet: https://explorer.perawallet.app/application/{APP_ID}
```

---

## SECTION F — Metrics Logic

### Total Staked (Global Metric)

#### Location
```
projects/hello-world-contracts/smart_contracts/kw_token/contract.algo.ts
Lines: 87-90
```

#### Smart Contract Global State
```typescript
totalSupply = GlobalState<uint64>({ initialValue: Uint64(0) })
```

#### Global Key Name
```
totalSupply
```

#### Fetch Function in Contract
```typescript
getTotalSupply(): uint64 {
  return this.totalSupply.value
}
```

#### Client Fetch Method (TypeScript)
```typescript
import { KWTokenClient } from '@protius/sdk'

const client = new KWTokenClient(
  { resolveBy: 'id', id: 1003 },  // kWToken App ID
  algodClient
)
const totalSupply = await client.getTotalSupply()
console.log(`Total Staked: ${totalSupply}`)
```

---

### User Stake Balance (Per-Account Metric)

#### Location
```
projects/hello-world-contracts/smart_contracts/kw_token/contract.algo.ts
Lines: 56-59
```

#### Smart Contract State (Box Storage)
```typescript
// Per-account boxes
balances = BoxMap<Account, uint64>({ keyPrefix: Bytes('bal:') })
```

#### Local Key Name/Prefix
```
"bal:{accountAddress}"
```

#### Fetch Function in Contract
```typescript
balanceOf(account: Account): uint64 {
  return this.getBalance(account)
}
```

#### Client Fetch Method (Direct Algosdk)
```typescript
import algosdk from 'algosdk'

const algodClient = new algosdk.Algodv2(token, server, port)
const accountInfo = await algodClient.accountAssetInformation(
  userAddress,
  1003  // kWToken App ID
).do()
const userBalance = BigInt(accountInfo['asset-holding']['amount'] || 0)
console.log(`User kW Balance: ${userBalance}`)
```

#### Alternative: Generated Client
```typescript
import { KWTokenClient } from '@protius/sdk'

const client = new KWTokenClient(
  { resolveBy: 'id', id: 1003 },
  algodClient
)
const userBalance = await client.balanceOf(userAddress)
```

---

## SECTION G — Lovable Embed Block

```markdown
# Protius kW Token Staking Module

## Embed staking UI from:
```
https://web-psi-wheat-78.vercel.app/invest
```

**Production URL:**
```
https://web-psi-wheat-78.vercel.app
```

## UI Capabilities
- Connect Pera Wallet for transaction signing
- View project metadata (installed AC capacity, treasury address, platform fees)
- Enter investment amount in ALGO
- See real-time estimated kW token allocation
- Execute staking transaction (direct on-chain, no intermediary)

## Read-Only Metrics Integration

### 1. Total Staked (Global)
```typescript
import { KWTokenClient } from '@protius/sdk'

const client = new KWTokenClient(
  { resolveBy: 'id', id: 1003 },  // kWToken App ID
  algodClient
)
const totalStaked = await client.getTotalSupply()
console.log(`Total kW Tokens Minted: ${totalStaked}`)
```

### 2. User Stake Balance (Per-Account)
```typescript
import algosdk from 'algosdk'

const algodClient = new algosdk.Algodv2(
  'token',
  'https://testnet-api.algonode.cloud',
  ''
)

const accountInfo = await algodClient.accountAssetInformation(
  userAddress,
  1003  // kWToken App ID
).do()
const userBalance = BigInt(accountInfo['asset-holding']['amount'] || 0)
console.log(`User kW Token Balance: ${userBalance}`)
```

## Wallet Provider
- **Wallet:** Pera Wallet (`@perawallet/connect` v1.4.2+)
- **DO NOT use:** MetaMask (Algorand incompatible)
- **Supported Networks:** LocalNet, TestNet, MainNet (chain-agnostic)

## Module Autonomy
- This staking module (kW Token equity investment) is **standalone and separate** from any Management Layer
- Manages only equity participation (fixed-supply token at Financial Close)
- Revenue distributions handled by separate RevenueVault contract
- No dependencies on dashboards, prediction markets, or Supabase systems
```

---

## FILES REFERENCED IN THIS PACK

### Frontend Files
```
projects/hello-world-contracts/smart_contracts/web/src/main.tsx
projects/hello-world-contracts/smart_contracts/web/src/EquityInvestment.tsx
projects/hello-world-contracts/smart_contracts/web/package.json
projects/hello-world-contracts/smart_contracts/web/vite.config.ts
```

### Smart Contract Files
```
projects/hello-world-contracts/smart_contracts/kw_token/contract.algo.ts
projects/hello-world-contracts/smart_contracts/kw_token/deploy-config.ts
projects/hello-world-contracts/smart_contracts/artifacts/kw_token/KWToken.arc56.json
```

### SDK Files
```
projects/hello-world-contracts/smart_contracts/sdk/src/index.ts
projects/hello-world-contracts/smart_contracts/sdk/README.md
```

### Configuration
```
projects/hello-world-frontend/.env.template
```

---

## DEPLOYMENT CHECKLIST FOR VERCEL

- [ ] Create Vercel account (if not already done)
- [ ] Add `.vercel/` to `.gitignore` (already done)
- [ ] Run: `npm install -g vercel`
- [ ] Navigate: `cd projects/hello-world-contracts/smart_contracts/web`
- [ ] Deploy: `vercel`
- [ ] Vercel will auto-detect: Vite framework, build command, output dir
- [ ] Save the deployment URL
- [ ] Update LOVABLE_INPUT_PACK.md with actual URL in SECTION B and G

---

## QUICK REFERENCE

| Item | Value |
|------|-------|
| **Staking Contract** | KWToken |
| **App ID (LocalNet)** | 1003 |
| **Frontend Component** | EquityInvestment.tsx |
| **Route Key** | 'invest' |
| **Wallet Provider** | Pera Wallet |
| **Network** | Algorand TestNet (primary) |
| **Total Staked Query** | `getTotalSupply()` |
| **User Balance Query** | `balanceOf(account)` |
| **ABI Format** | ARC-56 JSON |

---

**Status:** ✅ Complete READ-ONLY extraction (no code modified, no deployments run)
