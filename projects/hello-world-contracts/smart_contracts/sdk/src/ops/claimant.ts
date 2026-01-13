/**
 * Protius Claimant API
 * 
 * **Public interface for kW token holders**
 * 
 * Exposes ONE function only: claim(epochId)
 * 
 * This is the only SDK operation available to non-admin users.
 * Claimants execute inputless claims against settled epochs.
 */

import algosdk from 'algosdk'
import type { ProtiusProjectConfig } from '../config/project'
import type { AlgorandNetworkConfig } from '../config/networks'
import { createClients, waitForConfirmation } from '../lib/algod'
import { buildAndSubmitGroup } from '../lib/group'
import { validateEpochId, validateAddress } from '../lib/validate'

/**
 * Claim result
 */
export interface ClaimResult {
  /** Epoch ID claimed from */
  epochId: bigint

  /** Amount claimed */
  amountClaimed: bigint

  /** Transaction ID */
  txId: string

  /** Claimant address */
  claimant: string
}

/**
 * Protius Claimant - Public claim interface
 */
export class ProtiusClaimant {
  private clients: ReturnType<typeof createClients>

  constructor(
    private config: ProtiusProjectConfig,
    private network: AlgorandNetworkConfig
  ) {
    this.clients = createClients(network)
  }

  /**
   * Claim distributable revenue for epoch
   * 
   * **Inputless claim**: No amount parameter required.
   * Contract reads entitlement on-chain from entitledAmount[epochId, claimant].
   * 
   * Constraints:
   * - Epoch must be SETTLED
   * - Claimant must have entitlement > 0
   * - Claim is atomic with payout (inner txn)
   * 
   * @param epochId Epoch ID to claim from (YYYYMM format)
   * @param claimant Claimant account (kW token holder)
   */
  async claim(epochId: bigint, claimant: algosdk.Account): Promise<ClaimResult> {
    console.log(`=== Claim Epoch ${epochId} ===`)

    // Validate inputs
    validateEpochId(epochId)
    validateAddress(claimant.addr.toString())

    // Step 1: Query claimable amount (optional preview)
    console.log('Querying claimable amount...')
    // TODO: Use VaultClient.viewClaimable()
    const claimableAmount = 0n // Placeholder
    console.log(`Claimable: ${claimableAmount}`)

    if (claimableAmount === 0n) {
      throw new Error(`No claimable amount for epoch ${epochId}`)
    }

    // Step 2: Build claim transaction (placeholder - use generated client)
    console.log('Building claim transaction...')
    // TODO: Replace with actual VaultClient.send.claim() call
    // For now, this is a placeholder - generated clients should be used directly

    // Step 3: Submit claim (placeholder)
    console.log('Submitting claim...')
    // Placeholder transaction submission
    const txId = 'placeholder-txid'

    // Step 4: Wait for confirmation
    console.log('Waiting for confirmation...')
    // await waitForConfirmation(this.clients.algod, txId)

    console.log(`✓ Claim successful: ${txId}`)
    console.log(`=== Claim Complete ===`)

    return {
      epochId,
      amountClaimed: claimableAmount,
      txId,
      claimant: claimant.addr.toString(),
    }
  }

  /**
   * View claimable amount (preview without executing claim)
   */
  async viewClaimable(epochId: bigint, holder: string): Promise<bigint> {
    validateEpochId(epochId)
    validateAddress(holder)

    // TODO: Use VaultClient.viewClaimable()
    console.log(`Querying claimable for holder ${holder}, epoch ${epochId}`)

    return 0n // Placeholder
  }

  /**
   * Check if holder has claimed for epoch
   */
  async hasClaimed(epochId: bigint, holder: string): Promise<boolean> {
    validateEpochId(epochId)
    validateAddress(holder)

    // TODO: Query hasClaimed[epochId, holder] box state
    return false // Placeholder
  }

  /**
   * Get claim history for holder
   */
  async getClaimHistory(holder: string): Promise<
    Array<{
      epochId: bigint
      amountClaimed: bigint
      claimedAt: bigint
    }>
  > {
    validateAddress(holder)

    // TODO: Query all epochs where holder has claimed
    return [] // Placeholder
  }
}
