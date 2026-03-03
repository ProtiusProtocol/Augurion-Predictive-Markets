/**
 * Test Script: Initialize Remaining Contracts
 * 
 * Initializes:
 * - kWhReceipt (756074340)
 * - RevenueVault (756074359)
 * 
 * This enables Stage 2 features (production tracking, revenue settlement)
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KWhReceiptClient } from './artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultClient } from './artifacts/revenue_vault/RevenueVaultClient'
import algosdk from 'algosdk'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.testnet' })

async function initializeContracts() {
  console.log('🚀 Initializing Remaining Contracts...\n')

  // Initialize Algorand client
  const algodClient = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud',
    process.env.ALGOD_PORT || 443
  )

  const algorand = AlgorandClient.fromClients({ algod: algodClient })

  // Load deployer account
  const deployer = algosdk.mnemonicToSecretKey(process.env.DEPLOYER_MNEMONIC!)
  console.log(`✅ Deployer: ${deployer.addr}\n`)

  // Contract App IDs
  const registryAppId = 756074148
  const kwTokenAppId = 756074167
  const kwhReceiptAppId = 756074340
  const revenueVaultAppId = 756074359

  // ============================================
  // 1. Initialize kWhReceipt
  // ============================================
  console.log('📋 Initializing kWhReceipt...')
  console.log(`   App ID: ${kwhReceiptAppId}`)

  try {
    const kwhReceipt = algorand.client.getTypedAppClientById(KWhReceiptClient, {
      id: kwhReceiptAppId,
      sender: deployer,
    })

    const initReceiptResult = await kwhReceipt.send.initReceipt({
      args: {
        registry: registryAppId,
        vault: revenueVaultAppId,
      },
    })

    console.log('✅ kWhReceipt initialized!')
    console.log(`   Transaction ID: ${initReceiptResult.transaction.txID()}`)
    console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${initReceiptResult.transaction.txID()}\n`)

  } catch (error: any) {
    if (error.message?.includes('already initialized')) {
      console.log('⚠️  kWhReceipt already initialized (skipping)\n')
    } else {
      console.error('❌ Error initializing kWhReceipt:', error.message)
      throw error
    }
  }

  // ============================================
  // 2. Initialize RevenueVault
  // ============================================
  console.log('💰 Initializing RevenueVault...')
  console.log(`   App ID: ${revenueVaultAppId}`)

  try {
    const revenueVault = algorand.client.getTypedAppClientById(RevenueVaultClient, {
      id: revenueVaultAppId,
      sender: deployer,
    })

    const initVaultResult = await revenueVault.send.init({
      args: {
        registry: registryAppId,
        kwh_receipt: kwhReceiptAppId,
        kwtoken: kwTokenAppId,
      },
    })

    console.log('✅ RevenueVault initialized!')
    console.log(`   Transaction ID: ${initVaultResult.transaction.txID()}`)
    console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${initVaultResult.transaction.txID()}\n`)

  } catch (error: any) {
    if (error.message?.includes('already initialized')) {
      console.log('⚠️  RevenueVault already initialized (skipping)\n')
    } else {
      console.error('❌ Error initializing RevenueVault:', error.message)
      throw error
    }
  }

  console.log('🎉 All contracts initialized!')
  console.log('\n📊 Contract Status:')
  console.log('   ProjectRegistry (756074148) ✅ Active')
  console.log('   KWToken (756074167) ✅ Active')
  console.log('   kWhReceipt (756074340) ✅ Initialized')
  console.log('   RevenueVault (756074359) ✅ Initialized')
  console.log('\n🚀 Stage 2 features now available!')
}

// Run
initializeContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
