import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KWhReceiptFactory } from '../artifacts/kwh_receipt/KWhReceiptClient'

/**
 * Deploy kWh Receipt contract for a Protius project.
 * 
 * SSOT: This contract is a production truth layer.
 * Deployment flow:
 * 1. Deploy ProjectRegistry first
 * 2. Deploy kW Token (links to registry)
 * 3. Deploy kWh Receipt (links to registry)
 * 4. Deploy RevenueVault (links to all above)
 * 5. Wire contract addresses into ProjectRegistry via setContracts()
 */
export async function deploy() {
  console.log('=== Deploying kWh Receipt ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(KWhReceiptFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })

  // Fund for box storage (receipts, epochs, interval tracking)
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (10).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
    console.log(`Funded kWh Receipt app ${appClient.appId} with 10 ALGO`)
  }

  console.log(`kWh Receipt deployed with App ID: ${appClient.appId}`)

  console.log('Next steps:')
  console.log('1. Call initReceipt(registryAddress)')
  console.log('2. Set RevenueVault address via setRevenueVault()')
  console.log('3. After COD: oracle calls recordProduction() or batchRecordProduction()')
  console.log('4. At epoch end: RevenueVault calls markEpochSettled()')
}
