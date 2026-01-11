/**
 * kWhReceipt Client Wrapper
 * 
 * Wraps generated kWhReceiptClient with SDK-friendly interface.
 */

import { KWhReceiptClient as GeneratedKWhReceiptClient } from '../../../artifacts/kwh_receipt/KWhReceiptClient'
import type { AlgorandClients } from '../lib/algod'

/**
 * kWhReceipt simplified interface for SDK
 */
export class KWhReceiptClient {
  private client: GeneratedKWhReceiptClient

  constructor(
    private appId: bigint,
    private clients: AlgorandClients
  ) {
    this.client = new GeneratedKWhReceiptClient(
      {
        resolveBy: 'id',
        id: appId,
      },
      clients.algod
    )
  }

  /**
   * Record production (single interval)
   */
  async recordProduction(params: {
    caller: string
    epochId: bigint
    intervalId: bigint
    kWhAmount: bigint
  }): Promise<void> {
    await this.client.recordProduction(
      {
        epochId: params.epochId,
        intervalId: params.intervalId,
        kWhAmount: params.kWhAmount,
      },
      { sender: params.caller }
    )
  }

  /**
   * Mark epoch settled (lock production data)
   */
  async markEpochSettled(params: {
    caller: string
    epochId: bigint
  }): Promise<void> {
    await this.client.markEpochSettled(
      {
        epochId: params.epochId,
      },
      { sender: params.caller }
    )
  }

  /**
   * Query epoch data
   */
  async getEpoch(epochId: bigint): Promise<{
    totalKWh: bigint
    settled: bigint
  }> {
    const result = await this.client.getEpoch({
      epochId,
    })
    // Result is tuple (totalKWh, settled)
    const returnValue = result.return as { totalKWh: bigint; settled: bigint }
    return returnValue
  }

  /**
   * Query receipt
   */
  async getReceipt(intervalId: bigint): Promise<{
    epochId: bigint
    kWhAmount: bigint
  }> {
    const result = await this.client.getReceipt({
      intervalId,
    })
    const returnValue = result.return as { epochId: bigint; kWhAmount: bigint }
    return returnValue
  }
}

/**
 * Create KWhReceiptClient instance
 */
export function createKWhReceiptClient(
  appId: bigint,
  clients: AlgorandClients
): KWhReceiptClient {
  return new KWhReceiptClient(appId, clients)
}
