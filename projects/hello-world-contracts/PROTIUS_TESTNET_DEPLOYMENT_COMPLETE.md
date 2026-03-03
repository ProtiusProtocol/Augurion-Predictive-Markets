# Protius Equity TestNet Deployment — Stage 1 Complete ✅

**Deployment Date:** February 24, 2026  
**Deployer:** `7TOHMHYKSMJN2WMXUYEOQ2KU65AIW5EE2FNBIQAVPPZ6TE3MAN36P33JPM`  
**Network:** TestNet (https://testnet-api.algonode.cloud)  
**Status:** ✅ Stage 1 Complete (4 of 5 contracts deployed)

---

## Deployed Contracts

| Contract | App ID | Status | Explorer |
|----------|--------|--------|----------|
| **ProjectRegistry** | `756074148` | ✅ Active | [View](https://testnet.explorer.perawallet.app/application/756074148) |
| **KWToken** | `756074167` | ✅ Active | [View](https://testnet.explorer.perawallet.app/application/756074167) |
| **kWhReceipt** | `756074340` | ✅ Active | [View](https://testnet.explorer.perawallet.app/application/756074340) |
| **RevenueVault** | `756074359` | ⚠️ Created | [View](https://testnet.explorer.perawallet.app/application/756074359) |
| **PPA Contract** | — | ❌ Pending | Code error in contract |

---

## Vercel Environment Variables (to update)

Set these in **Vercel Settings → Environment Variables** (Production):

```env
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_PORT=443
VITE_ALGOD_TOKEN=
VITE_PROJECT_REGISTRY_APP_ID=756074148
VITE_KW_TOKEN_APP_ID=756074167
VITE_KWH_RECEIPT_APP_ID=756074340
VITE_REVENUE_VAULT_APP_ID=756074359
```

Then redeploy: `vercel --prod`

---

## Next Steps

1. ✅ Update Vercel environment variables with new App IDs
2. ✅ Redeploy Vercel to load new contracts
3. ⚠️ Review RevenueVault error (created but had network issue after)
4. ❌ Fix PPA Contract code error and deploy Stage 2

---

## Contract Ownership

All contracts are owned by: `7TOHMHYKSMJN2WMXUYEOQ2KU65AIW5EE2FNBIQAVPPZ6TE3MAN36P33JPM`

Keep the mnemonic safe and local-only (never commit to Git).

---

**Document:** PROTIUS_TESTNET_DEPLOYMENT_COMPLETE.md  
**Updated:** February 24, 2026
