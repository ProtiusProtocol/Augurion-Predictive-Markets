import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AugurionMarketV2Factory } from '../artifacts/augurion_v2/AugurionMarketV2Client'

// Deploy only; don't auto-call any methods yet
export async function deploy() {
  console.log('=== Deploying AugurionMarketV2 ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(AugurionMarketV2Factory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onSchemaBreak: 'append',
    onUpdate: 'append',
  })

  console.log(
    `AugurionMarketV2 deployed with App ID: ${appClient.appId}, operation: ${result.operationPerformed}`,
  )
}
