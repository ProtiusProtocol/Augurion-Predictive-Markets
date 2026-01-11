/**
 * Entitlements Builder
 * 
 * Computes off-chain entitlements with deterministic rounding.
 * Implements floor division with remainder allocated to treasury.
 */

import type { EpochEntitlements, ComputeEntitlementsParams, EntitlementsComputationResult } from '../types/entitlements'
import { computeEntitlementsHash, toCanonicalJson } from '../lib/hash'
import { validatePositiveAmount, validateBasisPoints, validateEntitlementsConservation } from '../lib/validate'

/**
 * Compute entitlements for epoch
 * 
 * Algorithm:
 * 1. Compute treasury base = floor(R * alpha / 10000)
 * 2. Remaining for kW = R - treasuryBase
 * 3. For each holder: baseShare = floor(remaining * holderKw / totalKw)
 * 4. Remainder = R - treasuryBase - sum(all baseShares)
 * 5. Treasury receives: baseShare + treasuryBase + remainder
 * 
 * Conservation: sum(all entitlements) == R exactly
 */
export function computeEntitlements(params: ComputeEntitlementsParams): EntitlementsComputationResult {
  // Validate inputs
  validatePositiveAmount(params.netDeposited, 'netDeposited')
  validateBasisPoints(params.platformKwhRateBps)

  const R = params.netDeposited
  const alpha = params.platformKwhRateBps

  // Step 1: Treasury base (floor division)
  const treasuryBase = (R * alpha) / 10000n

  // Step 2: Remaining for kW holders
  const remainingForKw = R - treasuryBase

  // Step 3: Compute total kW supply
  let totalKw = 0n
  for (const balance of params.holderBalances.values()) {
    totalKw += balance
  }

  if (totalKw === 0n) {
    throw new Error('Total kW supply is zero, cannot compute entitlements')
  }

  // Step 4: Compute base shares for each holder (floor division)
  const holders: Array<{ address: string; balance: bigint; baseShare: bigint }> = []
  let sumBaseShares = 0n

  for (const [address, balance] of params.holderBalances.entries()) {
    const baseShare = (remainingForKw * balance) / totalKw
    holders.push({ address, balance, baseShare })
    sumBaseShares += baseShare
  }

  // Step 5: Compute remainder
  const remainder = R - treasuryBase - sumBaseShares

  // Step 6: Allocate final entitlements
  const finalEntitlements: Array<{ address: string; amount: bigint }> = []
  let treasuryFinalAmount = 0n

  for (const holder of holders) {
    if (holder.address === params.treasuryAddress) {
      // Treasury receives: baseShare + treasuryBase + remainder
      treasuryFinalAmount = holder.baseShare + treasuryBase + remainder
      finalEntitlements.push({
        address: holder.address,
        amount: treasuryFinalAmount,
      })
    } else {
      // Other holders receive baseShare only
      finalEntitlements.push({
        address: holder.address,
        amount: holder.baseShare,
      })
    }
  }

  // If treasury is not a kW holder, add as separate entitlement
  if (!params.holderBalances.has(params.treasuryAddress)) {
    treasuryFinalAmount = treasuryBase + remainder
    finalEntitlements.push({
      address: params.treasuryAddress,
      amount: treasuryFinalAmount,
    })
  }

  // Step 7: Validate conservation
  const sumEntitlements = finalEntitlements.reduce((sum, e) => sum + e.amount, 0n)
  validateEntitlementsConservation(finalEntitlements, R)

  // Step 8: Compute hash
  const hash = computeEntitlementsHash(params.epochId, finalEntitlements)

  // Step 9: Build result
  const entitlements: EpochEntitlements = {
    epochId: params.epochId,
    snapshotId: params.snapshotId,
    totalKw,
    netDeposited: R,
    platformKwhRateBps: alpha,
    treasuryBase,
    treasuryRemainder: remainder,
    treasuryTotal: treasuryFinalAmount,
    holders: finalEntitlements.map((e) => ({
      address: e.address,
      kwBalance: params.holderBalances.get(e.address) || 0n,
      entitledAmount: e.amount,
    })),
    hash,
    computedAt: Math.floor(Date.now() / 1000),
    sdkVersion: '1.0.0', // TODO: Read from package.json
  }

  const canonicalJson = toCanonicalJson(entitlements)

  return {
    entitlements,
    canonicalJson,
    hash,
    conservationValid: sumEntitlements === R,
    sumEntitlements,
  }
}

/**
 * Batch entitlements for setEntitlement calls
 * 
 * Algorand group tx limit: 16 transactions
 * Reserve 1-2 for anchoring/settlement = max 14-15 setEntitlement per batch
 */
export function batchEntitlements(
  entitlements: Array<{ address: string; amount: bigint }>,
  batchSize: number = 14
): Array<{
  addresses: string[]
  amounts: bigint[]
  batchIndex: number
  totalBatches: number
}> {
  if (batchSize > 15) {
    throw new Error('Batch size cannot exceed 15 (group tx limit)')
  }

  const batches: Array<{
    addresses: string[]
    amounts: bigint[]
    batchIndex: number
    totalBatches: number
  }> = []

  const totalBatches = Math.ceil(entitlements.length / batchSize)

  for (let i = 0; i < entitlements.length; i += batchSize) {
    const batch = entitlements.slice(i, i + batchSize)
    batches.push({
      addresses: batch.map((e) => e.address),
      amounts: batch.map((e) => e.amount),
      batchIndex: Math.floor(i / batchSize),
      totalBatches,
    })
  }

  return batches
}

/**
 * Save entitlements to file (for audit trail)
 */
export function saveEntitlementsToFile(
  result: EntitlementsComputationResult,
  outputPath: string
): void {
  const fs = require('fs')
  const path = require('path')

  // Ensure outputs directory exists
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Write canonical JSON
  fs.writeFileSync(outputPath, result.canonicalJson, 'utf-8')

  console.log(`Entitlements saved to: ${outputPath}`)
  console.log(`Hash: ${result.hash}`)
  console.log(`Conservation valid: ${result.conservationValid}`)
  console.log(`Sum entitlements: ${result.sumEntitlements}`)
}
