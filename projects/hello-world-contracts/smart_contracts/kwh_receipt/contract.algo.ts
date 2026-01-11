import {
  Contract,
  GlobalState,
  Uint64,
  BoxMap,
  Bytes,
  Txn,
  Global,
  assert,
} from '@algorandfoundation/algorand-typescript'
import type { uint64, Account } from '@algorandfoundation/algorand-typescript'

/**
 * Protius V1 Core: kWh Receipt Contract (Minimal V1)
 *
 * SSOT: Production truth layer for per-project electricity generation.
 *
 * Core Constraints (Non-Negotiable):
 * 1. Post-COD only: recordProduction() forbidden until ProjectRegistry.markCOD()
 * 2. Interval uniqueness: Each intervalId recorded exactly once, globally
 * 3. Epoch locking: Once epoch settled, no new receipts accepted for that epoch
 * 4. Oracle authority: Only whitelist oracle can call recordProduction()
 * 5. Settlement authority: Only RevenueVault can call markEpochSettled()
 *
 * Storage Model:
 * - receipts[intervalId] = { epochId: uint64, kWhAmount: uint64 }
 * - epochTotals[epochId] = { totalKWh: uint64, settled: uint64 (0/1) }
 *
 * NOT a token. NOT tradable. NOT revenue distribution.
 */
export class KWhReceipt extends Contract {
  // -----------------------
  // Global State: Configuration
  // -----------------------
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  registry = GlobalState<Account>({ initialValue: Global.zeroAddress })
  revenueVault = GlobalState<Account>({ initialValue: Global.zeroAddress })
  paused = GlobalState<uint64>({ initialValue: Uint64(0) })

  // -----------------------
  // Box Storage: Per-Interval Receipts
  // Key: intervalId (uint64)
  // Values: epochId and kWhAmount (stored in two separate BoxMaps)
  // -----------------------
  intervalEpochId = BoxMap<uint64, uint64>({ keyPrefix: Bytes('int_epoch:') })
  intervalKWhAmount = BoxMap<uint64, uint64>({ keyPrefix: Bytes('int_kwh:') })

  // -----------------------
  // Box Storage: Per-Epoch Totals
  // Key: epochId (uint64)
  // Values: totalKWh and settled flag (0=open, 1=settled)
  // -----------------------
  epochTotalKWh = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_kwh:') })
  epochSettled = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_settled:') })

