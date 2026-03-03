/**
 * Deploy updated KWToken contract with invest() method
 * 
 * This script:
 * 1. Loads deployer account from .env.testnet
 * 2. Creates new KWToken app from compiled artifacts
 * 3. Initializes with token metadata
 * 4. Returns new App ID for environment variable update
 */

import algosdk from 'algosdk'
import * as fs from 'fs'
import * as path from 'path'

async function deployUpdatedKWToken() {
  console.log('=== Deploying Updated KWToken Contract ===\n')

  // 1. Setup Algod client
  const algodServer = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud'
  const algodToken = process.env.ALGOD_TOKEN || ''
  const algodPort = parseInt(process.env.ALGOD_PORT || '443')

  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort)

  // 2. Load deployer account
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not found in environment')
  }

  const deployer = algosdk.mnemonicToSecretKey(deployerMnemonic)
  console.log(`Deployer: ${deployer.addr}`)

  // Check deployer balance
  const accountInfo = await algodClient.accountInformation(deployer.addr).do()
  console.log(`Deployer balance: ${Number(accountInfo.amount) / 1_000_000} ALGO\n`)

  // 3. Read compiled TEAL files
  const artifactsDir = path.join(__dirname, 'kw_token', 'artifacts')
  const approvalProgram = fs.readFileSync(path.join(artifactsDir, 'KWToken.approval.teal'), 'utf8')
  const clearProgram = fs.readFileSync(path.join(artifactsDir, 'KWToken.clear.teal'), 'utf8')

  console.log('Compiling approval program...')
  const approvalCompileResult = await algodClient.compile(approvalProgram).do()
  const approvalProgramBytes = new Uint8Array(Buffer.from(approvalCompileResult.result, 'base64'))

  console.log('Compiling clear program...')
  const clearCompileResult = await algodClient.compile(clearProgram).do()
  const clearProgramBytes = new Uint8Array(Buffer.from(clearCompileResult.result, 'base64'))

  // 4. Read app spec to get schema requirements
  const appSpec = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KWToken.arc32.json'), 'utf8'))
  const globalInts = appSpec.state.global.num_uints || 0
  const globalBytes = appSpec.state.global.num_byte_slices || 0
  const localInts = appSpec.state.local.num_uints || 0
  const localBytes = appSpec.state.local.num_byte_slices || 0

  console.log(`Schema: Global(${globalInts} ints, ${globalBytes} bytes), Local(${localInts} ints, ${localBytes} bytes)\n`)

  // 5. Deploy new application
  console.log('Creating new KWToken application...')
  const suggestedParams = await algodClient.getTransactionParams().do()
  suggestedParams.flatFee = true
  suggestedParams.fee = 1000

  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    from: deployer.addr,
    suggestedParams,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: approvalProgramBytes,
    clearProgram: clearProgramBytes,
    numLocalInts: localInts,
    numLocalByteSlices: localBytes,
    numGlobalInts: globalInts,
    numGlobalByteSlices: globalBytes,
  })

  const signedCreateTxn = createTxn.signTxn(deployer.sk)
  const { txId } = await algodClient.sendRawTransaction(signedCreateTxn).do()
  console.log(`Transaction ID: ${txId}`)

  const result = await algosdk.waitForConfirmation(algodClient, txId, 4)
  const appId = result['application-index']
  const appAddress = algosdk.getApplicationAddress(appId)

  console.log(`\n✅ KWToken deployed successfully!`)
  console.log(`App ID: ${appId}`)
  console.log(`App Address: ${appAddress}`)

  // 6. Initialize token (assuming ProjectRegistry app ID from env)
  const projectRegistryAppId = parseInt(process.env.VITE_PROJECT_REGISTRY_APP_ID || '756074148')
  
  console.log(`\nInitializing token with ProjectRegistry ${projectRegistryAppId}...`)
  
  const initTxn = algosdk.makeApplicationNoOpTxnFromObject({
    from: deployer.addr,
    appIndex: appId,
    appArgs: [
      new Uint8Array(Buffer.from('initToken')),
      algosdk.encodeUint64(projectRegistryAppId),
      new Uint8Array(Buffer.from('Protius Demo kW')),
      new Uint8Array(Buffer.from('kW')),
    ],
    suggestedParams: await algodClient.getTransactionParams().do(),
  })

  const signedInitTxn = initTxn.signTxn(deployer.sk)
  const { txId: initTxId } = await algodClient.sendRawTransaction(signedInitTxn).do()
  console.log(`Init Transaction ID: ${initTxId}`)
  
  await algosdk.waitForConfirmation(algodClient, initTxId, 4)
  console.log('✅ Token initialized')

  // 7. Fund the contract with ALGO (for MBR and operations)
  console.log('\nFunding contract with 10 ALGO...')
  
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: deployer.addr,
    to: appAddress,
    amount: 10_000_000, // 10 ALGO
    suggestedParams: await algodClient.getTransactionParams().do(),
  })

  const signedFundTxn = fundTxn.signTxn(deployer.sk)
  const { txId: fundTxId } = await algodClient.sendRawTransaction(signedFundTxn).do()
  console.log(`Fund Transaction ID: ${fundTxId}`)
  
  await algosdk.waitForConfirmation(algodClient, fundTxId, 4)
  console.log('✅ Contract funded')

  // 8. Output final result
  console.log('\n=== Deployment Complete ===')
  console.log(`\n🎉 New KWToken App ID: ${appId}`)
  console.log(`\nNext steps:`)
  console.log(`1. Update .env.production: VITE_KW_TOKEN_APP_ID=${appId}`)
  console.log(`2. Update Vercel environment variable: VITE_KW_TOKEN_APP_ID=${appId}`)
  console.log(`3. Redeploy frontend: cd smart_contracts/web && vercel --prod`)
  console.log(`4. Test investment at: https://web-psi-wheat-78.vercel.app/invest`)
  console.log(`\nExplore on TestNet: https://testnet.explorer.perawallet.app/application/${appId}`)

  return appId
}

// Run deployment
deployUpdatedKWToken()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error)
    process.exit(1)
  })
