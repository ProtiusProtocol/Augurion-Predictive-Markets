import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KwTokenFactory } from './artifacts/kw_token/KWTokenClient'
import algosdk from 'algosdk'

async function main() {
  console.log('=== Deploying Updated KWToken (with invest method) ===\n')

  // Setup Algorand client for TestNet
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
  
  // Get deployer account
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC not set')
  }

  const deployerAccount = algosdk.mnemonicToSecretKey(deployerMnemonic)
  algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(deployerAccount))
  
  console.log(`Deployer: ${deployerAccount.addr}`)
  
  // Check balance
  const accountInfo = await algod.accountInformation(deployerAccount.addr).do()
  console.log(`Balance: ${Number(accountInfo.amount) / 1_000_000} ALGO\n`)

  // Create factory
  const factory = algorand.client.getTypedAppFactory(KwTokenFactory, {
    defaultSender: deployerAccount.addr,
  })

  console.log('Deploying KWToken contract...')

  // Deploy (creates new app)
  const { appClient, result } = await factory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })

  console.log(`\n✅ KWToken deployed!`)
  console.log(`App ID: ${appClient.appId}`)
  console.log(`App Address: ${appClient.appAddress}`)

  // Fund the contract
  if (['create', 'replace'].includes(result.operationPerformed)) {
    console.log('\nFunding contract with 10 ALGO...')
    await algorand.send.payment({
      amount: algosdk.algosToMicroalgos(10),
      sender: deployerAccount.addr,
      receiver: appClient.appAddress,
    })
    console.log('✅ Contract funded')
  }

  // Initialize token
  const projectRegistryAppId = parseInt(process.env.VITE_PROJECT_REGISTRY_APP_ID || '756074148')
  
  console.log(`\nInitializing with ProjectRegistry ${projectRegistryAppId}...`)
  
  await appClient.send.initToken({
    args: [
      BigInt(projectRegistryAppId),
      'Protius Demo kW',
      'kW',
    ],
    sender: deployerAccount.addr,
  })

  console.log('✅ Token initialized')

  console.log('\n=== Deployment Complete ===')
  console.log(`\n🎉 New KWToken App ID: ${appClient.appId}`)
  console.log(`\nNext steps:`)
  console.log(`1. Update .env.production: VITE_KW_TOKEN_APP_ID=${appClient.appId}`)
  console.log(`2. Update Vercel: VITE_KW_TOKEN_APP_ID=${appClient.appId}`)
  console.log(`3. Redeploy frontend: cd smart_contracts/web && vercel --prod`)
  console.log(`4. Test at: https://web-psi-wheat-78.vercel.app/invest`)
  console.log(`\nExplorer: https://testnet.explorer.perawallet.app/application/${appClient.appId}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error)
    process.exit(1)
  })
