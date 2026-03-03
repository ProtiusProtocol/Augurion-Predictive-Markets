# Protius Web UI — Configuration Refactoring Summary

**Date:** February 21, 2026  
**Repository:** Augurion-Predictive-Markets (Peter's repo)  
**Scope:** Environment-driven Algod & App ID configuration  
**Status:** ✅ COMPLETE

---

## CHANGES MADE

### 1. NEW FILE: `src/config.ts`

**Purpose:** Centralized configuration loader that reads from Vite environment variables with LocalNet fallbacks.

**Features:**
- Reads Algorand network config from `import.meta.env`
- Falls back to LocalNet defaults if env vars are missing (for local development)
- Exports singleton `CONFIG` object
- Supports validation of required values
- Supports Vercel/TestNet deployment with environment variables

**Example:**
```typescript
// Automatic fallback for local dev
import { CONFIG } from './config'

const CONFIG = {
  algodServer: 'http://127.0.0.1' // or from VITE_ALGOD_SERVER
  algodPort: 4001,                 // or from VITE_ALGOD_PORT
  algodToken: 'aaa...',            // or from VITE_ALGOD_TOKEN
  projectRegistryAppId: 1002,      // or from VITE_PROJECT_REGISTRY_APP_ID
  kwTokenAppId: 1003,              // or from VITE_KW_TOKEN_APP_ID
  // ... etc
}
```

---

### 2. UPDATED FILES: Component Imports

All component files updated to import `CONFIG` from centralized config:

**Files Changed:**
```
src/EquityInvestment.tsx       → import { CONFIG } from './config'
src/ClaimExecution.tsx         → import { CONFIG } from './config'
src/ProjectOverview.tsx        → import { CONFIG } from './config'
src/OperatorConsole.tsx        → import { CONFIG } from './config'
src/ClaimantPreview.tsx        → import { CONFIG } from './config'
src/ProductionRecording.tsx    → import { CONFIG } from './config'
src/BuyerPortal.tsx            → import { CONFIG } from './config'
```

**What Was Removed:**
- 7 `const CONFIG = { ... }` definitions (hardcoded in each component)
- Hardcoded `algodServer: 'http://127.0.0.1'`
- Hardcoded `algodPort: 4001`
- Hardcoded `algodToken: 'a'.repeat(64)`
- Hardcoded app IDs (1003, 1004, 1005, 1006)

**OperatorConsole.tsx - Special Handling:**
- Extracted LocalNet test credentials into separate constants:
  ```typescript
  const LOCAL_ADMIN_ADDRESS = '...'
  const LOCAL_ADMIN_MNEMONIC = '...'
  ```
- These are used only for local development and not exported/configurable

---

### 3. NEW FILE: `.env.example`

**Purpose:** Template showing all available environment variables.

**Contents:**
```env
VITE_ALGOD_SERVER=http://127.0.0.1
VITE_ALGOD_PORT=4001
VITE_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
VITE_PROJECT_REGISTRY_APP_ID=1002
VITE_KW_TOKEN_APP_ID=1003
VITE_KWH_RECEIPT_APP_ID=1004
VITE_REVENUE_VAULT_APP_ID=1005
VITE_PPA_CONTRACT_APP_ID=1006
```

---

### 4. UPDATED FILE: `.gitignore`

**Added:**
```
.env.local
.env.*.local
```

**Purpose:** Prevent local environment files (with TestNet App IDs) from being committed.

---

## CODE DIFF SUMMARY

### Before (Hardcoded)
```typescript
// EquityInvestment.tsx
const CONFIG = {
  algodToken: 'a'.repeat(64),
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  projectRegistryAppId: 1003,
  kwTokenAppId: 1003,
}
```

### After (Environment-Driven)
```typescript
// EquityInvestment.tsx
import { CONFIG } from './config'
// CONFIG automatically reads from VITE_* env vars or uses LocalNet defaults
```

### Config Loader
```typescript
// config.ts
export function getConfig(): AlgoConfig {
  const defaults: AlgoConfig = {
    algodServer: 'http://127.0.0.1',
    algodPort: 4001,
    algodToken: 'a'.repeat(64),
    projectRegistryAppId: 1002,
    kwTokenAppId: 1003,
    kwhReceiptAppId: 1004,
    revenueVaultAppId: 1005,
  }

  // Override with env vars if present
  const config: AlgoConfig = {
    algodServer: import.meta.env.VITE_ALGOD_SERVER ?? defaults.algodServer,
    algodPort: import.meta.env.VITE_ALGOD_PORT ? Number(import.meta.env.VITE_ALGOD_PORT) : defaults.algodPort,
    algodToken: import.meta.env.VITE_ALGOD_TOKEN !== undefined ? import.meta.env.VITE_ALGOD_TOKEN : defaults.algodToken,
    projectRegistryAppId: import.meta.env.VITE_PROJECT_REGISTRY_APP_ID ? Number(import.meta.env.VITE_PROJECT_REGISTRY_APP_ID) : defaults.projectRegistryAppId,
    kwTokenAppId: import.meta.env.VITE_KW_TOKEN_APP_ID ? Number(import.meta.env.VITE_KW_TOKEN_APP_ID) : defaults.kwTokenAppId,
    // ... etc
  }

  return config
}
```

---

## HOW TO RUN LOCALLY (Development)

### Option 1: Default LocalNet (No Config Needed)
```bash
cd projects/hello-world-contracts/smart_contracts/web
npm run dev
# Automatically uses http://127.0.0.1:4001 with App IDs 1002-1005
```

### Option 2: Custom Network via `.env.local`
```bash
# Copy template
cp .env.example .env.local

# Edit .env.local to point to TestNet or custom LocalNet endpoints
# No code changes needed — just set env vars
```

**Example `.env.local` (TestNet):**
```env
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_PORT=
VITE_ALGOD_TOKEN=
VITE_PROJECT_REGISTRY_APP_ID=1234
VITE_KW_TOKEN_APP_ID=1235
VITE_KWH_RECEIPT_APP_ID=1236
VITE_REVENUE_VAULT_APP_ID=1237
```

---

## HOW TO DEPLOY ON VERCEL (Production/TestNet)

### Step 1: Set Environment Variables on Vercel Dashboard

Visit: **Vercel Project Settings → Environment Variables**

Add the following:

| Key | Value | Example |
|-----|-------|---------|
| `VITE_ALGOD_SERVER` | TestNet endpoint | `https://testnet-api.algonode.cloud` |
| `VITE_ALGOD_PORT` | Empty (default https) | `` (blank) |
| `VITE_ALGOD_TOKEN` | Empty (public endpoint) | `` (blank) |
| `VITE_PROJECT_REGISTRY_APP_ID` | Deployed TestNet App ID | `1234567` |
| `VITE_KW_TOKEN_APP_ID` | Deployed TestNet App ID | `1234568` |
| `VITE_KWH_RECEIPT_APP_ID` | Deployed TestNet App ID | `1234569` |
| `VITE_REVENUE_VAULT_APP_ID` | Deployed TestNet App ID | `1234570` |

### Step 2: Redeploy

```bash
cd projects/hello-world-contracts/smart_contracts/web
vercel --prod
```

Or push changes to GitHub — Vercel auto-deploys.

### Step 3: Verify

- Check Vercel deployment logs
- Visit production URL (e.g., `https://web-psi-wheat-78.vercel.app/invest`)
- Try connecting wallet and loading project info
- Should NOT see network errors (previously would fail with localhost)

---

## NETWORK CONFIGURATION REFERENCE

### LocalNet (Development)
```env
VITE_ALGOD_SERVER=http://127.0.0.1
VITE_ALGOD_PORT=4001
VITE_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### TestNet (Vercel/Production)
```env
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_PORT=        # Empty or 443
VITE_ALGOD_TOKEN=       # Empty (public endpoint)
```

### MainNet (Future)
```env
VITE_ALGOD_SERVER=https://mainnet-api.algonode.cloud
VITE_ALGOD_PORT=        # Empty or 443
VITE_ALGOD_TOKEN=       # Empty (public endpoint)
```

---

## BACKWARDS COMPATIBILITY

✅ **Fully Backwards Compatible**

- Existing LocalNet setup works unchanged (default values apply)
- No breaking changes to component interfaces
- UI/routing/wallet provider unchanged
- Can omit all env vars and still get LocalNet behavior

---

## WHAT STILL NEEDS TO BE DONE

Awaiting user to provide:

1. **Actual TestNet App IDs** after deploying Protius contracts to TestNet
   - ProjectRegistry ID
   - kWToken ID
   - kWhReceipt ID
   - RevenueVault ID

2. **Set on Vercel** via Environment Variables settings

3. **Verify** deployment connects correctly

---

## FILES CREATED/MODIFIED

### New Files
```
src/config.ts                     ← Centralized config loader
.env.example                      ← Environment variable template
```

### Modified Files
```
src/EquityInvestment.tsx          ← Import CONFIG from './config'
src/ClaimExecution.tsx            ← Import CONFIG from './config'
src/ProjectOverview.tsx           ← Import CONFIG from './config'
src/OperatorConsole.tsx           ← Import CONFIG from './config' + LOCAL_ADMIN_*
src/ClaimantPreview.tsx           ← Import CONFIG from './config'
src/ProductionRecording.tsx       ← Import CONFIG from './config'
src/BuyerPortal.tsx               ← Import CONFIG from './config'
.gitignore                        ← Added .env.local
```

---

## VERIFICATION COMMANDS

```bash
# 1. Build locally (should pass)
npm run build

# 2. Preview production build
npm run preview

# 3. Check env var precedence (with .env.local set)
# The web app should use .env.local values instead of defaults
```

---

## SUMMARY

| Aspect | Before | After |
|--------|--------|-------|
| **Config Location** | Hardcoded in 7 files | Centralized in `src/config.ts` |
| **Environment Support** | None (LocalNet only) | Full env var support |
| **Vercel Ready** | ❌ No (hardcoded localhost) | ✅ Yes (env-configurable) |
| **LocalNet Default** | ✅ Yes | ✅ Yes (fallback) |
| **TestNet Required** | ❌ Would need code change | ✅ Just set env vars |
| **Code Duplication** | 7 × const CONFIG | 1 × config.ts + imports |

---

**Status:** ✅ Refactoring complete and ready for Vercel/TestNet deployment

**Next Steps:** 
1. Deploy Protius contracts to TestNet
2. Get actual App IDs
3. Set environment variables on Vercel
4. Test on https://web-psi-wheat-78.vercel.app/invest
