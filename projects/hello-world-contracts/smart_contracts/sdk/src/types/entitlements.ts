/**
 * Entitlements Data Structures
 * 
 * Defines types for off-chain entitlements computation and on-chain anchoring.
 */

/**
 * Single holder entitlement
 */
export interface HolderEntitlement {
  /** Holder address */
  address: string

  /** kW balance at snapshot */
  kwBalance: bigint

  /** Entitled amount (microalgos or smallest unit) */
  entitledAmount: bigint
}

/**
 * Complete entitlements set for an epoch
 */
export interface EpochEntitlements {
  /** Epoch ID (YYYYMM format, e.g., 202501n) */
  epochId: bigint

  /** Snapshot ID (from kWToken.snapshotEpoch) */
  snapshotId: bigint

  /** Total kW supply at snapshot */
  totalKw: bigint

  /** Net deposited revenue (R) */
  netDeposited: bigint

  /** Platform kWh rate in basis points */
  platformKwhRateBps: bigint

  /** Treasury base allocation */
  treasuryBase: bigint

  /** Remainder allocated to treasury */
  treasuryRemainder: bigint

  /** Total treasury entitlement */
  treasuryTotal: bigint

  /** All holder entitlements (including treasury) */
  holders: HolderEntitlement[]

  /** SHA-256 hash of canonical JSON representation */
  hash: string

  /** Computation timestamp */
  computedAt: number // Unix timestamp (seconds)

  /** SDK version that computed this */
  sdkVersion: string
}

/**
 * Entitlements computation parameters
 */
export interface ComputeEntitlementsParams {
  /** Epoch ID */
  epochId: bigint

  /** Snapshot ID from kWToken */
  snapshotId: bigint

  /** Net deposited revenue */
  netDeposited: bigint

  /** Platform rate in basis points */
  platformKwhRateBps: bigint

  /** Treasury address */
  treasuryAddress: string

  /** kW holder balances at snapshot */
  holderBalances: Map<string, bigint>
}

/**
 * Result of entitlements computation
 */
export interface EntitlementsComputationResult {
  /** Complete entitlements data */
  entitlements: EpochEntitlements

  /** Canonical JSON representation (sorted keys) */
  canonicalJson: string

  /** SHA-256 hash */
  hash: string

  /** Conservation check passed */
  conservationValid: boolean

  /** Sum of all entitlements */
  sumEntitlements: bigint
}

/**
 * Batch setEntitlement operation
 */
export interface BatchSetEntitlement {
  /** Addresses to set (max 16 per batch) */
  addresses: string[]

  /** Amounts corresponding to addresses */
  amounts: bigint[]

  /** Batch index (for tracking) */
  batchIndex: number

  /** Total batches */
  totalBatches: number
}

/**
 * Validation error for entitlements
 */
export class EntitlementsValidationError extends Error {
  constructor(message: string) {
    super(`Entitlements validation failed: ${message}`)
    this.name = 'EntitlementsValidationError'
  }
}
