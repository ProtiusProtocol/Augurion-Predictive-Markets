#!/usr/bin/env ts-node
/**
 * CLI: Initialize Protius V1 Core Contracts
 * 
 * One-time setup after deployment.
 * Wires all 4 contracts together with cross-references.
 * 
 * Must be run by admin account (DEPLOYER_MNEMONIC).
 * 
 * Usage:
 *   npm run operator:init
 * 
 * Environment:
 *   DEPLOYER_MNEMONIC - Admin mnemonic (required)
 *   NETWORK - Target network (default: localnet)
 * 
 * Optional params (defaults shown):
 *   PROJECT_ID='ProtProject'
 *   INSTALLED_AC_KW=5000
 *   PLATFORM_KW_BPS=500 (5%)
 *   PLATFORM_KWH_BPS=500 (5%)
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
    console.error('   Export your admin mnemonic to initialize contracts')
    process.exit(1)
  }

  const admin = algosdk.mnemonicToSecretKey(deployerMnemonic)

  // Read optional parameters from env
  const projectId = process.env.PROJECT_ID
  const installedAcKw = process.env.INSTALLED_AC_KW ? BigInt(process.env.INSTALLED_AC_KW) : undefined
  const platformKwBps = process.env.PLATFORM_KW_BPS ? BigInt(process.env.PLATFORM_KW_BPS) : undefined
  const platformKwhRateBps = process.env.PLATFORM_KWH_BPS ? BigInt(process.env.PLATFORM_KWH_BPS) : undefined
  const treasury = process.env.TREASURY_ADDRESS

  // Update config with admin and treasury addresses
  const config = {
    ...LOCALNET_CONFIG,
    adminAddress: admin.addr.toString(),
    treasuryAddress: treasury || admin.addr.toString(), // Default to admin if not specified
  }

  // Initialize operator
  const operator = new ProtiusOperator(config, LOCALNET)

  // Run initialization
  try {
    const result = await operator.init(admin, {
      projectId,
      installedAcKw,
      treasury,
      platformKwBps,
      platformKwhRateBps,
    })
    
    if (result.success) {
      console.log('✅ Initialization completed successfully')
      process.exit(0)
    } else {
      console.error('❌ Initialization failed')
      process.exit(1)
    }
  } catch (error: any) {
    console.error()
    console.error('❌ Fatal error:', error.message || error)
    process.exit(1)
  }
}

main()
