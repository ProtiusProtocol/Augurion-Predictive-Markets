import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { Buffer } from 'node:buffer'
import { AugurionMarketV4Factory } from '../artifacts/augurion_v2/AugurionMarketV4Client'

// Deploy only; don't auto-call any methods yet
export async function deploy() {
  console.log('=== Deploying AugurionMarketV4 ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

 const factory = algorand.client.getTypedAppFactory(AugurionMarketV4Factory, {
    defaultSender: deployer.addr,
  })

  // Force create a NEW app instance to ensure we're running V4
  const { appClient, result } = await factory.deploy({
    onSchemaBreak: 'replace',  // Create new app if schema changed
    onUpdate: 'replace',        // Create new app if code changed
  })

  // Fund the app account with 10 ALGO for box storage and inner transactions
  const appAddress = appClient.appClient.appAddress
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appAddress,
    amount: 10_000_000, // 10 ALGO in microAlgos (number, not bigint)
  })
  console.log(`Funded app ${appClient.appId} with 10 ALGO`)

  console.log('Configuring market...')

await appClient.send.configureMarket({
  args: [
    new Uint8Array(Buffer.from('SA Election 2029 outcome')), // outcomeRef
    0,                                                      // expiryRound (0 = no expiry for now)
    200,                                                    // feeBps = 2%
  ],
})

console.log('Market configured')
console.log('Opening market...')

await appClient.send.openMarket({
  args: [],
})

console.log('Market opened')


  console.log(
    `AugurionMarketV4 deployed with App ID: ${appClient.appId}, operation: ${result.operationPerformed}`,
  )
}
