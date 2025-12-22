// E2E smoke test for AugurionMarketV2
// - Requires `algosdk` installed and the sandbox running locally
// - Set ALGOD_TOKEN env var OR the script will try common defaults
// Usage examples:
// 1) Fetch token and run (PowerShell):
//    $token = docker exec algokit_sandbox_algod cat /var/lib/algod/algod.token; $env:ALGOD_TOKEN=$token; node .\scripts\e2e_smoke_test.js

const fs = require('fs');
const algosdk = require('algosdk');

async function main() {
  try {
    const ALGOD_SERVER = process.env.ALGOD_SERVER || 'http://127.0.0.1';
    const ALGOD_PORT = process.env.ALGOD_PORT || 9392;
    const possibleTokens = [];
    if (process.env.ALGOD_TOKEN) possibleTokens.push(process.env.ALGOD_TOKEN);
    possibleTokens.push('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    possibleTokens.push('a');

    let algodToken = null;
    let algodClient = null;
    for (const t of possibleTokens) {
      try {
        algodClient = new algosdk.Algodv2(t, ALGOD_SERVER, ALGOD_PORT);
        // try a simple status call
        const status = await algodClient.healthCheck().do().catch(() => null);
        if (status !== null) { algodToken = t; break; }
      } catch (e) {
        // ignore and try next
      }
    }

    if (!algodToken) {
      console.error('Failed to detect algod token. Please set ALGOD_TOKEN env var.');
      process.exit(1);
    }
    console.log('Using algod token:', algodToken.length > 8 ? algodToken.slice(0,8) + '...' : algodToken);

    // re-create client with detected token
    algodClient = new algosdk.Algodv2(algodToken, ALGOD_SERVER, ALGOD_PORT);

    // Load compiled programs from the ARC artifact (prefer compiled base64 if present)
    const arc32Path = 'smart_contracts/artifacts/augurion_v2/AugurionMarketV2.arc32.json';
    let approvalProg = null;
    let clearProg = null;
    if (fs.existsSync(arc32Path)) {
      const arc = JSON.parse(fs.readFileSync(arc32Path, 'utf8'));
      if (arc && arc.source && arc.source.approval) {
        approvalProg = new Uint8Array(Buffer.from(arc.source.approval, 'base64'));
      }
      if (arc && arc.source && arc.source.clear) {
        clearProg = new Uint8Array(Buffer.from(arc.source.clear, 'base64'));
      }
    }
    if (!approvalProg || !clearProg) {
      // fallback to compiling TEAL via algod
      const approvalPath = 'smart_contracts/artifacts/augurion_v2/AugurionMarketV2.approval.teal';
      const clearPath = 'smart_contracts/artifacts/augurion_v2/AugurionMarketV2.clear.teal';
      if (!fs.existsSync(approvalPath) || !fs.existsSync(clearPath)) {
        console.error('Approval or clear TEAL not found in artifacts. Run `npm run build` first.');
        process.exit(1);
      }
      const approvalSrc = fs.readFileSync(approvalPath, 'utf8');
      const clearSrc = fs.readFileSync(clearPath, 'utf8');
      console.log('Compiling TEAL programs via algod...');
      const compApproval = await algodClient.compile(approvalSrc).do();
      const compClear = await algodClient.compile(clearSrc).do();
      approvalProg = new Uint8Array(Buffer.from(compApproval.result, 'base64'));
      clearProg = new Uint8Array(Buffer.from(compClear.result, 'base64'));
    } else {
      console.log('Loaded compiled programs from ARC-32 artifact');
    }

    // create or load a deployer account to be the app creator
    let deployer = null;
    let deployerAddr = null;
    if (process.env.DEPLOYER_MNEMONIC) {
      const m = process.env.DEPLOYER_MNEMONIC.trim();
      deployer = algosdk.mnemonicToSecretKey(m);
      deployerAddr = deployer.addr.toString();
      console.log('Using deployer from DEPLOYER_MNEMONIC:', deployerAddr);
    } else {
      deployer = algosdk.generateAccount();
      deployerAddr = deployer.addr.toString();
      const mnemonic = algosdk.secretKeyToMnemonic(deployer.sk);
      console.log('Deployer address:', deployerAddr);
      console.log('Deployer mnemonic:', mnemonic);
      // write mnemonic/address to file so it can be funded externally
      try {
        fs.writeFileSync('scripts/deployer.json', JSON.stringify({ address: deployerAddr, mnemonic }, null, 2));
        console.log('Wrote deployer info to scripts/deployer.json');
      } catch (e) {
        // ignore file write failures
      }
    }

    // Try to fund deployer from a sandbox account using docker exec
    console.log('Attempting to find sandbox algod container to fetch a funded account...');
    console.log('If this fails, please fund the deployer address with sandbox funds manually.');

    // For convenience, try to use the dispenser account at index 0 from the algod node's keyfile (best-effort)
    // Otherwise the user must transfer funds into `deployer.addr` using sandbox tooling.

    // Check deployer balance loop (wait for funds)
    async function waitForBalance(address, minBalance=1000000, timeoutMs=60000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const info = await algodClient.accountInformation(address).do();
          if (info.amount >= minBalance) return info.amount;
        } catch (e) {
          // ignore
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      return null;
    }

    if (process.env.SKIP_BALANCE_CHECK) {
      console.log('SKIP_BALANCE_CHECK set — skipping deployer balance check (assuming funded)');
    } else {
      console.log('Waiting up to 60s for deployer to be funded...');
      const funded = await waitForBalance(deployerAddr);
      if (!funded) {
        console.error('Deployer not funded. Please transfer sandbox Algo to the deployer address and re-run.');
        process.exit(1);
      }
      console.log('Deployer funded with', funded);
    }

    // Create application
    const params = await algodClient.getTransactionParams().do();
    console.log('Deployer address:', deployerAddr, 'Type:', typeof deployerAddr);
    const onComplete = algosdk.OnApplicationComplete.NoOpOC;
    const globalInts = 7; // adapt to contract's global ints
    const globalBytes = 0;
    const localInts = 0;
    const localBytes = 0;

    console.log('Creating transaction object...');
    let txn;
    try {
      txn = algosdk.makeApplicationCreateTxnFromObject({
        from: deployerAddr,
        approvalProgram: approvalProg,
        clearProgram: clearProg,
        numLocalInts: localInts,
        numLocalByteSlice: localBytes,
        numGlobalInts: globalInts,
        numGlobalByteSlice: globalBytes,
        onComplete: onComplete,
        suggestedParams: params,
      });
      console.log('Transaction created successfully');
    } catch (err) {
      console.error('Error creating transaction:', err.message);
      console.error('Stack:', err.stack);
      throw err;
    }

    const signed = txn.signTxn(deployer.sk);
    const { txId } = await algodClient.sendRawTransaction(signed).do();
    console.log('Create app tx sent:', txId);
    const confirmed = await algosdk.waitForConfirmation(algodClient, txId, 4);
    const appId = confirmed['application-index'];
    console.log('Deployed app id:', appId);

    // Test the full betting flow
    console.log('\n=== Testing Betting Flow ===');
    
    // Get fresh params
    let txParams = await algodClient.getTransactionParams().do();
    
    // 1. Call create() to initialize the market
    console.log('1. Calling create() to initialize market...');
    const createTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: deployerAddr,
      appIndex: appId,
      appArgs: [new Uint8Array(Buffer.from('create'))],
      suggestedParams: txParams,
    });
    const signedCreate = createTxn.signTxn(deployer.sk);
    const createResult = await algodClient.sendRawTransaction(signedCreate).do();
    await algosdk.waitForConfirmation(algodClient, createResult.txId, 4);
    console.log('Market created');

    // 2. Place a YES bet (amount=5000000 microAlgos = 5 ALGO)
    console.log('2. Placing YES bet (5 ALGO)...');
    txParams = await algodClient.getTransactionParams().do();
    const betYesTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: deployerAddr,
      appIndex: appId,
      appArgs: [
        new Uint8Array(Buffer.from('bet_yes')),
        algosdk.encodeUint64(5000000)
      ],
      boxes: [
        { appIndex: appId, name: new Uint8Array(Buffer.from(deployerAddr)) }
      ],
      suggestedParams: txParams,
    });
    const signedBetYes = betYesTxn.signTxn(deployer.sk);
    const betYesResult = await algodClient.sendRawTransaction(signedBetYes).do();
    await algosdk.waitForConfirmation(algodClient, betYesResult.txId, 4);
    console.log('YES bet placed');

    // 3. Resolve market with YES winning (winningSide=1)
    console.log('3. Resolving market with YES winning...');
    txParams = await algodClient.getTransactionParams().do();
    const resolveTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: deployerAddr,
      appIndex: appId,
      appArgs: [
        new Uint8Array(Buffer.from('resolve_market')),
        algosdk.encodeUint64(1)
      ],
      suggestedParams: txParams,
    });
    const signedResolve = resolveTxn.signTxn(deployer.sk);
    const resolveResult = await algodClient.sendRawTransaction(signedResolve).do();
    await algosdk.waitForConfirmation(algodClient, resolveResult.txId, 4);
    console.log('Market resolved with YES winning');

    // 4. Claim payout as winner
    console.log('4. Claiming payout...');
    txParams = await algodClient.getTransactionParams().do();
    const claimTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: deployerAddr,
      appIndex: appId,
      appArgs: [new Uint8Array(Buffer.from('claim_payout'))],
      boxes: [
        { appIndex: appId, name: new Uint8Array(Buffer.from(deployerAddr)) }
      ],
      suggestedParams: txParams,
    });
    const signedClaim = claimTxn.signTxn(deployer.sk);
    const claimResult = await algodClient.sendRawTransaction(signedClaim).do();
    const claimConfirmed = await algosdk.waitForConfirmation(algodClient, claimResult.txId, 4);
    console.log('Payout claimed successfully!');
    console.log('Transaction ID:', claimResult.txId);

    // Done: full E2E test completed
    console.log('\n=== E2E Test Completed Successfully ===');
    console.log('App ID:', appId);
    console.log('All functions tested: create, bet_yes, resolve_market, claim_payout');

  } catch (err) {
    console.error('E2E script error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
