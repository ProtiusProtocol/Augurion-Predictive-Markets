/**
 * Claimant Script: Claim Distributable Revenue
 * 
 * Executes inputless claim for a single epoch.
 * 
 * Usage:
 *   ts-node scripts/claimant/claim.ts --epochId 202501
 */

import algosdk from 'algosdk'
import { ProtiusClaimant } from '../../src/ops/claimant'
import { LOCALNET_CONFIG } from '../../src/config/project'
import { LOCALNET } from '../../src/config/networks'

/**
 * Parse command line arguments
 */
function parseArgs(): { epochId: bigint } {
  const args = process.argv.slice(2)
  let epochId: bigint | null = null

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]

    if (flag === '--epochId') {
      epochId = BigInt(value)
    }
  }

  if (!epochId) {
    console.error('Usage: ts-node claim.ts --epochId <YYYYMM>')
    process.exit(1)
  }

  return { epochId }
}

/**
 * Main execution
 */
async function main() {
  const { epochId } = parseArgs()

  console.log('=== Protius Claim ===')
  console.log(`Epoch ID: ${epochId}`)
  console.log()

  // Step 1: Load configuration
  const config = LOCALNET_CONFIG
  const network = LOCALNET

  // Step 2: Load claimant account
  // In production, use secure key management or wallet integration
  const claimantMnemonic = process.env.CLAIMANT_MNEMONIC || ''
  if (!claimantMnemonic) {
    throw new Error('CLAIMANT_MNEMONIC environment variable not set')
  }
  const claimant = algosdk.mnemonicToSecretKey(claimantMnemonic)
  console.log(`Claimant: ${claimant.addr}`)
  console.log()

  // Step 3: Initialize claimant SDK
  const sdk = new ProtiusClaimant(config, network)

  // Step 4: Preview claimable amount
  console.log('Checking claimable amount...')
  const claimableAmount = await sdk.viewClaimable(epochId, claimant.addr)
  console.log(`Claimable: ${claimableAmount}`)

  if (claimableAmount === 0n) {
    console.log('No claimable amount. Exiting.')
    return
  }

  // Step 5: Execute claim
  console.log()
  const result = await sdk.claim(epochId, claimant)

  console.log()
  console.log('=== Claim Complete ===')
  console.log(`Amount Claimed: ${result.amountClaimed}`)
  console.log(`Transaction ID: ${result.txId}`)
  console.log(`Claimant: ${result.claimant}`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