  // -----------------------
  // Helpers
  // -----------------------
  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'NotAdmin')
  }

  private onlyRevenueVault(): void {
    assert(Txn.sender === this.revenueVault.value, 'NotRevenueVault')
  }

  private requireNotPaused(): void {
    assert(this.paused.value === Uint64(0), 'ContractPaused')
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  create(): void {
    this.admin.value = Txn.sender
    this.paused.value = Uint64(0)
  }

  /**
   * Initialize contract with registry and vault references.
   * SSOT: Must be called once post-deployment.
   */
  initReceipt(registry: Account, vault: Account): string {
    this.onlyAdmin()
    assert(this.registry.value === Global.zeroAddress, 'AlreadyInitialized')
    assert(registry !== Global.zeroAddress, 'InvalidRegistry')
    assert(vault !== Global.zeroAddress, 'InvalidVault')

    this.registry.value = registry
    this.revenueVault.value = vault
    return 'kWh Receipt initialized'
  }

  // -----------------------
  // Production Recording
  // -----------------------
  /**
   * Record production for a single interval.
   *
   * SSOT Constraints:
   * - Post-COD only (placeholder: requires ProjectRegistry.isCOD() check)
   * - Interval unique: cannot record same intervalId twice
   * - Epoch not settled: cannot add to settled epoch
   * - Oracle authorized: (placeholder: requires ProjectRegistry oracle check)
   *
   * @param epochId - Settlement period
   * @param intervalId - Production interval (globally unique key)
   * @param kWhAmount - AC kWh produced
   * @returns Success message
   */
  recordProduction(epochId: uint64, intervalId: uint64, kWhAmount: uint64): string {
    this.requireNotPaused()
    this.onlyAdmin() // TODO: Check ProjectRegistry.isOracle(Txn.sender)

    // SSOT: Validate input
    assert(kWhAmount > Uint64(0), 'InvalidKWhAmount')
    assert(epochId > Uint64(0), 'InvalidEpoch')
    assert(intervalId > Uint64(0), 'InvalidInterval')

    // SSOT: Interval uniqueness—cannot re-record
    const existingInterval = this.intervalEpochId(intervalId).maybe()
    assert(existingInterval[1] === false, 'IntervalAlreadyRecorded')

    // SSOT: Post-COD enforcement (placeholder - requires cross-contract call)
    // assert(ProjectRegistry.isCOD(), 'ProjectNotCOD')

    // SSOT: Epoch must not be settled
    const epochSettledFlag = this.epochSettled(epochId).maybe()
    const isSettled = epochSettledFlag[1] && (epochSettledFlag[0] as uint64) === Uint64(1)
    assert(!isSettled, 'EpochAlreadySettled')

    // Create receipt: store epochId and kWhAmount
    const intEpochBox = this.intervalEpochId(intervalId)
    intEpochBox.create({ size: Uint64(8) })
    intEpochBox.value = epochId

    const intKWhBox = this.intervalKWhAmount(intervalId)
    intKWhBox.create({ size: Uint64(8) })
    intKWhBox.value = kWhAmount

    // Update epoch total
    const epochTotalBox = this.epochTotalKWh(epochId)
    const epochMaybe = epochTotalBox.maybe()

    let newTotal = kWhAmount
    if (epochMaybe[1]) {
      newTotal = (epochMaybe[0] as uint64) + kWhAmount
    }

    if (epochMaybe[1]) {
      epochTotalBox.value = newTotal
    } else {
      epochTotalBox.create({ size: Uint64(8) })
      epochTotalBox.value = newTotal
    }

    return `Recorded: interval=${intervalId}, epoch=${epochId}, kWh=${kWhAmount}`
  }

  // -----------------------
  // Epoch Settlement
  // -----------------------
  /**
   * Mark an epoch as settled.
   * SSOT: Only RevenueVault. Locks epoch; no further records accepted.
   *
   * @param epochId - Epoch to settle
   * @returns Success message
   */
  markEpochSettled(epochId: uint64): string {
    this.onlyRevenueVault()

    assert(epochId > Uint64(0), 'InvalidEpoch')

    // SSOT: Epoch must exist and not already settled
    const epochSettledBox = this.epochSettled(epochId)
    const settleMaybe = epochSettledBox.maybe()
    assert(!(settleMaybe[1] && (settleMaybe[0] as uint64) === Uint64(1)), 'EpochAlreadySettled')

    // Mark epoch as settled
    if (settleMaybe[1]) {
      epochSettledBox.value = Uint64(1)
    } else {
      epochSettledBox.create({ size: Uint64(8) })
      epochSettledBox.value = Uint64(1)
    }

    // Get total for return message
    const totalMaybe = this.epochTotalKWh(epochId).maybe()
    const totalKWh = totalMaybe[1] ? (totalMaybe[0] as uint64) : Uint64(0)

    return `Epoch ${epochId} settled with ${totalKWh} kWh`
  }

  // -----------------------
  // Admin Controls
  // -----------------------
  /**
   * Emergency pause.
   */
  pauseRecording(): string {
    this.onlyAdmin()
    this.paused.value = Uint64(1)
    return 'Recording paused'
  }

  /**
   * Resume.
   */
  unpauseRecording(): string {
    this.onlyAdmin()
    this.paused.value = Uint64(0)
    return 'Recording resumed'
  }

  /**
   * Update admin.
   */
  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAddress')
    this.admin.value = newAdmin
    return 'Admin updated'
  }

  // -----------------------
  // Reads (Public)
  // -----------------------
  /**
   * Get receipt by intervalId.
   * Returns: { epochId, kWhAmount } or { 0, 0 } if not found
   */
  getReceipt(intervalId: uint64): { epochId: uint64; kWhAmount: uint64 } {
    const epochMaybe = this.intervalEpochId(intervalId).maybe()
    const kWhMaybe = this.intervalKWhAmount(intervalId).maybe()

    if (epochMaybe[1] && kWhMaybe[1]) {
      return { epochId: epochMaybe[0] as uint64, kWhAmount: kWhMaybe[0] as uint64 }
    }
    return { epochId: Uint64(0), kWhAmount: Uint64(0) }
  }

  /**
   * Get epoch total and settled status.
   * Returns: { totalKWh, settled (0/1) }
   */
  getEpoch(epochId: uint64): { totalKWh: uint64; settled: uint64 } {
    const kWhMaybe = this.epochTotalKWh(epochId).maybe()
    const settleMaybe = this.epochSettled(epochId).maybe()

    const totalKWh = kWhMaybe[1] ? (kWhMaybe[0] as uint64) : Uint64(0)
    const settled = settleMaybe[1] ? (settleMaybe[0] as uint64) : Uint64(0)

    return { totalKWh, settled }
  }

  /**
   * Check if interval recorded.
   */
  isIntervalRecorded(intervalId: uint64): uint64 {
    const maybe = this.intervalEpochId(intervalId).maybe()
    return maybe[1] ? Uint64(1) : Uint64(0)
  }

  /**
   * Check if epoch settled.
   */
  isEpochSettled(epochId: uint64): uint64 {
    const maybe = this.epochSettled(epochId).maybe()
    return maybe[1] && (maybe[0] as uint64) === Uint64(1) ? Uint64(1) : Uint64(0)
  }

  /**
   * Get configuration.
   */
  getRegistry(): Account {
    return this.registry.value
  }

  getRevenueVault(): Account {
    return this.revenueVault.value
  }

  getAdmin(): Account {
    return this.admin.value
  }

  isPaused(): uint64 {
    return this.paused.value
  }
}
