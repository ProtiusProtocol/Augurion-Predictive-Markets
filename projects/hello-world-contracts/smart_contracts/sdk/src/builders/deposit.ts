/**
 * Deposit Transaction Builder
 * 
 * Builds group transaction for depositing net revenue:
 * [0] Asset/ALGO transfer (depositor → vault)
 * [1] RevenueVault.depositNetRevenue(epochId, amount)
 */

import algosdk from 'algosdk'
import type { AlgorandClients } from '../lib/algod'
import { makePaymentTxn, makeAssetTransferTxn, assignGroupId } from '../lib/group'
import { validatePositiveAmount, validateEpochId } from '../lib/validate'

export interface DepositParams {
  /** Depositor address (sender) */
  depositor: string

  /** RevenueVault app address */
  vaultAddress: string

  /** RevenueVault app ID */
  vaultAppId: bigint

  /** Epoch ID (YYYYMM) */
  epochId: bigint

  /** Net revenue amount to deposit */
  amount: bigint

  /** Revenue asset ID (0 for ALGO) */
  assetId: bigint
}

/**
 * Build deposit group transaction
 */
export async function buildDepositGroup(
  params: DepositParams,
  clients: AlgorandClients
): Promise<algosdk.Transaction[]> {
  // Validate inputs
  validateEpochId(params.epochId)
  validatePositiveAmount(params.amount, 'deposit amount')

  const suggestedParams = await clients.algod.getTransactionParams().do()

  // Transaction 0: Transfer asset/ALGO to vault
  const transferTxn =
    params.assetId === 0n
      ? makePaymentTxn(
          params.depositor,
          params.vaultAddress,
          params.amount,
          suggestedParams,
          new Uint8Array(Buffer.from(`Deposit epoch ${params.epochId}`, 'utf-8'))
        )
      : makeAssetTransferTxn(
          params.depositor,
          params.vaultAddress,
          params.assetId,
          params.amount,
          suggestedParams,
          new Uint8Array(Buffer.from(`Deposit epoch ${params.epochId}`, 'utf-8'))
        )

  // Transaction 1: Call depositNetRevenue
  // Note: In production, use generated client to build this properly
  const depositCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
    sender: params.depositor,
    appIndex: Number(params.vaultAppId),
    appArgs: [
      new Uint8Array(Buffer.from('depositNetRevenue', 'utf-8')),
      encodeUint64(params.epochId),
      encodeUint64(params.amount),
    ],
    suggestedParams,
  })

  // Assign group ID
  return assignGroupId([transferTxn, depositCallTxn])
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
