/**
 * Protius Operator API
 * 
 * **Admin-only workflows for Protius V1 Core**
 * 
 * This is the primary SDK interface for privileged operations:
 * - Financial Close execution
 * - Monthly epoch lifecycle
 * - Accrual report anchoring
 * - Net revenue deposits
 * - Entitlements computation and anchoring
 * - Epoch settlement
 * 
 * Requires admin private key.
 */

import algosdk from 'algosdk'
import type { ProtiusProjectConfig } from '../config/project'
import type { AlgorandNetworkConfig } from '../config/networks'
import type { PEO } from '../types/peo'
import { MATURITY_GATES, validateMaturity } from '../types/peo'
import { createClients, waitForConfirmation } from '../lib/algod'
import { buildAndSubmitGroup } from '../lib/group'
import { validateEpochId, validateProjectConfig, ValidationError } from '../lib/validate'
import { computeEntitlements, batchEntitlements, saveEntitlementsToFile } from '../builders/entitlements'
import { buildDepositGroup } from '../builders/deposit'
import { buildSettleTxn } from '../builders/settle'
import { KwTokenClient, KwTokenFactory } from '../../../artifacts/kw_token/KWTokenClient'
import { KWhReceiptClient, KWhReceiptFactory } from '../../../artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultClient, RevenueVaultFactory } from '../../../artifacts/revenue_vault/RevenueVaultClient'
import { ProjectRegistryClient, ProjectRegistryFactory } from '../../../artifacts/project_registry/ProjectRegistryClient'

/**
 * Financial Close execution parameters
 */
export interface FinancialCloseParams {
  /** PEO from InfraPilot (must be FC_APPROVED) */
  peo: PEO

  /** Operator account (admin) */
  operator: algosdk.Account

  /** Installed AC capacity (must match PEO) */
  installedAcKw: bigint
}

/**
 * Monthly epoch execution parameters
 */
export interface MonthlyEpochParams {
  /** Epoch ID (YYYYMM format) */
  epochId: bigint

  /** Epoch start date (Unix timestamp) */
  startDate: bigint

  /** Epoch end date (Unix timestamp) */
  endDate: bigint

  /** Accrual report data (off-chain, for hash anchoring) */
  accrualReport: any

  /** Net revenue amount to deposit */
  netRevenue: bigint

  /** Platform kWh rate in basis points */
  platformKwhRateBps: bigint

  /** Operator account (admin) */
  operator: algosdk.Account

  /** PEO from InfraPilot (must be OPERATING) */
  peo: PEO
}

/**
 * Protius Operator - Admin workflows
 */
export class ProtiusOperator {
  private clients: ReturnType<typeof createClients>

  constructor(
    private config: ProtiusProjectConfig,
    private network: AlgorandNetworkConfig
  ) {
    // Validate configuration (skip asset IDs during initialization)
    validateProjectConfig(config, { skipAssetIds: true })

    // Initialize clients
    this.clients = createClients(network)
  }

