/**
 * ProjectRegistry Client Wrapper
 * 
 * Wraps generated ProjectRegistryClient with SDK-friendly interface.
 */

import { ProjectRegistryClient } from '../../../artifacts/project_registry/ProjectRegistryClient'
import type { AlgorandClients } from '../lib/algod'

/**
 * ProjectRegistry simplified interface for SDK
 */
export class RegistryClient {
  private client: ProjectRegistryClient

  constructor(
    private appId: bigint,
    private clients: AlgorandClients
  ) {
    this.client = new ProjectRegistryClient(
      {
        resolveBy: 'id',
        id: appId,
      },
      clients.algod
    )
  }

  /**
   * Initialize registry
   */
  async initRegistry(params: {
    caller: string
    projectId: string
    installedAcKw: bigint
    treasuryAddress: string
  }): Promise<void> {
    await this.client.initRegistry(
      {
        projectId: params.projectId,
        installedAcKw: params.installedAcKw,
        treasuryAddress: params.treasuryAddress,
      },
      { sender: params.caller }
    )
  }

  /**
   * Set contract addresses
   */
  async setContracts(params: {
    caller: string
    kwTokenApp: bigint
    kwhReceiptApp: bigint
    revenueVaultApp: bigint
  }): Promise<void> {
    await this.client.setContracts(
      {
        kwTokenApp: params.kwTokenApp,
        kwhReceiptApp: params.kwhReceiptApp,
        revenueVaultApp: params.revenueVaultApp,
      },
      { sender: params.caller }
    )
  }

  /**
   * Mark COD (Commercial Operations Date)
   */
  async markCOD(params: {
    caller: string
    codDate: bigint
  }): Promise<void> {
    await this.client.markCOD(
      {
        codDate: params.codDate,
      },
      { sender: params.caller }
    )
  }

  /**
   * Mark financial close finalized
   */
  async markFCFinalised(params: {
    caller: string
  }): Promise<void> {
    await this.client.markFCFinalised(
      {},
      { sender: params.caller }
    )
  }

  /**
   * Query project configuration
   */
  async getProjectConfig(): Promise<{
    projectId: string
    installedAcKw: bigint
    treasuryAddress: string
    fcFinalized: boolean
    codDate?: bigint
  }> {
    const projectId = await this.client.getProjectId({})
    const installedAcKw = await this.client.getInstalledAcKw({})
    const treasury = await this.client.getTreasury({})
    const fcFinalized = await this.client.isFcFinalized({})
    const codDate = await this.client.getCodDate({})

    return {
      projectId: projectId.return as string,
      installedAcKw: installedAcKw.return as bigint,
      treasuryAddress: treasury.return as string,
      fcFinalized: (fcFinalized.return as bigint) === 1n,
      codDate: codDate.return === 0n ? undefined : (codDate.return as bigint),
    }
  }

  /**
   * Query contract addresses
   */
  async getContractAddresses(): Promise<{
    kwTokenApp: bigint
    kwhReceiptApp: bigint
    revenueVaultApp: bigint
  }> {
    const kwToken = await this.client.getKWTokenApp({})
    const receipt = await this.client.getKWhReceiptApp({})
    const vault = await this.client.getRevenueVaultApp({})

    return {
      kwTokenApp: kwToken.return as bigint,
      kwhReceiptApp: receipt.return as bigint,
      revenueVaultApp: vault.return as bigint,
    }
  }
}

/**
 * Create RegistryClient instance
 */
export function createRegistryClient(
  appId: bigint,
  clients: AlgorandClients
): RegistryClient {
  return new RegistryClient(appId, clients)
}
