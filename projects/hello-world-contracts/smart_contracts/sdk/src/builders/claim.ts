/**
 * Claim Transaction Builder
 * 
 * Builds group transaction for claiming distributable revenue:
 * [0] RevenueVault.claim(epochId) - inputless, reads entitlement on-chain
 * [1] Asset/ALGO transfer (vault → claimant) - automatic inner txn
 * 
 * Note: Actual implementation may vary based on contract design.
 * This builder prepares the claim call; payout happens via inner txn.
 */

import algosdk from 'algosdk'
import type { AlgorandClients } from '../lib/algod'
import { validateEpochId, validateAddress } from '../lib/validate'

export interface ClaimParams {
  /** Claimant address (kW token holder) */
  claimant: string

  /** RevenueVault app ID */
  vaultAppId: bigint

  /** Epoch ID to claim from */
  epochId: bigint

  /** Revenue asset ID (for reference, not used in txn construction) */
  assetId?: bigint
}

/**
 * Build claim transaction
 * 
 * This is an inputless call - no amount parameter.
 * Contract reads entitledAmount[epochId, claimant] on-chain.
 */
export async function buildClaimTxn(
  params: ClaimParams,
  clients: AlgorandClients
): Promise<algosdk.Transaction> {
  // Validate inputs
  validateAddress(params.claimant)
  validateEpochId(params.epochId)

  const suggestedParams = await clients.algod.getTransactionParams().do()

  // Build claim call (inputless - only epochId)
  // Note: In production, use generated client
  const claimTxn = algosdk.makeApplicationNoOpTxnFromObject({
    from: params.claimant,
    appIndex: Number(params.vaultAppId),
    appArgs: [
      new Uint8Array(Buffer.from('claim', 'utf-8')),
      encodeUint64(params.epochId),
    ],
    suggestedParams,
  })

  return claimTxn
}

/**
 * Query claimable amount before executing claim
 * 
 * Allows claimant to preview their entitlement.
 */
export async function queryClaimable(
  params: ClaimParams,
  clients: AlgorandClients
): Promise<bigint> {
  // Read box state: entitledAmount[epochId, claimant]
  // This requires implementing box read logic
  
  // Placeholder implementation
  throw new Error('queryClaimable not implemented - use VaultClient.viewClaimable()')
}

/**
 * Helper: Encode uint64
 */
function encodeUint64(value: bigint): Uint8Array {
  const arr = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) {
    arr[i] = Number(value & 0xffn)
    value = value >> 8n
  }
  return arr
}
