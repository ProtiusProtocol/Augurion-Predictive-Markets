import {
  Contract,
  GlobalState,
  Uint64,
  BoxMap,
  Bytes,
  Txn,
  Global,
  assert,
  log,
} from '@algorandfoundation/algorand-typescript'
import type { uint64, Account, bytes } from '@algorandfoundation/algorand-typescript'

/**
 * Project lifecycle states (using literal numbers for Algorand TypeScript compatibility):
 * 0 = DRAFT
 * 1 = REGISTERED  
 * 2 = FUNDED
 * 3 = UNDER_CONSTRUCTION
 * 4 = COMMISSIONING
 * 5 = OPERATING
 * 6 = SUSPENDED
 * 7 = EXITED
 */

/**
 * Protius V1 Core: ProjectRegistry (per-project SSOT)
 * - Configuration + permissions only
 * - No funds, no token minting, no settlement math
 */
export class ProjectRegistry extends Contract {
  // -----------------------
  // Global state (SSOT)
  // -----------------------
  // Identity / immutables
  projectId = GlobalState<bytes>({ initialValue: Bytes('') })
  installedAcKw = GlobalState<uint64>({ initialValue: Uint64(0) })
  platformKwBps = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Updatable config (future-effective)
  treasury = GlobalState<Account>({ initialValue: Txn.sender })
  platformKwhRateBps = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Flags (monotonic)
  fcFinalised = GlobalState<uint64>({ initialValue: Uint64(0) }) // 0=false, 1=true
  cod = GlobalState<uint64>({ initialValue: Uint64(0) })        // 0=false, 1=true
  fcFinalisedAt = GlobalState<uint64>({ initialValue: Uint64(0) })
  codMarkedAt = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Administration
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  operator = GlobalState<Account>({ initialValue: Txn.sender }) // Subservient to admin

  // Project State Machine (DRAFT=0, REGISTERED=1, FUNDED=2, UNDER_CONSTRUCTION=3, COMMISSIONING=4, OPERATING=5, SUSPENDED=6, EXITED=7)
  projectState = GlobalState<uint64>({ initialValue: Uint64(0) }) // Starts in DRAFT
  stateEnteredAt = GlobalState<uint64>({ initialValue: Uint64(0) })
  lastStateTransition = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Authorisations
  oracle = BoxMap<Account, uint64>({ keyPrefix: Bytes('oracle:') }) // 1 = enabled

  // Per-project contract references (set once)
  kwToken = GlobalState<Account>({ initialValue: Global.currentApplicationAddress })
  kwhReceipt = GlobalState<Account>({ initialValue: Global.currentApplicationAddress })
  revenueVault = GlobalState<Account>({ initialValue: Global.currentApplicationAddress })
  contractsSet = GlobalState<uint64>({ initialValue: Uint64(0) }) // 0=false, 1=true

  // One-time initialization guard
  initialized = GlobalState<uint64>({ initialValue: Uint64(0) })

  // -----------------------
  // Helpers
  // -----------------------
  private onlyAdmin(): void {
    assert(Txn.sender === this.admin.value, 'NotAdmin')
  }

  private onlyAdminOrOperator(): void {
    assert(
      Txn.sender === this.admin.value || Txn.sender === this.operator.value,
      'NotAdminOrOperator'
    )
  }

  private onlyKWToken(): void {
    assert(Txn.sender === this.kwToken.value, 'NotKWToken')
  }

  private bpsInRange(bps: uint64): void {
    assert(bps <= Uint64(10_000), 'BpsOutOfRange')
  }

  // -----------------------
  // Lifecycle
  // -----------------------
  /**
   * On-create hook; sets defaults.
   */
  create(): void {
    // Defaults already set via initialValue; ensure admin defaults to sender
    this.admin.value = Txn.sender
    this.operator.value = Txn.sender // Initially same as admin
    this.treasury.value = Txn.sender

    this.fcFinalised.value = Uint64(0)
    this.cod.value = Uint64(0)
    this.fcFinalisedAt.value = Uint64(0)
    this.codMarkedAt.value = Uint64(0)

    this.contractsSet.value = Uint64(0)
    this.initialized.value = Uint64(0)

    // State machine initialization (DRAFT = 0)
    this.projectState.value = Uint64(0)
    this.stateEnteredAt.value = Global.round
    this.lastStateTransition.value = Global.round
  }

