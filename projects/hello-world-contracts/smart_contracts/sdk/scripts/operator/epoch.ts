/**
 * Protius Operator: Epoch Settlement CLI
 * 
 * Usage:
 *   npm run operator:epoch path/to/epoch.json
 * 
 * Epoch JSON format:
 * {
 *   "epochId": 202501,
 *   "periodStart": "2025-01-01",
 *   "periodEnd": "2025-01-31",
 *   "netRevenueMicroAlgos": 1000000,
 *   "accrualHash": "sha256:abc123..."
 * }
 */

import * as fs from 'fs'
import * as path from 'path'
import algosdk from 'algosdk'
import { ProtiusOperator, type EpochInput } from '../../src/ops/operator'
import { LOCALNET_CONFIG } from '../../src/config/project'
import { LOCALNET } from '../../src/config/networks'

async function main() {
  try {
    // Get epoch JSON path from command line
    const epochJsonPath = process.argv[2]
    if (!epochJsonPath) {
      console.error('\u274c Error: Missing epoch JSON file path')
      console.error('Usage: npm run operator:epoch path/to/epoch.json')
      process.exit(1)
    }

    // Resolve absolute path
    const absolutePath = path.isAbsolute(epochJsonPath) 
      ? epochJsonPath 
      : path.resolve(process.cwd(), epochJsonPath)

    // Load and validate epoch JSON
    console.log(`Loading epoch data from: ${absolutePath}`)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    const epochData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as EpochInput

    // Validate required fields
    const requiredFields: (keyof EpochInput)[] = [
      'epochId',
      'periodStart',
      'periodEnd',
      'netRevenueMicroAlgos',
      'accrualHash',
    ]
    
    for (const field of requiredFields) {
      if (epochData[field] === undefined || epochData[field] === null) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    // Validate types
    if (typeof epochData.epochId !== 'number') {
      throw new Error('epochId must be a number')
    }
    if (typeof epochData.periodStart !== 'string') {
      throw new Error('periodStart must be a string')
    }
    if (typeof epochData.periodEnd !== 'string') {
      throw new Error('periodEnd must be a string')
    }
    if (typeof epochData.netRevenueMicroAlgos !== 'number') {
      throw new Error('netRevenueMicroAlgos must be a number')
    }
    if (typeof epochData.accrualHash !== 'string') {
      throw new Error('accrualHash must be a string')
    }

    console.log('\u2705 Epoch JSON validated')
    console.log()

    // Load operator account from environment
    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC
    if (!deployerMnemonic) {
      throw new Error('DEPLOYER_MNEMONIC environment variable not set')
    }

    const operator = algosdk.mnemonicToSecretKey(deployerMnemonic)
    console.log(`Operator: ${operator.addr}`)
    console.log()

    // Initialize ProtiusOperator
    const protiusOperator = new ProtiusOperator(LOCALNET_CONFIG, LOCALNET)

    // Run epoch settlement
    await protiusOperator.runEpoch(operator, epochData)

  } catch (error: any) {
    console.error('\u274c Fatal error:', error.message || error)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

main()
