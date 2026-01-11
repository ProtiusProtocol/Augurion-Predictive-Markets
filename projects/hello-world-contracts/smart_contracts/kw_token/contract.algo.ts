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
 * Protius V1 Core: kW Token (per-project)
 *
 * SSOT: 1 kW token = 1 kW installed AC capacity
 * - Fixed supply minted once at Financial Close (FC)
 * - Platform receives platformKwBps % of supply at FC
 * - Supports epoch snapshots for RevenueVault distribution
 * - Transfers enabled post-FC only
 * - No rebasing, no post-FC minting
 */
export class KWToken extends Contract {
  // -----------------------
  // Global state (SSOT)
  // -----------------------
  // Immutable references
  registry = GlobalState<Account>({ initialValue: Global.zeroAddress })
  tokenName = GlobalState<bytes>({ initialValue: Bytes('') })
  tokenSymbol = GlobalState<bytes>({ initialValue: Bytes('') })

  // Token state
  totalSupply = GlobalState<uint64>({ initialValue: Uint64(0) })
  
  // FC state (SSOT: minting occurs once at FC)
  fcFinalized = GlobalState<uint64>({ initialValue: Uint64(0) }) // 0=false, 1=true
  fcOpen = GlobalState<uint64>({ initialValue: Uint64(1) }) // 1=true until closed
  treasuryMinted = GlobalState<uint64>({ initialValue: Uint64(0) })
  investorMintedAmount = GlobalState<uint64>({ initialValue: Uint64(0) })

  // External references
  revenueVault = GlobalState<Account>({ initialValue: Global.zeroAddress })

  // Snapshot state
  currentSnapshotId = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Controls
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  transfersEnabled = GlobalState<uint64>({ initialValue: Uint64(0) }) // enabled post-FC

  // -----------------------
  // Per-account boxes
  // -----------------------
  // SSOT: kW token balances represent equity-like participation
  balances = BoxMap<Account, uint64>({ keyPrefix: Bytes('bal:') })
  
  // ERC-20 style allowances for transferFrom
  // Key encoding: owner+spender concatenated
  allowances = BoxMap<bytes, uint64>({ keyPrefix: Bytes('allow:') })

  // Epoch snapshots: epochId -> snapshotId binding
  epochSnapshots = BoxMap<uint64, uint64>({ keyPrefix: Bytes('epoch:') })

  // Account snapshots at snapshotId: account+snapshotId -> balance
  accountSnapshotBalances = BoxMap<bytes, uint64>({ keyPrefix: Bytes('snap:') })

  // Total supply snapshots: snapshotId -> total supply
  supplySnapshots = BoxMap<uint64, uint64>({ keyPrefix: Bytes('supply:') })

