/**
 * Updates the existing KWToken contract (App ID 756134211) with new TEAL
 * that includes the invest() method. Keeps same App ID and state.
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

const APP_ID = 756134211n
const ALGOD_SERVER = 'https://testnet-api.algonode.cloud'
const ALGOD_PORT = 443
const ALGOD_TOKEN = ''

const ARTIFACTS_DIR = path.join(__dirname, 'artifacts', 'kw_token')

async function main() {
  console.log('=== Updating KWToken Contract with invest() method ===\n')

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

  // Verify invest() selector is present in approval program
  const selectorHex = '7b78bbc1'
  const programHex = Buffer.from(approvalBytes).toString('hex')
  if (programHex.includes(selectorHex)) {
    console.log('✅ invest() method selector found in TEAL')
  } else {
    console.warn('⚠️  invest() selector not found - contract may not have invest() method')
  }

  const suggestedParams = await algod.getTransactionParams().do()

  const updateTxn = algosdk.makeApplicationUpdateTxnFromObject({
    sender: deployer.addr,
    appIndex: APP_ID,
    approvalProgram: approvalBytes,
    clearProgram: clearBytes,
    suggestedParams,
  })

  console.log(`\nUpdating App ID ${APP_ID}...`)
  const signedTxn = updateTxn.signTxn(deployer.sk)
  const { txId } = await algod.sendRawTransaction(signedTxn).do()

  await algosdk.waitForConfirmation(algod, txId, 4)

  console.log(`\n✅ Contract updated!`)
  console.log(`   TxID: ${txId}`)
  console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${txId}`)
  console.log(`   App: https://testnet.explorer.perawallet.app/application/${APP_ID}`)
  console.log(`\nApp ID unchanged: ${APP_ID} — no frontend env var update needed!`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Failed:', err.message || err)
    console.error(err.stack)
    process.exit(1)
  })