  /**
   * One-time initializer to set deployment-time inputs.
   * Inputs:
   *  - projectId: bytes32 (bytes)
   *  - installedAcKw: uint64 (>0)
   *  - treasury: Account (non-zero)
   *  - platformKwBps: uint64 (0..10000)
   *  - platformKwhRateBps: uint64 (0..10000)
   *  - admin: Account (non-zero)
   */
  init_registry(projectId: bytes, installedAcKw: uint64, treasury: Account, platformKwBps: uint64, platformKwhRateBps: uint64, admin: Account): string {
    // Only current admin can initialize; only once
    this.onlyAdmin()
    assert(this.initialized.value === Uint64(0), 'ContractsAlreadySet') // reuse as one-time guard

    assert(installedAcKw > Uint64(0), 'InstalledAcKwInvalid')
    this.bpsInRange(platformKwBps)
    this.bpsInRange(platformKwhRateBps)

    // Basic address validation
    assert(treasury !== Global.zeroAddress, 'InvalidAddress')
    assert(admin !== Global.zeroAddress, 'InvalidAddress')

    // Set immutables and config
    this.projectId.value = projectId
    this.installedAcKw.value = installedAcKw
    this.platformKwBps.value = platformKwBps

    // Updatables
    this.treasury.value = treasury
    this.platformKwhRateBps.value = platformKwhRateBps

    // Admin
    this.admin.value = admin

    // Lock initialization
    this.initialized.value = Uint64(1)

    return 'Registry initialized'
  }

  // -----------------------
  // Admin methods
  // -----------------------
  setContracts(kwToken: Account, kwhReceipt: Account, revenueVault: Account): string {
    this.onlyAdmin()
    assert(this.contractsSet.value === Uint64(0), 'ContractsAlreadySet')

    assert(kwToken !== Global.zeroAddress, 'InvalidAddress')
    assert(kwhReceipt !== Global.zeroAddress, 'InvalidAddress')
    assert(revenueVault !== Global.zeroAddress, 'InvalidAddress')

    this.kwToken.value = kwToken
    this.kwhReceipt.value = kwhReceipt
    this.revenueVault.value = revenueVault

    this.contractsSet.value = Uint64(1)
    return 'Contracts set'
  }

  /**
   * State Machine: Manual State Transitions
   * Enforces allowed transitions and role-based permissions
   */
  transitionState(newState: uint64): string {
    this.onlyAdminOrOperator()

    const currentState = this.projectState.value
    assert(currentState !== newState, 'AlreadyInTargetState')

    // Validate allowed transitions
    let isValidTransition = false
    let transitionName = ''

    // DRAFT → REGISTERED (0 → 1)
    if (currentState === Uint64(0) && newState === Uint64(1)) {
      assert(this.initialized.value === Uint64(1), 'RegistryNotInitialized')
      assert(this.contractsSet.value === Uint64(1), 'ContractsNotSet')
      isValidTransition = true
      transitionName = 'DRAFT->REGISTERED'
    }
    // REGISTERED → FUNDED (1 → 2)
    else if (currentState === Uint64(1) && newState === Uint64(2)) {
      assert(this.fcFinalised.value === Uint64(1), 'FCNotFinalized')
      isValidTransition = true
      transitionName = 'REGISTERED->FUNDED'
    }
    // FUNDED → UNDER_CONSTRUCTION (2 → 3)
    else if (currentState === Uint64(2) && newState === Uint64(3)) {
      isValidTransition = true
      transitionName = 'FUNDED->UNDER_CONSTRUCTION'
    }
    // UNDER_CONSTRUCTION → COMMISSIONING (3 → 4)
    else if (currentState === Uint64(3) && newState === Uint64(4)) {
      isValidTransition = true
      transitionName = 'UNDER_CONSTRUCTION->COMMISSIONING'
    }
    // COMMISSIONING → OPERATING (4 → 5)
    else if (currentState === Uint64(4) && newState === Uint64(5)) {
      assert(this.cod.value === Uint64(1), 'CODNotMarked')
      isValidTransition = true
      transitionName = 'COMMISSIONING->OPERATING'
    }
    // OPERATING → SUSPENDED (5 → 6)
    else if (currentState === Uint64(5) && newState === Uint64(6)) {
      isValidTransition = true
      transitionName = 'OPERATING->SUSPENDED'
    }
    // SUSPENDED → OPERATING (6 → 5)
    else if (currentState === Uint64(6) && newState === Uint64(5)) {
      assert(this.cod.value === Uint64(1), 'CODRequired')
      isValidTransition = true
      transitionName = 'SUSPENDED->OPERATING'
    }
    // OPERATING → EXITED (5 → 7)
    else if (currentState === Uint64(5) && newState === Uint64(7)) {
      this.onlyAdmin() // Only admin can exit
      isValidTransition = true
      transitionName = 'OPERATING->EXITED'
    }
    // SUSPENDED → EXITED (6 → 7)
    else if (currentState === Uint64(6) && newState === Uint64(7)) {
      this.onlyAdmin() // Only admin can exit
      isValidTransition = true
      transitionName = 'SUSPENDED->EXITED'
    }

    assert(isValidTransition, 'InvalidStateTransition')

    // Execute transition
    const oldState = this.projectState.value
    this.projectState.value = newState
    this.stateEnteredAt.value = Global.round
    this.lastStateTransition.value = Global.round

    // Log state transition event
    log(Bytes('StateTransition:'), oldState, Bytes('->'), newState, Bytes('by'), Txn.sender)

    return transitionName
  }

