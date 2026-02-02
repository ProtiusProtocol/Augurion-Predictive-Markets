/**
 * Simple deployment script for ProjectRegistry with state machine
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ProjectRegistryFactory } from './artifacts/project_registry/ProjectRegistryClient'

async function main() {
  console.log('=== Deploying ProjectRegistry with State Machine ===\n')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  console.log(`Deployer: ${deployer.addr}\n`)

  const factory = algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
    defaultSender: deployer.addr,
  })

  console.log('Deploying contract...')
  const { appClient, result } = await factory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })

  console.log(`✅ Operation: ${result.operationPerformed}`)

  // Fund the app account for box storage
  if (['create', 'replace'].includes(result.operationPerformed)) {
    console.log('Funding app account...')
    await algorand.send.payment({
      amount: (5).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
    console.log(`✅ Funded app with 5 ALGO`)
  }

  console.log(`\n🎉 ProjectRegistry App ID: ${appClient.appId}`)
  console.log(`   App Address: ${appClient.appAddress}`)
  
  // Read state to verify state machine fields exist
  const globalState = await appClient.getGlobalState()
  console.log('\n📊 Global State Keys:')
  for (const [key, value] of Object.entries(globalState)) {
    console.log(`   ${key}: ${JSON.stringify(value)}`)
  }
}

main().catch(console.error)
