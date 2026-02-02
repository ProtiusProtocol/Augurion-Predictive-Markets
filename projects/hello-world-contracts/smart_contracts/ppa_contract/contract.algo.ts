import {
  Contract,
  GlobalState,
  Uint64,
  BoxMap,
  Bytes,
  Txn,
  Global,
  assert,
  gtxn,
} from '@algorandfoundation/algorand-typescript'
import type { uint64, Account, bytes } from '@algorandfoundation/algorand-typescript'

/**
 * Protius V1 Extension: PPA (Power Purchase Agreement) Contract
 *
 * SSOT: Transactional-level electricity sales via PPAs
 *
 * Core Responsibilities:
 * 1. Manage bilateral PPA agreements between sellers (project) and buyers (corporates/utilities)
 * 2. Allocate monthly generation (kWh) to specific PPA buyers
 * 3. Verify buyer payments match agreed-upon pricing
 * 4. Track payment status and settlement history
 * 5. Ensure total PPA allocations ≤ actual generation
 *
 * Integration with Protius Core:
 * - Reads total generation from KWhReceipt per epoch
 * - Allocates kWh to PPA buyers (direct revenue to treasury)
 * - Remaining kWh goes to RevenueVault (distributed to token holders)
 *
 * Revenue Flow:
 * Total Generation → PPA Allocations (direct buyer payments) + Remaining (market/vault)
 *
 * NOT Responsible For:
 * - Minting tokens
 * - Managing market pricing
 * - Off-chain invoice generation
 * - Currency conversion
 * - Tax/regulatory compliance
 */
export class PPAContract extends Contract {
  // -----------------------
  // Global State: Configuration
  // -----------------------
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  projectRegistry = GlobalState<Account>({ initialValue: Global.zeroAddress })
  kwhReceipt = GlobalState<Account>({ initialValue: Global.zeroAddress })
  treasury = GlobalState<Account>({ initialValue: Global.zeroAddress })
  
  // Settlement asset (0 = ALGO, >0 = ASA ID)
  settlementAssetId = GlobalState<uint64>({ initialValue: Uint64(0) })
  
  // Agreement counter
  currentAgreementId = GlobalState<uint64>({ initialValue: Uint64(0) })
  
  // Emergency controls
  paused = GlobalState<uint64>({ initialValue: Uint64(0) })
  initialized = GlobalState<uint64>({ initialValue: Uint64(0) })

  // -----------------------
  // Agreement Status Constants
  // -----------------------
  private statusActive(): uint64 { return Uint64(0) }
  private statusTerminated(): uint64 { return Uint64(1) }
  private statusCompleted(): uint64 { return Uint64(2) }

  // -----------------------
  // Box Storage: Agreement Details
  // Key: agreementId (uint64)
  // -----------------------
  agreementBuyer = BoxMap<uint64, Account>({ keyPrefix: Bytes('agr_buyer:') })
  agreementSeller = BoxMap<uint64, Account>({ keyPrefix: Bytes('agr_seller:') })
  agreementPricePerKWh = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_price:') })
  agreementStartEpoch = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_start:') })
  agreementEndEpoch = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_end:') })
  agreementStatus = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_status:') })
  
  // Optional volume commitments (0 = no limit)
  agreementMinKWhPerEpoch = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_min:') })
  agreementMaxKWhPerEpoch = BoxMap<uint64, uint64>({ keyPrefix: Bytes('agr_max:') })

  // -----------------------
  // Box Storage: Epoch Allocation Summary
  // Key: epochId (uint64)
  // -----------------------
  epochTotalKWhAllocated = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_alloc:') })
  epochTotalRevenue = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_rev:') })
  epochSettled = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_settled:') })

  // -----------------------
  // Box Storage: Per-Agreement Per-Epoch Allocations
  // Key: agreementId_epochId (bytes, concatenated)
  // -----------------------
  allocationKWh = BoxMap<bytes, uint64>({ keyPrefix: Bytes('alloc_kwh:') })
  allocationRevenue = BoxMap<bytes, uint64>({ keyPrefix: Bytes('alloc_rev:') })
  allocationPaid = BoxMap<bytes, uint64>({ keyPrefix: Bytes('alloc_paid:') })
  allocationSettledAt = BoxMap<bytes, uint64>({ keyPrefix: Bytes('alloc_ts:') })

