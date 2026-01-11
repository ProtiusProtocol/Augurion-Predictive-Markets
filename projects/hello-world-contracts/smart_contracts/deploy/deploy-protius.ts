/**
 * Protius Protocol Deployment Script
 * 
 * Deploys all 4 Protius V1 Core contracts in the correct order:
 * 1. ProjectRegistry
 * 2. kWToken
 * 3. kWhReceipt
 * 4. RevenueVault
 * 
 * Usage:
 *   npm run deploy:protius
 * 
 * Requirements:
 *   - DEPLOYER_MNEMONIC environment variable set
 *   - LocalNet or target network running and accessible
 *   - Admin account funded with sufficient ALGO
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ProjectRegistryFactory } from '../artifacts/project_registry/ProjectRegistryClient'
import { KwTokenFactory } from '../artifacts/kw_token/KWTokenClient'
import { KWhReceiptFactory } from '../artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultFactory } from '../artifacts/revenue_vault/RevenueVaultClient'

interface DeploymentResult {
  registryAppId: bigint
  kwTokenAppId: bigint
  kwhReceiptAppId: bigint
  revenueVaultAppId: bigint
}

async function main() {
  console.log('=== Deploying Protius Protocol ===')
  console.log()

  // Initialize Algorand client and deployer account
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment()

  console.log(`Deployer: ${deployer.addr}`)
  console.log()

  const result: DeploymentResult = {
    registryAppId: 0n,
    kwTokenAppId: 0n,
    kwhReceiptAppId: 0n,
    revenueVaultAppId: 0n,
  }

  try {
    // ================================================================
    // 1. Deploy ProjectRegistry
    // ================================================================
    console.log('[1/4] Deploying ProjectRegistry...')
    const registryFactory = algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
      defaultSender: deployer.addr,
    })

    const registryDeployment = await registryFactory.deploy({
      onUpdate: 'replace',
      onSchemaBreak: 'replace',
    })

    // Fund the app account for box storage
    if (['create', 'replace'].includes(registryDeployment.result.operationPerformed)) {
      await algorand.send.payment({
        amount: (5).algo(),
        sender: deployer.addr,
        receiver: registryDeployment.appClient.appAddress,
      })
      console.log(`  Funded app with 5 ALGO`)
    }

    result.registryAppId = BigInt(registryDeployment.appClient.appId)
    console.log(`✅ ProjectRegistry App ID: ${result.registryAppId}`)
    console.log()

    // ================================================================
    // 2. Deploy kWToken
    // ================================================================
    console.log('[2/4] Deploying kWToken...')
    const kwTokenFactory = algorand.client.getTypedAppFactory(KwTokenFactory, {
      defaultSender: deployer.addr,
    })

    const kwTokenDeployment = await kwTokenFactory.deploy({
      onUpdate: 'replace',
      onSchemaBreak: 'replace',
    })

    // Fund for box storage (balances, snapshots, allowances)
    if (['create', 'replace'].includes(kwTokenDeployment.result.operationPerformed)) {
      await algorand.send.payment({
        amount: (10).algo(),
        sender: deployer.addr,
        receiver: kwTokenDeployment.appClient.appAddress,
      })
      console.log(`  Funded app with 10 ALGO`)
    }

    result.kwTokenAppId = BigInt(kwTokenDeployment.appClient.appId)
    console.log(`✅ kWToken App ID: ${result.kwTokenAppId}`)
    console.log()

    // ================================================================
    // 3. Deploy kWhReceipt
    // ================================================================
    console.log('[3/4] Deploying kWhReceipt...')
    const kwhReceiptFactory = algorand.client.getTypedAppFactory(KWhReceiptFactory, {
      defaultSender: deployer.addr,
    })

    const kwhReceiptDeployment = await kwhReceiptFactory.deploy({
      onUpdate: 'replace',
      onSchemaBreak: 'replace',
    })

    // Fund for box storage (receipts, epochs, interval tracking)
    if (['create', 'replace'].includes(kwhReceiptDeployment.result.operationPerformed)) {
      await algorand.send.payment({
        amount: (10).algo(),
        sender: deployer.addr,
        receiver: kwhReceiptDeployment.appClient.appAddress,
      })
      console.log(`  Funded app with 10 ALGO`)
    }

    result.kwhReceiptAppId = BigInt(kwhReceiptDeployment.appClient.appId)
    console.log(`✅ kWhReceipt App ID: ${result.kwhReceiptAppId}`)
    console.log()

    // ================================================================
    // 4. Deploy RevenueVault
    // ================================================================
    console.log('[4/4] Deploying RevenueVault...')
    const vaultFactory = algorand.client.getTypedAppFactory(RevenueVaultFactory, {
      defaultSender: deployer.addr,
    })

    const vaultDeployment = await vaultFactory.deploy({
      onUpdate: 'replace',
      onSchemaBreak: 'replace',
    })

    // Fund the app account
    if (['create', 'replace'].includes(vaultDeployment.result.operationPerformed)) {
      await algorand.send.payment({
        amount: (10).algo(),
        sender: deployer.addr,
        receiver: vaultDeployment.appClient.appAddress,
      })
      console.log(`  Funded app with 10 ALGO`)
    }

    result.revenueVaultAppId = BigInt(vaultDeployment.appClient.appId)
    console.log(`✅ RevenueVault App ID: ${result.revenueVaultAppId}`)
    console.log()

    // ================================================================
    // Deployment Summary
    // ================================================================
    console.log('=== Protius Deployment Complete ===')
    console.log()
    console.log('App IDs:')
    console.log(`  ProjectRegistry:  ${result.registryAppId}`)
    console.log(`  kWToken:          ${result.kwTokenAppId}`)
    console.log(`  kWhReceipt:       ${result.kwhReceiptAppId}`)
    console.log(`  RevenueVault:     ${result.revenueVaultAppId}`)
    console.log()
    console.log('Next steps:')
    console.log('  1. Update sdk/src/config/project.ts with these App IDs')
    console.log('  2. Run: npm run operator:init')
    console.log()

  } catch (error) {
    console.error()
    console.error('❌ Deployment failed:')
    console.error(error)
    console.error()
    console.error('Partial deployment results:')
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }
}

main()
