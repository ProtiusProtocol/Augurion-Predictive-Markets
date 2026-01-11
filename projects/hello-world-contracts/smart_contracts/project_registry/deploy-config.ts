import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ProjectRegistryFactory } from '../artifacts/project_registry/ProjectRegistryClient'

// Deploy the ProjectRegistry app; initialization can be called separately once inputs are confirmed
export async function deploy() {
  console.log('=== Deploying ProjectRegistry ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })

  // Fund the app account for box storage
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: 5_000_000, // 5 ALGO
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
    console.log(`Funded app ${appClient.appId} with 5 ALGO`)
  }

  console.log(`ProjectRegistry deployed with App ID: ${appClient.appId}`)

  // NOTE: We'll call init_registry(...) once you provide the deployment-time inputs
}