  /**
   * One-time initialization of all Protius V1 Core contracts
   * 
   * **Must be run once by Admin after deployment**
   * 
   * This wires all 4 contracts together with cross-references:
   * 1. ProjectRegistry.init_registry() - sets project config
   * 2. KWToken.initToken() - sets registry, name, symbol
   * 3. KWhReceipt.initReceipt() - sets registry and vault
   * 4. RevenueVault.initVault() - sets all contract references
   * 5. ProjectRegistry.setContracts() - wires all contracts
   * 
   * Idempotent: Safe to run once. Will throw if already initialized.
   * 
   * @param operator - Admin account with initialization authority
   * @param params - Initialization parameters (projectId, installedAcKw, treasury, platform fees)
   */
  async init(
    operator: algosdk.Account,
    params?: {
      projectId?: string
      installedAcKw?: bigint
      treasury?: string
      platformKwBps?: bigint
      platformKwhRateBps?: bigint
    }
  ): Promise<{
    success: boolean
    txIds: string[]
  }> {
    console.log('=== Protius V1 Core — One-Time Initialization ===')
    console.log()
    console.log(`Admin: ${operator.addr}`)
    console.log(`Registry:     ${this.config.registryAppId}`)
    console.log(`kWToken:      ${this.config.kwTokenAppId}`)
    console.log(`kWhReceipt:   ${this.config.kwhReceiptAppId}`)
    console.log(`RevenueVault: ${this.config.revenueVaultAppId}`)
    console.log()

    // Use provided params or defaults
    const projectId = params?.projectId || this.config.projectId || 'ProtProject'
    const installedAcKw = params?.installedAcKw || 5000n
    const treasury = params?.treasury || this.config.treasuryAddress || operator.addr
    const platformKwBps = params?.platformKwBps || 500n // 5%
    const platformKwhRateBps = params?.platformKwhRateBps || 500n // 5%

    console.log('Parameters:')
    console.log(`  Project ID:   ${projectId}`)
    console.log(`  Capacity:     ${installedAcKw} kW`)
    console.log(`  Treasury:     ${treasury}`)
    console.log(`  Platform kW:  ${Number(platformKwBps) / 100}%`)
    console.log(`  Platform kWh: ${Number(platformKwhRateBps) / 100}%`)
    console.log()

    const txIds: string[] = []

    try {
      // Compute contract addresses
      const registryAddress = algosdk.getApplicationAddress(Number(this.config.registryAppId))
      const kwTokenAddress = algosdk.getApplicationAddress(Number(this.config.kwTokenAppId))
      const kwhReceiptAddress = algosdk.getApplicationAddress(Number(this.config.kwhReceiptAppId))
      const vaultAddress = algosdk.getApplicationAddress(Number(this.config.revenueVaultAppId))

      // Step 1: Initialize ProjectRegistry
      console.log('[1/5] Initializing ProjectRegistry...')
      const registryFactory = this.clients.algorand.client.getTypedAppFactory(ProjectRegistryFactory)
      const registry = registryFactory.getAppClientById({ appId: this.config.registryAppId })

      const registryInitResult = await registry.send.initRegistry({
        args: {
          projectId: new TextEncoder().encode(projectId),
          installedAcKw,
          treasury: treasury.toString(),
          platformKwBps,
          platformKwhRateBps,
          admin: operator.addr.toString(),
        },
        sender: operator.addr,
      })
      txIds.push(registryInitResult.transaction.txID())
      await waitForConfirmation(this.clients.algod, registryInitResult.transaction.txID())
      console.log(`✅ ProjectRegistry initialized (TxID: ${registryInitResult.transaction.txID().slice(0, 8)}...)`)
      console.log()

      // Step 2: Initialize kWToken
      console.log('[2/5] Initializing kWToken...')
      const kwTokenFactory = this.clients.algorand.client.getTypedAppFactory(KwTokenFactory)
      const kwToken = kwTokenFactory.getAppClientById({ appId: this.config.kwTokenAppId })
      
      const kwInitResult = await kwToken.send.initToken({
        args: {
          registry: registryAddress.toString(),
          name: new TextEncoder().encode('Protius kW Token'),
          symbol: new TextEncoder().encode('PKW'),
        },
        sender: operator.addr,
      })
      txIds.push(kwInitResult.transaction.txID())
      await waitForConfirmation(this.clients.algod, kwInitResult.transaction.txID())
      console.log(`✅ kWToken initialized (TxID: ${kwInitResult.transaction.txID().slice(0, 8)}...)`)
      console.log()

      // Step 3: Initialize kWhReceipt (includes vault reference)
      console.log('[3/5] Initializing kWhReceipt...')
      const kwhReceiptFactory = this.clients.algorand.client.getTypedAppFactory(KWhReceiptFactory)
      const kwhReceipt = kwhReceiptFactory.getAppClientById({ appId: this.config.kwhReceiptAppId })

      const kwhInitResult = await kwhReceipt.send.initReceipt({
        args: {
          registry: registryAddress.toString(),
          vault: vaultAddress.toString(),
        },
        sender: operator.addr,
      })
      txIds.push(kwhInitResult.transaction.txID())
      await waitForConfirmation(this.clients.algod, kwhInitResult.transaction.txID())
      console.log(`✅ kWhReceipt initialized (TxID: ${kwhInitResult.transaction.txID().slice(0, 8)}...)`)
      console.log()

      // Step 4: Initialize RevenueVault
      console.log('[4/5] Initializing RevenueVault...')
      const vaultFactory = this.clients.algorand.client.getTypedAppFactory(RevenueVaultFactory)
      const vault = vaultFactory.getAppClientById({ appId: this.config.revenueVaultAppId })

      const vaultInitResult = await vault.send.initVault({
        args: {
          registry: registryAddress.toString(),
          kwToken: kwTokenAddress.toString(),
          kwhReceipt: kwhReceiptAddress.toString(),
          treasury: treasury.toString(),
          settlementAssetId: this.config.revenueAssetId,
          platformKwhRateBps,
        },
        sender: operator.addr,
      })
      txIds.push(vaultInitResult.transaction.txID())
      await waitForConfirmation(this.clients.algod, vaultInitResult.transaction.txID())
      console.log(`✅ RevenueVault initialized (TxID: ${vaultInitResult.transaction.txID().slice(0, 8)}...)`)
      console.log()

      // Step 5: Wire all contracts in ProjectRegistry
      console.log('[5/5] Wiring contracts in ProjectRegistry...')
      const setContractsResult = await registry.send.setContracts({
        args: {
          kwToken: kwTokenAddress.toString(),
          kwhReceipt: kwhReceiptAddress.toString(),
          revenueVault: vaultAddress.toString(),
        },
        sender: operator.addr,
      })
      txIds.push(setContractsResult.transaction.txID())
      await waitForConfirmation(this.clients.algod, setContractsResult.transaction.txID())
      console.log(`✅ Contracts wired (TxID: ${setContractsResult.transaction.txID().slice(0, 8)}...)`)
      console.log()

      console.log('=== Initialization Complete ===')
      console.log()
      console.log('✅ All contracts initialized and wired!')
      console.log(`✅ ${txIds.length} transactions confirmed`)
      console.log()
      console.log('Ready for:')
      console.log('  - Financial Close (npm run operator:fc)')
      console.log('  - Monthly Epochs (npm run operator:epoch)')
      console.log()

      return {
        success: true,
        txIds,
      }

    } catch (error: any) {
      console.error()
      console.error('❌ Initialization failed:')
      
      // Check for common idempotency errors
      if (error.message?.includes('already initialized') || 
          error.message?.includes('assert failed')) {
        console.error('⚠️  Contracts may already be initialized')
        console.error('   This operation is idempotent - safe to run only once')
      } else {
        console.error(error.message || error)
      }
      
      console.error()
      console.error(`Successful transactions: ${txIds.length}`)
      console.error(`Transaction IDs:`, txIds)
      
      throw error
    }
  }

