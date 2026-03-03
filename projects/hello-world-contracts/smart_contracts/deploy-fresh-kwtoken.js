/**
 * Deploys a fresh KWToken contract with invest() method.
 * Outputs new App ID to use in VITE_KW_TOKEN_APP_ID.
 */
const algosdk = require('algosdk')
const fs = require('fs')
const path = require('path')

// Load .env.testnet
const envPath = path.join(__dirname, '..', '..', '.env.testnet')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
  console.log('✅ Loaded .env.testnet')
}

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud'
const ALGOD_PORT = 443
const ALGOD_TOKEN = ''

const ARTIFACTS_DIR = path.join(__dirname, 'artifacts', 'kw_token')

async function main() {
  console.log('=== Deploying Fresh KWToken Contract ===\n')

  const mnemonic = process.env.DEPLOYER_MNEMONIC
  if (!mnemonic) throw new Error('DEPLOYER_MNEMONIC not set')

  const deployer = algosdk.mnemonicToSecretKey(mnemonic)
  console.log(`Deployer: ${deployer.addr}`)

  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)

  const accountInfo = await algod.accountInformation(deployer.addr).do()
  console.log(`Balance: ${Number(accountInfo.amount) / 1e6} ALGO`)

  // Load compiled TEAL
  const approvalPath = path.join(ARTIFACTS_DIR, 'KWToken.approval.teal')
  const clearPath = path.join(ARTIFACTS_DIR, 'KWToken.clear.teal')

  if (!fs.existsSync(approvalPath)) throw new Error(`Approval TEAL not found: ${approvalPath}`)
  if (!fs.existsSync(clearPath)) throw new Error(`Clear TEAL not found: ${clearPath}`)

  console.log('\nCompiling TEAL...')
  const approvalTeal = fs.readFileSync(approvalPath, 'utf8')
  const clearTeal = fs.readFileSync(clearPath, 'utf8')

  const approvalResult = await algod.compile(approvalTeal).do()
  const clearResult = await algod.compile(clearTeal).do()

  const approvalBytes = new Uint8Array(Buffer.from(approvalResult.result, 'base64'))
  const clearBytes = new Uint8Array(Buffer.from(clearResult.result, 'base64'))

  console.log('✅ TEAL compiled')

  // Verify invest() selector is present
  const selectorHex = '7b78bbc1'
  const programHex = Buffer.from(approvalBytes).toString('hex')
  if (programHex.includes(selectorHex)) {
    console.log('✅ invest() method selector found in TEAL')
  } else {
    console.warn('⚠️  invest() selector NOT found — wrong artifact?')
  }

  // Actual schema from ARC56 artifact (7 ints, 5 bytes)
  const globalBytesSchema = 5
  const globalUintsSchema = 7

  const suggestedParams = await algod.getTransactionParams().do()

  // ARC-4 create selector (bare call or method call)
  // The create method takes no args from Deploy (bare create)
  // Use the create() bare call: OnCompletion=NoOp with create flag
  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    sender: deployer.addr,
    approvalProgram: approvalBytes,
    clearProgram: clearBytes,
    numGlobalByteSlices: globalBytesSchema,
    numGlobalInts: globalUintsSchema,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    extraPages: 1,  // program is ~2280 bytes, needs 1 extra page (4096 byte limit)
    suggestedParams,
  })

  console.log('\nCreating new app...')
  const signedTxn = createTxn.signTxn(deployer.sk)
  const sendResult = await algod.sendRawTransaction(signedTxn).do()
  console.log('sendResult:', JSON.stringify(sendResult))
  // algosdk v3 returns { txid } (lowercase), v2 returns { txId }
  const txId = sendResult.txid || sendResult.txId
  console.log(`TxID: ${txId}`)
  const result = await algosdk.waitForConfirmation(algod, txId, 10)

  const appId = result['application-index'] || result.applicationIndex
  console.log(`\n✅ KWToken deployed!`)
  console.log(`   New App ID: ${appId}`)
  console.log(`   TxID: ${txId}`)
  console.log(`   Explorer: https://testnet.explorer.perawallet.app/application/${appId}`)
  console.log(`\n📋 NEXT STEPS:`)
  console.log(`   1. Update VITE_KW_TOKEN_APP_ID=${appId} in smart_contracts/web/.env.production`)
  console.log(`   2. Run: node smart_contracts/run-init-kwtoken.js  (with APP_ID=${appId})`)
  console.log(`   3. Update Vercel env var VITE_KW_TOKEN_APP_ID=${appId}`)
  console.log(`   4. Rebuild and redeploy frontend`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Failed:', err.message || err)
    console.error(err.stack)
    process.exit(1)
  })
