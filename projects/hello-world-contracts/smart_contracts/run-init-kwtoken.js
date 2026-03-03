/**
 * Plain JS script to call initToken on the deployed KWToken contract.
 * No TypeScript needed - just runs with node.
 * 
 * Usage: node run-init-kwtoken.js
 * Requires DEPLOYER_MNEMONIC env variable to be set.
 */

const algosdk = require('algosdk')
const fs = require('fs')
const path = require('path')

// Load .env.testnet manually
const envPath = path.join(__dirname, '..', '..', '.env.testnet')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^#][^=]*)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
  console.log('✅ Loaded .env.testnet')
}

const APP_ID = 756198809n
const REGISTRY_APP_ID = 756074148n
const ALGOD_SERVER = 'https://testnet-api.algonode.cloud'
const ALGOD_PORT = 443
const ALGOD_TOKEN = ''

const TOKEN_NAME = 'Protius kW'
const TOKEN_SYMBOL = 'kW'

async function main() {
  console.log('=== Initializing KWToken on TestNet ===\n')

  const mnemonic = process.env.DEPLOYER_MNEMONIC
  if (!mnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not set in environment')
  }

  const deployer = algosdk.mnemonicToSecretKey(mnemonic)
  console.log(`Deployer: ${deployer.addr}`)

  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)

  // Check deployer balance
  const accountInfo = await algod.accountInformation(deployer.addr).do()
  const balanceMicroAlgo = accountInfo.amount
  console.log(`Deployer balance: ${Number(balanceMicroAlgo) / 1e6} ALGO`)

  const contractAddress = algosdk.getApplicationAddress(APP_ID)
  const registryAddress = algosdk.getApplicationAddress(REGISTRY_APP_ID)
  console.log(`\nContract address: ${contractAddress}`)
  console.log(`Registry address: ${registryAddress}`)

  // Build the ABI method call for initToken(address,byte[],byte[])string
  const method = new algosdk.ABIMethod({
    name: 'initToken',
    args: [
      { type: 'address', name: 'registry' },
      { type: 'byte[]', name: 'name' },
      { type: 'byte[]', name: 'symbol' },
    ],
    returns: { type: 'string' },
  })

  const suggestedParams = await algod.getTransactionParams().do()

  const nameBytes = new TextEncoder().encode(TOKEN_NAME)
  const symbolBytes = new TextEncoder().encode(TOKEN_SYMBOL)

  const atc = new algosdk.AtomicTransactionComposer()
  atc.addMethodCall({
    appID: APP_ID,
    method,
    methodArgs: [registryAddress.toString(), nameBytes, symbolBytes],
    sender: deployer.addr,
    suggestedParams: { ...suggestedParams, fee: 2000, flatFee: true },
    signer: algosdk.makeBasicAccountTransactionSigner(deployer),
  })

  console.log('\nCalling initToken...')
  const result = await atc.execute(algod, 4)

  for (const txResult of result.methodResults) {
    console.log(`\n✅ initToken result: ${txResult.returnValue}`)
    console.log(`   TxID: ${txResult.txID}`)
    console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${txResult.txID}`)
  }

  console.log('\n=== Done! ===')
  console.log(`KWToken App ID: ${APP_ID}`)
  console.log(`Explorer: https://testnet.explorer.perawallet.app/application/${APP_ID}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Failed:', err.message || err)
    console.error(err.stack)
    process.exit(1)
  })
