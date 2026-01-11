/**
 * Protius V1 Core — Contract Initialization Script
 * 
 * Initializes all 4 contracts with their cross-references.
 * Must be run AFTER all contracts are deployed.
 * 
 * Initialization order (DO NOT CHANGE):
 * 1. ProjectRegistry.init_registry() — Sets project parameters
 * 2. kWToken.initToken() — Links to ProjectRegistry
 * 3. kWhReceipt.initReceipt() — Links to ProjectRegistry
 * 4. RevenueVault.initVault() — Links to all 3 above
 * 5. ProjectRegistry.setContracts() — Completes the wiring
 * 
 * Usage:
 *   npx ts-node init-contracts.ts
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ProjectRegistryClient } from './artifacts/project_registry/ProjectRegistryClient'
import { KwTokenClient } from './artifacts/kw_token/KWTokenClient'
import { KWhReceiptClient } from './artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultClient } from './artifacts/revenue_vault/RevenueVaultClient'

// CONFIGURATION - UPDATE WITH ACTUAL VALUES
const REGISTRY_ID = 1026n
const KW_TOKEN_ID = 1028n
const KWH_RECEIPT_ID = 1030n
const REVENUE_VAULT_ID = 1032n

// Localnet test values
const PROJECT_ID = 'TestProject'
const INSTALLED_AC_KW = 5000n // 5 MW in kW
const TREASURY_ADDRESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY' // Zero address for test
const PLATFORM_KW_BPS = 500n // 5% of kW distributions
const PLATFORM_KWH_RATE_BPS = 500n // 5% of kWh revenue

async function main() {
  console.log('\n🔧 PROTIUS V1 CORE — CONTRACT INITIALIZATION\n')

  const algorand = AlgorandClient.fromEnvironment()
  const admin = await algorand.account.fromEnvironment('DEPLOYER')

  console.log(`Admin: ${admin.addr}\n`)

  try {
    // Step 1: Initialize ProjectRegistry
    console.log('📝 Step 1: Initializing ProjectRegistry...')
    const registry = new ProjectRegistryClient(
      {
        resolveBy: 'id',
        id: REGISTRY_ID,
      },
      algorand.client.algod
    )

    const initResult = await registry.send.initRegistry({
      projectId: PROJECT_ID,
      installedAcKw: INSTALLED_AC_KW,
      treasury: TREASURY_ADDRESS,
      platformKwBps: PLATFORM_KW_BPS,
      platformKwhRateBps: PLATFORM_KWH_RATE_BPS,
      admin: admin.addr,
    })
    console.log(`✅ ProjectRegistry initialized`)
    console.log(`   TxID: ${initResult.transactions[0].txID()}\n`)

    // Step 2: Initialize kWToken
    console.log('📝 Step 2: Initializing kWToken...')
    const kwToken = new KwTokenClient(
      {
        resolveBy: 'id',
        id: KW_TOKEN_ID,
      },
      algorand.client.algod
    )

    const tokenResult = await kwToken.send.initToken({
      registry: REGISTRY_ID,
      name: 'kW',
      symbol: 'KW-TST',
    })
    console.log(`✅ kWToken initialized`)
    console.log(`   TxID: ${tokenResult.transactions[0].txID()}\n`)

    // Step 3: Initialize kWhReceipt
    console.log('📝 Step 3: Initializing kWhReceipt...')
    const kwhReceipt = new KWhReceiptClient(
      {
        resolveBy: 'id',
        id: KWH_RECEIPT_ID,
      },
      algorand.client.algod
    )

    const receiptResult = await kwhReceipt.send.initReceipt({
      registry: REGISTRY_ID,
      vault: REVENUE_VAULT_ID,
    })
    console.log(`✅ kWhReceipt initialized`)
    console.log(`   TxID: ${receiptResult.transactions[0].txID()}\n`)

    // Step 4: Initialize RevenueVault
    console.log('📝 Step 4: Initializing RevenueVault...')
    const vault = new RevenueVaultClient(
      {
        resolveBy: 'id',
        id: REVENUE_VAULT_ID,
      },
      algorand.client.algod
    )

    const vaultResult = await vault.send.initVault({
      registry: REGISTRY_ID,
      kwToken: KW_TOKEN_ID,
      kwhReceipt: KWH_RECEIPT_ID,
      treasury: TREASURY_ADDRESS,
      settlementAssetId: 0n, // 0 = ALGO
      platformKwhRateBps: PLATFORM_KWH_RATE_BPS,
    })
    console.log(`✅ RevenueVault initialized`)
    console.log(`   TxID: ${vaultResult.transactions[0].txID()}\n`)

    // Step 5: Wire contracts in ProjectRegistry
    console.log('📝 Step 5: Wiring contracts in ProjectRegistry...')
    const wireResult = await registry.send.setContracts({
      kwTokenApp: KW_TOKEN_ID,
      kwhReceiptApp: KWH_RECEIPT_ID,
      revenueVaultApp: REVENUE_VAULT_ID,
    })
    console.log(`✅ Contracts wired in ProjectRegistry`)
    console.log(`   TxID: ${wireResult.transactions[0].txID()}\n`)

    console.log('🎉 INITIALIZATION COMPLETE\n')
    console.log('Summary:')
    console.log(`  ProjectRegistry:  ${REGISTRY_ID}`)
    console.log(`  kWToken:          ${KW_TOKEN_ID}`)
    console.log(`  kWhReceipt:       ${KWH_RECEIPT_ID}`)
    console.log(`  RevenueVault:     ${REVENUE_VAULT_ID}`)
    console.log()
    console.log('✅ Ready for operator workflows!\n')

  } catch (error) {
    console.error('❌ Initialization failed:')
    console.error(error)
    process.exit(1)
  }
}

main()
