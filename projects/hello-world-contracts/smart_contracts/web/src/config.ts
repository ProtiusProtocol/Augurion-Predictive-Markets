/**
 * Protius Web UI Configuration
 * 
 * Loads Algorand network config from Vite environment variables.
 * Falls back to LocalNet defaults for local development.
 * 
 * Environment Variables:
 * - VITE_ALGOD_SERVER (default: http://127.0.0.1)
 * - VITE_ALGOD_PORT (default: 4001)
 * - VITE_ALGOD_TOKEN (default: 'a'.repeat(64) for LocalNet)
 * - VITE_PROJECT_REGISTRY_APP_ID (default: 1002)
 * - VITE_KW_TOKEN_APP_ID (default: 1003)
 * - VITE_KWH_RECEIPT_APP_ID (default: 1004)
 * - VITE_REVENUE_VAULT_APP_ID (default: 1005)
 */

interface AlgoConfig {
  algodServer: string
  algodPort: number
  algodToken: string
  projectRegistryAppId: number
  kwTokenAppId: number
  kwhReceiptAppId?: number
  revenueVaultAppId?: number
  registryAppId?: number // alias for projectRegistryAppId
}

/**
 * Get configuration from Vite environment variables with LocalNet fallbacks.
 * 
 * For production (Vercel/TestNet), set:
 * - VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
 * - VITE_ALGOD_PORT=443 (or empty string)
 * - VITE_ALGOD_TOKEN="" (empty for public endpoints)
 * - VITE_KW_TOKEN_APP_ID=<actual_testnet_id>
 * - VITE_PROJECT_REGISTRY_APP_ID=<actual_testnet_id>
 */
export function getConfig(): AlgoConfig {
  // LocalNet defaults
  const defaults: AlgoConfig = {
    algodServer: 'http://127.0.0.1',
    algodPort: 4001,
    algodToken: 'a'.repeat(64),
    projectRegistryAppId: 1002,
    kwTokenAppId: 1003,
    kwhReceiptAppId: 1004,
    revenueVaultAppId: 1005,
  }

  // Read from Vite environment variables
  const envServer = import.meta.env.VITE_ALGOD_SERVER
  const envPort = import.meta.env.VITE_ALGOD_PORT
  const envToken = import.meta.env.VITE_ALGOD_TOKEN
  const envRegistryId = import.meta.env.VITE_PROJECT_REGISTRY_APP_ID
  const envKwTokenId = import.meta.env.VITE_KW_TOKEN_APP_ID
  const envKwhReceiptId = import.meta.env.VITE_KWH_RECEIPT_APP_ID
  const envRevenueVaultId = import.meta.env.VITE_REVENUE_VAULT_APP_ID

  // Build config with env overrides
  const config: AlgoConfig = {
    algodServer: envServer ?? defaults.algodServer,
    algodPort: envPort ? Number(envPort) : defaults.algodPort,
    algodToken: envToken !== undefined ? envToken : defaults.algodToken,
    projectRegistryAppId: envRegistryId ? Number(envRegistryId) : defaults.projectRegistryAppId,
    kwTokenAppId: envKwTokenId ? Number(envKwTokenId) : defaults.kwTokenAppId,
    kwhReceiptAppId: envKwhReceiptId ? Number(envKwhReceiptId) : defaults.kwhReceiptAppId,
    revenueVaultAppId: envRevenueVaultId ? Number(envRevenueVaultId) : defaults.revenueVaultAppId,
  }

  // Add alias for backwards compatibility
  config.registryAppId = config.projectRegistryAppId

  return config
}

/**
 * Singleton instance for convenience
 */
export const CONFIG = getConfig()

/**
 * Swap active project's contract IDs at runtime.
 * Called from the project selector in main.tsx.
 * Screens remount via key prop so they pick up the new IDs.
 */
export function setActiveProjectIds(ids: {
  registryAppId: number
  kwTokenAppId: number
  revenueVaultAppId: number
  kwhReceiptAppId: number
}) {
  CONFIG.projectRegistryAppId = ids.registryAppId
  CONFIG.registryAppId = ids.registryAppId
  CONFIG.kwTokenAppId = ids.kwTokenAppId
  CONFIG.revenueVaultAppId = ids.revenueVaultAppId
  CONFIG.kwhReceiptAppId = ids.kwhReceiptAppId
}

/**
 * Validate configuration (checks for required values)
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!CONFIG.algodServer) errors.push('VITE_ALGOD_SERVER is required')
  if (CONFIG.algodPort <= 0) errors.push('VITE_ALGOD_PORT must be > 0')
  if (CONFIG.projectRegistryAppId <= 0) errors.push('VITE_PROJECT_REGISTRY_APP_ID must be > 0')
  if (CONFIG.kwTokenAppId <= 0) errors.push('VITE_KW_TOKEN_APP_ID must be > 0')

  return {
    valid: errors.length === 0,
    errors,
  }
}
