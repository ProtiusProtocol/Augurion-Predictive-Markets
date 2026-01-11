/**
 * RevenueVault Client Wrapper
 * 
 * Wraps generated RevenueVaultClient with SDK-friendly interface.
 */

import { RevenueVaultClient as GeneratedRevenueVaultClient } from '../../../artifacts/revenue_vault/RevenueVaultClient'
import type { AlgorandClients } from '../lib/algod'

/**
 * RevenueVault simplified interface for SDK
 */
export class VaultClient {
  private client: GeneratedRevenueVaultClient

  constructor(
    private appId: bigint,
    private clients: AlgorandClients
  ) {
    this.client = new GeneratedRevenueVaultClient(
      {
        resolveBy: 'id',
        id: appId,
      },
      clients.algod
    )
  }

  /**
   * Create new epoch
   */
  async createEpoch(params: {
    caller: string
    epochId: bigint
    startDate: bigint
    endDate: bigint
    snapshotId: bigint
  }): Promise<void> {
    await this.client.createEpoch(
      {
        epochId: params.epochId,
        startDate: params.startDate,
        endDate: params.endDate,
        snapshotId: params.snapshotId,
      },
      { sender: params.caller }
    )
  }

  /**
   * Close epoch for deposits
   */
  async closeEpoch(params: {
    caller: string
    epochId: bigint
  }): Promise<void> {
    await this.client.closeEpoch(
      {
        epochId: params.epochId,
      },
      { sender: params.caller }
    )
  }

  /**
   * Anchor accrual report
   */
  async anchorAccrualReport(params: {
    caller: string
    epochId: bigint
    accrualHash: Uint8Array
  }): Promise<void> {
    await this.client.anchorAccrualReport(
      {
        epochId: params.epochId,
        accrualHash: params.accrualHash,
      },
      { sender: params.caller }
    )
  }

  /**
   * Deposit net revenue (must be in group with transfer)
   */
  async depositNetRevenue(params: {
    caller: string
    epochId: bigint
    amount: bigint
  }): Promise<void> {
    await this.client.depositNetRevenue(
      {
        epochId: params.epochId,
        amount: params.amount,
      },
      { sender: params.caller }
    )
  }

  /**
   * Anchor entitlements hash
   */
  async anchorEntitlements(params: {
    caller: string
    epochId: bigint
    entitlementsHash: Uint8Array
  }): Promise<void> {
    await this.client.anchorEntitlements(
      {
        epochId: params.epochId,
        entitlementsHash: params.entitlementsHash,
      },
      { sender: params.caller }
    )
  }

  /**
   * Set individual entitlement
   */
  async setEntitlement(params: {
    caller: string
    epochId: bigint
    holder: string
    amount: bigint
  }): Promise<void> {
    await this.client.setEntitlement(
      {
        epochId: params.epochId,
        holder: params.holder,
        amount: params.amount,
      },
      { sender: params.caller }
    )
  }

  /**
   * Settle epoch (finalize entitlements)
   */
  async settleEpochEntitlements(params: {
    caller: string
    epochId: bigint
  }): Promise<void> {
    await this.client.settleEpochEntitlements(
      {
        epochId: params.epochId,
      },
      { sender: params.caller }
    )
  }

  /**
   * Claim distributable revenue (inputless)
   */
  async claim(params: {
    caller: string
    epochId: bigint
  }): Promise<void> {
    await this.client.claim(
      {
        epochId: params.epochId,
      },
      { sender: params.caller }
    )
  }

  /**
   * View claimable amount
   */
  async viewClaimable(params: {
    holder: string
    epochId: bigint
  }): Promise<bigint> {
    const result = await this.client.viewClaimable({
      holder: params.holder,
      epochId: params.epochId,
    })
    return result.return as bigint
  }

  /**
   * Query epoch state
   */
  async getEpochState(epochId: bigint): Promise<{
    status: bigint
    netDeposited: bigint
    sumSettled: bigint
    sumClaimed: bigint
  }> {
    const result = await this.client.getEpochState({
      epochId,
    })
    const returnValue = result.return as {
      status: bigint
      netDeposited: bigint
      sumSettled: bigint
      sumClaimed: bigint
    }
    return returnValue
  }

  /**
   * Query entitlement for holder
   */
  async getEntitlement(epochId: bigint, holder: string): Promise<bigint> {
    const result = await this.client.getEntitlementAmount({
      epochId,
      holder,
    })
    return result.return as bigint
  }
}

/**
 * Create VaultClient instance
 */
export function createVaultClient(
  appId: bigint,
  clients: AlgorandClients
): VaultClient {
  return new VaultClient(appId, clients)
}
