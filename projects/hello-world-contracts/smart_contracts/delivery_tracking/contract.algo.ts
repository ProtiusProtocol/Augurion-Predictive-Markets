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
 * Delivery Tracking Contract
 *
 * SSOT: Tracks actual electricity delivery to PPA buyers
 * 
 * Key Distinction:
 * - Production (KWhReceipt): What solar panels generate
 * - Delivery (this contract): What buyers actually receive
 * 
 * Delivery < Production due to:
 * - Transmission losses (2-8%)
 * - On-site consumption
 * - Curtailment events
 * - Grid constraints
 * 
 * Buyers pay only for delivered kWh, not produced kWh.
 */
export class DeliveryTracking extends Contract {
  // -----------------------
  // Global State
  // -----------------------
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  ppaContract = GlobalState<Account>({ initialValue: Global.zeroAddress })
  kwhReceipt = GlobalState<Account>({ initialValue: Global.zeroAddress })
  paused = GlobalState<uint64>({ initialValue: Uint64(0) })
  initialized = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Default loss factor (basis points, e.g., 500 = 5%)
  defaultLossFactorBps = GlobalState<uint64>({ initialValue: Uint64(500) })

  // -----------------------
  // Box Storage: Delivery Records
  // Key: agreementId_epochId (bytes)
  // -----------------------
  deliveryKWh = BoxMap<bytes, uint64>({ keyPrefix: Bytes('del_kwh:') })
  deliveryRecorded = BoxMap<bytes, uint64>({ keyPrefix: Bytes('del_recorded:') })
  deliveryRecordedAt = BoxMap<bytes, uint64>({ keyPrefix: Bytes('del_ts:') })
  
  // Loss tracking
  deliveryLossFactor = BoxMap<bytes, uint64>({ keyPrefix: Bytes('del_loss:') })
  deliveryProductionRef = BoxMap<bytes, uint64>({ keyPrefix: Bytes('del_prod:') })

  // Per-epoch delivery totals
  epochDeliveryTotal = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_del:') })
  epochDeliveryRecorded = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_del_rec:') })

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

  private encodeDeliveryKey(agreementId: uint64, epochId: uint64): bytes {
    return Bytes.concat(Bytes.fromInt(agreementId), Bytes.fromInt(epochId))
  }

