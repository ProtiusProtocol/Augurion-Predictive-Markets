/**
 * Protius V1 Core Project Configuration
 * 
 * Stores deployment-specific values for the 4 core contracts:
 * - ProjectRegistry
 * - kWToken
 * - kWhReceipt
 * - RevenueVault
 * 
 * Update after each deployment.
 */

export interface ProtiusProjectConfig {
  /** ProjectRegistry app ID */
  registryAppId: bigint

  /** kWToken app ID */
  kwTokenAppId: bigint

  /** kWhReceipt app ID */
  kwhReceiptAppId: bigint

  /** RevenueVault app ID */
  revenueVaultAppId: bigint

  /** kW ASA ID (issued by kWToken contract) */
  kwAssetId: bigint

  /** kWh ASA ID (issued by kWhReceipt contract) */
  kwhAssetId: bigint

  /** Project admin address (operator authority) */
  adminAddress: string

  /** Treasury address (receives protocol fees + remainder) */
  treasuryAddress: string

  /** Revenue asset ID (USDC, ALGO, etc.) */
  revenueAssetId: bigint // 0 for ALGO

  /** Project identifier (for outputs and logging) */
  projectId: string
}

/**
 * Default configuration for localnet testing
 */
export const LOCALNET_CONFIG: ProtiusProjectConfig = {
  registryAppId: 1002n,
  kwTokenAppId: 1003n,
  kwhReceiptAppId: 1004n,
  revenueVaultAppId: 1005n,
  kwAssetId: 0n,
  kwhAssetId: 0n,
  adminAddress: 'ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA', // Deployer/operator
  treasuryAddress: 'ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA', // Using admin as treasury for testing
  revenueAssetId: 0n, // ALGO for localnet
  projectId: 'protius-localnet',
}

/**
 * Testnet configuration (example)
 */
export const TESTNET_CONFIG: ProtiusProjectConfig = {
  registryAppId: 0n, // Update after testnet deployment
  kwTokenAppId: 0n,
  kwhReceiptAppId: 0n,
  revenueVaultAppId: 0n,
  kwAssetId: 0n,
  kwhAssetId: 0n,
  adminAddress: '', // Testnet admin
  treasuryAddress: '', // Testnet treasury
  revenueAssetId: 0n, // Use Testnet USDC ASA
  projectId: 'protius-testnet',
}

/**
 * Mainnet configuration (example)
 */
export const MAINNET_CONFIG: ProtiusProjectConfig = {
  registryAppId: 0n, // Update after mainnet deployment
  kwTokenAppId: 0n,
  kwhReceiptAppId: 0n,
  revenueVaultAppId: 0n,
  kwAssetId: 0n,
  kwhAssetId: 0n,
  adminAddress: '', // Mainnet admin
  treasuryAddress: '', // Mainnet treasury
  revenueAssetId: 31566704n, // Example: USDC on mainnet
  projectId: 'protius-mainnet',
}
