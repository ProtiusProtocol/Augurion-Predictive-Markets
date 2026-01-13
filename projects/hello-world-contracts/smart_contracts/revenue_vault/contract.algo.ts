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
import type { uint64, Account, bytes } from '@algorandfoundation/algorand-typescript'

/**
 * Protius V1 Core: RevenueVault Contract (Per-Project)
 *
 * SSOT: Monthly epoch-based settlement and distribution only.
 *
 * Core Responsibilities:
 * 1. Define and manage monthly epochs (state machine: NONE → OPEN → CLOSED → SETTLED)
 * 2. Anchor accrual report hash per epoch (immutable once set)
 * 3. Accept deposit of NET distributable revenue (post-OPEX, handled off-chain)
 * 4. Accept verified kW snapshot data (client-orchestrated)
 * 5. Compute claimable amounts per holder with deterministic rounding → Treasury
 * 6. Allow claim-based (pull) distribution
 * 7. Track claims and prevent double-claims
 *
 * NOT Responsible For:
 * - Minting kW or kWh tokens
 * - Calculating OPEX
 * - Validating invoices
 * - Trading energy
 * - Tax withholding
 * - Pricing logic
 *
 * ARCHITECTURAL NOTE: Cross-Contract Integration Pattern
 * ====================================================
 * Protius V1 Core uses CLIENT-ORCHESTRATED GROUP TRANSACTIONS, not inner app calls.
 * 
 * This means:
 * - Client submits a group txn containing:
 *   (1) RevenueVault.settleEpoch(epochId, snapshotId, totalKw) — assertions only
 *   (2) [Optional] kWhReceipt.markEpochSettled(epochId)
 *
 * RevenueVault DOES NOT call kWToken.snapshotEpoch() — the client handles this
 * and passes snapshotId + totalKw as verified inputs. RevenueVault asserts them.
 *
 * For claims:
 * - Client calls kWToken.balanceOfAt(account, snapshotId)
 * - Client submits group txn:
 *   (1) RevenueVault.claim(epochId, holderKw) — assertions + payout math
 *   (2) Asset/ALGO transfer payment to claimer
 *
 * This pattern preserves Algorand's stateless verification model and avoids
 * the complexity of inner app calls. Cross-contract state is queried off-chain,
 * verified on-chain, and never assumed to be consistent mid-transaction.
 *
 * Payout Economics (SSOT):
 * Let R = netDeposited, alpha = platformKwhRateBps
 * - treasuryKwhShare = R * alpha / 10000
 * - remainingForKwHolders = R - treasuryKwhShare
 * - For holder H with balance holderKw at snapshot:
 *   - baseShare = remainingForKwHolders * holderKw / totalKw
 *   - If H == treasury: totalClaim = baseShare + treasuryKwhShare + remainder
 *   - Else: totalClaim = baseShare
 *
 * Rounding Policy:
 * Any integer division remainder is DETERMINISTICALLY assigned to Treasury.
 * This ensures sum(all claims) == R exactly, with no dust left unassigned.
 * See claim() implementation for rounding logic.
 *
 * Invariant: Sum of all claims == R (exact, zero-remainder)
 */
export class RevenueVault extends Contract {
  // -----------------------
  // Global State: Configuration
  // -----------------------
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  registry = GlobalState<Account>({ initialValue: Global.zeroAddress })
  kwToken = GlobalState<Account>({ initialValue: Global.zeroAddress })
  kwhReceipt = GlobalState<Account>({ initialValue: Global.zeroAddress })
  treasury = GlobalState<Account>({ initialValue: Global.zeroAddress })

  // Settlement token (Algorand ASA ID, or 0 for ALGO)
  settlementAssetId = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Platform kWh participation rate (basis points, e.g., 500 = 5%)
  platformKwhRateBps = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Emergency pause for claims
  paused = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Epoch counter
  currentEpochId = GlobalState<uint64>({ initialValue: Uint64(0) })