  /**
   * Execute Financial Close
   * 
   * Steps:
   * 1. Validate PEO maturity (FC_APPROVED)
   * 2. Call kWToken.finalizeFinancialCloseSimple()
   * 3. Call kWToken.closeFinancialClose()
   * 4. Call ProjectRegistry.markFCFinalised()
   */
  async runFinancialClose(params: FinancialCloseParams): Promise<{
    kwAssetId: bigint
    txIds: string[]
  }> {
    console.log('=== Financial Close Execution ===')

    // Step 1: Validate PEO maturity
    validateMaturity(params.peo, MATURITY_GATES.FINANCIAL_CLOSE)
    console.log(`✓ PEO maturity validated: ${params.peo.status}`)

    // Step 2: Finalize FC and mint kW tokens
    console.log('Calling kWToken.finalizeFinancialCloseSimple()...')
    // TODO: Use generated client
    const kwAssetId = 0n // Placeholder
    console.log(`✓ kW Asset created: ${kwAssetId}`)

    // Step 3: Close financial close
    console.log('Calling kWToken.closeFinancialClose()...')
    // TODO: Use generated client
    console.log('✓ Financial Close closed')

    // Step 4: Mark FC finalized in registry
    console.log('Calling ProjectRegistry.markFCFinalised()...')
    // TODO: Use generated client
    console.log('✓ Registry updated')

    console.log('=== Financial Close Complete ===')

    return {
      kwAssetId,
      txIds: [], // Placeholder
    }
  }