  // -----------------------
  // Helpers
  // -----------------------
  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'NotAdmin')
  }

  private requireNotPaused(): void {
    assert(this.paused.value === Uint64(0), 'ContractPaused')
  }

  private requireInitialized(): void {
    assert(this.initialized.value === Uint64(1), 'NotInitialized')
  }

  private encodeAllocationKey(agreementId: uint64, epochId: uint64): bytes {
    // Simple concatenation: agreementId + epochId (both 8 bytes)
    return Bytes.concat(Bytes.fromInt(agreementId), Bytes.fromInt(epochId))
  }

  private getAgreementStatus(agreementId: uint64): uint64 {
    const maybe = this.agreementStatus(agreementId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : this.statusActive()
  }

  private getAllocationKWh(key: bytes): uint64 {
    const maybe = this.allocationKWh(key).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  private getAllocationPaid(key: bytes): uint64 {
    const maybe = this.allocationPaid(key).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  private getEpochTotalAllocated(epochId: uint64): uint64 {
    const maybe = this.epochTotalKWhAllocated(epochId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  private getEpochSettled(epochId: uint64): uint64 {
    const maybe = this.epochSettled(epochId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  create(): void {
    this.admin.value = Txn.sender
    this.paused.value = Uint64(0)
    this.initialized.value = Uint64(0)
    this.currentAgreementId.value = Uint64(0)
  }

  /**
   * Initialize PPA contract with references to core Protius contracts.
   * Must be called once post-deployment.
   */
  initPPA(
    registry: Account,
    kwhReceipt: Account,
    treasury: Account,
    settlementAssetId: uint64
  ): string {
    this.onlyAdmin()
    assert(this.initialized.value === Uint64(0), 'AlreadyInitialized')
    assert(registry !== Global.zeroAddress, 'InvalidRegistry')
    assert(kwhReceipt !== Global.zeroAddress, 'InvalidKWhReceipt')
    assert(treasury !== Global.zeroAddress, 'InvalidTreasury')

    this.projectRegistry.value = registry
    this.kwhReceipt.value = kwhReceipt
    this.treasury.value = treasury
    this.settlementAssetId.value = settlementAssetId
    this.initialized.value = Uint64(1)

    return 'PPA Contract initialized'
  }

  // -----------------------
  // Agreement Management
  // -----------------------
  /**
   * Create a new PPA agreement.
   * 
   * Constraints:
   * - buyer ≠ seller (no self-dealing)
   * - pricePerKWh > 0
   * - startEpoch < endEpoch
   * - minKWh ≤ maxKWh (if both > 0)
   */
  createAgreement(
    buyer: Account,
    pricePerKWh: uint64,
    startEpoch: uint64,
    endEpoch: uint64,
    minKWhPerEpoch: uint64,
    maxKWhPerEpoch: uint64
  ): uint64 {
    this.onlyAdmin()
    this.requireNotPaused()
    this.requireInitialized()

    // Validations
    assert(buyer !== this.treasury.value, 'BuyerCannotBeSeller')
    assert(pricePerKWh > Uint64(0), 'InvalidPrice')
    assert(startEpoch < endEpoch, 'InvalidEpochRange')
    
    // Volume commitment validation
    if (minKWhPerEpoch > Uint64(0) && maxKWhPerEpoch > Uint64(0)) {
      assert(minKWhPerEpoch <= maxKWhPerEpoch, 'MinExceedsMax')
    }

    // Increment agreement ID
    const newId = this.currentAgreementId.value + Uint64(1)
    this.currentAgreementId.value = newId

    // Create agreement boxes
    this.agreementBuyer(newId).create({ size: Uint64(32) })
    this.agreementBuyer(newId).value = buyer

    this.agreementSeller(newId).create({ size: Uint64(32) })
    this.agreementSeller(newId).value = this.treasury.value

    this.agreementPricePerKWh(newId).create({ size: Uint64(8) })
    this.agreementPricePerKWh(newId).value = pricePerKWh

    this.agreementStartEpoch(newId).create({ size: Uint64(8) })
    this.agreementStartEpoch(newId).value = startEpoch

    this.agreementEndEpoch(newId).create({ size: Uint64(8) })
    this.agreementEndEpoch(newId).value = endEpoch

    this.agreementStatus(newId).create({ size: Uint64(8) })
    this.agreementStatus(newId).value = this.statusActive()

    this.agreementMinKWhPerEpoch(newId).create({ size: Uint64(8) })
    this.agreementMinKWhPerEpoch(newId).value = minKWhPerEpoch

    this.agreementMaxKWhPerEpoch(newId).create({ size: Uint64(8) })
    this.agreementMaxKWhPerEpoch(newId).value = maxKWhPerEpoch

    return newId
  }

  /**
   * Terminate an active agreement early.
   */
  terminateAgreement(agreementId: uint64): string {
    this.onlyAdmin()
    this.requireNotPaused()

    const status = this.getAgreementStatus(agreementId)
    assert(status === this.statusActive(), 'AgreementNotActive')

    this.agreementStatus(agreementId).value = this.statusTerminated()
    return 'Agreement terminated'
  }

  // -----------------------
  // Production Allocation
  // -----------------------
  /**
   * Allocate production to PPA buyers for a specific epoch.
   * 
   * Constraints:
   * - Epoch must not be already settled
   * - Sum of allocations must not exceed actual generation (verified client-side)
   * - Agreements must be active and within valid epoch range
   * 
   * Note: This is a batch operation. Client must provide all allocations for the epoch.
   * 
   * Input format for allocations:
   * - Array of (agreementId, kWhAmount) pairs
   * - Since Algorand doesn't support dynamic arrays in ABI, we use multiple calls
   *   or a single call with concatenated bytes
   */
  allocateProduction(
    epochId: uint64,
    agreementId: uint64,
    kWhAmount: uint64,
    expectedTotalGeneration: uint64
  ): string {
    this.onlyAdmin()
    this.requireNotPaused()
    this.requireInitialized()

    // Check epoch not already settled
    assert(this.getEpochSettled(epochId) === Uint64(0), 'EpochAlreadySettled')

    // Validate agreement exists and is active
    const status = this.getAgreementStatus(agreementId)
    assert(status === this.statusActive(), 'AgreementNotActive')

    // Validate epoch is within agreement range
    const startEpoch = this.agreementStartEpoch(agreementId).value
    const endEpoch = this.agreementEndEpoch(agreementId).value
    assert(epochId >= startEpoch && epochId <= endEpoch, 'EpochOutOfRange')

    // Check volume commitments (if set)
    const minKWh = this.agreementMinKWhPerEpoch(agreementId).value
    const maxKWh = this.agreementMaxKWhPerEpoch(agreementId).value
    
    if (minKWh > Uint64(0)) {
      assert(kWhAmount >= minKWh, 'BelowMinCommitment')
    }
    if (maxKWh > Uint64(0)) {
      assert(kWhAmount <= maxKWh, 'ExceedsMaxCommitment')
    }

    // Calculate revenue for this allocation
    const pricePerKWh = this.agreementPricePerKWh(agreementId).value
    const revenueAmount = kWhAmount * pricePerKWh

    // Create allocation key
    const allocKey = this.encodeAllocationKey(agreementId, epochId)

    // Check this allocation hasn't been set yet
    assert(this.getAllocationKWh(allocKey) === Uint64(0), 'AllocationAlreadyExists')

    // Store allocation
    this.allocationKWh(allocKey).create({ size: Uint64(8) })
    this.allocationKWh(allocKey).value = kWhAmount

    this.allocationRevenue(allocKey).create({ size: Uint64(8) })
    this.allocationRevenue(allocKey).value = revenueAmount

    this.allocationPaid(allocKey).create({ size: Uint64(8) })
    this.allocationPaid(allocKey).value = Uint64(0) // unpaid

    // Update epoch totals
    const currentTotal = this.getEpochTotalAllocated(epochId)
    const newTotal = currentTotal + kWhAmount

    // Verify total allocations don't exceed generation
    assert(newTotal <= expectedTotalGeneration, 'ExceedsTotalGeneration')

    // Update or create epoch total box
    if (currentTotal === Uint64(0)) {
      this.epochTotalKWhAllocated(epochId).create({ size: Uint64(8) })
    }
    this.epochTotalKWhAllocated(epochId).value = newTotal

    // Update epoch revenue
    const epochRevBox = this.epochTotalRevenue(epochId)
    const currentRevenue = epochRevBox.maybe()[1] ? (epochRevBox.maybe()[0] as uint64) : Uint64(0)
    if (currentRevenue === Uint64(0)) {
      epochRevBox.create({ size: Uint64(8) })
    }
    epochRevBox.value = currentRevenue + revenueAmount

    return 'Allocation recorded'
  }

  /**
   * Mark an epoch as settled (no more allocations allowed).
   * Called after all allocations are complete.
   */
  settleEpoch(epochId: uint64): string {
    this.onlyAdmin()
    this.requireNotPaused()

    assert(this.getEpochSettled(epochId) === Uint64(0), 'EpochAlreadySettled')

    const box = this.epochSettled(epochId)
    box.create({ size: Uint64(8) })
    box.value = Uint64(1)

    return 'Epoch settled'
  }

  // -----------------------
  // Payment Settlement
  // -----------------------
  /**
   * Settle buyer payment for a specific allocation.
   * 
   * Client submits atomic group transaction:
   * - Txn 0: Payment (buyer → treasury, exact amount)
   * - Txn 1: This method call (verifies payment)
   * 
   * Constraints:
   * - Payment amount must match allocation.revenueAmount exactly
   * - Payment receiver must be treasury
   * - Allocation must exist and be unpaid
   * - Payment currency must match settlementAssetId
   */
  settlePayment(agreementId: uint64, epochId: uint64): string {
    this.requireNotPaused()
    this.requireInitialized()

    // Get allocation key
    const allocKey = this.encodeAllocationKey(agreementId, epochId)

    // Check allocation exists
    const allocKWh = this.getAllocationKWh(allocKey)
    assert(allocKWh > Uint64(0), 'AllocationNotFound')

    // Check not already paid
    assert(this.getAllocationPaid(allocKey) === Uint64(0), 'AlreadyPaid')

    // Get expected revenue amount
    const expectedRevenue = this.allocationRevenue(allocKey).value

    // Verify payment transaction (must be previous txn in group)
    assert(Txn.groupSize >= Uint64(2), 'RequiresGroupTransaction')
    
    const paymentTxn = gtxn(0)
    
    // Verify payment details
    assert(paymentTxn.typeEnum === 1, 'InvalidPaymentType') // 1 = payment txn
    assert(paymentTxn.receiver === this.treasury.value, 'InvalidReceiver')
    assert(paymentTxn.amount === expectedRevenue, 'InvalidPaymentAmount')

    // Verify currency (ALGO vs ASA)
    if (this.settlementAssetId.value === Uint64(0)) {
      // ALGO payment - already validated above
    } else {
      // ASA payment - check xferAsset field
      assert(paymentTxn.xferAsset === this.settlementAssetId.value, 'InvalidSettlementAsset')
    }

    // Verify payment sender is the agreement buyer
    const buyer = this.agreementBuyer(agreementId).value
    assert(paymentTxn.sender === buyer, 'InvalidBuyer')

    // Mark as paid
    this.allocationPaid(allocKey).value = Uint64(1)

    // Record timestamp
    this.allocationSettledAt(allocKey).create({ size: Uint64(8) })
    this.allocationSettledAt(allocKey).value = Global.latestTimestamp

    return 'Payment settled'
  }

  // -----------------------
  // Query Functions
  // -----------------------
  /**
   * Get allocation details for a specific agreement and epoch.
   * Returns: (kWhAmount, revenueAmount, isPaid)
   */
  getAllocation(agreementId: uint64, epochId: uint64): [uint64, uint64, uint64] {
    const allocKey = this.encodeAllocationKey(agreementId, epochId)
    
    const kWhAmount = this.getAllocationKWh(allocKey)
    const revenueAmount = this.allocationRevenue(allocKey).maybe()[1]
      ? (this.allocationRevenue(allocKey).maybe()[0] as uint64)
      : Uint64(0)
    const isPaid = this.getAllocationPaid(allocKey)

    return [kWhAmount, revenueAmount, isPaid]
  }

  /**
   * Get total epoch allocation summary.
   * Returns: (totalKWhAllocated, totalRevenue, isSettled)
   */
  getEpochSummary(epochId: uint64): [uint64, uint64, uint64] {
    const totalKWh = this.getEpochTotalAllocated(epochId)
    const totalRevenue = this.epochTotalRevenue(epochId).maybe()[1]
      ? (this.epochTotalRevenue(epochId).maybe()[0] as uint64)
      : Uint64(0)
    const isSettled = this.getEpochSettled(epochId)

    return [totalKWh, totalRevenue, isSettled]
  }

  /**
   * Get agreement basic info.
   * Returns: (buyer, pricePerKWh, startEpoch, endEpoch, status)
   */
  getAgreement(agreementId: uint64): [Account, uint64, uint64, uint64, uint64] {
    const buyer = this.agreementBuyer(agreementId).value
    const price = this.agreementPricePerKWh(agreementId).value
    const startEpoch = this.agreementStartEpoch(agreementId).value
    const endEpoch = this.agreementEndEpoch(agreementId).value
    const status = this.getAgreementStatus(agreementId)

    return [buyer, price, startEpoch, endEpoch, status]
  }

  // -----------------------
  // Admin Functions
  // -----------------------
  setPaused(paused: uint64): string {
    this.onlyAdmin()
    this.paused.value = paused
    return paused === Uint64(1) ? 'Paused' : 'Unpaused'
  }

  updateTreasury(newTreasury: Account): string {
    this.onlyAdmin()
    assert(newTreasury !== Global.zeroAddress, 'InvalidTreasury')
    this.treasury.value = newTreasury
    return 'Treasury updated'
  }

  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAdmin')
    this.admin.value = newAdmin
    return 'Admin updated'
  }
}
