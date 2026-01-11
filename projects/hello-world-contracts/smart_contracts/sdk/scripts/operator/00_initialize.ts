/**
 * Operator Script: Initialize Protius V1 Core Contracts
 * 
 * One-time setup after deployment.
 * Wires all 4 contracts together with cross-references.
 * 
 * Must be run by admin account before any other operations.
 * 
 * Usage:
 *   npm run operator:init
 */

import algosdk from 'algosdk'
import { ProjectRegistryClient } from '../../../artifacts/project_registry/ProjectRegistryClient'
import { KwTokenClient } from '../../../artifacts/kw_token/KWTokenClient'
import { KWhReceiptClient } from '../../../artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultClient } from '../../../artifacts/revenue_vault/RevenueVaultClient'
import { LOCALNET_CONFIG } from '../../src/config/project'
import { LOCALNET } from '../../src/config/networks'

/**
 * Main execution
 */
async function main() {
  console.log('=== Protius V1 Core — Contract Initialization ===')
  console.log()

  // Load operator (admin) account
  const operatorMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!operatorMnemonic) {
    throw new Error('DEPLOYER_MNEMONIC environment variable not set')
  }
  const operator = algosdk.mnemonicToSecretKey(operatorMnemonic)
  console.log(`Admin: ${operator.addr}`)

  // Setup Algod client
  const algodClient = new algosdk.Algodv2(
    LOCALNET.algodToken,
    LOCALNET.algodServer,
    LOCALNET.algodPort
  )

  // Project parameters
  const PROJECT_ID = 'TestProject'
  const INSTALLED_AC_KW = 5000n // 5 MW
  const TREASURY_ADDRESS = operator.addr // Use admin as treasury for testing
  const PLATFORM_KW_BPS = 500n // 5%
  const PLATFORM_KWH_RATE_BPS = 500n // 5%

  console.log()
  console.log('Project Configuration:')
  console.log(`  Project ID:        ${PROJECT_ID}`)
  console.log(`  Installed AC kW:   ${INSTALLED_AC_KW}`)
  console.log(`  Treasury:          ${TREASURY_ADDRESS}`)
  console.log(`  Platform kW Rate:  ${PLATFORM_KW_BPS / 100n}%`)
  console.log(`  Platform kWh Rate: ${PLATFORM_KWH_RATE_BPS / 100n}%`)
  console.log()

  try {
    // Step 1: Initialize ProjectRegistry
    console.log('[1/5] Initializing ProjectRegistry...')
    const registry = new ProjectRegistryClient(
      {
        resolveBy: 'id',
        id: LOCALNET_CONFIG.registryAppId,
        sender: operator.addr,
      },
      algodClient
    )

    await registry.initRegistry({
      args: {
        projectId: PROJECT_ID,
        installedAcKw: INSTALLED_AC_KW,
        treasury: TREASURY_ADDRESS,
        platformKwBps: PLATFORM_KW_BPS,
        platformKwhRateBps: PLATFORM_KWH_RATE_BPS,
        admin: operator.addr,
      },
    })
    console.log('✅ ProjectRegistry initialized\n')

    // Step 2: Initialize kWToken
    console.log('[2/5] Initializing kWToken...')
    const kwToken = new KwTokenClient(
      {
        resolveBy: 'id',
        id: LOCALNET_CONFIG.kwTokenAppId,
        sender: operator.addr,
      },
      algodClient
    )

    await kwToken.initToken({
      args: {
        registry: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.registryAppId)),
        name: 'kW',
        symbol: 'KW-TST',
      },
    })
    console.log('✅ kWToken initialized\n')

    // Step 3: Initialize kWhReceipt
    console.log('[3/5] Initializing kWhReceipt...')
    const kwhReceipt = new KWhReceiptClient(
      {
        resolveBy: 'id',
        id: LOCALNET_CONFIG.kwhReceiptAppId,
        sender: operator.addr,
      },
      algodClient
    )

    await kwhReceipt.initReceipt({
      args: {
        registry: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.registryAppId)),
        vault: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.revenueVaultAppId)),
      },
    })
    console.log('✅ kWhReceipt initialized\n')

    // Step 4: Initialize RevenueVault
    console.log('[4/5] Initializing RevenueVault...')
    const vault = new RevenueVaultClient(
      {
        resolveBy: 'id',
        id: LOCALNET_CONFIG.revenueVaultAppId,
        sender: operator.addr,
      },
      algodClient
    )

    await vault.initVault({
      args: {
        registry: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.registryAppId)),
        kwToken: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.kwTokenAppId)),
        kwhReceipt: algosdk.getApplicationAddress(Number(LOCALNET_CONFIG.kwhReceiptAppId)),
        treasury: TREASURY_ADDRESS,
        settlementAssetId: 0n, // 0 = ALGO
        platformKwhRateBps: PLATFORM_KWH_RATE_BPS,
      },
    })
    console.log('✅ RevenueVault initialized\n')

    // Step 5: Wire contracts in ProjectRegistry
    console.log('[5/5] Wiring contracts in ProjectRegistry...')
    await registry.setContracts({
      args: {
        kwTokenApp: LOCALNET_CONFIG.kwTokenAppId,
        kwhReceiptApp: LOCALNET_CONFIG.kwhReceiptAppId,
        revenueVaultApp: LOCALNET_CONFIG.revenueVaultAppId,
      },
    })
    console.log('✅ Contracts wired\n')

    console.log('=== Initialization Complete ===')
    console.log()
    console.log('✅ All contracts initialized and wired!')
    console.log('✅ Ready for operator workflows (Financial Close, Monthly Epoch)')
    console.log()

  } catch (error) {
    console.error('\n❌ Initialization failed:')
    console.error(error)
    process.exit(1)
  }
}

main()
