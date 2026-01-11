/**
 * Algorand Network Configuration
 * 
 * Defines connection parameters for localnet, testnet, and mainnet.
 */

export type NetworkType = 'localnet' | 'testnet' | 'mainnet'

export interface AlgorandNetworkConfig {
  /** Algod API endpoint */
  algodServer: string

  /** Algod API token */
  algodToken: string

  /** Algod API port (optional) */
  algodPort?: number

  /** Indexer API endpoint (optional) */
  indexerServer?: string

  /** Indexer API token (optional) */
  indexerToken?: string

  /** Indexer API port (optional) */
  indexerPort?: number

  /** Network genesis ID */
  genesisId: string

  /** Network genesis hash */
  genesisHash: string
}

/**
 * Localnet configuration (AlgoKit default)
 */
export const LOCALNET: AlgorandNetworkConfig = {
  algodServer: 'http://localhost',
  algodToken: 'a'.repeat(64), // AlgoKit default token
  algodPort: 4001,
  indexerServer: 'http://localhost',
  indexerToken: 'a'.repeat(64),
  indexerPort: 8980,
  genesisId: 'sandnet-v1',
  genesisHash: '', // Will be set by sandbox
}

/**
 * Testnet configuration
 */
export const TESTNET: AlgorandNetworkConfig = {
  algodServer: 'https://testnet-api.algonode.cloud',
  algodToken: '', // Public node, no token required
  indexerServer: 'https://testnet-idx.algonode.cloud',
  indexerToken: '',
  genesisId: 'testnet-v1.0',
  genesisHash: 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
}

/**
 * Mainnet configuration
 */
export const MAINNET: AlgorandNetworkConfig = {
  algodServer: 'https://mainnet-api.algonode.cloud',
  algodToken: '', // Public node, no token required
  indexerServer: 'https://mainnet-idx.algonode.cloud',
  indexerToken: '',
  genesisId: 'mainnet-v1.0',
  genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
}

/**
 * Get network configuration by type
 */
export function getNetworkConfig(network: NetworkType): AlgorandNetworkConfig {
  switch (network) {
    case 'localnet':
      return LOCALNET
    case 'testnet':
      return TESTNET
    case 'mainnet':
      return MAINNET
    default:
      throw new Error(`Unknown network type: ${network}`)
  }
}
