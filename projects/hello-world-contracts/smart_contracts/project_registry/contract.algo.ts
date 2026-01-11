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
    this.treasury.value = Txn.sender

    this.fcFinalised.value = Uint64(0)
    this.cod.value = Uint64(0)
    this.fcFinalisedAt.value = Uint64(0)
    this.codMarkedAt.value = Uint64(0)

    this.contractsSet.value = Uint64(0)
    this.initialized.value = Uint64(0)
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

    this.cod.value = Uint64(1)
    this.codMarkedAt.value = Global.round
    return 'COD marked'
  }

  markFCFinalised(): string {
    assert(this.contractsSet.value === Uint64(1), 'InvalidAddress')
    this.onlyKWToken()
    assert(this.fcFinalised.value === Uint64(0), 'FCAlreadyFinalised')

    this.fcFinalised.value = Uint64(1)
    this.fcFinalisedAt.value = Global.round
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
}
