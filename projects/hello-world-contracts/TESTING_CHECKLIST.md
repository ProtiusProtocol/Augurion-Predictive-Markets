# Protius TestNet Testing Checklist

**Date:** February 25, 2026  
**Network:** Algorand TestNet  
**Frontend:** https://web-psi-wheat-78.vercel.app/invest

---

## Prerequisites ✅

- [ ] Pera Wallet installed and in **TestNet mode**
- [ ] Deployer wallet funded (at least 1 ALGO)
- [ ] `.env.testnet` contains `DEPLOYER_MNEMONIC`
- [ ] Frontend deployed to Vercel with correct env vars

**Get TestNet ALGO:** https://dispenser.algorand.org/

---

## Phase 1: Frontend Connectivity Test (5 minutes)

### Step 1.1: Verify Environment Variables

```powershell
cd projects/hello-world-contracts/smart_contracts/web

# Check Vercel env vars
# Visit: https://vercel.com/giorgio-mauros-projects/web/settings/environment-variables

# Should include:
# VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
# VITE_PROJECT_REGISTRY_APP_ID=756074148
# VITE_KW_TOKEN_APP_ID=756074167
# VITE_KWH_RECEIPT_APP_ID=756074340
# VITE_REVENUE_VAULT_APP_ID=756074359
# VITE_NETWORK=testnet
```

**Expected Result:**
- [ ] All env vars present
- [ ] TestNet URLs correct
- [ ] App IDs match deployment

### Step 1.2: Test Frontend Loading

1. **Visit:** https://web-psi-wheat-78.vercel.app/invest
2. **Open browser console:** Press F12
3. **Check for errors:**
   - [ ] No "Cannot reach 127.0.0.1:4001" errors
   - [ ] No "Contract not found" errors
   - [ ] Page loads successfully

### Step 1.3: Test Wallet Connection

1. Click "Connect Wallet"
2. Select Pera Wallet
3. **Verify Pera is in TestNet mode:**
   - Settings → Network → TestNet
4. Approve connection

**Expected Result:**
- [ ] Wallet connects successfully
- [ ] Your address displays on page
- [ ] No connection errors

### Step 1.4: Browser Console Test

Open browser console (F12) and run:

```javascript
// Check env vars loaded
console.log('ALGOD Server:', import.meta.env.VITE_ALGOD_SERVER)
console.log('Registry App ID:', import.meta.env.VITE_PROJECT_REGISTRY_APP_ID)
console.log('KWToken App ID:', import.meta.env.VITE_KW_TOKEN_APP_ID)

// Should output TestNet URLs and App IDs
```

**Expected Result:**
- [ ] TestNet URLs displayed
- [ ] App IDs displayed correctly

---

## Phase 2: Execute Financial Close (10 minutes)

This allocates tokens to test investors.

### Step 2.1: Run Financial Close Script

```powershell
cd projects/hello-world-contracts/smart_contracts

# Execute Financial Close
$env:DOTENV_CONFIG_PATH = ".env.testnet"
npx tsx -r dotenv/config test-financial-close.ts
```

**Expected Output:**
```
🚀 Starting Financial Close Test...

✅ Deployer: 7TOHMHYK...P33JPM
✅ KWToken App ID: 756074167

📊 Checking current state...
   fcFinalized: 0
   transfersEnabled: 0

🎯 Executing Financial Close...
   Installed Capacity: 1,000,000 kW
   Platform Fee: 10% (1,000 bps)
   Treasury: 100,000 kW
   Investor: 900,000 kW

✅ Financial Close executed successfully!
   Transaction ID: <txid>
   Explorer: https://testnet.explorer.perawallet.app/tx/<txid>

📊 Verifying new state...
   fcFinalized: 1
   transfersEnabled: 1
   treasuryMinted: 100000 kW
   investorMintedAmount: 900000 kW

🎉 Financial Close complete! Tokens allocated.
```

