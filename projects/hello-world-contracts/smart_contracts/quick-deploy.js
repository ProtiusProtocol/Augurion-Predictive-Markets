/**
 * Quick deployment script for testing state machine
 * Deploys only ProjectRegistry to test the new state fields
 */

const algosdk = require('algosdk');
const fs = require('fs');

const CONFIG = {
  algodServer: 'http://127.0.0.1',
  algodPort: 4001,
  algodToken: 'a'.repeat(64),
  adminMnemonic: 'elephant edge panel cushion oblige hurt toilet ridge lift great light hybrid domain foster clap fault screen index judge seed town idle powder able vessel'
};

async function main() {
  console.log('🚀 Quick Deploy: ProjectRegistry with State Machine\n');
  
  // Connect
  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort);
  const admin = algosdk.mnemonicToSecretKey(CONFIG.adminMnemonic);
  
  console.log(`Admin: ${admin.addr}\n`);
  
  // Fund the admin account
  console.log('💰 Funding admin account...');
  const funder = algosdk.mnemonicToSecretKey(
    'provide success escape aunt build endorse coconut crawl alpha bulb paper size today announce chef coil there absorb cause kid stem ticket across absorb salute'
  );
  const fundingParams = await algodClient.getTransactionParams().do();
  
  // Use the "FromObject" function with sender instead of from
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: funder.addr,
    receiver: admin.addr,
    amount: 10_000_000,
    suggestedParams: fundingParams
  });
  const signedFundTxn = fundTxn.signTxn(funder.sk);
  await algodClient.sendRawTransaction(signedFundTxn).do();
  await algosdk.waitForConfirmation(algodClient, fundTxn.txID(), 4);
  console.log('✅ Funded with 10 Algos\n');
  
  // Read compiled contract files
  const approvalPath = './artifacts/project_registry/ProjectRegistry.approval.teal';
  const clearPath = './artifacts/project_registry/ProjectRegistry.clear.teal';
  
  if (!fs.existsSync(approvalPath)) {
    console.error('❌ Approval TEAL not found!');
    console.error('   The contract needs to be compiled first.');
    console.error('   Artifacts are outdated (no state machine fields).\n');
    process.exit(1);
  }
  
  console.log('⚠️  Using EXISTING artifacts (may not have state machine)');
  console.log('   This is just a test to see if deployment works.\n');
  
  const approvalTeal = fs.readFileSync(approvalPath, 'utf8');
  const clearTeal = fs.readFileSync(clearPath, 'utf8');
  
  // Compile TEAL to bytecode
  console.log('📝 Compiling TEAL...');
  const approvalCompiled = await algodClient.compile(approvalTeal).do();
  const clearCompiled = await algodClient.compile(clearTeal).do();
  
  // Deploy
  const params = await algodClient.getTransactionParams().do();
  console.log('Params keys:', Object.keys(params));
  console.log('Params.genesisID:', params.genesisID);
  console.log('Params.genesisHash:', params.genesisHash);
  
  const txn = algosdk.makeApplicationCreateTxnFromObject({
    sender: admin.addr,
    suggestedParams: params,
    approvalProgram: new Uint8Array(Buffer.from(approvalCompiled.result, 'base64')),
    clearProgram: new Uint8Array(Buffer.from(clearCompiled.result, 'base64')),
    numGlobalByteSlices: 10,
    numGlobalInts: 20,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });
  
  console.log('📤 Deploying contract...');
  const signedTxn = txn.signTxn(admin.sk);
  const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
  
  const result = await algosdk.waitForConfirmation(algodClient, txId, 4);
  const appId = result['application-index'];
  
  console.log(`✅ Deployed! App ID: ${appId}\n`);
  
  // Try to read state
  console.log('🔍 Reading global state...');
  try {
    const appInfo = await algodClient.getApplicationByID(appId).do();
    const globalState = appInfo.params['global-state'] || [];
    
    console.log('\nGlobal State Keys:');
    for (const item of globalState) {
      const key = Buffer.from(item.key, 'base64').toString();
      console.log(`  - ${key}`);
    }
    
    const hasStateMachine = globalState.some(item => 
      Buffer.from(item.key, 'base64').toString() === 'projectState'
    );
    
    if (hasStateMachine) {
      console.log('\n✅ State machine fields detected!');
    } else {
      console.log('\n⚠️  State machine fields NOT found (old artifacts)');
      console.log('   Need to recompile contract with updated code.');
    }
  } catch (err) {
    console.error('Error reading state:', err.message);
  }
}

main().catch(console.error);
