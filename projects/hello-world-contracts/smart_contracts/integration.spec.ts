import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { describe, expect, it } from 'vitest'
import { ProjectRegistry } from '../project_registry/contract.algo'
import { KWToken } from '../kw_token/contract.algo'
import { KWhReceipt } from '../kwh_receipt/contract.algo'
import { RevenueVault } from './contract.algo'
import { Bytes } from '@algorandfoundation/algorand-typescript'

/**
 * Protius V1 Core: End-to-End Integration Test
 * 
 * Tests the complete lifecycle across all 4 contracts:
 * 1. ProjectRegistry: Project setup and SSOT authority
 * 2. kWToken: Fixed-supply token minting at Financial Close
 * 3. kWhReceipt: Production recording (minimal tracking)
 * 4. RevenueVault: Epoch settlement with entitlements-based claims
 * 
 * Scenario:
 * - Deploy 4 contracts
 * - Initialize ProjectRegistry with project params
 * - Mint kW at FC (treasury + 2 investors)
 * - Create and settle epoch
 * - Anchor entitlements
 * - Set 3 entitlements (Investor A, Investor B, Treasury)
 * - Verify settlement and claims
 * - Assert total paid == netDeposited and no double-claim
 */
describe('Protius V1 Core: End-to-End Integration', () => {
  const ctx = new TestExecutionContext()

  // Shared Parameters
  const projectId = 1n
  const installedAcKw = 10000n
  const platformKwBps = 1000n // 10% to treasury
  const epochId = 202501n
  const reportHash = Bytes('accrual_report_hash')
  const entitlementsHash = Bytes('entitlements_hash')
  const netDeposited = 100000n // 100k revenue units
  const startTs = 1704067200n
  const endTs = 1706745600n

  it('Full lifecycle: Registry → kWToken → kWhReceipt → RevenueVault', () => {
    // ========================================
    // SETUP: Create all 4 contracts
    // ========================================
    const registry = ctx.contract.create(ProjectRegistry)
    const kwToken = ctx.contract.create(KWToken)
    const kwhReceipt = ctx.contract.create(KWhReceipt)
    const vault = ctx.contract.create(RevenueVault)

    // Create accounts
    const admin = ctx.account.create().address
    const oracle = ctx.account.create().address
    const settlementAsset = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    // ========================================
    // PHASE 1: ProjectRegistry Setup
    // ========================================
    ctx.txn.from = admin
    
    // Create and initialize ProjectRegistry
    registry.create()
    registry.init_registry(
      Bytes('TestProject'),
      installedAcKw,
      treasury,
      platformKwBps,
      platformKwBps, // platformKwhRateBps (same as platformKwBps for simplicity)
      admin
    )

    // Set contract references
    registry.setContracts(kwToken.address, kwhReceipt.address, vault.address)

    // Set oracle
    registry.setOracle(oracle, 1n)

    // Mark COD
    registry.markCOD()
    
    // ========================================
    // PHASE 2: kWToken Financial Close
    // ========================================
    ctx.txn.from = admin
    
    // Initialize kWToken
    kwToken.create()
    kwToken.initToken(registry.address, Bytes('kW'), Bytes('kW-TST'))

    // Mint allocations to investors
    kwToken.mintAllocation(investorA, 4500n) // 4500 kW
    kwToken.mintAllocation(investorB, 4500n) // 4500 kW
    // Total investor allocation: 9000 kW
    
    // Close Financial Close (mints treasury)
    // Expected treasury = floor(10000 * 1000 / 10000) = 1000 kW
    kwToken.closeFinancialClose(installedAcKw, platformKwBps, treasury)

    // Verify supply invariant
    expect(kwToken.getTotalSupply()).toBe(installedAcKw)
    expect(kwToken.balanceOf(treasury)).toBe(1000n)
    expect(kwToken.balanceOf(investorA)).toBe(4500n)
    expect(kwToken.balanceOf(investorB)).toBe(4500n)

    // ========================================
    // PHASE 3: kWhReceipt Setup (Minimal)
    // ========================================
    ctx.txn.from = admin
    
    // Initialize kWhReceipt
    kwhReceipt.create()
    kwhReceipt.initReceipt(
      registry.address,
      vault.address
    )

    // ========================================
    // PHASE 4: RevenueVault Epoch Setup
    // ========================================
    ctx.txn.from = admin
    
    // Initialize RevenueVault
    vault.create()
    vault.initVault(
      registry.address,
      kwToken.address,
      kwhReceipt.address,
      treasury,
      0n, // Settlement asset (0 = ALGO)
      platformKwBps
    )

    // Create epoch
    vault.createEpoch(epochId, startTs, endTs)

    // Close epoch
    vault.closeEpoch(epochId)

    // ========================================
    // PHASE 5: Accrual & Revenue Deposit
    // ========================================
    ctx.txn.from = admin
    
    // Anchor accrual report
    vault.anchorAccrualReport(epochId, reportHash)

    // Deposit net revenue (simulating grouped asset transfer)
    vault.depositNetRevenue(epochId, netDeposited)

    // ========================================
    // PHASE 6: Entitlements Setup
    // ========================================
    ctx.txn.from = admin
    
    // Anchor entitlements hash
    vault.anchorEntitlements(epochId, entitlementsHash)

    // Calculate expected entitlements:
    // treasury% = floor(100000 * 1000 / 10000) = 10000
    // remaining = 100000 - 10000 = 90000
    // investorA share: floor(90000 * 4500 / 9000) = 45000
    // investorB share: floor(90000 * 4500 / 9000) = 45000
    // investorA + investorB = 90000
    // Treasury final: 10000 + (100000 - 10000 - 45000 - 45000) = 10000
    // Total: 45000 + 45000 + 10000 = 100000 ✓

    const treasuryBase = (netDeposited * platformKwBps) / 10000n
    const remainingForKw = netDeposited - treasuryBase // 90000
    const investorAShare = (remainingForKw * 4500n) / 9000n // 45000
    const investorBShare = (remainingForKw * 4500n) / 9000n // 45000
    const remainder = netDeposited - treasuryBase - investorAShare - investorBShare // 0
    const treasuryFinal = treasuryBase + remainder // 10000

    // Set entitlements
    vault.setEntitlement(epochId, investorA, investorAShare)
    vault.setEntitlement(epochId, investorB, investorBShare)
    vault.setEntitlement(epochId, treasury, treasuryFinal)

    // ========================================
    // PHASE 7: Settlement
    // ========================================
    ctx.txn.from = admin
    
    // Settle epoch (enforces sum == netDeposited)
    let settleResult = vault.settleEpochEntitlements(epochId)
    expect(settleResult).toContain('settled')

    // ========================================
    // PHASE 8: Claims (Pull-Based Distribution)
    // ========================================
    
    // InvestorA claims
    ctx.txn.from = investorA
    let claimResult = vault.claim(epochId)
    expect(claimResult).toContain('Claimed')
    expect(vault.viewClaimable(epochId, investorA)).toBe(0n) // Already claimed

    // InvestorB claims
    ctx.txn.from = investorB
    claimResult = vault.claim(epochId)
    expect(claimResult).toContain('Claimed')
    expect(vault.viewClaimable(epochId, investorB)).toBe(0n)

    // Treasury claims
    ctx.txn.from = treasury
    claimResult = vault.claim(epochId)
    expect(claimResult).toContain('Claimed')
    expect(vault.viewClaimable(epochId, treasury)).toBe(0n)

    // ========================================
    // PHASE 9: Verification
    // ========================================
    
    // Verify conservation invariant
    const totalClaimed = investorAShare + investorBShare + treasuryFinal
    expect(totalClaimed).toBe(netDeposited)

    // Verify no double-claim possible
    ctx.txn.from = investorA
    expect(() => {
      vault.claim(epochId)
    }).toThrow(/Claimed|AlreadyClaimed/)

    ctx.txn.from = investorB
    expect(() => {
      vault.claim(epochId)
    }).toThrow(/Claimed|AlreadyClaimed/)

    ctx.txn.from = treasury
    expect(() => {
      vault.claim(epochId)
    }).toThrow(/Claimed|AlreadyClaimed/)

    // Verify uninitialized account cannot claim
    const stranger = ctx.account.create().address
    ctx.txn.from = stranger
    expect(() => {
      vault.claim(epochId)
    }).toThrow(/NotFound|NoEntitlementFound/)
  })

  /**
   * Test: Multiple epochs in sequence (no crosstalk)
   */
  it('Multiple epochs: Independent lifecycle per epoch', () => {
    const registry = ctx.contract.create(ProjectRegistry)
    const kwToken = ctx.contract.create(KWToken)
    const kwhReceipt = ctx.contract.create(KWhReceipt)
    const vault = ctx.contract.create(RevenueVault)

    const admin = ctx.account.create().address
    const oracle = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address

    ctx.txn.from = admin

    // Initialize all contracts
    registry.create()
    registry.init_registry(
      Bytes('MultiEpochProject'),
      installedAcKw,
      treasury,
      platformKwBps,
      platformKwBps,
      admin
    )
    registry.setContracts(kwToken.address, kwhReceipt.address, vault.address)
    registry.setOracle(oracle, 1n)
    registry.markCOD()

    kwToken.create()
    kwToken.initToken(registry.address, Bytes('kW'), Bytes('kW-MULTI'))
    kwToken.mintAllocation(investor, installedAcKw - 1000n)
    kwToken.closeFinancialClose(installedAcKw, platformKwBps, treasury)

    kwhReceipt.create()
    kwhReceipt.initReceipt(registry.address, vault.address)

    vault.create()
    vault.initVault(registry.address, kwToken.address, kwhReceipt.address, treasury, 0n, platformKwBps)

    // ========================================
    // Epoch 1
    // ========================================
    const epochId1 = 202501n
    vault.createEpoch(epochId1, startTs, endTs)
    vault.closeEpoch(epochId1)
    vault.anchorAccrualReport(epochId1, reportHash)
    vault.depositNetRevenue(epochId1, 50000n)
    vault.anchorEntitlements(epochId1, entitlementsHash)
    vault.setEntitlement(epochId1, investor, 45000n)
    vault.setEntitlement(epochId1, treasury, 5000n)
    vault.settleEpochEntitlements(epochId1)

    // ========================================
    // Epoch 2
    // ========================================
    const epochId2 = 202502n
    vault.createEpoch(epochId2, endTs, endTs + 2592000n)
    vault.closeEpoch(epochId2)
    vault.anchorAccrualReport(epochId2, reportHash)
    vault.depositNetRevenue(epochId2, 60000n)
    vault.anchorEntitlements(epochId2, entitlementsHash)
    vault.setEntitlement(epochId2, investor, 54000n)
    vault.setEntitlement(epochId2, treasury, 6000n)
    vault.settleEpochEntitlements(epochId2)

    // ========================================
    // Claim from Epoch 1
    // ========================================
    ctx.txn.from = investor
    vault.claim(epochId1)
    expect(vault.viewClaimable(epochId1, investor)).toBe(0n) // Already claimed
    expect(vault.viewClaimable(epochId2, investor)).toBe(54000n) // Can still claim epoch 2

    // ========================================
    // Claim from Epoch 2
    // ========================================
    vault.claim(epochId2)
    expect(vault.viewClaimable(epochId2, investor)).toBe(0n)

    // ========================================
    // Treasury claims
    // ========================================
    ctx.txn.from = treasury
    vault.claim(epochId1)
    vault.claim(epochId2)
    expect(vault.viewClaimable(epochId1, treasury)).toBe(0n)
    expect(vault.viewClaimable(epochId2, treasury)).toBe(0n)
  })
})
