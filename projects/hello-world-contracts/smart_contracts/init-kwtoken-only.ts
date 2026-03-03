import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KwTokenFactory } from './artifacts/kw_token/KWTokenClient'
import algosdk from 'algosdk'

async function main() {
  console.log('=== Initializing KWToken ===\n')

  const algod = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud',
    parseInt(process.env.ALGOD_PORT || '443')
  )

  const indexer = new algosdk.Indexer(
    process.env.INDEXER_TOKEN || '',
    process.env.INDEXER_SERVER || 'https://testnet-idx.algonode.cloud',
    parseInt(process.env.INDEXER_PORT || '443')
  )

  const algorand = AlgorandClient.fromClients({ algod, indexer })
  
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not set')
  }

  const deployerAccount = algosdk.mnemonicToSecretKey(deployerMnemonic)
  
  // Register the account with AlgorandClient
  algorand.setSignerFromAccount(deployerAccount)
  
  const appId = 756134211
  const appAddress = algosdk.getApplicationAddress(appId)
  
  console.log(`App ID: ${appId}`)
  console.log(`App Address: ${appAddress}`)
  console.log(`Deployer: ${deployerAccount.addr}\n`)

  // Get app client
  const factory = algorand.client.getTypedAppFactory(KwTokenFactory, {
    defaultSender: deployerAccount.addr,
  })
  
  const appClient = factory.getAppClientById({ appId })

  // Initialize token
  const projectRegistryAppId = parseInt(process.env.VITE_PROJECT_REGISTRY_APP_ID || '756074148')
  const registryAddress = algosdk.getApplicationAddress(projectRegistryAppId)
  
  console.log(`Initializing with ProjectRegistry ${projectRegistryAppId}...`)
  
  await appClient.send.initToken({
    args: [
      registryAddress,  // Pass app address
      'Protius Demo kW',
      'kW',
    ],
    sender: deployerAccount.addr,
  })

  console.log('✅ Token initialized\n')

  console.log('=== Setup Complete ===')
  console.log(`\n🎉 KWToken App ID: ${appId}`)
  console.log(`\nNext steps:`)
  console.log(`1. Update .env.production: VITE_KW_TOKEN_APP_ID=${appId}`)
  console.log(`2. Update Vercel: VITE_KW_TOKEN_APP_ID=${appId}`)
  console.log(`3. Redeploy frontend: cd smart_contracts/web && vercel --prod`)
  console.log(`4. Test at: https://web-psi-wheat-78.vercel.app/invest`)
  console.log(`\nExplorer: https://testnet.explorer.perawallet.app/application/${appId}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Initialization failed:', error)
    process.exit(1)
  })
