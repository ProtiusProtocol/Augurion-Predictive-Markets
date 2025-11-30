import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AugurionMarketV1Factory } from '../artifacts/augurion_v1/AugurionMarketV1Client'

// Deploy-only script for AugurionMarketV1
export async function deploy() {
  console.log('=== Deploying AugurionMarketV1 ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(AugurionMarketV1Factory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  // If the app was just created / replaced, fund its account a little
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  console.log(
    `AugurionMarketV1 deployed with App ID: ${appClient.appId}, operation: ${result.operationPerformed}`,
  )
}
