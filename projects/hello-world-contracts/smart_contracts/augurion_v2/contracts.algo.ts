import {
  Contract,
  GlobalState,
  Uint64,
  BoxMap,
  Bytes,
  itxn,
  Txn,
  gtxn,
  Global,
  assert,
} from '@algorandfoundation/algorand-typescript'
import type { uint64, Account, bytes } from '@algorandfoundation/algorand-typescript'

/**
 * AugurionMarketV2_1 (single-market, ALGO collateral, parimutuel pool)
 *
 * Lifecycle (status):
 * 0 = PENDING   (configured but not open)
 * 1 = OPEN      (accept bets)
 * 2 = FROZEN    (no more bets; awaiting resolution)
 * 3 = RESOLVED  (winner set; claims allowed)
 * 4 = CANCELLED (refunds allowed)
 *
 * winningSide:
 * 0 = NONE
 * 1 = YES
 * 2 = NO
 */
export class AugurionMarketV4 extends Contract {
  // -----------------------
  // Global state
  // -----------------------

  status = GlobalState<uint64>({ initialValue: Uint64(0) }) // PENDING

  // Admin is also oracle in this version
  admin = GlobalState<Account>({ initialValue: Txn.sender }) // set during create

  // Layer 1 → Layer 2 link (hash/ID of off-chain Outcome Brief / Outcome Spec)
  outcomeRef = GlobalState<bytes>({ initialValue: Bytes('') })

  // Round after which betting should not be allowed
  expiryRound = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Totals
  yesTotal = GlobalState<uint64>({ initialValue: Uint64(0) })
  noTotal = GlobalState<uint64>({ initialValue: Uint64(0) })
  totalBets = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Fee basis points (e.g. 200 = 2%)
  feeBps = GlobalState<uint64>({ initialValue: Uint64(0) })

  winningSide = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Version marker
  claimVersion = GlobalState<uint64>({ initialValue: Uint64(2) })

  // -----------------------
  // Per-user boxes
  // -----------------------

  yesBet = BoxMap<Account, uint64>({ keyPrefix: Bytes('yes:') })
  noBet = BoxMap<Account, uint64>({ keyPrefix: Bytes('no:') })
  claimed = BoxMap<Account, uint64>({ keyPrefix: Bytes('claimed:') })
  refunded = BoxMap<Account, uint64>({ keyPrefix: Bytes('refunded:') })

