/**
 * Operator Script: Full Monthly Epoch Execution
 * 
 * Canonical runbook for monthly revenue distribution.
 * 
 * Usage:
 *   ts-node scripts/operator/07_full_epoch.ts \
 *     --epochId 202501 \
 *     --netRevenue 1000000 \
 *     --accrualFile ./accruals/202501.json
 */

import algosdk from 'algosdk'
import { ProtiusOperator } from '../../src/ops/operator'
import { LOCALNET_CONFIG } from '../../src/config/project'
import { LOCALNET } from '../../src/config/networks'
import { PEOMaturityStatus } from '../../src/types/peo'

/**
 * Parse command line arguments
 */
function parseArgs(): {
  epochId: bigint
  netRevenue: bigint
  accrualFile: string
} {
  const args = process.argv.slice(2)
  let epochId: bigint | null = null
  let netRevenue: bigint | null = null
  let accrualFile = ''

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]

    switch (flag) {
      case '--epochId':
        epochId = BigInt(value)
        break
      case '--netRevenue':
        netRevenue = BigInt(value)
        break
      case '--accrualFile':
        accrualFile = value
        break
    }
  }

  if (!epochId || !netRevenue || !accrualFile) {
    console.error('Usage: ts-node 07_full_epoch.ts --epochId <YYYYMM> --netRevenue <amount> --accrualFile <path>')
    process.exit(1)
  }

  return { epochId, netRevenue, accrualFile }
}

/**
 * Main execution
 */
async function main() {
  const { epochId, netRevenue, accrualFile } = parseArgs()

  console.log('=== Protius Monthly Epoch Execution ===')
  console.log(`Epoch ID: ${epochId}`)
  console.log(`Net Revenue: ${netRevenue}`)
  console.log(`Accrual File: ${accrualFile}`)
  console.log()

  // Step 1: Load configuration
  const config = LOCALNET_CONFIG
  const network = LOCALNET

  // Step 2: Load operator account
  // In production, use secure key management
  const operatorMnemonic = process.env.OPERATOR_MNEMONIC || ''
  if (!operatorMnemonic) {
    throw new Error('OPERATOR_MNEMONIC environment variable not set')
  }
  const operator = algosdk.mnemonicToSecretKey(operatorMnemonic)
  console.log(`Operator: ${operator.addr}`)

  // Step 3: Load PEO from InfraPilot
  // In production, fetch from InfraPilot API
  const peo = {
    projectId: config.projectId,
    status: PEOMaturityStatus.OPERATING,
    evaluatedAt: BigInt(Math.floor(Date.now() / 1000)),
    installedAcKw: 5000n,
    treasuryAddress: config.treasuryAddress,
    platformKwhRateBps: 500n, // 5%
  }
  console.log(`PEO Status: ${peo.status}`)
  console.log()

  // Step 4: Load accrual report
  const fs = require('fs')
  const accrualReport = JSON.parse(fs.readFileSync(accrualFile, 'utf-8'))
  console.log('Accrual report loaded')

  // Step 5: Initialize operator SDK
  const sdk = new ProtiusOperator(config, network)

  // Step 6: Execute monthly epoch
  const result = await sdk.runMonthlyEpoch({
    epochId,
    startDate: BigInt(Math.floor(new Date('2025-01-01').getTime() / 1000)),
    endDate: BigInt(Math.floor(new Date('2025-01-31').getTime() / 1000)),
    accrualReport,
    netRevenue,
    platformKwhRateBps: peo.platformKwhRateBps || 500n,
    operator,
    peo,
  })

  console.log()
  console.log('=== Execution Complete ===')
  console.log(`Epoch ID: ${result.epochId}`)
  console.log(`Entitlements Hash: ${result.entitlementsHash}`)
  console.log(`Transactions: ${result.txIds.length}`)
  result.txIds.forEach((txId, i) => {
    console.log(`  [${i + 1}] ${txId}`)
  })
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
