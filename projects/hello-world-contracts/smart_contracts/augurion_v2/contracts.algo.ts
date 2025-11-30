import {
  Contract,
  GlobalState,
  Uint64,
  BoxMap,
  Bytes,
  itxn,
  Txn,
} from '@algorandfoundation/algorand-typescript'
import type { uint64, Account } from '@algorandfoundation/algorand-typescript'

/**
 * AugurionMarketV2
 * status: 0 = DRAFT, 1 = OPEN, 2 = CLOSED, 3 = RESOLVED
 * winningSide: 0 = NONE, 1 = YES, 2 = NO
 */
export class AugurionMarketV2 extends Contract {
  // --- Global state ---

  // Current market status
  status = GlobalState<uint64>({ initialValue: Uint64(1) }) // start as OPEN

  // Total YES and NO stake
  yesTotal = GlobalState<uint64>({ initialValue: Uint64(0) })
  noTotal = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Total staked (YES + NO) – for reporting
  totalBets = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Fee in basis points (e.g. 200 = 2%)
  feeBps = GlobalState<uint64>({ initialValue: Uint64(0) }) // 0% fee for now

  // Winning side after resolution: 0 = none, 1 = YES, 2 = NO
  winningSide = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Version marker – also bumps global uint count so a new app is created
  claimVersion = GlobalState<uint64>({ initialValue: Uint64(1) })

  // --- Per-user boxes (box-per-user pattern) ---

  // Store each user's YES stake (uint64) under prefix "yes:" + sender
  yesBet = BoxMap<Account, uint64>({ keyPrefix: Bytes('yes:') })

  // Store each user's NO stake (uint64) under prefix "no:" + sender
  noBet = BoxMap<Account, uint64>({ keyPrefix: Bytes('no:') })

  // Store whether a user has claimed (0 or 1) under prefix "claimed:" + sender
  claimed = BoxMap<Account, uint64>({ keyPrefix: Bytes('claimed:') })

  // Called on app creation – initialise state
  create(): void {
    this.status.value = Uint64(1)      // OPEN
    this.yesTotal.value = Uint64(0)
    this.noTotal.value = Uint64(0)
    this.totalBets.value = Uint64(0)
    this.feeBps.value = Uint64(0)      // no fee in v2.0
    this.winningSide.value = Uint64(0) // not resolved yet
    this.claimVersion.value = Uint64(1)
  }

  // Place a YES bet
  bet_yes(amount: uint64): string {
    // Only allow bets when market is OPEN (status = 1)
    if (this.status.value !== Uint64(1)) {
      return 'Market is not open'
    }

    // Update global totals
    this.yesTotal.value = this.yesTotal.value + amount
    this.totalBets.value = this.totalBets.value + amount

    // Increment the per-user YES box by `amount`. Use Txn.sender as the key.
    const senderKey = Txn.sender
    const userYesBox = this.yesBet(senderKey)

    // If the box doesn't exist, create it (create() no-ops if exists)
    userYesBox.create({ size: Uint64(8) })

    // Read current (default 0) and write updated value
    const currentYes: uint64 = userYesBox.get({ default: Uint64(0) })
    userYesBox.value = currentYes + amount

    return `YES bet of ${amount} registered. YES total = ${this.yesTotal.value}, TOTAL = ${this.totalBets.value}`
  }

  // Place a NO bet
  bet_no(amount: uint64): string {
    if (this.status.value !== Uint64(1)) {
      return 'Market is not open'
    }

    // Update global totals
    this.noTotal.value = this.noTotal.value + amount
    this.totalBets.value = this.totalBets.value + amount

    // Increment the per-user NO box by `amount`.
    const senderKey = Txn.sender
    const userNoBox = this.noBet(senderKey)
    userNoBox.create({ size: Uint64(8) })
    const currentNo: uint64 = userNoBox.get({ default: Uint64(0) })
    userNoBox.value = currentNo + amount

    return `NO bet of ${amount} registered. NO total = ${this.noTotal.value}, TOTAL = ${this.totalBets.value}`
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

    // feeBps may be non-zero later; keep the formula in place
    const feeBpsVal: uint64 = this.feeBps.value
    const feeAmount: uint64 = (totalPool * feeBpsVal) / Uint64(10_000)
    const payoutPool: uint64 = totalPool - feeAmount

    // Close market and record winner (3 = RESOLVED)
    this.status.value = Uint64(3)
    this.winningSide.value = winningSide

    // Turn 1/2 into a readable label
    let sideLabel = 'UNKNOWN'
    if (winningSide === Uint64(1)) {
      sideLabel = 'YES'
    } else if (winningSide === Uint64(2)) {
      sideLabel = 'NO'
    }

    return (
      `Market resolved: ${sideLabel} wins. ` +
      `(winningSide=${winningSide}, yesTotal=${yesTotal}, noTotal=${noTotal}, ` +
      `total_pool=${totalPool}, fee_bps=${feeBpsVal}, fee_amount=${feeAmount}, ` +
      `payout_pool=${payoutPool})`
    )
  }

  // Claim winnings after resolution. Pays out the user's share of the payout pool.
  claim_payout(): string {
    // Only callable when RESOLVED (3)
    if (this.status.value !== Uint64(3)) {
      return 'Market not resolved'
    }

    const winning: uint64 = this.winningSide.value
    const yesTotalVal: uint64 = this.yesTotal.value
    const noTotalVal: uint64 = this.noTotal.value
    const totalPool: uint64 = yesTotalVal + noTotalVal
    const feeBpsVal: uint64 = this.feeBps.value

    // Determine user's winning bet
    const senderKey = Txn.sender
    let userWinningBet: uint64 = Uint64(0)
    let totalWinningSide: uint64 = Uint64(0)

    if (winning === Uint64(1)) {
      // YES won
      const b = this.yesBet(senderKey)
      const maybe = b.maybe()
      userWinningBet = maybe[1] ? (maybe[0] as uint64) : Uint64(0)
      totalWinningSide = yesTotalVal
    } else if (winning === Uint64(2)) {
      // NO won
      const b = this.noBet(senderKey)
      const maybe = b.maybe()
      userWinningBet = maybe[1] ? (maybe[0] as uint64) : Uint64(0)
      totalWinningSide = noTotalVal
    } else {
      return 'No winning side set'
    }

    if (userWinningBet === Uint64(0)) {
      return 'Nothing to claim'
    }

    // Check claimed flag
    const claimedBox = this.claimed(senderKey)
    const claimedMaybe = claimedBox.maybe()
    const hasClaimed = claimedMaybe[1] ? (claimedMaybe[0] as uint64) : Uint64(0)
    if (hasClaimed === Uint64(1)) {
      return 'Already claimed'
    }

    // Compute payout: payoutPool = totalPool - fee
    const feeAmount: uint64 = (totalPool * feeBpsVal) / Uint64(10_000)
    const payoutPool: uint64 = totalPool - feeAmount

    // userShare = payoutPool * userWinningBet / totalWinningSide
    const numerator: uint64 = payoutPool * userWinningBet
    const userShare: uint64 = numerator / totalWinningSide

    // Mark claimed
    claimedBox.create({ size: Uint64(8) })
    claimedBox.value = Uint64(1)

    // Perform payment from the app account to the user via an inner transaction
    itxn.payment({ receiver: Txn.sender, amount: userShare }).submit()

    return `Paid ${userShare}`
  }
}
