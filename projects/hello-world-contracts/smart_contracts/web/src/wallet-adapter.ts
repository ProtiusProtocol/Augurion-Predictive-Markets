/**
 * Minimal Wallet Adapter for Protius Phase 4.1
 * 
 * Responsibilities:
 * - Connect/disconnect wallet
 * - Provide connected address
 * - Sign transactions
 * 
 * Constraints:
 * - No claim semantics logic
 * - No UI components
 * - Thin wrapper around Pera Wallet SDK
 */

import algosdk from 'algosdk'
import { PeraWalletConnect } from '@perawallet/connect'

export interface WalletAdapter {
  connect(): Promise<string[]>
  disconnect(): Promise<void>
  signTransaction(txnGroup: Uint8Array[]): Promise<Uint8Array[]>
  isConnected(): boolean
  getAccounts(): string[]
}

class PeraWalletAdapter implements WalletAdapter {
  private peraWallet: PeraWalletConnect
  private accounts: string[] = []

  constructor() {
    this.peraWallet = new PeraWalletConnect()
  }

  async connect(): Promise<string[]> {
    try {
      const accounts = await this.peraWallet.connect()
      this.accounts = accounts
      
      // Listen for disconnect events
      this.peraWallet.connector?.on('disconnect', () => {
        this.accounts = []
      })
      
      return accounts
    } catch (error) {
      console.error('Wallet connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await this.peraWallet.disconnect()
    this.accounts = []
  }

  async signTransaction(txnGroup: Uint8Array[]): Promise<Uint8Array[]> {
    if (!this.isConnected()) {
      throw new Error('Wallet not connected')
    }

    // Pera Wallet expects array of SignerTransaction objects
    // Each has { txn: Transaction, signers?: string[] }
    const txnsToSign = txnGroup.map(txnBytes => {
      // Decode to Transaction object
      const txn = algosdk.decodeUnsignedTransaction(txnBytes)
      return { txn, signers: [this.accounts[0]] }
    })

    const signedTxns = await this.peraWallet.signTransaction([txnsToSign])
    return signedTxns
  }

  isConnected(): boolean {
    return this.accounts.length > 0
  }

  getAccounts(): string[] {
    return this.accounts
  }
}

// Singleton instance
let walletInstance: WalletAdapter | null = null

export function getWalletAdapter(): WalletAdapter {
  if (!walletInstance) {
    walletInstance = new PeraWalletAdapter()
  }
  return walletInstance
}
