#!/usr/bin/env ts-node
/**
 * CLI: Activate Protius V1 Protocol
 *
 * Cross-links core contracts after initialization.
 * Enables protocol communication without opening economic activity.
 *
 * Usage:
 *   npm run operator:activate
 *
 * Environment:
 *   DEPLOYER_MNEMONIC - Admin mnemonic (required)
 *   NETWORK - Target network (default: localnet)
 */

import algosdk from 'algosdk'
import { ProtiusOperator } from '../../src/ops/operator'
import { LOCALNET_CONFIG } from '../../src/config/project'
import { LOCALNET } from '../../src/config/networks'

async function main() {
  // Load admin account
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
  if (!deployerMnemonic) {
    console.error('❌ DEPLOYER_MNEMONIC environment variable not set')
    console.error('   Export your admin mnemonic to activate the protocol')
    process.exit(1)
  }

  const admin = algosdk.mnemonicToSecretKey(deployerMnemonic)

  // Use config with admin address
  const config = {
    ...LOCALNET_CONFIG,
    adminAddress: admin.addr.toString(),
    treasuryAddress: admin.addr.toString(),
  }

  // Create operator
  const operator = new ProtiusOperator(config, LOCALNET)

  // Run activation
  try {
    const result = await operator.activate(admin)
    
    if (result.success) {
      console.log('✅ Protocol activation completed successfully')
      process.exit(0)
    } else {
      console.error('❌ Protocol activation failed')
      process.exit(1)
    }
  } catch (error: any) {
    console.error()
    console.error('❌ Fatal error:', error.message || error)
    if (error.stack) console.error('Stack:', error.stack)
    if (error.response) console.error('Response:', error.response)
    process.exit(1)
  }
}

main()