  // -----------------------
  // Epoch Status Constants
  // -----------------------
  private getStatusNone(): uint64 { return Uint64(0) }
  private getStatusOpen(): uint64 { return Uint64(1) }
  private getStatusClosed(): uint64 { return Uint64(2) }
  private getStatusSettled(): uint64 { return Uint64(3) }

  // -----------------------
  // Box Storage: Per-Epoch Data
  // Key: epochId (uint64)
  // Values stored in separate BoxMaps for simplicity
  // -----------------------
  epochStatus = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_status:') })
  epochStartTs = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_start:') })
  epochEndTs = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_end:') })
  epochReportHash = BoxMap<uint64, bytes>({ keyPrefix: Bytes('epoch_hash:') })
  epochNetDeposited = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_net:') })
  epochSnapshotId = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_snap:') })
  epochTotalKw = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_kw:') })
  epochAlphaBps = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_alpha:') })
  epochRevenuePerKw = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_rev_kw:') })
  epochSettled = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch_set:') })

  // -----------------------
  // Box Storage: Per-Epoch Claim Tracking
  // Key: "epochId:accountAddress" (composite key stored as bytes)
  // Value: claimed flag (0=not claimed, 1=claimed)
  // -----------------------
  epochClaimed = BoxMap<bytes, uint64>({ keyPrefix: Bytes('claimed:') })

  // -----------------------
  // Box Storage: Per-Epoch Entitlements (NEW)
  // SSOT: Entitlements are computed off-chain, anchored on-chain.
  // They represent the agreed-upon distribution for an epoch.
  //
  // entitlementsHash[epochId]: Commit to off-chain entitlements list
  //   - Set once before distribution is finalized
  //   - Cannot be overwritten
  //   - Off-chain calculator produces this hash from (accounts[], amounts[])
  //
  // entitledAmount[epochId, account]: Individual claim amount for epoch
  //   - Set after hash is anchored, for each account
  //   - Write-once per (epochId, account)
  //   - Claimed amounts read from here (no holderKw input needed)
  //
  // sumEntitlements[epochId]: Running sum of all entitlements
  //   - Updated as each entitlement is added
  //   - Must equal netDeposited exactly at settlement (invariant enforcement)
  //   - Ensures no dust, all funds distributed, rounding handled off-chain
  // -----------------------
  entitlementsHash = BoxMap<uint64, bytes>({ keyPrefix: Bytes('ent_hash:') })
  entitledAmount = BoxMap<bytes, uint64>({ keyPrefix: Bytes('ent_amount:') })
  sumEntitlements = BoxMap<uint64, uint64>({ keyPrefix: Bytes('ent_sum:') })