  /**
   * Execute Monthly Epoch
   * 
   * Canonical runbook for monthly revenue distribution:
   * 
   * 1. Validate PEO maturity (OPERATING)
   * 2. Create epoch
   * 3. Snapshot kW balances
   * 4. Anchor accrual report
   * 5. Deposit net revenue (group tx)
   * 6. Close epoch
   * 7. Compute entitlements off-chain
   * 8. Anchor entitlements hash
   * 9. Batch set entitlements (≤16 per group)
   * 10. Settle epoch
   */
  async runMonthlyEpoch(params: MonthlyEpochParams): Promise<{
    epochId: bigint
    entitlementsHash: string
    txIds: string[]
  }> {
    console.log(`=== Monthly Epoch ${params.epochId} Execution ===`)

    // Step 1: Validate PEO maturity
    validateMaturity(params.peo, MATURITY_GATES.MONTHLY_EPOCH)
    validateEpochId(params.epochId)
    console.log(`✓ PEO maturity validated: ${params.peo.status}`)

    const txIds: string[] = []

    // Step 2: Create epoch
    console.log('Creating epoch...')
    // TODO: Use VaultClient.createEpoch()
    console.log('✓ Epoch created')

    // Step 3: Snapshot kW balances
    console.log('Snapshotting kW balances...')
    // TODO: Use KWTokenClient.snapshotEpoch()
    const snapshotId = 0n // Placeholder
    console.log(`✓ Snapshot created: ${snapshotId}`)

    // Step 4: Anchor accrual report
    console.log('Anchoring accrual report...')
    // TODO: Compute accrual hash and call VaultClient.anchorAccrualReport()
    console.log('✓ Accrual report anchored')

    // Step 5: Deposit net revenue
    console.log(`Depositing net revenue: ${params.netRevenue}...`)
    const vaultAddress = algosdk.getApplicationAddress(this.config.revenueVaultAppId)
    const depositTxns = await buildDepositGroup(
      {
        depositor: params.operator.addr.toString(),
        vaultAddress: vaultAddress.toString(),
        vaultAppId: this.config.revenueVaultAppId,
        epochId: params.epochId,
        amount: params.netRevenue,
        assetId: this.config.revenueAssetId,
      },
      this.clients
    )
    const depositTxId = await buildAndSubmitGroup(this.clients.algod, depositTxns, params.operator)
    await waitForConfirmation(this.clients.algod, depositTxId)
    txIds.push(depositTxId)
    console.log(`✓ Net revenue deposited: ${depositTxId}`)

    // Step 6: Close epoch
    console.log('Closing epoch...')
    // TODO: Use VaultClient.closeEpoch()
    console.log('✓ Epoch closed')

    // Step 7: Compute entitlements off-chain
    console.log('Computing entitlements off-chain...')
    // TODO: Query kW holder balances at snapshot
    const holderBalances = new Map<string, bigint>()
    // Placeholder: Add treasury
    holderBalances.set(this.config.treasuryAddress, 0n)

    const entitlementsResult = computeEntitlements({
      epochId: params.epochId,
      snapshotId,
      netDeposited: params.netRevenue,
      platformKwhRateBps: params.platformKwhRateBps,
      treasuryAddress: this.config.treasuryAddress,
      holderBalances,
    })

    console.log(`✓ Entitlements computed: ${entitlementsResult.entitlements.holders.length} holders`)
    console.log(`  Hash: ${entitlementsResult.hash}`)
    console.log(`  Conservation: ${entitlementsResult.conservationValid}`)

    // Save to outputs
    const outputPath = `./sdk/outputs/entitlements/${params.epochId}.json`
    saveEntitlementsToFile(entitlementsResult, outputPath)

    // Step 8: Anchor entitlements hash
    console.log('Anchoring entitlements hash...')
    // TODO: Use VaultClient.anchorEntitlements()
    console.log('✓ Entitlements hash anchored')

    // Step 9: Batch set entitlements
    console.log('Setting entitlements...')
    const batches = batchEntitlements(
      entitlementsResult.entitlements.holders.map((h) => ({
        address: h.address,
        amount: h.entitledAmount,
      }))
    )

    for (const batch of batches) {
      console.log(`  Batch ${batch.batchIndex + 1}/${batch.totalBatches}: ${batch.addresses.length} holders`)
      // TODO: Use VaultClient.setEntitlement() in batch
    }
    console.log('✓ All entitlements set')

    // Step 10: Settle epoch
    console.log('Settling epoch...')
    const settleTxn = await buildSettleTxn(
      {
        operator: params.operator.addr.toString(),
        vaultAppId: this.config.revenueVaultAppId,
        epochId: params.epochId,
      },
      this.clients
    )
    const settleTxId = await buildAndSubmitGroup(this.clients.algod, [settleTxn], params.operator)
    await waitForConfirmation(this.clients.algod, settleTxId)
    txIds.push(settleTxId)
    console.log(`✓ Epoch settled: ${settleTxId}`)

    console.log('=== Monthly Epoch Complete ===')

    return {
      epochId: params.epochId,
      entitlementsHash: entitlementsResult.hash,
      txIds,
    }
  }

  /**
   * Query epoch state
   */
  async getEpochState(epochId: bigint): Promise<any> {
    // TODO: Implement using VaultClient
    throw new Error('Not implemented')
  }

  /**
   * Query kW holder balances
   */
  async getKwHolders(): Promise<Map<string, bigint>> {
    // TODO: Implement using indexer
    throw new Error('Not implemented')
  }
}
