/**
 * kWToken Client Wrapper
 * 
 * Wraps generated kWTokenClient with SDK-friendly interface.
 */

import { KWTokenClient as GeneratedKWTokenClient } from '../../../artifacts/kw_token/KWTokenClient'
import type { AlgorandClients } from '../lib/algod'

/**
 * kWToken simplified interface for SDK
 */
export class KWTokenClient {
  private client: GeneratedKWTokenClient

  constructor(
    private appId: bigint,
    private clients: AlgorandClients
  ) {
    this.client = new GeneratedKWTokenClient(
      {
        resolveBy: 'id',
        id: appId,
      },
      clients.algod
    )
  }

  /**
   * Finalize financial close (simple mode)
   */
  async finalizeFinancialCloseSimple(params: {
    caller: string
    installedAcKw: bigint
  }): Promise<bigint> {
    // Returns kW asset ID
    const result = await this.client.finalizeFinancialCloseSimple(
      {
        installedAcKw: params.installedAcKw,
      },
      { sender: params.caller }
    )
    return result.return as bigint
  }

  /**
   * Close financial close (mint complete)
   */
  async closeFinancialClose(params: {
    caller: string
  }): Promise<void> {
    await this.client.closeFinancialClose(
      {},
      { sender: params.caller }
    )
  }

  /**
   * Snapshot epoch (record kW balances)
   */
  async snapshotEpoch(params: {
    caller: string
    epochId: bigint
  }): Promise<bigint> {
    // Returns snapshot ID
    const result = await this.client.snapshotEpoch(
      {
        epochId: params.epochId,
      },
      { sender: params.caller }
    )
    return result.return as bigint
  }

  /**
   * Transfer kW tokens
   */
  async transfer(params: {
    caller: string
    receiver: string
    amount: bigint
  }): Promise<void> {
    await this.client.transfer(
      {
        receiver: params.receiver,
        amount: params.amount,
      },
      { sender: params.caller }
    )
  }

  /**
   * Query total supply
   */
  async getTotalSupply(): Promise<bigint> {
    const result = await this.client.getTotalSupply({})
    return result.return as bigint
  }

  /**
   * Query balance at snapshot
   */
  async getBalanceAtSnapshot(
    holder: string,
    snapshotId: bigint
  ): Promise<bigint> {
    const result = await this.client.getHolderBalanceAtSnapshot({
      holder,
      snapshotId,
    })
    return result.return as bigint
  }

  /**
   * Query FC finalized status
   */
  async isFCFinalized(): Promise<boolean> {
    const result = await this.client.isFcFinalized({})
    return (result.return as bigint) === 1n
  }
}

/**
 * Create KWTokenClient instance
 */
export function createKWTokenClient(
  appId: bigint,
  clients: AlgorandClients
): KWTokenClient {
  return new KWTokenClient(appId, clients)
}
