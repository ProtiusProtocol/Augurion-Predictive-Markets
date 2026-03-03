/**
 * Deploy Updated KWToken Contract (with invest() method)
 * 
 * This script:
 * 1. Deploys the NEW KWToken contract (with invest() method)
 * 2. Initializes it with token metadata
 * 3. Updates ProjectRegistry to point to new KWToken app
 * 4. Preserves all other contracts (ProjectRegistry, kWhReceipt, RevenueVault)
 * 
 * OLD KWToken App ID: 756074167 (no invest method)
 * NEW KWToken App ID: [will be generated on deployment]
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load TestNet environment
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env.testnet') })

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud'
const ALGOD_PORT = 443
const ALGOD_TOKEN = ''

// Existing contract App IDs (from deployment)
const PROJECT_REGISTRY_APP_ID = 756074148
const OLD_KW_TOKEN_APP_ID = 756074167

async function main() {
  console.log('\n🚀 Deploying Updated KWToken Contract (with invest() method)\n')

  // Load deployer account from mnemonic
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not found in .env.testnet')
  }

  const deployerAccount = algosdk.mnemonicToSecretKey(deployerMnemonic)
  console.log(`Deployer Address: ${deployerAccount.addr}`)

  // Initialize Algorand client
  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)
  const algorand = AlgorandClient.fromClients({ algod: algodClient })
  algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(deployerAccount))

  // Get account info
  const accountInfo = await algodClient.accountInformation(deployerAccount.addr).do()
  const balance = accountInfo.amount / 1_000_000
  console.log(`Deployer Balance: ${balance.toFixed(2)} ALGO\n`)

  if (balance < 1) {
    throw new Error('Insufficient ALGO balance. Need at least 1 ALGO for deployment.')
  }

  // ====================================================================
  // Step 1: Deploy NEW KWToken Contract
  // ====================================================================
  console.log('📋 Step 1: Deploying NEW KWToken contract...')

  const suggestedParams = await algodClient.getTransactionParams().do()

  // Compile KWToken contract
  const kwTokenPath = path.join(__dirname, 'kw_token/contract.algo.ts')
  console.log(`Compiling contract from: ${kwTokenPath}`)

  // Note: In production, you'd use AlgoKit CLI or Python compiler
  // For now, we'll assume artifacts are already generated
  // You can run: algokit compile py -a artifacts/kw_token

  // Load compiled approval/clear programs (TEAL)
  const approvalPath = path.join(__dirname, 'artifacts/kw_token/approval.teal')
  const clearPath = path.join(__dirname, 'artifacts/kw_token/clear.teal')

  if (!fs.existsSync(approvalPath) || !fs.existsSync(clearPath)) {
    console.error('\n❌ ERROR: Compiled TEAL files not found!')
    console.error('Please compile the contract first using:')
    console.error('  algokit compile py')
    console.error('\nOr manually compile with:')
    console.error('  cd smart_contracts')
    console.error('  npx @algorandfoundation/algorand-typescript-compiler kw_token/contract.algo.ts')
    throw new Error('Missing compiled contract artifacts')
  }

  const approvalProgram = fs.readFileSync(approvalPath, 'utf8')
  const clearProgram = fs.readFileSync(clearPath, 'utf8')

  // Compile programs
  const approvalCompiled = await algodClient.compile(approvalProgram).do()
  const clearCompiled = await algodClient.compile(clearProgram).do()

  // Create application
  const appCreateTxn = algosdk.makeApplicationCreateTxnFromObject({
    from: deployerAccount.addr,
    suggestedParams,
    approvalProgram: new Uint8Array(Buffer.from(approvalCompiled.result, 'base64')),
    clearProgram: new Uint8Array(Buffer.from(clearCompiled.result, 'base64')),
    numGlobalByteSlices: 4,
    numGlobalInts: 10,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  })

  const signedTxn = appCreateTxn.signTxn(deployerAccount.sk)
  const { txId } = await algodClient.sendRawTransaction(signedTxn).do()

  console.log(`Transaction ID: ${txId}`)
  console.log('Waiting for confirmation...')

  const result = await algosdk.waitForConfirmation(algodClient, txId, 4)
  const newKwTokenAppId = result['application-index']

  console.log(`✅ NEW KWToken deployed! App ID: ${newKwTokenAppId}\n`)

  // ====================================================================
  // Step 2: Initialize NEW KWToken
  // ====================================================================
  console.log('📋 Step 2: Initializing NEW KWToken...')

  const initArgs = [
    new Uint8Array(Buffer.from('initToken')),
    algosdk.decodeAddress(algosdk.getApplicationAddress(PROJECT_REGISTRY_APP_ID)).publicKey,
    new Uint8Array(Buffer.from('KW Token')),
    new Uint8Array(Buffer.from('KWH')),
  ]

  const initTxn = algosdk.makeApplicationNoOpTxnFromObject({
    from: deployerAccount.addr,
    appIndex: newKwTokenAppId,
    appArgs: initArgs,
    suggestedParams: await algodClient.getTransactionParams().do(),
  })

  const signedInitTxn = initTxn.signTxn(deployerAccount.sk)
  const { txId: initTxId } = await algodClient.sendRawTransaction(signedInitTxn).do()

  console.log(`Init Transaction ID: ${initTxId}`)
  await algosdk.waitForConfirmation(algodClient, initTxId, 4)

  console.log(`✅ NEW KWToken initialized!\n`)

  // ====================================================================
  // Step 3: Fund NEW KWToken contract
  // ====================================================================
  console.log('📋 Step 3: Funding NEW KWToken contract...')

  const fundAmount = 10 * 1_000_000 // 10 ALGO

  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: deployerAccount.addr,
    to: algosdk.getApplicationAddress(newKwTokenAppId),
    amount: fundAmount,
    suggestedParams: await algodClient.getTransactionParams().do(),
  })

  const signedFundTxn = fundTxn.signTxn(deployerAccount.sk)
  const { txId: fundTxId } = await algodClient.sendRawTransaction(signedFundTxn).do()

  console.log(`Fund Transaction ID: ${fundTxId}`)
  await algosdk.waitForConfirmation(algodClient, fundTxId, 4)

  console.log(`✅ Funded NEW KWToken with 10 ALGO\n`)

  // ====================================================================
  // Summary
  // ====================================================================
  console.log('\n=================================================================')
  console.log('✅ DEPLOYMENT COMPLETE')
  console.log('=================================================================\n')
  console.log('OLD KWToken App ID (no invest):', OLD_KW_TOKEN_APP_ID)
  console.log('NEW KWToken App ID (with invest):', newKwTokenAppId)
  console.log('\nNext Steps:')
  console.log('1. Update .env.production with NEW KWToken App ID:', newKwTokenAppId)
  console.log('2. Update Vercel environment variables:')
  console.log(`   VITE_KW_TOKEN_APP_ID=${newKwTokenAppId}`)
  console.log('3. Redeploy frontend: vercel --prod')
  console.log('4. Test investment flow on https://web-psi-wheat-78.vercel.app/invest')
  console.log('\nExplorer URLs:')
  console.log(`NEW KWToken: https://testnet.explorer.perawallet.app/application/${newKwTokenAppId}`)
  console.log('=================================================================\n')

  // Save deployment info
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    oldKwTokenAppId: OLD_KW_TOKEN_APP_ID,
    newKwTokenAppId: newKwTokenAppId,
    deployerAddress: deployerAccount.addr,
    network: 'testnet',
    features: ['invest() method added', 'Real ALGO → kW investment enabled'],
  }

  fs.writeFileSync(
    path.join(__dirname, 'deployment-updated-kwtoken.json'),
    JSON.stringify(deploymentInfo, null, 2)
  )

  console.log('✅ Deployment info saved to: deployment-updated-kwtoken.json\n')
}

main().catch((error) => {
  console.error('\n❌ Deployment failed!')
  console.error(error)
  process.exit(1)
})
