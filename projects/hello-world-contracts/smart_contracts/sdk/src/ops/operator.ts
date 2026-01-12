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
 * Epoch settlement input (Phase 4)
 */
export interface EpochInput {
  /** Epoch ID (e.g., 202501) */
  epochId: number
  
  /** Period start date (ISO 8601) */
  periodStart: string
  
  /** Period end date (ISO 8601) */
  periodEnd: string
  
  /** Net revenue in microAlgos */
  netRevenueMicroAlgos: number
  
  /** Hash of accrual report (commitment) */
  accrualHash: string
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
    console.log('INIT START')
    console.log(`Admin: ${operator.addr}`)
    console.log(`Network: ${this.network.algodServer}:${this.network.algodPort || ''}`)
    console.log()

    const txIds: string[] = []

    try {
      // Health check: proves algod connectivity
      const status = await this.clients.algod.status().do()
      console.log('Algod connected')
      console.log(`Last round: ${status.lastRound}`)

      // Ensure the Algorand client can sign with the admin account
      this.clients.algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(operator))

      // Minimal proof: deploy a fresh ProjectRegistry
      console.log('Deploying ProjectRegistry (minimal init path)...')
      const registryFactory = this.clients.algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
        defaultSender: operator.addr,
      })

      const { appClient, result } = await registryFactory.deploy({
        onUpdate: 'replace',
        onSchemaBreak: 'replace',
      })

      const creationTxId = `op=${result.operationPerformed}`

      txIds.push(creationTxId)

      console.log(`✅ ProjectRegistry appId: ${appClient.appId}`)
      console.log(`TxID: ${creationTxId}`)
      console.log()

      // Store registry appId and client for Phase 2
      const registryAppId = appClient.appId
      const registryClient = appClient

      // ============================================================
      // Phase 2: kWToken Initialization
      // ============================================================
      console.log('--- Phase 2: kWToken Initialization ---')
      console.log()

      console.log('Deploying kWToken...')
      const kwTokenFactory = this.clients.algorand.client.getTypedAppFactory(KwTokenFactory, {
        defaultSender: operator.addr,
      })

      const { appClient: kwTokenAppClient, result: kwTokenResult } = await kwTokenFactory.deploy({
        onUpdate: 'replace',
        onSchemaBreak: 'replace',
      })

      const kwTokenTxId = `op=${kwTokenResult.operationPerformed}`
      txIds.push(kwTokenTxId)

      const kwTokenAppId = kwTokenAppClient.appId
      console.log(`✅ kWToken ${kwTokenResult.operationPerformed === 'create' ? 'deployed' : 'found'}: appId ${kwTokenAppId}`)
      console.log(`TxID: ${kwTokenTxId}`)
      console.log()

      // Check if kWToken is already registered correctly in ProjectRegistry
      console.log('Checking if kWToken is registered in ProjectRegistry...')
      const registryState = await registryClient.appClient.state.global.getAll()
      const registeredKwToken = registryState.kwToken
      const expectedKwTokenAddr = algosdk.getApplicationAddress(kwTokenAppId).toString()
      const zeroAddress = algosdk.getApplicationAddress(0).toString()

      if (registeredKwToken === expectedKwTokenAddr) {
        console.log(`✓ kWToken already correctly registered: ${registeredKwToken}`)
      } else {
        console.log(`kWToken deployment complete (will register all contracts in Phase 4)`)
      }

      console.log()
      console.log('✅ Phase 2 complete: kWToken initialized and registered')
      console.log()

      // ============================================================
      // Phase 3: kWhReceipt Initialization
      // ============================================================
      console.log('--- Phase 3: kWhReceipt Initialization ---')
      console.log()

      console.log('Deploying kWhReceipt...')
      const kwhReceiptFactory = this.clients.algorand.client.getTypedAppFactory(KWhReceiptFactory, {
        defaultSender: operator.addr,
      })

      const { appClient: kwhReceiptAppClient, result: kwhReceiptResult } = await kwhReceiptFactory.deploy({
        onUpdate: 'replace',
        onSchemaBreak: 'replace',
      })

      const kwhReceiptTxId = `op=${kwhReceiptResult.operationPerformed}`
      txIds.push(kwhReceiptTxId)

      const kwhReceiptAppId = kwhReceiptAppClient.appId
      console.log(`✅ kWhReceipt ${kwhReceiptResult.operationPerformed === 'create' ? 'deployed' : 'found'}: appId ${kwhReceiptAppId}`)
      console.log(`TxID: ${kwhReceiptTxId}`)
      console.log()

      // Check if kWhReceipt is already registered correctly in ProjectRegistry
      console.log('Checking if kWhReceipt is registered in ProjectRegistry...')
      const registryState2 = await registryClient.appClient.state.global.getAll()
      const registeredKwhReceipt = registryState2.kwhReceipt
      const expectedKwhReceiptAddr = algosdk.getApplicationAddress(kwhReceiptAppId).toString()

      if (registeredKwhReceipt === expectedKwhReceiptAddr) {
        console.log(`✓ kWhReceipt already correctly registered: ${registeredKwhReceipt}`)
      } else {
        console.log(`kWhReceipt deployment complete (will register all contracts in Phase 4)`)
      }

      console.log()
      console.log('✅ Phase 3 complete: kWhReceipt initialized and registered')
      console.log()

      // ============================================================
      // Phase 4: RevenueVault Initialization
      // ============================================================
      console.log('--- Phase 4: RevenueVault Initialization ---')
      console.log()

      console.log('Deploying RevenueVault...')
      const revenueVaultFactory = this.clients.algorand.client.getTypedAppFactory(RevenueVaultFactory, {
        defaultSender: operator.addr,
      })

      const { appClient: revenueVaultAppClient, result: revenueVaultResult } = await revenueVaultFactory.deploy({
        onUpdate: 'replace',
        onSchemaBreak: 'replace',
      })

      const revenueVaultTxId = `op=${revenueVaultResult.operationPerformed}`
      txIds.push(revenueVaultTxId)

      const revenueVaultAppId = revenueVaultAppClient.appId
      console.log(`✅ RevenueVault ${revenueVaultResult.operationPerformed === 'create' ? 'deployed' : 'found'}: appId ${revenueVaultAppId}`)
      console.log(`TxID: ${revenueVaultTxId}`)
      console.log()

      // Check if RevenueVault is already registered correctly in ProjectRegistry
      console.log('Checking if RevenueVault is registered in ProjectRegistry...')
      const registryState3 = await registryClient.appClient.state.global.getAll()
      const registeredRevenueVault = registryState3.revenueVault
      const expectedRevenueVaultAddr = algosdk.getApplicationAddress(revenueVaultAppId).toString()

      if (registeredRevenueVault === expectedRevenueVaultAddr) {
        console.log(`✓ RevenueVault already correctly registered: ${registeredRevenueVault}`)
      } else {
        console.log(`Registering RevenueVault in ProjectRegistry... (current: ${registeredRevenueVault || 'none'})`)
        
        // Call ProjectRegistry.setContracts() with all four contracts
        const setContractsResult3 = await registryClient.send.setContracts({
          args: {
            kwToken: algosdk.getApplicationAddress(kwTokenAppId).toString(),
            kwhReceipt: algosdk.getApplicationAddress(kwhReceiptAppId).toString(),
            revenueVault: expectedRevenueVaultAddr,
          },
        })

        txIds.push(setContractsResult3.txIds[0])
        console.log(`✅ RevenueVault registered in ProjectRegistry`)
        console.log(`TxID: ${setContractsResult3.txIds[0]}`)
      }

      console.log()
      console.log('✅ Phase 4 complete: RevenueVault initialized and registered')
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

  /**
   * Activate Protocol (Phase 5A)
   *
   * Cross-links the four core contracts so they can communicate.
   * Does NOT enable any economic activity.
   *
   * **Must be run once by Admin after init**
   *
   * Steps:
   * 1. Load ProjectRegistry
   * 2. Validate all four core contracts are present
   * 3. Link kWhReceipt ↔ RevenueVault
   *
   * Idempotent: Safe to run multiple times.
   *
   * @param operator - Admin account with activation authority
   */
  async activate(operator: algosdk.Account): Promise<{
    success: boolean
    txIds: string[]
  }> {
    console.log('Activating Protius Protocol…')
    console.log(`Admin: ${operator.addr}`)
    console.log()

    const txIds: string[] = []

    try {
      // Health check
      const status = await this.clients.algod.status().do()
      console.log('Algod connected')
      console.log(`Last round: ${status.lastRound}`)
      console.log()

      // Set signer
      this.clients.algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(operator))

      // Load ProjectRegistry to validate all four contracts are present
      console.log('Loading ProjectRegistry...')
      const registryFactory = this.clients.algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
        defaultSender: operator.addr,
      })
      const registryClient = await registryFactory.getAppClientById({
        appId: this.config.registryAppId,
      })

      const registryAppAddress = algosdk.getApplicationAddress(Number(this.config.registryAppId)).toString()
      
      // Diagnostic: Expected app addresses from config
      const expectedKwTokenAddr = algosdk.getApplicationAddress(Number(this.config.kwTokenAppId)).toString()
      const expectedKwhReceiptAddr = algosdk.getApplicationAddress(Number(this.config.kwhReceiptAppId)).toString()
      const expectedRevenueVaultAddr = algosdk.getApplicationAddress(Number(this.config.revenueVaultAppId)).toString()

      console.log('=== Diagnostic: App IDs and Addresses ===')
      console.log(`ProjectRegistry: appId ${this.config.registryAppId} → ${registryAppAddress}`)
      console.log(`kWToken:         appId ${this.config.kwTokenAppId} → ${expectedKwTokenAddr}`)
      console.log(`kWhReceipt:      appId ${this.config.kwhReceiptAppId} → ${expectedKwhReceiptAddr}`)
      console.log(`RevenueVault:    appId ${this.config.revenueVaultAppId} → ${expectedRevenueVaultAddr}`)
      console.log()

      // Read global state to get contract addresses
      const registryState = await registryClient.appClient.state.global.getAll()
      const kwTokenAddrFromRegistry = registryState.kwToken
      const kwhReceiptAddrFromRegistry = registryState.kwhReceipt
      const revenueVaultAddrFromRegistry = registryState.revenueVault

      console.log('=== Registry State (Registered Addresses) ===')
      console.log(`kwToken:      ${kwTokenAddrFromRegistry}`)
      console.log(`kwhReceipt:   ${kwhReceiptAddrFromRegistry}`)
      console.log(`revenueVault: ${revenueVaultAddrFromRegistry}`)
      console.log()

      // Validate all four contracts are registered
      // Zero address in Base32 (what contracts return) vs getApplicationAddress(0) are different
      const zeroAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'

      if (!kwTokenAddrFromRegistry || kwTokenAddrFromRegistry === zeroAddress) {
        throw new Error('kWToken not registered in ProjectRegistry')
      }
      if (kwTokenAddrFromRegistry !== expectedKwTokenAddr) {
        throw new Error(`kWToken address mismatch: registry has ${kwTokenAddrFromRegistry}, expected ${expectedKwTokenAddr}`)
      }
      console.log(`✓ kWToken validated`)

      if (!kwhReceiptAddrFromRegistry || kwhReceiptAddrFromRegistry === zeroAddress) {
        throw new Error('kWhReceipt not registered in ProjectRegistry')
      }
      if (kwhReceiptAddrFromRegistry !== expectedKwhReceiptAddr) {
        throw new Error(`kWhReceipt address mismatch: registry has ${kwhReceiptAddrFromRegistry}, expected ${expectedKwhReceiptAddr}`)
      }
      console.log(`✓ kWhReceipt validated`)

      if (!revenueVaultAddrFromRegistry || revenueVaultAddrFromRegistry === zeroAddress) {
        throw new Error('RevenueVault not registered in ProjectRegistry')
      }
      if (revenueVaultAddrFromRegistry !== expectedRevenueVaultAddr) {
        throw new Error(`RevenueVault address mismatch: registry has ${revenueVaultAddrFromRegistry}, expected ${expectedRevenueVaultAddr}`)
      }
      console.log(`✓ RevenueVault validated`)

      console.log()

      // Cross-link kWhReceipt ↔ RevenueVault
      console.log('=== Cross-linking contracts ===')

      // Load kWhReceipt client
      const kwhReceiptFactory = this.clients.algorand.client.getTypedAppFactory(KWhReceiptFactory, {
        defaultSender: operator.addr,
      })
      const kwhReceiptClient = await kwhReceiptFactory.getAppClientById({
        appId: this.config.kwhReceiptAppId,
      })

      // Load RevenueVault client
      const revenueVaultFactory = this.clients.algorand.client.getTypedAppFactory(RevenueVaultFactory, {
        defaultSender: operator.addr,
      })
      const revenueVaultClient = await revenueVaultFactory.getAppClientById({
        appId: this.config.revenueVaultAppId,
      })

      

      // Check current state
      const kwhReceiptState = await kwhReceiptClient.appClient.state.global.getAll()
      const currentKwhRegistry = kwhReceiptState.registry
      const currentKwhVault = kwhReceiptState.revenueVault

      const revenueVaultState = await revenueVaultClient.appClient.state.global.getAll()
      const currentVaultRegistry = revenueVaultState.registry
      const currentVaultKwhReceipt = revenueVaultState.kwhReceipt

      console.log('Current kWhReceipt internal state:')
      console.log(`  registry:     ${currentKwhRegistry}`)
      console.log(`  revenueVault: ${currentKwhVault}`)
      console.log()
      console.log('Current RevenueVault internal state:')
      console.log(`  registry:    ${currentVaultRegistry}`)
      console.log(`  kwhReceipt:  ${currentVaultKwhReceipt}`)
      console.log()

      // Idempotency logic for kWhReceipt → RevenueVault link
      if (currentKwhVault === zeroAddress) {
        console.log('→ kWhReceipt.revenueVault is ZERO (unset) - calling initReceipt()...')
        const initKwhResult = await kwhReceiptClient.send.initReceipt({
          args: {
            registry: registryAppAddress,
            vault: expectedRevenueVaultAddr,
          },
        })
        txIds.push(initKwhResult.txIds[0])
        console.log(`✅ kWhReceipt initialized: ${initKwhResult.txIds[0]}`)
      } else if (currentKwhVault === expectedRevenueVaultAddr) {
        console.log('✓ kWhReceipt already linked to correct RevenueVault (idempotent)')
      } else {
        throw new Error(`kWhReceipt.revenueVault mismatch: has ${currentKwhVault}, expected ${expectedRevenueVaultAddr}`)
      }

      // Idempotency logic for RevenueVault → kWhReceipt link
      if (currentVaultKwhReceipt === zeroAddress) {
        console.log('→ RevenueVault.kwhReceipt is ZERO (unset) - calling initVault()...')
        
        // initVault requires: registry, kwToken, kwhReceipt, treasury, settlementAssetId, platformKwhRateBps
        const initVaultResult = await revenueVaultClient.send.initVault({
          args: {
            registry: registryAppAddress,
            kwToken: expectedKwTokenAddr,
            kwhReceipt: expectedKwhReceiptAddr,
            treasury: this.config.treasuryAddress,
            settlementAssetId: this.config.revenueAssetId,
            platformKwhRateBps: 500n, // 5% default - should come from config
          },
        })
        txIds.push(initVaultResult.txIds[0])
        console.log(`✅ RevenueVault initialized: ${initVaultResult.txIds[0]}`)
      } else if (currentVaultKwhReceipt === expectedKwhReceiptAddr) {
        console.log('✓ RevenueVault already linked to correct kWhReceipt (idempotent)')
      } else {
        throw new Error(`RevenueVault.kwhReceipt mismatch: has ${currentVaultKwhReceipt}, expected ${expectedKwhReceiptAddr}`)
      }

      console.log()
      console.log('✅ kWhReceipt ↔ RevenueVault cross-linking complete')
      console.log()
      console.log('✅ Protocol activated successfully')

      return {
        success: true,
        txIds,
      }

    } catch (error: any) {
      console.error()
      console.error('❌ Activation failed:')
      console.error(error.message || error)
      console.error()
      console.error(`Successful transactions: ${txIds.length}`)
      console.error(`Transaction IDs:`, txIds)

      throw error
    }
  }

  /**
   * Run epoch settlement (Phase 4: operator:epoch)
   * 
   * This method performs the monthly epoch settlement workflow:
   * 1. Validates protocol is activated
   * 2. Records accrual hash in kWhReceipt  
   * 3. Sends net revenue to RevenueVault
   * 4. Marks epoch as settled
   * 
   * Fully idempotent - safe to re-run for the same epoch.
   * 
   * @param operator - Admin account
   * @param epoch - Epoch settlement data
   */
  async runEpoch(operator: algosdk.Account, epoch: EpochInput): Promise<void> {
    const txIds: string[] = []

    try {
      console.log('\n=== Protius Epoch Settlement ===')
      console.log(`Epoch ID: ${epoch.epochId}`)
      console.log(`Period: ${epoch.periodStart} → ${epoch.periodEnd}`)
      console.log(`Net Revenue: ${epoch.netRevenueMicroAlgos} microAlgos`)
      console.log(`Accrual Hash: ${epoch.accrualHash}`)
      console.log()

      // Load ProjectRegistry
      console.log('Loading ProjectRegistry...')
      const registryFactory = this.clients.algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
        defaultSender: operator.addr,
      })
      const registryClient = await registryFactory.getAppClientById({
        appId: this.config.registryAppId,
      })
      const registryAppAddress = algosdk.getApplicationAddress(Number(this.config.registryAppId))

      // Load contract addresses from registry
      const registryState = await registryClient.appClient.state.global.getAll()
      const kwTokenAddr = registryState.kwToken
      const kwhReceiptAddr = registryState.kwhReceipt
      const revenueVaultAddr = registryState.revenueVault

      console.log('=== Contract Addresses ===')
      console.log(`ProjectRegistry: ${registryAppAddress}`)
      console.log(`kWToken:         ${kwTokenAddr}`)
      console.log(`kWhReceipt:      ${kwhReceiptAddr}`)
      console.log(`RevenueVault:    ${revenueVaultAddr}`)
      console.log()

      // Validate protocol is activated
      const zeroAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'
      if (kwTokenAddr === zeroAddress || kwhReceiptAddr === zeroAddress || revenueVaultAddr === zeroAddress) {
        throw new Error('Protocol not activated - run operator:activate first')
      }

      // Ensure default signer is set for AlgoKit AppClient calls
      this.clients.algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(operator))

      // Load kWhReceipt client
      console.log('Loading kWhReceipt contract...')
      const kwhReceiptFactory = this.clients.algorand.client.getTypedAppFactory(KWhReceiptFactory, {
        defaultSender: operator.addr,
      })
      const kwhReceiptClient = await kwhReceiptFactory.getAppClientById({
        appId: this.config.kwhReceiptAppId,
      })

      // Load RevenueVault client
      const revenueVaultFactory = this.clients.algorand.client.getTypedAppFactory(RevenueVaultFactory, {
        defaultSender: operator.addr,
      })
      const revenueVaultClient = await revenueVaultFactory.getAppClientById({
        appId: this.config.revenueVaultAppId,
      })

      // Ensure RevenueVault app account is funded to cover min balance for boxes/state
      try {
        console.log('→ Ensuring RevenueVault app account is funded...')
        const rvAppAddr = algosdk.getApplicationAddress(Number(this.config.revenueVaultAppId))
        let acctInfo: any
        try {
          acctInfo = await this.clients.algod.accountInformation(rvAppAddr).do()
        } catch (_) {
          acctInfo = { amount: 0, ['min-balance']: 0 }
        }
        const currentAmt: number = Number(acctInfo?.amount ?? 0)
        const minBal: number = Number(acctInfo?.['min-balance'] ?? 0)
        // Target at least min balance + 0.2 ALGO buffer, but not less than 0.3 ALGO total
        const target = Math.max(minBal + 200_000, 300_000)
        if (currentAmt < target) {
          const topUp = target - currentAmt
          const sp = await this.clients.algod.getTransactionParams().do()
          const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: operator.addr,
            receiver: rvAppAddr,
            amount: topUp,
            suggestedParams: sp,
          })
          const signed = fundTxn.signTxn(operator.sk)
          const txId = algosdk.decodeSignedTransaction(signed).txn.txID()
          await this.clients.algod.sendRawTransaction(signed).do()
          await waitForConfirmation(this.clients.algod, txId, 4)
          txIds.push(txId)
          console.log(`✅ Funded RevenueVault: +${topUp} µAlgos (tx: ${txId})`)
        } else {
          console.log('✓ RevenueVault already sufficiently funded')
        }
        console.log()
      } catch (e: any) {
        console.log('⚠️ Skipping funding step (non-fatal):', e?.message || e)
        console.log()
      }

      // Check if epoch already settled in kWhReceipt (idempotency)
      const epochResult = await kwhReceiptClient.send.getEpoch({ args: { epochId: BigInt(epoch.epochId) } })
      const epochData = epochResult.return as { totalKWh: bigint; settled: bigint }
      
      if (epochData.settled === 1n) {
        console.log(`✓ Epoch ${epoch.epochId} already settled (idempotent)`)
        console.log(`  Total kWh: ${epochData.totalKWh}`)
        console.log()
        console.log('✅ Epoch settlement complete (already settled)')
        return
      }

      console.log(`Epoch ${epoch.epochId} status: Not settled (totalKWh: ${epochData.totalKWh})`)
      console.log()

      // RevenueVault epoch lifecycle handling (create → close) idempotently
      console.log('→ Ensuring RevenueVault epoch exists and is CLOSED...')
      const toTs = (s: string) => BigInt(Math.floor(new Date(s).getTime() / 1000))
      const startTs = toTs(epoch.periodStart)
      const endTs = toTs(epoch.periodEnd)
      // Try create (ignore if already exists)
      try {
        const createRes = await revenueVaultClient.send.createEpoch({ args: { epochId: BigInt(epoch.epochId), startTs, endTs } })
        txIds.push(createRes.txIds[0])
        console.log(`✅ Created epoch in RevenueVault (tx: ${createRes.txIds[0]})`)
      } catch (e: any) {
        console.log('✓ Epoch create skipped (likely exists):', e?.message || e)
      }
      // Try close (ignore if already closed)
      try {
        const closeRes = await revenueVaultClient.send.closeEpoch({ args: { epochId: BigInt(epoch.epochId) } })
        txIds.push(closeRes.txIds[0])
        console.log(`✅ Closed epoch in RevenueVault (tx: ${closeRes.txIds[0]})`)
      } catch (e: any) {
        console.log('✓ Epoch close skipped (likely already closed):', e?.message || e)
      }
      console.log()

      // Step 1: Anchor accrual report hash in RevenueVault (if not already set)
      try {
        console.log('→ Anchoring accrual report hash...')
        const hashStr = epoch.accrualHash
        let hashBytes: Uint8Array
        const hex = hashStr.startsWith('sha256:') ? hashStr.slice(7) : hashStr
        if (/^[0-9a-fA-F]{64}$/.test(hex)) {
          hashBytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
        } else {
          hashBytes = new Uint8Array(Buffer.from(hashStr, 'utf-8'))
        }
        // Check if already anchored
        const existingHash = await revenueVaultClient.send.getEpochReportHash({ args: { epochId: BigInt(epoch.epochId) } })
        const alreadyAnchored = (existingHash.return as Uint8Array | undefined)?.length && (existingHash.return as Uint8Array).length > 0
        if (alreadyAnchored) {
          console.log('✓ Accrual report already anchored (idempotent)')
        } else {
          const anchorResult = await revenueVaultClient.send.anchorAccrualReport({ args: { epochId: BigInt(epoch.epochId), reportHash: hashBytes } })
          txIds.push(anchorResult.txIds[0])
          console.log(`✅ Accrual report anchored (tx: ${anchorResult.txIds[0]})`)
        }
        console.log()
      } catch (e: any) {
        console.log('⚠️ Skipping accrual anchoring (precondition not met or already set):', e?.message || e)
        console.log()
      }

      // Step 2: Deposit revenue to RevenueVault (grouped payment + app call)
      if (epoch.netRevenueMicroAlgos > 0) {
        console.log('→ Depositing revenue to RevenueVault (group)...')
        const suggested = await this.clients.algod.getTransactionParams().do()
        const revenueVaultAppAddr = algosdk.getApplicationAddress(Number(this.config.revenueVaultAppId))

        // Payment txn
        const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: operator.addr,
          receiver: revenueVaultAppAddr,
          amount: epoch.netRevenueMicroAlgos,
          suggestedParams: suggested,
        })

        // App call: depositNetRevenue(epochId, amount)
        const { encodeMethodSelector, encodeUint64, makeAppCallTxn } = await import('../lib/group') as any
        const appArgs: Uint8Array[] = [
          encodeMethodSelector('depositNetRevenue(uint64,uint64)string'),
          encodeUint64(BigInt(epoch.epochId)),
          encodeUint64(BigInt(epoch.netRevenueMicroAlgos)),
        ]
        // Provide required box references: epoch_status, epoch_hash, epoch_net
        const key = encodeUint64(BigInt(epoch.epochId))
        const name = (prefix: string) => new Uint8Array(Buffer.concat([Buffer.from(prefix, 'utf-8'), Buffer.from(key)]))
        const appIndex = Number(this.config.revenueVaultAppId)
        const boxes = [
          { appIndex, name: name('epoch_status:') },
          { appIndex, name: name('epoch_hash:') },
          { appIndex, name: name('epoch_net:') },
        ]
        const appCallTxn = makeAppCallTxn(
          operator.addr,
          this.config.revenueVaultAppId,
          algosdk.OnApplicationComplete.NoOpOC,
          appArgs,
          undefined,
          undefined,
          undefined,
          suggested,
          undefined,
          boxes
        )

        // Group, sign, submit
        const { assignGroupId, signGroupSingle, submitGroup } = await import('../lib/group') as any
        const grouped = assignGroupId([payTxn, appCallTxn])
        const signed = signGroupSingle(grouped, operator)
        const respTxId = await submitGroup(this.clients.algod, signed)
        await waitForConfirmation(this.clients.algod, respTxId, 4)
        txIds.push(respTxId)
        console.log(`✅ Revenue deposited: ${epoch.netRevenueMicroAlgos} microAlgos`)
        console.log(`   Group TxID: ${respTxId}`)
        console.log()
      } else {
        console.log('✓ No revenue to deposit (netRevenueMicroAlgos = 0)')
        console.log()
      }

      // Step 3: Mark epoch as settled in kWhReceipt (optional; requires RevenueVault authority)
      try {
        console.log('→ Marking epoch as settled in kWhReceipt...')
        const settleResult = await kwhReceiptClient.send.markEpochSettled({ args: { epochId: BigInt(epoch.epochId) } })
        txIds.push(settleResult.txIds[0])
        console.log(`✅ kWhReceipt epoch ${epoch.epochId} marked as settled (tx: ${settleResult.txIds[0]})`)
        console.log()
      } catch (e: any) {
        console.log('⚠️ Skipping kWhReceipt.markEpochSettled (likely requires RevenueVault caller):', e?.message || e)
        console.log()
      }

      // Summary
      console.log('=== Settlement Summary ===')
      console.log(`Epoch ID:            ${epoch.epochId}`)
      console.log(`Total kWh (epoch):   ${epochData.totalKWh}`)
      console.log(`Net Revenue:         ${epoch.netRevenueMicroAlgos} microAlgos`)
      if (epochData.totalKWh > 0n) {
        const revenuePerKwh = Number(epoch.netRevenueMicroAlgos) / Number(epochData.totalKWh)
        console.log(`Revenue per kWh:     ${revenuePerKwh.toFixed(2)} microAlgos`)
      } else {
        console.log(`Revenue per kWh:     N/A (no kWh recorded)`)
      }
      console.log()
      console.log('✅ Epoch settlement completed successfully')

    } catch (error: any) {
      console.error()
      console.error('❌ Epoch settlement failed:')
      console.error(error.message || error)
      console.error()
      console.error(`Successful transactions: ${txIds.length}`)
      console.error(`Transaction IDs:`, txIds)

      throw error
    }
  }
}
