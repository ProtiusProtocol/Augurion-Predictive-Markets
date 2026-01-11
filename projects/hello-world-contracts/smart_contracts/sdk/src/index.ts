/**
 * Protius SDK - Main Entrypoint
 * 
 * Exports Operator and Claimant APIs for Protius V1 Core.
 */

// Configuration
export { ProtiusProjectConfig, LOCALNET_CONFIG, TESTNET_CONFIG, MAINNET_CONFIG } from './config/project'
export { AlgorandNetworkConfig, NetworkType, LOCALNET, TESTNET, MAINNET, getNetworkConfig } from './config/networks'

// Types
export { PEO, PEOMaturityStatus, MaturityGate, MATURITY_GATES, validateMaturity } from './types/peo'
export {
  HolderEntitlement,
  EpochEntitlements,
  ComputeEntitlementsParams,
  EntitlementsComputationResult,
  BatchSetEntitlement,
  EntitlementsValidationError,
} from './types/entitlements'

// Lib utilities
export { AlgorandClients, createClients, waitForConfirmation, getSuggestedParams, getAssetBalance } from './lib/algod'
export { assignGroupId, signGroupSingle, signGroupMultiple, submitGroup, buildAndSubmitGroup } from './lib/group'
export { toCanonicalJson, sha256, hashCanonicalJson, computeEntitlementsHash, verifyEntitlementsHash } from './lib/hash'
export { ValidationError, validateAddress, validateEpochId, validateProjectConfig } from './lib/validate'

// Clients
export { VaultClient, createVaultClient } from './clients/vault.client'
export { KWTokenClient, createKWTokenClient } from './clients/kwtoken.client'
export { RegistryClient, createRegistryClient } from './clients/registry.client'
export { KWhReceiptClient, createKWhReceiptClient } from './clients/kwhreceipt.client'

// Builders
export { DepositParams, buildDepositGroup } from './builders/deposit'
export { computeEntitlements, batchEntitlements, saveEntitlementsToFile } from './builders/entitlements'
export { SettleParams, buildSettleTxn } from './builders/settle'
export { ClaimParams, buildClaimTxn, queryClaimable } from './builders/claim'

// Operations
export { ProtiusOperator, FinancialCloseParams, MonthlyEpochParams } from './ops/operator'
export { ProtiusClaimant, ClaimResult } from './ops/claimant'

/**
 * SDK Version
 */
export const SDK_VERSION = '1.0.0'

/**
 * Protius V1 Core contract versions (frozen)
 */
export const CONTRACT_VERSIONS = {
  ProjectRegistry: '1.0.0',
  kWToken: '1.0.0',
  kWhReceipt: '1.0.0',
  RevenueVault: '1.0.0',
}