  // -----------------------
  // Helpers
  // -----------------------

  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'Only admin')
  }

  /**
   * Returns the app address for payment validation.
   *
   * NOTE:
   * Different versions of algorand-typescript expose this differently.
   * If this fails to compile, replace the body with the correct helper for your version,
   * e.g. Global.currentApplicationAddress or similar.
   */
  private getAppAddress(): Account {
    // Many toolchains provide this via Txn.applicationAddress / Global.currentApplicationAddress.
    // If Txn.applicationAddress doesn't exist in your version, swap to the available equivalent.
    return Global.currentApplicationAddress

  }

  /**
   * Require a grouped ALGO payment immediately before the app call.
   * Pattern:
   *   gtxn[i-1] = payment (sender -> app address, amount = bet amount)
   *   gtxn[i]   = app call (bet_yes / bet_no)
   */
  private assertGroupedAlgoPayment(amount: uint64): void {
  // Enforce strict 2-txn group:
  // gtxn[0] = payment
  // gtxn[1] = app call (this)
  assert(Txn.groupIndex === Uint64(1), 'App call must be second transaction in group')

  const payTxn = gtxn.PaymentTxn(0)

  assert(payTxn.sender === Txn.sender, 'Payment sender mismatch')
  assert(payTxn.amount === amount, 'Payment amount mismatch')
  assert(payTxn.receiver === this.getAppAddress(), 'Payment must go to app address')
}

  private assertOpenAndNotExpired(): void {
  assert(this.status.value === Uint64(1), 'Market is not open')

  const exp = this.expiryRound.value
  if (exp !== Uint64(0)) {
    assert(Global.round < exp, 'Market expired')
  }
}


  // -----------------------
  // Lifecycle
  // -----------------------

  create(): void {
    this.status.value = Uint64(0) // PENDING
    this.admin.value = Txn.sender

    this.outcomeRef.value = Bytes('')
    this.expiryRound.value = Uint64(0)

    this.yesTotal.value = Uint64(0)
    this.noTotal.value = Uint64(0)
    this.totalBets.value = Uint64(0)

    this.feeBps.value = Uint64(0)
    this.winningSide.value = Uint64(0)
    this.claimVersion.value = Uint64(2)
  }

  /**
   * Configure the market metadata before opening.
   * Can be called multiple times while PENDING to fix wording/refs.
   * Configuration fields are immutable after configure_market.
   */
  configure_market(outcomeRef: bytes, expiryRound: uint64, feeBps: uint64): string {
    this.onlyAdmin()
    if (this.status.value !== Uint64(0)) {
      return 'Can only configure while PENDING'
    }

    if (expiryRound !== Uint64(0)) {
      assert(Global.round < expiryRound, 'Expiry must be in the future')
    }

    this.outcomeRef.value = outcomeRef
    this.expiryRound.value = expiryRound
    this.feeBps.value = feeBps

    return 'Market configured'
  }

  open_market(): string {
    this.onlyAdmin()
    if (this.status.value !== Uint64(0)) return 'Market must be PENDING to open'
    if (this.outcomeRef.value === Bytes('')) return 'OutcomeRef required'

    // Do not mutate configuration here; configure_market is the only writer.
    const exp = this.expiryRound.value
    if (exp !== Uint64(0)) {
      assert(Global.round < exp, 'Market expired before open')
    }

    this.status.value = Uint64(1)
    return 'Market opened'
  }

  freeze_market(): string {
    this.onlyAdmin()
    if (this.status.value !== Uint64(1)) return 'Market must be OPEN to freeze'
    this.status.value = Uint64(2)
    return 'Market frozen'
  }

  cancel_market(): string {
    this.onlyAdmin()
    if (this.status.value === Uint64(3)) return 'Already resolved'
    this.status.value = Uint64(4)
    return 'Market cancelled'
  }

  // -----------------------
  // Bets
  // -----------------------

  bet_yes(amount: uint64): string {
    this.assertOpenAndNotExpired()
    this.assertGroupedAlgoPayment(amount)

    this.yesTotal.value = this.yesTotal.value + amount
    this.totalBets.value = this.totalBets.value + amount

    const senderKey = Txn.sender
    const userYesBox = this.yesBet(senderKey)
    userYesBox.create({ size: Uint64(8) })
    const currentYes: uint64 = userYesBox.get({ default: Uint64(0) })
    userYesBox.value = currentYes + amount

    return `YES bet registered: ${amount}`
  }

  bet_no(amount: uint64): string {
    this.assertOpenAndNotExpired()
    this.assertGroupedAlgoPayment(amount)

    this.noTotal.value = this.noTotal.value + amount
    this.totalBets.value = this.totalBets.value + amount

    const senderKey = Txn.sender
    const userNoBox = this.noBet(senderKey)
    userNoBox.create({ size: Uint64(8) })
    const currentNo: uint64 = userNoBox.get({ default: Uint64(0) })
    userNoBox.value = currentNo + amount

    return `NO bet registered: ${amount}`
  }

  // -----------------------
  // Resolve + Claim
  // -----------------------

  /**
   * Admin-as-oracle resolves the market.
   * Prefer: freeze first, then resolve.
   */
  resolve_market(winningSide: uint64): string {
    this.onlyAdmin()

    if (this.status.value !== Uint64(2) && this.status.value !== Uint64(1)) {
      return 'Market must be OPEN or FROZEN to resolve'
    }

    if (winningSide !== Uint64(1) && winningSide !== Uint64(2)) {
      return 'Invalid winning side'
    }

    this.status.value = Uint64(3)
    this.winningSide.value = winningSide

    return winningSide === Uint64(1) ? 'Resolved: YES' : 'Resolved: NO'
  }

  claim_payout(): string {
    if (this.status.value !== Uint64(3)) return 'Market not resolved'

    const winning: uint64 = this.winningSide.value
    const yesTotalVal: uint64 = this.yesTotal.value
    const noTotalVal: uint64 = this.noTotal.value
    const totalPool: uint64 = yesTotalVal + noTotalVal
    const feeBpsVal: uint64 = this.feeBps.value

    const senderKey = Txn.sender

    // Check claimed
    const claimedBox = this.claimed(senderKey)
    const claimedMaybe = claimedBox.maybe()
    const hasClaimed = claimedMaybe[1] ? (claimedMaybe[0] as uint64) : Uint64(0)
    if (hasClaimed === Uint64(1)) return 'Already claimed'

    // Determine user's winning bet
    let userWinningBet: uint64 = Uint64(0)
    let totalWinningSide: uint64 = Uint64(0)

    if (winning === Uint64(1)) {
      const b = this.yesBet(senderKey)
      const maybe = b.maybe()
      userWinningBet = maybe[1] ? (maybe[0] as uint64) : Uint64(0)
      totalWinningSide = yesTotalVal
    } else if (winning === Uint64(2)) {
      const b = this.noBet(senderKey)
      const maybe = b.maybe()
      userWinningBet = maybe[1] ? (maybe[0] as uint64) : Uint64(0)
      totalWinningSide = noTotalVal
    } else {
      return 'No winning side set'
    }

    if (userWinningBet === Uint64(0)) return 'Nothing to claim'
    if (totalWinningSide === Uint64(0)) return 'Invalid totals'

    // payoutPool = totalPool - fee
    const feeAmount: uint64 = (totalPool * feeBpsVal) / Uint64(10_000)
    const payoutPool: uint64 = totalPool - feeAmount

    // userShare = payoutPool * userWinningBet / totalWinningSide
    const numerator: uint64 = payoutPool * userWinningBet
    const userShare: uint64 = numerator / totalWinningSide

    // Mark claimed
    claimedBox.create({ size: Uint64(8) })
    claimedBox.value = Uint64(1)

    itxn.payment({ receiver: Txn.sender, amount: userShare }).submit()

    return `Paid ${userShare}`
  }

  /**
   * If market is cancelled, users can refund their YES+NO bets (one-time).
   */
  claim_refund(): string {
    if (this.status.value !== Uint64(4)) return 'Market not cancelled'

    const senderKey = Txn.sender

    // already refunded?
    const r = this.refunded(senderKey)
    const rm = r.maybe()
    const already = rm[1] ? (rm[0] as uint64) : Uint64(0)
    if (already === Uint64(1)) return 'Already refunded'

    const y = this.yesBet(senderKey).maybe()
    const n = this.noBet(senderKey).maybe()
    const yesAmt: uint64 = y[1] ? (y[0] as uint64) : Uint64(0)
    const noAmt: uint64 = n[1] ? (n[0] as uint64) : Uint64(0)

    const refundAmt: uint64 = yesAmt + noAmt
    if (refundAmt === Uint64(0)) return 'Nothing to refund'

    r.create({ size: Uint64(8) })
    r.value = Uint64(1)

    itxn.payment({ receiver: Txn.sender, amount: refundAmt }).submit()

    return `Refunded ${refundAmt}`
  }

  // -----------------------
  // Read helpers for UI
  // -----------------------

  get_market_meta(): string {
    return `status=${this.status.value}, outcomeRef=${this.outcomeRef.value}, expiryRound=${this.expiryRound.value}, feeBps=${this.feeBps.value}`
  }
}
