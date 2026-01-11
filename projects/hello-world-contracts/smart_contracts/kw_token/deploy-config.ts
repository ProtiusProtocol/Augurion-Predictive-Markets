import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KwTokenFactory } from '../artifacts/kw_token/KWTokenClient'
import { ProjectRegistryFactory } from '../artifacts/project_registry/ProjectRegistryClient'

/**
 * Deploy kW Token for a Protius project.
 * 
 * SSOT: This token represents installed AC capacity.
 * Deployment flow:
 * 1. Deploy ProjectRegistry first (provides SSOT config)
 * 2. Deploy kW Token (links to registry)
 * 3. Initialize token with registry reference
 * 4. Set kW Token address in ProjectRegistry
 * 5. Later: call FC methods when ready to mint
 */
export async function deploy() {
  console.log('=== Deploying kW Token ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // Get or deploy ProjectRegistry first
  // NOTE: In production, you'd fetch the existing registry app ID
  // For now, we assume it's already deployed
  console.log('Note: Ensure ProjectRegistry is deployed first')

  const factory = algorand.client.getTypedAppFactory(KwTokenFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })

  // Fund for box storage (balances, snapshots, allowances)
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (10).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
    console.log(`Funded kW Token app ${appClient.appId} with 10 ALGO`)
  }

  console.log(`kW Token deployed with App ID: ${appClient.appId}`)

  // TODO: Initialize with registry reference
  // await appClient.send.initToken({
  //   args: [
  //     registryAddress,
  //     new Uint8Array(Buffer.from('Project XYZ kW Token')),
  //     new Uint8Array(Buffer.from('kW-XYZ')),
  //   ],
  // })

  console.log('Next steps:')
  console.log('1. Call initToken(registryAddress, name, symbol)')
  console.log('2. Call ProjectRegistry.setContracts(...) to link this token')
  console.log('3. When ready: call mintAllocation() or finalizeFinancialCloseSimple()')
  console.log('4. Call closeFinancialClose() to finalize and enable transfers')
}
