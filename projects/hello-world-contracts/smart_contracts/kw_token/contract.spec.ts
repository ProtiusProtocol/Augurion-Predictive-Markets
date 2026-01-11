import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { describe, expect, it } from 'vitest'
import { KWToken } from './contract.algo'

/**
 * SSOT Invariant Test: Total Supply Immutability Post-FC
 * 
 * This test guards a sacred invariant in the Protius execution model:
 * 
 * After Financial Close (FC), totalSupply MUST equal installedAcKw exactly
 * and MUST NEVER change.
 * 
 * Why this matters:
 * - kW tokens represent fixed installed AC capacity at grid connection
 * - The entire revenue distribution model depends on this fixed denominator
 * - Any supply change post-FC would break equity-like participation ratios
 * - No rebasing, no inflation, no post-FC minting is permitted under SSOT
 * 
 * This test validates both Financial Close paths:
 * 1. finalizeFinancialCloseSimple() - single investor happy path
 * 2. mintAllocation() + closeFinancialClose() - multi-investor path
 */
describe('KWToken SSOT Invariant: Total Supply Immutability', () => {
  const ctx = new TestExecutionContext()

  /**
   * Test Path 1: finalizeFinancialCloseSimple()
   * 
   * Validates:
   * - totalSupply == installedAcKw after FC
   * - treasuryKw + investorKw == installedAcKw (no leakage)
   * - Any post-FC mint attempt reverts
   */
  it('Path 1: finalizeFinancialCloseSimple enforces supply invariant', () => {
    const contract = ctx.contract.create(KWToken)
    
    // SSOT: Known project parameters
    const installedAcKw = 1000n // 1000 kW installed capacity
    const platformKwBps = 2000n // 20% to treasury (2000 basis points)
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address
    
    // Initialize contract
    contract.initToken(
      ctx.account.create().address, // registry placeholder
      ctx.encoders.utf8('Test kW Token'),
      ctx.encoders.utf8('kW-TEST')
    )
    
    // Execute Financial Close via simple path
    // Expected: treasuryKw = floor(1000 * 2000 / 10000) = 200
    //           investorKw = 1000 - 200 = 800
    contract.finalizeFinancialCloseSimple(
      installedAcKw,
      platformKwBps,
      treasury,
      investor
    )
    
    // SSOT Invariant 1: totalSupply == installedAcKw exactly
    const totalSupply = contract.getTotalSupply()
    expect(totalSupply).toBe(installedAcKw)
    
    // SSOT Invariant 2: treasury + investor allocations == installedAcKw
    const treasuryBal = contract.balanceOf(treasury)
    const investorBal = contract.balanceOf(investor)
    const expectedTreasuryKw = (installedAcKw * platformKwBps) / 10000n
    const expectedInvestorKw = installedAcKw - expectedTreasuryKw
    
    expect(treasuryBal).toBe(expectedTreasuryKw) // 200 kW
    expect(investorBal).toBe(expectedInvestorKw) // 800 kW
    expect(treasuryBal + investorBal).toBe(installedAcKw) // No rounding leakage
    
    // SSOT Invariant 3: Post-FC minting must be blocked
    expect(() => {
      contract.mintAllocation(ctx.account.create().address, 1n)
    }).toThrow(/FinancialCloseAlreadyFinalized|MintingClosed/)
    
    expect(() => {
      contract.finalizeFinancialCloseSimple(
        installedAcKw,
        platformKwBps,
        treasury,
        investor
      )
    }).toThrow(/FinancialCloseAlreadyFinalized/)
  })

  /**
   * Test Path 2: mintAllocation() + closeFinancialClose()
   * 
   * Validates:
   * - Multiple allocations sum correctly
   * - Treasury minted during close
   * - totalSupply == installedAcKw after close
   * - Post-FC minting blocked
   */
  it('Path 2: mintAllocation + closeFinancialClose enforces supply invariant', () => {
    const contract = ctx.contract.create(KWToken)
    
    // SSOT: Known project parameters
    const installedAcKw = 5000n // 5000 kW capacity
    const platformKwBps = 1500n // 15% to treasury (1500 bps)
    const treasury = ctx.account.create().address
    
    const investor1 = ctx.account.create().address
    const investor2 = ctx.account.create().address
    const investor3 = ctx.account.create().address
    
    // Initialize
    contract.initToken(
      ctx.account.create().address, // registry placeholder
      ctx.encoders.utf8('Multi Investor kW Token'),
      ctx.encoders.utf8('kW-MULTI')
    )
    
    // Expected allocations:
    // treasuryKw = floor(5000 * 1500 / 10000) = 750
    // investorKw = 5000 - 750 = 4250
    const expectedTreasuryKw = (installedAcKw * platformKwBps) / 10000n // 750
    const expectedInvestorKw = installedAcKw - expectedTreasuryKw // 4250
    
    // Mint investor allocations (must sum to expectedInvestorKw)
    contract.mintAllocation(investor1, 2000n)
    contract.mintAllocation(investor2, 1500n)
    contract.mintAllocation(investor3, 750n)
    // Sum: 2000 + 1500 + 750 = 4250 ✓
    
    // Close Financial Close (mints treasury and validates)
    contract.closeFinancialClose(installedAcKw, platformKwBps, treasury)
    
    // SSOT Invariant 1: totalSupply == installedAcKw exactly
    const totalSupply = contract.getTotalSupply()
    expect(totalSupply).toBe(installedAcKw)
    
    // SSOT Invariant 2: All balances sum to installedAcKw
    const treasuryBal = contract.balanceOf(treasury)
    const inv1Bal = contract.balanceOf(investor1)
    const inv2Bal = contract.balanceOf(investor2)
    const inv3Bal = contract.balanceOf(investor3)
    
    expect(treasuryBal).toBe(expectedTreasuryKw) // 750
    expect(inv1Bal).toBe(2000n)
    expect(inv2Bal).toBe(1500n)
    expect(inv3Bal).toBe(750n)
    expect(treasuryBal + inv1Bal + inv2Bal + inv3Bal).toBe(installedAcKw)
    
    // SSOT Invariant 3: Post-FC minting blocked
    expect(() => {
      contract.mintAllocation(ctx.account.create().address, 1n)
    }).toThrow(/FinancialCloseAlreadyFinalized|MintingClosed/)
    
    expect(() => {
      contract.closeFinancialClose(installedAcKw, platformKwBps, treasury)
    }).toThrow(/FinancialCloseAlreadyFinalized/)
  })

  /**
   * Edge Case: Platform receives 0% (platformKwBps = 0)
   * 
   * Validates:
   * - Treasury receives 0 kW
   * - All supply goes to investors
   * - totalSupply still equals installedAcKw
   */
  it('Edge case: platformKwBps = 0 (all investor)', () => {
    const contract = ctx.contract.create(KWToken)
    
    const installedAcKw = 1000n
    const platformKwBps = 0n // 0% to treasury
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address
    
    contract.initToken(
      ctx.account.create().address,
      ctx.encoders.utf8('No Platform Token'),
      ctx.encoders.utf8('kW-ZERO')
    )
    
    contract.finalizeFinancialCloseSimple(
      installedAcKw,
      platformKwBps,
      treasury,
      investor
    )
    
    // Treasury should receive 0
    expect(contract.balanceOf(treasury)).toBe(0n)
    expect(contract.balanceOf(investor)).toBe(installedAcKw)
    expect(contract.getTotalSupply()).toBe(installedAcKw)
  })

  /**
   * Edge Case: Platform receives 100% (platformKwBps = 10000)
   * 
   * Validates:
   * - Treasury receives all installedAcKw
   * - Investor receives 0 kW
   * - totalSupply still equals installedAcKw
   */
  it('Edge case: platformKwBps = 10000 (all treasury)', () => {
    const contract = ctx.contract.create(KWToken)
    
    const installedAcKw = 1000n
    const platformKwBps = 10000n // 100% to treasury
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address
    
    contract.initToken(
      ctx.account.create().address,
      ctx.encoders.utf8('Full Platform Token'),
      ctx.encoders.utf8('kW-FULL')
    )
    
    contract.finalizeFinancialCloseSimple(
      installedAcKw,
      platformKwBps,
      treasury,
      investor
    )
    
    // Treasury receives all
    expect(contract.balanceOf(treasury)).toBe(installedAcKw)
    expect(contract.balanceOf(investor)).toBe(0n)
    expect(contract.getTotalSupply()).toBe(installedAcKw)
  })

  /**
   * Failure Case: Invalid allocation sum in multi-call path
   * 
   * Validates closeFinancialClose reverts if investor allocations
   * don't sum to expected (installedAcKw - treasuryKw)
   */
  it('Rejects closeFinancialClose with incorrect allocation sum', () => {
    const contract = ctx.contract.create(KWToken)
    
    const installedAcKw = 1000n
    const platformKwBps = 2000n // 20% treasury = 200, investor = 800
    const treasury = ctx.account.create().address
    const investor = ctx.account.create().address
    
    contract.initToken(
      ctx.account.create().address,
      ctx.encoders.utf8('Bad Sum Token'),
      ctx.encoders.utf8('kW-BAD')
    )
    
    // Mint WRONG amount to investor (should be 800, minting only 500)
    contract.mintAllocation(investor, 500n)
    
    // closeFinancialClose should reject due to sum mismatch
    expect(() => {
      contract.closeFinancialClose(installedAcKw, platformKwBps, treasury)
    }).toThrow(/InvalidAllocationSum/)
  })
})