**Checklist:**
- [ ] Script runs without errors
- [ ] fcFinalized changed from 0 → 1
- [ ] transfersEnabled changed from 0 → 1
- [ ] Treasury minted 100,000 kW
- [ ] Investor minted 900,000 kW
- [ ] Transaction visible on [TestNet Explorer](https://testnet.explorer.perawallet.app/)

### Step 2.2: Verify on TestNet Explorer

1. Copy transaction ID from output
2. Visit: `https://testnet.explorer.perawallet.app/tx/<txid>`
3. Check transaction details

**Expected Result:**
- [ ] Transaction confirmed
- [ ] App call to KWToken (756074167)
- [ ] Method: finalizeFinancialCloseSimple

---

## Phase 3: Test Holdings Dashboard (5 minutes)

### Step 3.1: Refresh Frontend

1. **Visit:** https://web-psi-wheat-78.vercel.app/invest
2. **Clear cache:** Ctrl+Shift+R (hard refresh)
3. **Connect wallet** (if not already connected)

### Step 3.2: Verify Balance Display

**Expected Result:**
- [ ] Project name displays: "Protius Demo Project"
- [ ] Treasury address displays
- [ ] **KWToken balance displays: 900,000 kW** (if using deployer wallet)
- [ ] Transfers enabled: YES
- [ ] No console errors (F12)

### Step 3.3: Check Console Logs

Open browser console (F12):

```javascript
// Should see no errors, just info logs about contract loading
```

**Checklist:**
- [ ] No red error messages
- [ ] Contract data loading successfully
- [ ] Balance displays correctly

---

## Phase 4: Test Token Transfer (10 minutes)

### Step 4.1: Run Transfer Test Script

```powershell
cd projects/hello-world-contracts/smart_contracts

# Execute transfer test
$env:DOTENV_CONFIG_PATH = ".env.testnet"
npx tsx -r dotenv/config test-transfer.ts
```

**Expected Output:**
```
🔄 Starting Transfer Test...

✅ Sender: 7TOHMHYK...P33JPM
✅ Recipient: <generated_address>

📊 Checking transfer status...
✅ Transfers enabled

💰 Checking sender balance...
   Sender balance: 900000 kW

🚀 Executing transfer...
   Amount: 50000 kW
   To: <recipient_address>

✅ Transfer successful!
   Transaction ID: <txid>
   Explorer: https://testnet.explorer.perawallet.app/tx/<txid>

📊 Verifying new balances...
   Sender new balance: 850000 kW
   Recipient balance: 50000 kW

🎉 Transfer test complete!
```

**Checklist:**
- [ ] Transfer executes successfully
- [ ] Sender balance decreased by 50,000 kW
- [ ] Recipient balance increased by 50,000 kW
- [ ] Transaction visible on explorer

### Step 4.2: Test Frontend Transfer UI (Optional)

1. Visit Holdings Dashboard
2. Enter recipient address in transfer form
3. Enter amount: 10000
4. Click "Transfer Tokens"
5. Approve in Pera Wallet
6. Wait for confirmation

**Expected Result:**
- [ ] Transfer form works
- [ ] Pera Wallet popup appears
- [ ] Transaction confirms (~10 seconds)
- [ ] Success message displays
- [ ] New balance reflects transfer

---

## Phase 5: Initialize Stage 2 Contracts (10 minutes)

### Step 5.1: Run Initialization Script

```powershell
cd projects/hello-world-contracts/smart_contracts

# Initialize kWhReceipt and RevenueVault
$env:DOTENV_CONFIG_PATH = ".env.testnet"
npx tsx -r dotenv/config test-init-contracts.ts
```

**Expected Output:**
```
🚀 Initializing Remaining Contracts...

✅ Deployer: 7TOHMHYK...P33JPM

📋 Initializing kWhReceipt...
   App ID: 756074340
✅ kWhReceipt initialized!
   Transaction ID: <txid>
   Explorer: https://testnet.explorer.perawallet.app/tx/<txid>

💰 Initializing RevenueVault...
   App ID: 756074359
✅ RevenueVault initialized!
   Transaction ID: <txid>
   Explorer: https://testnet.explorer.perawallet.app/tx/<txid>

🎉 All contracts initialized!

📊 Contract Status:
   ProjectRegistry (756074148) ✅ Active
   KWToken (756074167) ✅ Active
   kWhReceipt (756074340) ✅ Initialized
   RevenueVault (756074359) ✅ Initialized

🚀 Stage 2 features now available!
```

**Checklist:**
- [ ] kWhReceipt initialized successfully
- [ ] RevenueVault initialized successfully
- [ ] Both transactions visible on explorer
- [ ] No initialization errors

### Step 5.2: Verify Contract State

Visit TestNet Explorer:
- [kWhReceipt](https://testnet.explorer.perawallet.app/application/756074340)
- [RevenueVault](https://testnet.explorer.perawallet.app/application/756074359)

**Expected Result:**
- [ ] Both contracts show "initialized" state
- [ ] Global state variables populated
- [ ] Registry references correct

---

## Phase 6: End-to-End Verification (5 minutes)

### Step 6.1: Complete System Check

**Contract Status:**
- [ ] ProjectRegistry (756074148) ✅ Active
- [ ] KWToken (756074167) ✅ Active, FC finalized, transfers enabled
- [ ] kWhReceipt (756074340) ✅ Initialized
- [ ] RevenueVault (756074359) ✅ Initialized

**Frontend Status:**
- [ ] Holdings Dashboard loads
- [ ] Wallet connects
- [ ] Balance displays correctly
- [ ] Transfer functionality works
- [ ] No console errors

**TestNet Verification:**
- [ ] All 4 contracts visible on explorer
- [ ] Transactions confirmed
- [ ] No failed transactions
- [ ] Deployer wallet has remaining ALGO

### Step 6.2: Document Test Results

Record your findings:

**Successes:**
- Financial Close: [ ] Passed / [ ] Failed
- Token Transfer: [ ] Passed / [ ] Failed
- Holdings Dashboard: [ ] Passed / [ ] Failed
- Contract Init: [ ] Passed / [ ] Failed

**Issues Found:**
```
(Document any errors, warnings, or unexpected behavior)
```

**Next Steps:**
```
(What needs to be fixed or improved?)
```

---

## Troubleshooting

### Issue: "Transaction rejected: insufficient funds"
**Fix:** Get more TestNet ALGO from https://dispenser.algorand.org/

### Issue: "fcFinalized already 1"
**Fix:** Financial Close already executed. Skip to transfer tests.

### Issue: "Transfers not enabled"
**Fix:** Run `test-financial-close.ts` first to allocate tokens.

### Issue: "Contract not found"
**Fix:** Verify App IDs in `.env.testnet` and Vercel match deployment guide.

### Issue: Pera Wallet not connecting
**Fix:** 
1. Ensure Pera is in TestNet mode
2. Clear Pera cache
3. Reinstall Pera Wallet if needed

### Issue: Frontend shows 0 balance
**Fix:**
1. Verify Financial Close executed (check `fcFinalized = 1`)
2. Hard refresh browser (Ctrl+Shift+R)
3. Check console for API errors

---

## Success Criteria ✅

**All tests pass when:**
- [x] Financial Close allocates tokens correctly
- [x] Holdings Dashboard displays balances
- [x] Token transfers execute successfully
- [x] All 4 contracts initialized
- [x] No errors in browser console
- [x] All transactions confirmed on TestNet Explorer
- [x] Wallet connection works reliably

---

## Next Steps After Testing

1. **Report Findings:** Document any issues discovered
2. **Plan Stage 2 Features:**
   - Production tracking (kWhReceipt integration)
   - Revenue settlement (RevenueVault epochs)
   - Claim execution UI
3. **UI/UX Improvements:** Continue Lovable work
4. **Plan invest() Method:** Stage 2 product decision

---

**Document Version:** 1.0  
**Last Updated:** February 25, 2026  
**Tested By:** _______________  
**Test Date:** _______________  
**Overall Status:** [ ] PASSED / [ ] FAILED