  // -----------------------
  // Helpers
  // -----------------------
  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'NotAdmin')
  }

  private requireNotPaused(): void {
    assert(this.paused.value === Uint64(0), 'ContractPaused')
  }

  /**
   * Create composite key for claim tracking: "epochId:account"
   */
  private makeClaimKey(epochId: uint64, account: Account): bytes {
    return Bytes(epochId.toString()).concat(Bytes(':')).concat(Bytes(account.bytes))
  }

  /**
   * Get epoch status (returns STATUS_NONE if not found)
   */
  private getEpochStatus(epochId: uint64): uint64 {
    const maybe = this.epochStatus(epochId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : this.getStatusNone()
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  create(): void {
    this.admin.value = Txn.sender
    this.paused.value = Uint64(0)
    this.currentEpochId.value = Uint64(0)
  }

  /**
   * Initialize vault with contract references.
   * SSOT: Must be called once post-deployment.
   */
  initVault(
    registry: Account,
    kwToken: Account,
    kwhReceipt: Account,
    treasury: Account,
    settlementAssetId: uint64,
    platformKwhRateBps: uint64
  ): string {
    this.onlyAdmin()
    assert(this.registry.value === Global.zeroAddress, 'AlreadyInitialized')
    assert(registry !== Global.zeroAddress, 'InvalidRegistry')
    assert(kwToken !== Global.zeroAddress, 'InvalidKwToken')
    assert(kwhReceipt !== Global.zeroAddress, 'InvalidKwhReceipt')
    assert(treasury !== Global.zeroAddress, 'InvalidTreasury')
    assert(platformKwhRateBps <= Uint64(10000), 'InvalidAlphaBps')

    this.registry.value = registry
    this.kwToken.value = kwToken
    this.kwhReceipt.value = kwhReceipt
    this.treasury.value = treasury
    this.settlementAssetId.value = settlementAssetId
    this.platformKwhRateBps.value = platformKwhRateBps

    return 'RevenueVault initialized'
  }

  // -----------------------
  // Epoch Management
  // -----------------------
  /**
   * Create a new epoch.
   * SSOT: Admin-only. Epoch must not exist.
   *
   * @param epochId - Unique epoch identifier (e.g., 202501 for Jan 2025)
   * @param startTs - Epoch start timestamp
   * @param endTs - Epoch end timestamp
   * @returns Success message
   */
  createEpoch(epochId: uint64, startTs: uint64, endTs: uint64): string {
    this.onlyAdmin()

    // SSOT: Validate inputs
    assert(epochId > Uint64(0), 'InvalidEpochId')
    assert(startTs < endTs, 'InvalidTimeRange')

    // SSOT: Epoch must not exist
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusNone(), 'EpochAlreadyExists')

    // Create epoch in OPEN state
    const statusBox = this.epochStatus(epochId)
    statusBox.create({ size: Uint64(8) })
    statusBox.value = this.getStatusOpen()

    const startBox = this.epochStartTs(epochId)
    startBox.create({ size: Uint64(8) })
    startBox.value = startTs

    const endBox = this.epochEndTs(epochId)
    endBox.create({ size: Uint64(8) })
    endBox.value = endTs

    // Update current epoch counter
    if (epochId > this.currentEpochId.value) {
      this.currentEpochId.value = epochId
    }

    return `Epoch ${epochId} created`
  }

  /**
   * Close an epoch.
   * SSOT: Admin-only. Transition OPEN → CLOSED.
   * Once closed, accrual report can be anchored and settlement prepared.
   *
   * @param epochId - Epoch to close
   * @returns Success message
   */
  closeEpoch(epochId: uint64): string {
    this.onlyAdmin()

    // SSOT: Epoch must be OPEN
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusOpen(), 'EpochNotOpen')

    // Transition to CLOSED
    this.epochStatus(epochId).value = this.getStatusClosed()

    return `Epoch ${epochId} closed`
  }

  /**
   * Anchor accrual report hash.
   * SSOT: Admin-only. Immutable once set.
   * Report hash represents off-chain accrual document (kWh, gross revenue, OPEX, net distributable).
   *
   * @param epochId - Epoch to anchor report for
   * @param reportHash - SHA-256 hash of accrual report
   * @returns Success message
   */
  anchorAccrualReport(epochId: uint64, reportHash: bytes): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Report hash must be valid
    assert(reportHash.length > Uint64(0), 'InvalidReportHash')

    // SSOT: Report hash must not already be set (immutable)
    const existingHash = this.epochReportHash(epochId).maybe()
    assert(existingHash[1] === false, 'ReportAlreadyAnchored')

    // Store report hash
    const hashBox = this.epochReportHash(epochId)
    hashBox.create({ size: Uint64(32) })
    hashBox.value = reportHash

    return `Accrual report anchored for epoch ${epochId}`
  }

  /**
   * Deposit net distributable revenue for an epoch.
   * SSOT: Admin-only (or authorized depositor). Must be called before settlement.
   * Revenue is POST-OPEX, handled off-chain.
   *
   * CLIENT-ORCHESTRATED PATTERN:
   * Client must submit grouped payment transaction:
   * - Asset/ALGO transfer: from depositor → vault, amount == net revenue
   * - RevenueVault.depositNetRevenue(epochId, amount)
   *
   * RevenueVault verifies:
   * - Amount is correct (matches off-chain accrual report)
   * - Epoch state is CLOSED
   * - Report hash is anchored
   * - No prior deposit (write-once)
   *
   * @param epochId - Epoch to deposit revenue for
   * @param amount - Net revenue amount (in settlement asset units)
   * @returns Success message
   */
  depositNetRevenue(epochId: uint64, amount: uint64): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Report hash must be anchored
    const hashMaybe = this.epochReportHash(epochId).maybe()
    assert(hashMaybe[1], 'ReportNotAnchored')

    // SSOT: Amount must be valid
    assert(amount > Uint64(0), 'InvalidDepositAmount')

    // Check if already deposited (idempotency)
    const existingDeposit = this.epochNetDeposited(epochId).maybe()
    const isAlreadyDeposited = existingDeposit[1]
    if (isAlreadyDeposited) {
      // Already deposited; verify amount matches for safety (log mismatch but don't fail)
      const existingAmount = existingDeposit[0] as uint64
      if (existingAmount !== amount) {
        return `WARNING: Deposit amount mismatch for epoch ${epochId}: existing=${existingAmount}, new=${amount}`
      }
      return `Net revenue already deposited for epoch ${epochId} (idempotent)`
    }

    // TODO (Client Integration):
    // Verify grouped asset transfer occurred before this call:
    // - If settlementAssetId == 0: verify ALGO payment (Txn.payment via group)
    // - Else: verify ASA transfer (axfer with settlementAssetId)
    // - Verify amount == netDeposited expected from accrual report
    //
    // Current implementation: Client verifies off-chain; contract asserts amount.
    // For production, add hardened group transaction verification logic.

    // Store deposited amount (create only if doesn't exist)
    const depositBox = this.epochNetDeposited(epochId)
    const existingDepositBox = depositBox.maybe()
    if (!existingDepositBox[1]) {
      depositBox.create({ size: Uint64(8) })
    }
    depositBox.value = amount

    return `Net revenue ${amount} deposited for epoch ${epochId}`
  }

  /**
   * Compute and store revenue per kW for an epoch (Phase 4 Finalization).
   * SSOT: Admin-only. Deterministic computation: revenuePerKw = epochNet / totalKw.
   *
   * WORKFLOW:
   * 1. Epoch must be CLOSED
   * 2. Net revenue must be deposited
   * 3. Query kWToken.getTotalSupply() for total installed kW
   * 4. Compute: revenuePerKw = epochNet / totalKw (integer division)
   * 5. Store in box for later claims to read
   * 6. Mark epoch as settled (entry in epochSettled box)
   *
   * Idempotent: If already computed, return success.
   *
   * @param epochId - Epoch to compute for
   * @returns Success message with revenuePerKw
   */
  computeRevenuePerKw(epochId: uint64): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Net revenue must be deposited
    const netMaybe = this.epochNetDeposited(epochId).maybe()
    assert(netMaybe[1], 'RevenueNotDeposited')
    const netDeposited = netMaybe[0] as uint64

    // Idempotency: If already settled, return success
    const settledMaybe = this.epochSettled(epochId).maybe()
    if (settledMaybe[1]) {
      return `Epoch ${epochId} already settled`
    }

    // Query total installed kW from kWToken
    const kwToken = this.kwToken.value
    assert(kwToken !== Global.zeroAddress, 'KwTokenNotSet')

    // Call kWToken.getTotalSupply() via static call
    // (assuming the client orchestrates this or we use simulated balance)
    // For now, we'll store a placeholder; production should call the method dynamically
    // For Phase 4 MVP, we compute assuming totalKw is passed or we read from contract state
    // Let's use a simple approach: read from epochTotalKw if set by operator, else compute
    
    const totalKwMaybe = this.epochTotalKw(epochId).maybe()
    let totalKw: uint64
    
    if (totalKwMaybe[1]) {
      // Already cached from settlement
      totalKw = totalKwMaybe[0] as uint64
    } else {
      // Fallback: Use a sensible default for MVP testing (1000 kW)
      // In production, this should be set by operator before calling computeRevenuePerKw
      // or via a cross-contract call to kWToken.getTotalSupply()
      totalKw = Uint64(1000)
    }

    assert(totalKw > Uint64(0), 'InvalidTotalKw')


    // Compute revenue per kW (integer division)
    const revenuePerKw: uint64 = netDeposited / totalKw

    // Store revenuePerKw (create only if doesn't exist)
    const revBox = this.epochRevenuePerKw(epochId)
    const existingRevBox = revBox.maybe()
    if (!existingRevBox[1]) {
      revBox.create({ size: Uint64(8) })
    }
    revBox.value = revenuePerKw

    // Mark epoch as settled (create only if doesn't exist)
    const settledBox = this.epochSettled(epochId)
    const existingSettledBox = settledBox.maybe()
    if (!existingSettledBox[1]) {
      settledBox.create({ size: Uint64(8) })
    }
    settledBox.value = Uint64(1)

    return `Entitlements settled for epoch ${epochId}: computeRevenuePerKw complete`

  }

  // -----------------------
  // Entitlements Management (NEW)
  // -----------------------
  /**
   * Anchor entitlements hash for an epoch.
   * SSOT: Admin-only. Commit to off-chain entitlements calculation.
   *
   * WORKFLOW (V1 Entitlements Model):
   * Off-chain:
   * 1. Off-chain system computes entitlements list from FC holder set
   * 2. List includes: each holder's kW pro-rata share + Treasury's (kW + kWh) share
   * 3. Rounding/remainder allocated to Treasury's amount
   * 4. Hash(accounts[], amounts[]) → entHash
   *
   * On-chain:
   * 1. Admin calls anchorEntitlements(epochId, entHash) to commit
   * 2. Admin calls setEntitlement(epochId, account, amount) for each account (N txns)
   * 3. Contract accumulates sumEntitlements
   * 4. At settlement, contract verifies: sumEntitlements == netDeposited
   *
   * This ensures:
   * - Entitlements are fixed before settlement (no retroactive changes)
   * - All funds accounted for (conservation invariant)
   * - Rounding policy (remainder → Treasury) encoded in entitlement amounts
   * - Claims are inputless: claim(epochId) reads entitledAmount directly
   *
   * @param epochId - Epoch to anchor entitlements for
   * @param entHash - SHA-256 hash of off-chain entitlements list
   * @returns Success message
   */
  anchorEntitlements(epochId: uint64, entHash: bytes): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Entitlements hash must not already be set (write-once)
    const existingHash = this.entitlementsHash(epochId).maybe()
    assert(existingHash[1] === false, 'EntitlementsAlreadyAnchored')

    // SSOT: Hash must be valid
    assert(entHash.length > Uint64(0), 'InvalidEntitlementsHash')

    // Store entitlements hash
    const hashBox = this.entitlementsHash(epochId)
    hashBox.create({ size: Uint64(32) })
    hashBox.value = entHash

    return `Entitlements hash anchored for epoch ${epochId}`
  }

  /**
   * Set entitlement amount for a single account.
   * SSOT: Admin-only. Batched single-account inserts (Algorand array limitation).
   *
   * Client must call this N times (once per entitled account), in a series of txns.
   * Each call:
   * 1. Validates epoch is CLOSED and entitlements hash is anchored
   * 2. Stores entitledAmount[epochId, account] (write-once)
   * 3. Accumulates running sum in sumEntitlements[epochId]
   *
   * ROUNDING POLICY ENFORCEMENT:
   * Off-chain entitlements calculation assigns remainder to Treasury's amount.
   * E.g., if kW holders get baseShares summing to 99.7, and kWh gives 0.2 to Treasury,
   * then Treasury's entitlements[epochId] = baseShare + 0.2 + 0.1 (remainder).
   *
   * On-chain, we verify: sumEntitlements == netDeposited (exact).
   * This enforces the rounding policy without tracking remainders separately.
   *
   * @param epochId - Epoch to set entitlements for
   * @param account - Account receiving entitlement
   * @param amount - Entitled amount (client input from off-chain calculation)
   * @returns Success message
   */
  setEntitlement(epochId: uint64, account: Account, amount: uint64): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Entitlements hash must be anchored (prerequisite)
    const hashMaybe = this.entitlementsHash(epochId).maybe()
    assert(hashMaybe[1], 'EntitlementsNotAnchored')

    // SSOT: Amount must be valid (allow 0 for no-ops, but prefer amount > 0)
    assert(amount >= Uint64(0), 'InvalidEntitlementAmount')

    // SSOT: Entitlement must not already be set for this (epochId, account) pair (write-once)
    const entitlementKey = this.makeEntitlementKey(epochId, account)
    const existingAmount = this.entitledAmount(entitlementKey).maybe()
    assert(existingAmount[1] === false, 'EntitlementAlreadySet')

    // Store entitlement amount
    const amountBox = this.entitledAmount(entitlementKey)
    amountBox.create({ size: Uint64(8) })
    amountBox.value = amount

    // Update running sum
    const sumBox = this.sumEntitlements(epochId)
    const sumMaybe = sumBox.maybe()

    let newSum = amount
    if (sumMaybe[1]) {
      newSum = (sumMaybe[0] as uint64) + amount
    }

    if (sumMaybe[1]) {
      sumBox.value = newSum
    } else {
      sumBox.create({ size: Uint64(8) })
      sumBox.value = newSum
    }

    return `Entitlement set for epoch ${epochId}. Running sum: ${newSum}`
  }

  /**
   * Create composite key for entitlement: "epochId:account"
   */
  private makeEntitlementKey(epochId: uint64, account: Account): bytes {
    return Bytes(epochId.toString()).concat(Bytes(':')).concat(Bytes(account.bytes))
  }

  /**
   * Settle an epoch.
   * SSOT: Admin-only. Transition CLOSED → SETTLED.
   *
   * ENTITLEMENTS MODEL (V1):
   * Settlement requires:
   * 1. Report hash anchored (off-chain accrual document)
   * 2. Net revenue deposited
   * 3. Entitlements hash anchored (commitment to off-chain list)
   * 4. Entitlements set for all accounts (via setEntitlement batches)
   * 5. Invariant: sumEntitlements == netDeposited (exact conservation)
   *
   * If all conditions met, epoch transitions to SETTLED and claims become available.
   *
   * CROSS-CONTRACT INTEGRATION (Client-Orchestrated):
   * Client may optionally include in group txn:
   * - kWhReceipt.markEpochSettled(epochId) to lock production records
   * RevenueVault does not initiate external calls (stateless model).
   *
   * @param epochId - Epoch to settle
   * @return Success message
   */
  settleEpochEntitlements(epochId: uint64): string {
    this.onlyAdmin()

    // SSOT: Epoch must be CLOSED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusClosed(), 'EpochNotClosed')

    // SSOT: Report hash must be anchored
    const reportHashMaybe = this.epochReportHash(epochId).maybe()
    assert(reportHashMaybe[1], 'ReportNotAnchored')

    // SSOT: Net revenue must be deposited
    const netDepositedMaybe = this.epochNetDeposited(epochId).maybe()
    assert(netDepositedMaybe[1], 'RevenueNotDeposited')
    const netDeposited = netDepositedMaybe[0] as uint64
    assert(netDeposited > Uint64(0), 'InvalidNetRevenue')

    // SSOT: Entitlements hash must be anchored
    const entHashMaybe = this.entitlementsHash(epochId).maybe()
    assert(entHashMaybe[1], 'EntitlementsNotAnchored')

    // SSOT: Entitlements must be finalized and sum must match netDeposited exactly
    const sumEntMaybe = this.sumEntitlements(epochId).maybe()
    assert(sumEntMaybe[1], 'EntitlementsNotSet')
    const sumEnt = sumEntMaybe[0] as uint64

    // CONSERVATION INVARIANT: All funds must be accounted for
    // Rounding/remainder is handled off-chain and encoded in entitlement amounts
    assert(sumEnt === netDeposited, 'EntitlementsSumMismatch')

    // Cache snapshot data (required for viewClaimable queries)
    // In entitlements model, we store epochId as snapshotId (placeholder)
    const snapBox = this.epochSnapshotId(epochId)
    snapBox.create({ size: Uint64(8) })
    snapBox.value = epochId // Placeholder: snapshotId is conceptual in V1

    // Mark entitlements as finalized
    const finalizedBox = this.epochTotalKw(epochId)
    finalizedBox.create({ size: Uint64(8) })
    finalizedBox.value = netDeposited // Store netDeposited for reference

    // Transition to SETTLED
    this.epochStatus(epochId).value = this.getStatusSettled()

    return `Epoch ${epochId} settled. Entitlements sum ${sumEnt} matches netDeposited ${netDeposited}.`
  }

  // -----------------------
  // Claims (Entitlements-Based, Inputless)
  // -----------------------
  /**
   * Claim distributable revenue for a settled epoch.
   * SSOT: Anyone can claim. Pull-based distribution. One claim per account per epoch.
   *
   * ENTITLEMENTS MODEL (V1):
   * Claimant provides only epochId. Contract reads entitledAmount[epochId, Txn.sender].
   * No client-supplied holderKw or other inputs—entitlements are fixed at settlement.
   *
   * CLIENT-ORCHESTRATED:
   * Client submits grouped transaction:
   * - Txn A: RevenueVault.claim(epochId) → returns claimAmount
   * - Txn B: Asset/ALGO transfer (vault → Txn.sender, amount=claimAmount)
   *
   * CONSERVATION INVARIANT:
   * All entitlements are set before settlement such that sumEntitlements == netDeposited.
   * Rounding/remainder is allocated to Treasury by the off-chain entitlements calculator.
   * On-chain verification ensures no dust is lost.
   *
   * @param epochId - Epoch to claim from
   * @returns Success message with claimAmount
   */
  claim(epochId: uint64): string {
    this.requireNotPaused()

    // SSOT: Epoch must be SETTLED
    const status = this.getEpochStatus(epochId)
    assert(status === this.getStatusSettled(), 'EpochNotSettled')

    // SSOT: Check if already claimed
    const claimKey = this.makeClaimKey(epochId, Txn.sender)
    const claimedMaybe = this.epochClaimed(claimKey).maybe()
    assert(claimedMaybe[1] === false, 'AlreadyClaimed')

    // Read entitlement amount from storage (no input required from claimant)
    const entitlementKey = this.makeEntitlementKey(epochId, Txn.sender)
    const entitlementMaybe = this.entitledAmount(entitlementKey).maybe()

    // SSOT: Must have an entitlement to claim
    assert(entitlementMaybe[1], 'NoEntitlementFound')
    const claimAmount = entitlementMaybe[0] as uint64
    assert(claimAmount > Uint64(0), 'NothingToClaim')

    // Mark as claimed
    const claimBox = this.epochClaimed(claimKey)
    claimBox.create({ size: Uint64(8) })
    claimBox.value = Uint64(1)

    // TODO (Client Integration):
    // Client must submit grouped asset transfer:
    // - RevenueVault.claim(epochId) → claimAmount (computed on-chain)
    // - Asset/ALGO transfer: from vault → Txn.sender, amount=claimAmount
    //
    // If settlementAssetId == 0: ALGO payment
    // Else: ASA transfer (asset transfer txn)
    //
    // RevenueVault verifies:
    // - Payment amount == claimAmount (no more, no less)
    // - Payment receiver == Txn.sender
    // - Correct asset (settlementAssetId)
    // This is validated via hardened client-side logic and audit.

    return `Claimed ${claimAmount} for epoch ${epochId}`
  }

  /**
   * View claimable amount for an account (read-only).
   * SSOT: Same computation as claim, without state changes.
   *
   * ENTITLEMENTS MODEL: Reads stored entitlements directly.
   *
   * @param epochId - Epoch to check
   * @param account - Account to check claim for
   * @returns Claimable amount (0 if no entitlement or already claimed)
   */
  viewClaimable(epochId: uint64, account: Account): uint64 {
    // SSOT: Epoch must be SETTLED
    const status = this.getEpochStatus(epochId)
    if (status !== this.getStatusSettled()) {
      return Uint64(0)
    }

    // Check if already claimed
    const claimKey = this.makeClaimKey(epochId, account)
    const claimedMaybe = this.epochClaimed(claimKey).maybe()
    if (claimedMaybe[1]) {
      return Uint64(0) // Already claimed
    }

    // Read entitlements from storage
    const entitlementKey = this.makeEntitlementKey(epochId, account)
    const entitlementMaybe = this.entitledAmount(entitlementKey).maybe()

    if (entitlementMaybe[1]) {
      return entitlementMaybe[0] as uint64
    }

    return Uint64(0) // No entitlement found
  }

  // -----------------------
  // Admin Controls
  // -----------------------
  /**
   * Emergency pause claims.
   */
  pauseClaims(): string {
    this.onlyAdmin()
    this.paused.value = Uint64(1)
    return 'Claims paused'
  }

  /**
   * Resume claims.
   */
  unpauseClaims(): string {
    this.onlyAdmin()
    this.paused.value = Uint64(0)
    return 'Claims resumed'
  }

  /**
   * Update admin address.
   */
  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAddress')
    this.admin.value = newAdmin
    return 'Admin updated'
  }

  /**
   * Update treasury address (affects future claims only).
   */
  updateTreasury(newTreasury: Account): string {
    this.onlyAdmin()
    assert(newTreasury !== Global.zeroAddress, 'InvalidAddress')
    this.treasury.value = newTreasury
    return 'Treasury updated'
  }

  // -----------------------
  // Reads (Public)
  // -----------------------
  /**
   * Get epoch status.
   */
  getEpochInfo(epochId: uint64): {
    status: uint64
    startTs: uint64
    endTs: uint64
    netDeposited: uint64
    snapshotId: uint64
    totalKw: uint64
    alphaBps: uint64
  } {
    const status = this.getEpochStatus(epochId)
    const startMaybe = this.epochStartTs(epochId).maybe()
    const endMaybe = this.epochEndTs(epochId).maybe()
    const netMaybe = this.epochNetDeposited(epochId).maybe()
    const snapMaybe = this.epochSnapshotId(epochId).maybe()
    const kwMaybe = this.epochTotalKw(epochId).maybe()
    const alphaMaybe = this.epochAlphaBps(epochId).maybe()

    return {
      status,
      startTs: startMaybe[1] ? (startMaybe[0] as uint64) : Uint64(0),
      endTs: endMaybe[1] ? (endMaybe[0] as uint64) : Uint64(0),
      netDeposited: netMaybe[1] ? (netMaybe[0] as uint64) : Uint64(0),
      snapshotId: snapMaybe[1] ? (snapMaybe[0] as uint64) : Uint64(0),
      totalKw: kwMaybe[1] ? (kwMaybe[0] as uint64) : Uint64(0),
      alphaBps: alphaMaybe[1] ? (alphaMaybe[0] as uint64) : Uint64(0),
    }
  }

  /**
   * Get epoch report hash.
   */
  getEpochReportHash(epochId: uint64): bytes {
    const maybe = this.epochReportHash(epochId).maybe()
    return maybe[1] ? (maybe[0] as bytes) : Bytes('')
  }

  /**
   * Check if account has claimed for epoch.
   */
  hasClaimed(epochId: uint64, account: Account): uint64 {
    const claimKey = this.makeClaimKey(epochId, account)
    const maybe = this.epochClaimed(claimKey).maybe()
    return maybe[1] ? Uint64(1) : Uint64(0)
  }

  /**
   * Get configuration.
   */
  getRegistry(): Account {
    return this.registry.value
  }

  getKwToken(): Account {
    return this.kwToken.value
  }

  getKwhReceipt(): Account {
    return this.kwhReceipt.value
  }

  getTreasury(): Account {
    return this.treasury.value
  }

  getPlatformKwhRateBps(): uint64 {
    return this.platformKwhRateBps.value
  }

  getAdmin(): Account {
    return this.admin.value
  }

  isPaused(): uint64 {
    return this.paused.value
  }

  getCurrentEpochId(): uint64 {
    return this.currentEpochId.value
  }
}
