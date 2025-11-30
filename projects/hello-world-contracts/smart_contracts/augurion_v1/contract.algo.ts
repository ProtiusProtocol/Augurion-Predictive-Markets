import {
  Contract,
  GlobalState,
  Uint64,
} from '@algorandfoundation/algorand-typescript'
import type { uint64 } from '@algorandfoundation/algorand-typescript'

/**
 * AugurionMarketV1
 * status: 0 = DRAFT, 1 = OPEN, 2 = CLOSED, 3 = RESOLVED
 * winningSide: 0 = NONE, 1 = YES, 2 = NO
 */
export class AugurionMarketV1 extends Contract {
  // --- Global state ---

  // Current market status
  status = GlobalState<uint64>({ initialValue: Uint64(1) }) // start as OPEN

  // Total YES and NO stake
  yesTotal = GlobalState<uint64>({ initialValue: Uint64(0) })
  noTotal = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Fee in basis points (e.g. 200 = 2%)
  feeBps = GlobalState<uint64>({ initialValue: Uint64(0) }) // 0% fee for now

  // Winning side after resolution: 0 = none, 1 = YES, 2 = NO
  winningSide = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Called on app creation – initialise state
  create(): void {
    this.status.value = Uint64(1)      // OPEN
    this.yesTotal.value = Uint64(0)
    this.noTotal.value = Uint64(0)
    this.feeBps.value = Uint64(0)      // no fee in v0
    this.winningSide.value = Uint64(0) // not resolved yet
  }

  // Place a YES bet
  bet_yes(amount: uint64): string {
    // Only allow bets when market is OPEN (status = 1)
    if (this.status.value !== Uint64(1)) {
      return 'Market is not open'
    }

    this.yesTotal.value = this.yesTotal.value + amount

    return `YES bet of ${amount} registered. YES total = ${this.yesTotal.value}`
  }

  // Place a NO bet
  bet_no(amount: uint64): string {
    if (this.status.value !== Uint64(1)) {
      return 'Market is not open'
    }

    this.noTotal.value = this.noTotal.value + amount

    return `NO bet of ${amount} registered. NO total = ${this.noTotal.value}`
  }

  // Resolve the market: winningSide = 1 (YES) or 2 (NO)
resolve_market(winningSide: uint64): string {
  // Only allow resolve while still OPEN (status = 1)
  if (this.status.value !== Uint64(1)) {
    return 'Market must be OPEN to resolve'
  }

  const yesTotal: uint64 = this.yesTotal.value
  const noTotal: uint64 = this.noTotal.value
  const totalPool: uint64 = yesTotal + noTotal

  // feeBps is 0 in this version, but we keep the formula in place
  const feeBps: uint64 = this.feeBps.value
  const feeAmount: uint64 = (totalPool * feeBps) / Uint64(10_000)
  const payoutPool: uint64 = totalPool - feeAmount

  // Close market and record winner (we’ve been using 3 = RESOLVED)
  this.status.value = Uint64(3)
  this.winningSide.value = winningSide

  // Turn 1/2 into a readable label
  let sideLabel = 'UNKNOWN'
  if (winningSide === Uint64(1)) {
    sideLabel = 'YES'
  } else if (winningSide === Uint64(2)) {
    sideLabel = 'NO'
  }

  return `Market resolved: ${sideLabel} wins. ` +
         `(winningSide=${winningSide}, yesTotal=${yesTotal}, noTotal=${noTotal}, ` +
         `total_pool=${totalPool}, fee_bps=${feeBps}, fee_amount=${feeAmount}, ` +
         `payout_pool=${payoutPool})`
}

}