  setOracle(oracle: Account, enabled: uint64): string {
    this.onlyAdmin()
    assert(oracle !== Global.zeroAddress, 'InvalidAddress')

    const box = this.oracle(oracle)
    box.create({ size: Uint64(8) })
    box.value = enabled !== Uint64(0) ? Uint64(1) : Uint64(0)

    return 'Oracle updated'
  }

  markCOD(): string {
    this.onlyAdmin()
    assert(this.cod.value === Uint64(0), 'CODAlreadyMarked')
    assert(
      this.projectState.value === Uint64(4),
      'MustBeInCommissioningState'
    )

    this.cod.value = Uint64(1)
    this.codMarkedAt.value = Global.round
    // Note: Operator must manually call transitionState(OPERATING) after this
    return 'COD marked'
  }

  markFCFinalised(): string {
    assert(this.contractsSet.value === Uint64(1), 'InvalidAddress')
    this.onlyKWToken()
    assert(this.fcFinalised.value === Uint64(0), 'FCAlreadyFinalised')
    assert(
      this.projectState.value === Uint64(1),
      'MustBeInRegisteredState'
    )

    this.fcFinalised.value = Uint64(1)
    this.fcFinalisedAt.value = Global.round
    // Note: Operator must manually call transitionState(FUNDED) after this
    return 'FC finalised'
  }

  setPlatformKwhRateBps(newAlphaBps: uint64): string {
    this.onlyAdmin()
    this.bpsInRange(newAlphaBps)

    const oldVal = this.platformKwhRateBps.value
    this.platformKwhRateBps.value = newAlphaBps

    // Future-effective: RevenueVault should read/caches at settlement
    return `PlatformKwhRateUpdated ${oldVal} -> ${newAlphaBps}`
  }

  setTreasury(newTreasury: Account): string {
    this.onlyAdmin()
    assert(newTreasury !== Global.zeroAddress, 'InvalidAddress')
    assert(newTreasury !== this.treasury.value, 'TreasurySameAsCurrent')

    this.treasury.value = newTreasury
    return 'Treasury updated'
  }

  updateAdmin(newAdmin: Account): string {
    this.onlyAdmin()
    assert(newAdmin !== Global.zeroAddress, 'InvalidAddress')

    this.admin.value = newAdmin
    return 'Admin updated'
  }

  updateOperator(newOperator: Account): string {
    this.onlyAdmin()
    assert(newOperator !== Global.zeroAddress, 'InvalidAddress')

    this.operator.value = newOperator
    return 'Operator updated'
  }

  // -----------------------
  // Reads
  // -----------------------
  getProjectId(): bytes { return this.projectId.value }
  getInstalledAcKw(): uint64 { return this.installedAcKw.value }
  getTreasury(): Account { return this.treasury.value }
  getPlatformKwBps(): uint64 { return this.platformKwBps.value }
  getPlatformKwhRateBps(): uint64 { return this.platformKwhRateBps.value }
  isCOD(): uint64 { return this.cod.value }
  isFCFinalised(): uint64 { return this.fcFinalised.value }

  isOracle(authority: Account): uint64 {
    const maybe = this.oracle(authority).maybe()
    return maybe[1] ? (maybe[0] as uint64) : Uint64(0)
  }

  getKWToken(): Account { return this.kwToken.value }
  getKWhReceipt(): Account { return this.kwhReceipt.value }
  getRevenueVault(): Account { return this.revenueVault.value }

  // -----------------------
  // State Machine Queries
  // -----------------------
  getProjectState(): uint64 { return this.projectState.value }
  getStateEnteredAt(): uint64 { return this.stateEnteredAt.value }
  getLastStateTransition(): uint64 { return this.lastStateTransition.value }
  getOperator(): Account { return this.operator.value }

  /**
   * Check if project is in OPERATING or SUSPENDED state
   * (for functions that should work during normal operations)
   */
  isOperational(): uint64 {
    const state = this.projectState.value
    return (state === Uint64(5) || state === Uint64(6))
      ? Uint64(1)
      : Uint64(0)
  }
}
