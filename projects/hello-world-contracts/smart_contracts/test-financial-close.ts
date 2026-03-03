/**
 * Test Script: Execute Financial Close on KWToken
 * 
 * This allocates tokens at Financial Close:
 * - Treasury: 100,000 kW (10%)
 * - Investor: 900,000 kW (90%)
 * 
 * After execution, transfers are enabled.
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KwTokenClient } from './artifacts/kw_token/KWTokenClient'
import algosdk from 'algosdk'
import * as dotenv from 'dotenv'

// Load TestNet config
dotenv.config({ path: '.env.testnet' })

async function executeFinancialClose() {
  console.log('🚀 Starting Financial Close Test...\n')

  // Initialize Algorand client
  const algodClient = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud',
    process.env.ALGOD_PORT || 443
  )

  const algorand = AlgorandClient.fromClients({ algod: algodClient })

  // Load deployer account
  const deployer = algosdk.mnemonicToSecretKey(process.env.DEPLOYER_MNEMONIC!)
  console.log(`✅ Deployer: ${deployer.addr}`)

  // Get KWToken client
  const kwTokenAppId = 756074167
  const kwToken = algorand.client.getTypedAppClientById(KwTokenClient, {
    id: kwTokenAppId,
    sender: deployer,
  })

  console.log(`✅ KWToken App ID: ${kwTokenAppId}\n`)

  // Check current state
  console.log('📊 Checking current state...')
  const globalState = await kwToken.appClient.getGlobalState()
  
  const fcFinalized = globalState.fcFinalized?.asNumber() ?? 0
  const transfersEnabled = globalState.transfersEnabled?.asNumber() ?? 0
  
  console.log(`   fcFinalized: ${fcFinalized}`)
  console.log(`   transfersEnabled: ${transfersEnabled}\n`)

  if (fcFinalized === 1) {
    console.log('⚠️  Financial Close already executed!')
    console.log('   Tokens already allocated. Skipping...')
    return
  }

  // Execute Financial Close
  console.log('🎯 Executing Financial Close...')
  console.log('   Installed Capacity: 1,000,000 kW')
  console.log('   Platform Fee: 10% (1,000 bps)')
  console.log('   Treasury: 100,000 kW')
  console.log('   Investor: 900,000 kW\n')

  const treasuryAddr = deployer.addr
  const investorAddr = deployer.addr // For testing, using same address

  try {
    const result = await kwToken.send.finalizeFinancialCloseSimple({
      args: {
        installedAcKw: 1_000_000,
        platformKwBps: 1_000,
        treasury: treasuryAddr,
        investorAddress: investorAddr,
      },
    })

    console.log('✅ Financial Close executed successfully!')
    console.log(`   Transaction ID: ${result.transaction.txID()}`)
    console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${result.transaction.txID()}\n`)

    // Verify new state
    console.log('📊 Verifying new state...')
    const newState = await kwToken.appClient.getGlobalState()
    
    console.log(`   fcFinalized: ${newState.fcFinalized?.asNumber()}`)
    console.log(`   transfersEnabled: ${newState.transfersEnabled?.asNumber()}`)
    console.log(`   treasuryMinted: ${newState.treasuryMinted?.asNumber()} kW`)
    console.log(`   investorMintedAmount: ${newState.investorMintedAmount?.asNumber()} kW\n`)

    console.log('🎉 Financial Close complete! Tokens allocated.')
    console.log('   Next: Test Holdings Dashboard to see balance')

  } catch (error: any) {
    console.error('❌ Error executing Financial Close:', error.message)
    throw error
  }
}

// Run
executeFinancialClose()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