  private getDeliveryKWh(key: bytes): uint64 {
    const maybe = this.deliveryKWh(key).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  private getDeliveryRecorded(key: bytes): uint64 {
    const maybe = this.deliveryRecorded(key).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  create(): void {
    this.admin.value = Txn.sender
    this.paused.value = Uint64(0)
    this.initialized.value = Uint64(0)
    this.defaultLossFactorBps.value = Uint64(500) // 5% default
  }

  initDelivery(ppaContract: Account, kwhReceipt: Account): string {
    this.onlyAdmin()
    assert(this.initialized.value === Uint64(0), 'AlreadyInitialized')
    assert(ppaContract !== Global.zeroAddress, 'InvalidPPAContract')
    assert(kwhReceipt !== Global.zeroAddress, 'InvalidKWhReceipt')

    this.ppaContract.value = ppaContract
    this.kwhReceipt.value = kwhReceipt
    this.initialized.value = Uint64(1)

    return 'Delivery Tracking initialized'
  }

  // -----------------------
  // Delivery Recording
  // -----------------------
  /**
   * Record actual delivery to a PPA buyer.
   * 
   * This is what the buyer receives after transmission losses.
   * Typically recorded from:
   * - Utility meter at buyer's location
   * - Grid operator delivery confirmation
   * - Smart meter data
   * 
   * @param agreementId - PPA agreement
   * @param epochId - Settlement period
   * @param deliveredKWh - Actual kWh delivered to buyer
   * @param productionKWh - Reference production amount (for loss calculation)
   * @returns Success message
   */
  recordDelivery(
    agreementId: uint64,
    epochId: uint64,
    deliveredKWh: uint64,
    productionKWh: uint64
  ): string {
    this.onlyAdmin()
    this.requireNotPaused()
    this.requireInitialized()

    // Validations
    assert(deliveredKWh > Uint64(0), 'InvalidDeliveryAmount')
    assert(productionKWh >= deliveredKWh, 'DeliveryExceedsProduction')

    // Create delivery key
    const delKey = this.encodeDeliveryKey(agreementId, epochId)

    // Check not already recorded
    assert(this.getDeliveryRecorded(delKey) === Uint64(0), 'DeliveryAlreadyRecorded')

    // Calculate actual loss factor (in basis points)
    const lossAmount = productionKWh - deliveredKWh
    const lossFactor = (lossAmount * Uint64(10_000)) / productionKWh

    // Store delivery record
    this.deliveryKWh(delKey).create({ size: Uint64(8) })
    this.deliveryKWh(delKey).value = deliveredKWh

    this.deliveryRecorded(delKey).create({ size: Uint64(8) })
    this.deliveryRecorded(delKey).value = Uint64(1)

    this.deliveryRecordedAt(delKey).create({ size: Uint64(8) })
    this.deliveryRecordedAt(delKey).value = Global.latestTimestamp

    this.deliveryProductionRef(delKey).create({ size: Uint64(8) })
    this.deliveryProductionRef(delKey).value = productionKWh

    this.deliveryLossFactor(delKey).create({ size: Uint64(8) })
    this.deliveryLossFactor(delKey).value = lossFactor

    // Update epoch totals
    const epochTotalBox = this.epochDeliveryTotal(epochId)
    const currentTotal = epochTotalBox.maybe()[1] ? (epochTotalBox.maybe()[0] as uint64) : Uint64(0)
    const newTotal = currentTotal + deliveredKWh

    if (currentTotal === Uint64(0)) {
      epochTotalBox.create({ size: Uint64(8) })
    }
    epochTotalBox.value = newTotal

    // Mark epoch as having deliveries
    const epochRecBox = this.epochDeliveryRecorded(epochId)
    if (!epochRecBox.maybe()[1]) {
      epochRecBox.create({ size: Uint64(8) })
    }
    epochRecBox.value = Uint64(1)

    return 'Delivery recorded'
  }

  /**
   * Record delivery with automatic loss calculation.
   * Uses the default loss factor to calculate expected delivery.
   */
  recordDeliveryWithDefaultLoss(
    agreementId: uint64,
    epochId: uint64,
    productionKWh: uint64
  ): string {
    this.onlyAdmin()
    this.requireNotPaused()
    this.requireInitialized()

    // Calculate delivered amount after default loss
    const lossFactor = this.defaultLossFactorBps.value
    const lossAmount = (productionKWh * lossFactor) / Uint64(10_000)
    const deliveredKWh = productionKWh - lossAmount

    return this.recordDelivery(agreementId, epochId, deliveredKWh, productionKWh)
  }

  // -----------------------
  // Query Functions
  // -----------------------
  /**
   * Get delivery details for an agreement and epoch.
   * Returns: (deliveredKWh, productionKWh, lossFactor, timestamp)
   */
  getDelivery(agreementId: uint64, epochId: uint64): [uint64, uint64, uint64, uint64] {
    const delKey = this.encodeDeliveryKey(agreementId, epochId)

    const deliveredKWh = this.getDeliveryKWh(delKey)
    
    const productionKWh = this.deliveryProductionRef(delKey).maybe()[1]
      ? (this.deliveryProductionRef(delKey).maybe()[0] as uint64)
      : Uint64(0)
    
    const lossFactor = this.deliveryLossFactor(delKey).maybe()[1]
      ? (this.deliveryLossFactor(delKey).maybe()[0] as uint64)
      : Uint64(0)
    
    const timestamp = this.deliveryRecordedAt(delKey).maybe()[1]
      ? (this.deliveryRecordedAt(delKey).maybe()[0] as uint64)
      : Uint64(0)

    return [deliveredKWh, productionKWh, lossFactor, timestamp]
  }

  /**
   * Get total deliveries for an epoch.
   */
  getEpochDeliveryTotal(epochId: uint64): uint64 {
    const maybe = this.epochDeliveryTotal(epochId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  /**
   * Check if delivery has been recorded for an agreement/epoch.
   */
  isDeliveryRecorded(agreementId: uint64, epochId: uint64): uint64 {
    const delKey = this.encodeDeliveryKey(agreementId, epochId)
    return this.getDeliveryRecorded(delKey)
  }

  // -----------------------
  // Admin Functions
  // -----------------------
  setDefaultLossFactor(lossBps: uint64): string {
    this.onlyAdmin()
    assert(lossBps <= Uint64(2000), 'LossFactorTooHigh') // Max 20%
    this.defaultLossFactorBps.value = lossBps
    return 'Default loss factor updated'
  }

  setPaused(paused: uint64): string {
    this.onlyAdmin()
    this.paused.value = paused
    return paused === Uint64(1) ? 'Paused' : 'Unpaused'
  }

  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAdmin')
    this.admin.value = newAdmin
    return 'Admin updated'
  }
}
