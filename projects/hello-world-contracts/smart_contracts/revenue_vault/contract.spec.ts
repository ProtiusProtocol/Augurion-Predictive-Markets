import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { describe, expect, it } from 'vitest'
import { RevenueVault } from './contract.algo'
import { Bytes } from '@algorandfoundation/algorand-typescript'

/**
 * Protius V1 Core: RevenueVault Entitlements Tests
 * 
 * SSOT Invariants:
 * 1. anchorEntitlements is write-once per epoch
 * 2. setEntitlement requires hash anchored + epoch CLOSED
 * 3. setEntitlement is write-once per (epochId, account)
 * 4. sumEntitlements accumulates as entitlements are set
 * 5. settleEpochEntitlements enforces sumEntitlements == netDeposited
 * 6. claim(epochId) is inputless, reads from storage, prevents double-claim
 * 7. viewClaimable returns correct values pre/post claim
 */
describe('RevenueVault Entitlements SSOT', () => {
  const ctx = new TestExecutionContext()

  // Test Parameters (Consistent Across Tests)
  const epochId = 202501n // Jan 2025
  const reportHash = Bytes('report_hash_jan_2025')
  const entitlementsHash = Bytes('ent_hash_jan_2025')
  const netDeposited = 10000n // 10000 units
  const startTs = 1704067200n // 2024-01-01 00:00:00 UTC
  const endTs = 1706745600n // 2024-02-01 00:00:00 UTC

  /**
   * Test: anchorEntitlements is write-once and requires epoch CLOSED
   */
  it('anchorEntitlements: write-once and requires epoch CLOSED', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address

    // Setup
    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Create and close epoch
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)

    // SUCCESS: Anchor hash when epoch CLOSED
    let result = contract.anchorEntitlements(epochId, entitlementsHash)
    expect(result).toContain('anchored')

    // FAILURE: Cannot anchor again (write-once)
    expect(() => {
      contract.anchorEntitlements(epochId, entitlementsHash)
    }).toThrow(/AlreadyAnchored|EntitlementsAlreadyAnchored/)

    // FAILURE: Cannot anchor to OPEN epoch
    const epochId2 = 202502n
    contract.createEpoch(epochId2, startTs, endTs)
    expect(() => {
      contract.anchorEntitlements(epochId2, entitlementsHash)
    }).toThrow(/NotClosed|EpochNotClosed/)
  })

  /**
   * Test: setEntitlement requires entitlementsHash anchored and epoch CLOSED
   */
  it('setEntitlement: reverts unless entitlementsHash anchored and epoch CLOSED', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Create and close epoch
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)

    // FAILURE: Cannot set entitlement before hash is anchored
    expect(() => {
      contract.setEntitlement(epochId, investor, 5000n)
    }).toThrow(/NotAnchored|EntitlementsNotAnchored/)

    // Anchor the hash
    contract.anchorEntitlements(epochId, entitlementsHash)

    // SUCCESS: Can set entitlement after hash is anchored
    let result = contract.setEntitlement(epochId, investor, 5000n)
    expect(result).toContain('set')

    // FAILURE: Cannot set entitlement to OPEN epoch
    const epochId3 = 202503n
    contract.createEpoch(epochId3, startTs, endTs)
    // Don't close it, so it's OPEN
    expect(() => {
      contract.setEntitlement(epochId3, investor, 5000n)
    }).toThrow(/NotClosed|EpochNotClosed/)
  })

  /**
   * Test: setEntitlement is write-once per (epochId, account) and updates sumEntitlements
   */
  it('setEntitlement: write-once per (epochId, account) and updates sumEntitlements', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Setup: Create, close, anchor
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)
    contract.anchorEntitlements(epochId, entitlementsHash)

    // SUCCESS: Set entitlement for investor A
    contract.setEntitlement(epochId, investorA, 6000n)
    
    // SUCCESS: Set entitlement for investor B (different account)
    contract.setEntitlement(epochId, investorB, 4000n)

    // FAILURE: Cannot overwrite investor A's entitlement
    expect(() => {
      contract.setEntitlement(epochId, investorA, 5000n)
    }).toThrow(/AlreadySet|EntitlementAlreadySet/)

    // Verify settlement works (sum accumulated correctly: 6000 + 4000 = 10000)
    contract.anchorAccrualReport(epochId, reportHash)
    contract.depositNetRevenue(epochId, netDeposited)
    const settleResult = contract.settleEpochEntitlements(epochId)
    expect(settleResult).toContain('settled')
  })

  /**
   * Test: settleEpochEntitlements enforces all preconditions
   */
  it('settleEpochEntitlements: reverts unless all preconditions met', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Setup epoch
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)

    // Test 1: FAILURE without report hash
    expect(() => {
      contract.settleEpochEntitlements(epochId)
    }).toThrow(/NotAnchored|ReportNotAnchored/)

    // Add report hash
    contract.anchorAccrualReport(epochId, reportHash)

    // Test 2: FAILURE without netDeposited
    expect(() => {
      contract.settleEpochEntitlements(epochId)
    }).toThrow(/NotDeposited|RevenueNotDeposited/)

    // Simulate deposit
    contract.depositNetRevenue(epochId, netDeposited)

    // Test 3: FAILURE without entitlements hash
    expect(() => {
      contract.settleEpochEntitlements(epochId)
    }).toThrow(/NotAnchored|EntitlementsNotAnchored/)

    // Anchor entitlements hash
    contract.anchorEntitlements(epochId, entitlementsHash)

    // Test 4: FAILURE if sumEntitlements != netDeposited
    contract.setEntitlement(epochId, investorA, 6000n)
    contract.setEntitlement(epochId, investorB, 3000n) // Total: 9000, not 10000
    
    expect(() => {
      contract.settleEpochEntitlements(epochId)
    }).toThrow(/Mismatch|EntitlementsSumMismatch/)

    // Test 5: SUCCESS when sumEntitlements == netDeposited
    const epochId2 = 202502n
    contract.createEpoch(epochId2, startTs, endTs)
    contract.closeEpoch(epochId2)
    contract.anchorAccrualReport(epochId2, reportHash)
    contract.depositNetRevenue(epochId2, netDeposited)
    contract.anchorEntitlements(epochId2, entitlementsHash)
    contract.setEntitlement(epochId2, investorA, 6000n)
    contract.setEntitlement(epochId2, investorB, 4000n) // Total: 10000

    let result = contract.settleEpochEntitlements(epochId2)
    expect(result).toContain('settled')
  })

  /**
   * Test: claim reverts if epoch not SETTLED
   */
  it('claim: reverts if epoch not SETTLED', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Create epoch but don't close/settle
    contract.createEpoch(epochId, startTs, endTs)

    // FAILURE: Cannot claim from OPEN epoch
    ctx.txn.from = investorA
    expect(() => {
      contract.claim(epochId)
    }).toThrow(/NotSettled|EpochNotSettled/)

    // Close epoch but don't settle
    ctx.txn.from = admin
    contract.closeEpoch(epochId)

    ctx.txn.from = investorA
    expect(() => {
      contract.claim(epochId)
    }).toThrow(/NotSettled|EpochNotSettled/)
  })

  /**
   * Test: claim reverts if entitlement is 0 or not found
   */
  it('claim: reverts if entitlement is 0', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Setup: Create, close, anchor, deposit, settle
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)
    contract.anchorAccrualReport(epochId, reportHash)
    contract.depositNetRevenue(epochId, netDeposited)
    contract.anchorEntitlements(epochId, entitlementsHash)
    contract.setEntitlement(epochId, investorA, 10000n) // Only A has entitlement
    contract.settleEpochEntitlements(epochId)

    // SUCCESS: investorA can claim (has entitlement)
    ctx.txn.from = investorA
    let result = contract.claim(epochId)
    expect(result).toContain('Claimed')

    // FAILURE: investorB cannot claim (no entitlement)
    ctx.txn.from = investorB
    expect(() => {
      contract.claim(epochId)
    }).toThrow(/NotFound|NoEntitlementFound/)
  })

  /**
   * Test: claim marks claimed and prevents second claim (write-once)
   */
  it('claim: marks claimed and prevents second claim', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Setup
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)
    contract.anchorAccrualReport(epochId, reportHash)
    contract.depositNetRevenue(epochId, netDeposited)
    contract.anchorEntitlements(epochId, entitlementsHash)
    contract.setEntitlement(epochId, investorA, 6000n)
    contract.setEntitlement(epochId, investorB, 4000n)
    contract.settleEpochEntitlements(epochId)

    // SUCCESS: First claim
    ctx.txn.from = investorA
    let result = contract.claim(epochId)
    expect(result).toContain('Claimed')

    // FAILURE: Second claim from same account
    expect(() => {
      contract.claim(epochId)
    }).toThrow(/Claimed|AlreadyClaimed/)

    // SUCCESS: Different account can claim independently
    ctx.txn.from = investorB
    result = contract.claim(epochId)
    expect(result).toContain('Claimed')

    // FAILURE: investorB cannot claim again
    expect(() => {
      contract.claim(epochId)
    }).toThrow(/Claimed|AlreadyClaimed/)
  })

  /**
   * Test: viewClaimable returns correct values pre/post claim
   */
  it('viewClaimable: returns expected values pre/post claim', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Create but don't close
    const epochId1 = 202501n
    contract.createEpoch(epochId1, startTs, endTs)

    // BEFORE SETTLEMENT: viewClaimable returns 0 (OPEN epoch)
    let claimable = contract.viewClaimable(epochId1, investorA)
    expect(claimable).toBe(0n)

    // Setup and settle
    contract.closeEpoch(epochId1)
    contract.anchorAccrualReport(epochId1, reportHash)
    contract.depositNetRevenue(epochId1, netDeposited)
    contract.anchorEntitlements(epochId1, entitlementsHash)
    contract.setEntitlement(epochId1, investorA, 6000n)
    contract.setEntitlement(epochId1, investorB, 4000n)
    contract.settleEpochEntitlements(epochId1)

    // AFTER SETTLEMENT (pre-claim): viewClaimable returns entitlement amount
    claimable = contract.viewClaimable(epochId1, investorA)
    expect(claimable).toBe(6000n)

    claimable = contract.viewClaimable(epochId1, investorB)
    expect(claimable).toBe(4000n)

    // Account with no entitlement returns 0
    const uninvolved = ctx.account.create().address
    claimable = contract.viewClaimable(epochId1, uninvolved)
    expect(claimable).toBe(0n)

    // AFTER CLAIM: viewClaimable returns 0
    ctx.txn.from = investorA
    contract.claim(epochId1)

    claimable = contract.viewClaimable(epochId1, investorA)
    expect(claimable).toBe(0n)

    // investorB can still claim
    claimable = contract.viewClaimable(epochId1, investorB)
    expect(claimable).toBe(4000n)
  })

  /**
   * Test: Conservation Invariant (sumEntitlements == netDeposited)
   */
  it('Conservation: sumEntitlements must equal netDeposited exactly', () => {
    const contract = ctx.contract.create(RevenueVault)
    const admin = ctx.account.create().address
    const registry = ctx.account.create().address
    const kwToken = ctx.account.create().address
    const kwhReceipt = ctx.account.create().address
    const treasury = ctx.account.create().address
    const investorA = ctx.account.create().address
    const investorB = ctx.account.create().address
    const investorC = ctx.account.create().address

    ctx.txn.from = admin
    contract.create()
    contract.initVault(registry, kwToken, kwhReceipt, treasury, 0n, 500n)

    // Setup
    const net = 10000n
    contract.createEpoch(epochId, startTs, endTs)
    contract.closeEpoch(epochId)
    contract.anchorAccrualReport(epochId, reportHash)
    contract.depositNetRevenue(epochId, net)
    contract.anchorEntitlements(epochId, entitlementsHash)

    // Set entitlements that sum to exactly netDeposited
    contract.setEntitlement(epochId, investorA, 3333n)
    contract.setEntitlement(epochId, investorB, 3333n)
    contract.setEntitlement(epochId, investorC, 3334n) // Includes rounding remainder

    // SUCCESS: Settlement passes (sum == net)
    let result = contract.settleEpochEntitlements(epochId)
    expect(result).toContain('settled')

    // All three can claim their full amounts
    ctx.txn.from = investorA
    contract.claim(epochId)
    expect(contract.viewClaimable(epochId, investorA)).toBe(0n)

    ctx.txn.from = investorB
    contract.claim(epochId)
    expect(contract.viewClaimable(epochId, investorB)).toBe(0n)

    ctx.txn.from = investorC
    contract.claim(epochId)
    expect(contract.viewClaimable(epochId, investorC)).toBe(0n)
  })
})