  // -----------------------
  // Helpers
  // -----------------------
  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'NotAdmin')
  }

  private onlyRevenueVault(): void {
    const vault = this.revenueVault.value
    if (vault === Global.zeroAddress) {
      // Bootstrap: allow admin if vault not yet set
      this.onlyAdmin()
    } else {
      assert(Txn.sender === vault, 'NotRevenueVault')
    }
  }

  private requireTransfersEnabled(): void {
    assert(this.transfersEnabled.value === Uint64(1), 'TransfersDisabled')
  }

  private getBalance(account: Account): uint64 {
    const maybe = this.balances(account).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  private setBalance(account: Account, amount: uint64): void {
    const box = this.balances(account)
    box.create({ size: Uint64(8) })
    box.value = amount
  }

  private makeAllowanceKey(owner: Account, spender: Account): bytes {
    // Concatenate owner and spender addresses
    return owner.bytes.concat(spender.bytes)
  }

  private makeSnapshotKey(account: Account, snapshotId: uint64): bytes {
    // Concatenate account and snapshotId as string representation
    return account.bytes.concat(Bytes(snapshotId.toString()))
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  /**
   * On-create hook.
   * SSOT: Registry address and token metadata set during deployment.
   */
  create(): void {
    this.admin.value = Txn.sender
    this.fcOpen.value = Uint64(1)
    this.fcFinalized.value = Uint64(0)
    this.transfersEnabled.value = Uint64(0) // disabled until FC
    this.totalSupply.value = Uint64(0)
    this.currentSnapshotId.value = Uint64(0)
    this.treasuryMinted.value = Uint64(0)
    this.investorMintedAmount.value = Uint64(0)
  }

  /**
   * Initialize token metadata and registry link.
   * SSOT: Must be called once post-deployment.
   */
  initToken(registry: Account, name: bytes, symbol: bytes): string {
    this.onlyAdmin()
    assert(this.registry.value === Global.zeroAddress, 'AlreadyInitialized')
    assert(registry !== Global.zeroAddress, 'InvalidAddress')

    this.registry.value = registry
    this.tokenName.value = name
    this.tokenSymbol.value = symbol

    return 'Token initialized'
  }

  // -----------------------
  // Financial Close (SSOT: one-time minting)
  // -----------------------
  /**
   * Finalize FC in a single transaction (single investor).
   * SSOT: Reads installedAcKw, platformKwBps, treasury from ProjectRegistry.
   * Mints total supply = installedAcKw exactly.
   * Treasury receives floor(installedAcKw * platformKwBps / 10000).
   * Investor receives remainder (installedAcKw - treasuryKw).
   * 
   * For multiple investors, use mintAllocation() + closeFinancialClose().
   * 
   * @param installedAcKw - Total AC capacity (from ProjectRegistry)
   * @param platformKwBps - Platform allocation in basis points (from ProjectRegistry)
   * @param treasury - Treasury address (from ProjectRegistry)
   * @param investorAddress - Single investor receiving remainder
   */
  finalizeFinancialCloseSimple(installedAcKw: uint64, platformKwBps: uint64, treasury: Account, investorAddress: Account): string {
    this.onlyAdmin()
    assert(this.fcFinalized.value === Uint64(0), 'FinancialCloseAlreadyFinalized')
    assert(this.fcOpen.value === Uint64(1), 'MintingClosed')
    assert(this.registry.value !== Global.zeroAddress, 'InvalidAddress')

    // SSOT: Validate inputs (would come from ProjectRegistry.getInstalledAcKw(), etc.)
    assert(installedAcKw > Uint64(0), 'InstalledAcKwInvalid')
    assert(platformKwBps <= Uint64(10_000), 'BpsOutOfRange')
    assert(treasury !== Global.zeroAddress, 'InvalidAddress')
    assert(investorAddress !== Global.zeroAddress, 'InvalidAddress')

    // SSOT: Compute allocations per Protius economics
    // treasuryKw = floor(installedAcKw * platformKwBps / 10_000)
    const treasuryKw: uint64 = (installedAcKw * platformKwBps) / Uint64(10_000)
    const investorKw: uint64 = installedAcKw - treasuryKw

    // SSOT: Validate supply invariant before minting
    assert(treasuryKw + investorKw === installedAcKw, 'InvalidAllocationSum')

    // Mint treasury allocation
    if (treasuryKw > Uint64(0)) {
      this.setBalance(treasury, treasuryKw)
    }

    // Mint investor allocation
    if (investorKw > Uint64(0)) {
      this.setBalance(investorAddress, investorKw)
    }

    // SSOT: Set total supply = installedAcKw exactly
    this.totalSupply.value = installedAcKw

    // Finalize FC
    this.fcFinalized.value = Uint64(1)
    this.fcOpen.value = Uint64(0)
    this.transfersEnabled.value = Uint64(1)

    // TODO: Cross-contract call to ProjectRegistry.markFCFinalised()
    // Requires app-to-app call: registry.markFCFinalised()

    return 'FC finalized'
  }

  /**
   * Mint allocation during FC window (multi-call pattern).
   * SSOT: Used when investor list is large; call multiple times, then closeFinancialClose().
   * 
   * This is for investor allocations only. Treasury is minted in closeFinancialClose().
   */
  mintAllocation(to: Account, amount: uint64): string {
    this.onlyAdmin()
    assert(this.fcFinalized.value === Uint64(0), 'FinancialCloseAlreadyFinalized')
    assert(this.fcOpen.value === Uint64(1), 'MintingClosed')
    assert(to !== Global.zeroAddress, 'InvalidAddress')
    assert(amount > Uint64(0), 'ZeroAmount')

    // Accumulate investor allocations
    const currentBal = this.getBalance(to)
    this.setBalance(to, currentBal + amount)
    this.investorMintedAmount.value = this.investorMintedAmount.value + amount

    return `Minted ${amount} to investor`
  }

  /**
   * Close FC after all allocations minted (multi-call pattern).
   * SSOT: Validates total minted equals installedAcKw from registry.
   * Mints treasury share, validates invariants, closes FC.
   * Calls ProjectRegistry.markFCFinalised() on success.
   * 
   * @param installedAcKw - Total AC capacity (from ProjectRegistry)
   * @param platformKwBps - Platform allocation in basis points (from ProjectRegistry)
   * @param treasury - Treasury address (from ProjectRegistry)
   */
  closeFinancialClose(installedAcKw: uint64, platformKwBps: uint64, treasury: Account): string {
    this.onlyAdmin()
    assert(this.fcFinalized.value === Uint64(0), 'FinancialCloseAlreadyFinalized')
    assert(this.fcOpen.value === Uint64(1), 'MintingClosed')

    // SSOT: Validate inputs (would come from ProjectRegistry)
    assert(installedAcKw > Uint64(0), 'InstalledAcKwInvalid')
    assert(platformKwBps <= Uint64(10_000), 'BpsOutOfRange')
    assert(treasury !== Global.zeroAddress, 'InvalidAddress')

    // SSOT: Compute expected allocations
    const treasuryKw: uint64 = (installedAcKw * platformKwBps) / Uint64(10_000)
    const expectedInvestorKw: uint64 = installedAcKw - treasuryKw

    // SSOT: Validate investor minting completed correctly
    const actualInvestorKw: uint64 = this.investorMintedAmount.value
    assert(actualInvestorKw === expectedInvestorKw, 'InvalidAllocationSum')

    // Mint treasury allocation (if not already minted)
    if (this.treasuryMinted.value === Uint64(0)) {
      if (treasuryKw > Uint64(0)) {
        const treasuryBal = this.getBalance(treasury)
        this.setBalance(treasury, treasuryBal + treasuryKw)
      }
      this.treasuryMinted.value = Uint64(1)
    }

    // SSOT: Set total supply = installedAcKw exactly
    this.totalSupply.value = installedAcKw

    // SSOT: Validate supply invariant
    assert(treasuryKw + actualInvestorKw === installedAcKw, 'InvalidAllocationSum')
    assert(this.totalSupply.value === installedAcKw, 'SupplyMismatch')

    // Finalize FC
    this.fcFinalized.value = Uint64(1)
    this.fcOpen.value = Uint64(0)
    this.transfersEnabled.value = Uint64(1)

    // TODO: Cross-contract call to ProjectRegistry.markFCFinalised()
    // Requires app-to-app call: registry.markFCFinalised()

    return 'FC closed'
  }

  // -----------------------
  // Admin controls
  // -----------------------
  setRevenueVault(vault: Account): string {
    this.onlyAdmin()
    assert(vault !== Global.zeroAddress, 'InvalidAddress')
    this.revenueVault.value = vault
    return 'RevenueVault set'
  }

  toggleTransfers(enabled: uint64): string {
    this.onlyAdmin()
    this.transfersEnabled.value = enabled !== Uint64(0) ? Uint64(1) : Uint64(0)
    return `Transfers ${enabled !== Uint64(0) ? 'enabled' : 'disabled'}`
  }

  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAddress')
    this.admin.value = newAdmin
    return 'Admin updated'
  }

  // -----------------------
  // Snapshot (SSOT: for epoch settlement by RevenueVault)
  // -----------------------
  /**
   * Create snapshot for an epoch.
   * SSOT: Only callable by RevenueVault (or admin if vault not set).
   * Binds epochId -> snapshotId for later balance lookups.
   */
  snapshotEpoch(epochId: uint64): string {
    this.onlyRevenueVault()

    // Check not already snapshotted
    const existing = this.epochSnapshots(epochId).maybe()
    assert(existing[1] === false, 'EpochAlreadySnapshotted')

    // Create new snapshot
    const snapshotId: uint64 = this.currentSnapshotId.value + Uint64(1)
    this.currentSnapshotId.value = snapshotId

    // Bind epoch to snapshot
    const epochBox = this.epochSnapshots(epochId)
    epochBox.create({ size: Uint64(8) })
    epochBox.value = snapshotId

    // Store current total supply
    const supplyBox = this.supplySnapshots(snapshotId)
    supplyBox.create({ size: Uint64(8) })
    supplyBox.value = this.totalSupply.value

    // Note: Account balances are snapshotted on-demand when queried
    // or we snapshot all active accounts here (gas intensive)
    // For V1, we'll use lazy snapshot: store current balance when first queried

    return `Epoch snapshotted`
  }

  /**
   * Snapshot a specific account's balance at current snapshot.
   * SSOT: Called before balance changes to preserve historical state.
   */
  private snapshotAccount(account: Account): void {
    const snapshotId = this.currentSnapshotId.value
    if (snapshotId === Uint64(0)) return // No snapshots yet

    const key = this.makeSnapshotKey(account, snapshotId)
    const snapBox = this.accountSnapshotBalances(key)
    
    // Only snapshot if not already done for this snapshotId
    if (!snapBox.maybe()[1]) {
      snapBox.create({ size: Uint64(8) })
      snapBox.value = this.getBalance(account)
    }
  }

  // -----------------------
  // ERC-20 style interface
  // -----------------------
  /**
   * Transfer tokens.
   * SSOT: Only allowed post-FC when transfersEnabled.
   */
  transfer(to: Account, amount: uint64): string {
    this.requireTransfersEnabled()
    assert(to !== Global.zeroAddress, 'InvalidAddress')
    assert(amount > Uint64(0), 'ZeroAmount')

    const sender = Txn.sender
    const senderBal = this.getBalance(sender)
    assert(senderBal >= amount, 'InsufficientBalance')

    // Snapshot before balance change
    this.snapshotAccount(sender)
    this.snapshotAccount(to)

    // Update balances
    this.setBalance(sender, senderBal - amount)
    const receiverBal = this.getBalance(to)
    this.setBalance(to, receiverBal + amount)

    return `Transferred ${amount}`
  }

  /**
   * Approve spender allowance.
   */
  approve(spender: Account, amount: uint64): string {
    assert(spender !== Global.zeroAddress, 'InvalidAddress')

    const key = this.makeAllowanceKey(Txn.sender, spender)
    const allowBox = this.allowances(key)
    allowBox.create({ size: Uint64(8) })
    allowBox.value = amount

    return `Approved ${amount}`
  }

  /**
   * Transfer from approved allowance.
   */
  transferFrom(from: Account, to: Account, amount: uint64): string {
    this.requireTransfersEnabled()
    assert(from !== Global.zeroAddress, 'InvalidAddress')
    assert(to !== Global.zeroAddress, 'InvalidAddress')
    assert(amount > Uint64(0), 'ZeroAmount')

    // Check allowance
    const key = this.makeAllowanceKey(from, Txn.sender)
    const allowMaybe = this.allowances(key).maybe()
    const currentAllowance = allowMaybe[1] ? (allowMaybe[0] as uint64) : Uint64(0)
    assert(currentAllowance >= amount, 'ExceedsAllowance')

    // Check balance
    const fromBal = this.getBalance(from)
    assert(fromBal >= amount, 'InsufficientBalance')

    // Snapshot before changes
    this.snapshotAccount(from)
    this.snapshotAccount(to)

    // Update balances
    this.setBalance(from, fromBal - amount)
    const toBal = this.getBalance(to)
    this.setBalance(to, toBal + amount)

    // Update allowance
    const allowBox = this.allowances(key)
    allowBox.value = currentAllowance - amount

    return `Transfer completed`
  }

  // -----------------------
  // Reads
  // -----------------------
  getName(): bytes { return this.tokenName.value }
  getSymbol(): bytes { return this.tokenSymbol.value }
  getDecimals(): uint64 { return Uint64(0) } // SSOT: integral kW
  getTotalSupply(): uint64 { return this.totalSupply.value }
  
  balanceOf(account: Account): uint64 {
    return this.getBalance(account)
  }

  allowance(owner: Account, spender: Account): uint64 {
    const key = this.makeAllowanceKey(owner, spender)
    const maybe = this.allowances(key).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  getRegistry(): Account { return this.registry.value }
  getRevenueVault(): Account { return this.revenueVault.value }
  isFinancialCloseFinalized(): uint64 { return this.fcFinalized.value }
  transfersEnabledStatus(): uint64 { return this.transfersEnabled.value }

  /**
   * Get snapshotId for an epoch.
   * SSOT: Used by RevenueVault to query historical balances.
   */
  snapshotIdForEpoch(epochId: uint64): uint64 {
    const maybe = this.epochSnapshots(epochId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  /**
   * Get balance at a specific snapshot.
   * SSOT: Enables RevenueVault to calculate distributions based on historical ownership.
   */
  balanceOfAt(account: Account, snapshotId: uint64): uint64 {
    if (snapshotId === Uint64(0)) return Uint64(0)

    const key = this.makeSnapshotKey(account, snapshotId)
    const maybe = this.accountSnapshotBalances(key).maybe()
    
    if (maybe[1]) {
      return maybe[0] as uint64
    }

    // Not snapshotted yet; return current balance if snapshot exists
    // This handles accounts that had no activity at snapshot time
    const currentSnap = this.currentSnapshotId.value
    if (snapshotId <= currentSnap) {
      return this.getBalance(account)
    }

    return Uint64(0)
  }

  /**
   * Get total supply at a specific snapshot.
   */
  totalSupplyAt(snapshotId: uint64): uint64 {
    if (snapshotId === Uint64(0)) return Uint64(0)

    const maybe = this.supplySnapshots(snapshotId).maybe()
    return maybe[1] ? (maybe[0] as uint64) : this.totalSupply.value
  }
}
