/**
 * Settlement Transaction Builder
 * 
 * Builds transaction for settling epoch entitlements.
 */

import algosdk from 'algosdk'
import type { AlgorandClients } from '../lib/algod'
import { validateEpochId } from '../lib/validate'

export interface SettleParams {
  /** Operator address (admin) */
  operator: string

  /** RevenueVault app ID */
  vaultAppId: bigint

  /** Epoch ID to settle */
  epochId: bigint
}

/**
 * Build settle epoch transaction
 */
export async function buildSettleTxn(
  params: SettleParams,
  clients: AlgorandClients
): Promise<algosdk.Transaction> {
  // Validate inputs
  validateEpochId(params.epochId)

  const suggestedParams = await clients.algod.getTransactionParams().do()

  // Build settleEpochEntitlements call
  // Note: In production, use generated client
  const settleTxn = algosdk.makeApplicationNoOpTxnFromObject({
    sender: params.operator,
    appIndex: Number(params.vaultAppId),
    appArgs: [
      new Uint8Array(Buffer.from('settleEpochEntitlements', 'utf-8')),
      encodeUint64(params.epochId),
    ],
    suggestedParams,
  })

  return settleTxn
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
