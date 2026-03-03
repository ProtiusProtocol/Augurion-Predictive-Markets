/**
 * Equity Holdings Dashboard
 *
 * Displays an investor's KW token balance and allows peer-to-peer transfers
 * after Financial Close is finalised and transfers are enabled by the operator.
 *
 * Architecture constraints:
 * - KWToken uses FINANCIAL CLOSE ALLOCATION — no retail invest() flow
 * - Balance lives in AVM box storage (not ASA account balance)
 * - Transfers are gated by the operator-controlled `transfersEnabled` flag
 * - App ID 756074167 ≠ ASA ID (ASA ID resolved dynamically from global state)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import algosdk from 'algosdk'
import { useWallet } from '@txnlab/use-wallet-react'
import { motion, AnimatePresence } from 'framer-motion'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

import {
  getAlgodClient,
  resolveAsaId,
  getKwBalance,
  getTransfersEnabled,
  getKwTransactionHistory,
  buildKwTransferTxn,
  validateTransferAmount,
  type KwTransferRecord,
} from '@/lib/kwtoken'
import { CONTRACTS, explorerTx, explorerApp, explorerAddr } from '@/lib/projects'

// ── Types ──────────────────────────────────────────────────────────────────

type TransferStatus = 'idle' | 'validating' | 'signing' | 'submitting' | 'success' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Shortens an Algorand address for display: ABCDE…VWXYZ */
function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`
}

/** Formats a unix timestamp as a local date+time string */
function fmtDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Equity() {
  const { activeAddress, signTransactions } = useWallet()

  // ── On-chain state ────────────────────────────────────────────────────
  const [balance, setBalance] = useState<bigint>(0n)
  const [asaId, setAsaId] = useState<number>(0)
  const [transfersEnabled, setTransfersEnabled] = useState<boolean>(false)
  const [history, setHistory] = useState<KwTransferRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Transfer form ──────────────────────────────────────────────────────
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [transferStatus, setTransferStatus] = useState<TransferStatus>('idle')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [lastTxId, setLastTxId] = useState<string | null>(null)

  // ── Polling ref (keeps interval alive across renders) ──────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data loading ───────────────────────────────────────────────────────

  /** Loads balance + transfersEnabled flag in one pass */
  const refreshBalance = useCallback(async () => {
    if (!activeAddress) return
    const [bal, enabled] = await Promise.all([
      getKwBalance(activeAddress),
      getTransfersEnabled(),
    ])
    setBalance(bal)
    setTransfersEnabled(enabled)
  }, [activeAddress])

  /** Loads transaction history (called once on tab switch) */
  const loadHistory = useCallback(async () => {
    if (!activeAddress || !asaId) return
    setHistoryLoading(true)
    try {
      const records = await getKwTransactionHistory(activeAddress, asaId)
      setHistory(records)
    } finally {
      setHistoryLoading(false)
    }
  }, [activeAddress, asaId])

  // Resolve ASA ID once on mount
  useEffect(() => {
    resolveAsaId().then(setAsaId).catch(console.error)
  }, [])

  // Start/stop balance polling when wallet connects/disconnects
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)

    if (!activeAddress) {
      setBalance(0n)
      setTransfersEnabled(false)
      setHistory([])
      return
    }

    // Immediate load + poll every 4 s
    refreshBalance()
    pollRef.current = setInterval(refreshBalance, 4_000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeAddress, refreshBalance])

  // ── Transfer handler ───────────────────────────────────────────────────

  const handleTransfer = async () => {
    if (!activeAddress) return

    // Validate
    const amountError = validateTransferAmount(amount, balance)
    if (amountError) {
      setTransferError(amountError)
      return
    }
    try {
      algosdk.decodeAddress(recipient)
    } catch {
      setTransferError('Invalid Algorand address')
      return
    }

    setTransferStatus('signing')
    setTransferError(null)
    setLastTxId(null)

    try {
      // Build the ABI call transaction
      const txn = await buildKwTransferTxn(activeAddress, recipient, BigInt(amount.trim()))

      // Sign via useWallet — hands off to Pera / whatever wallet is active
      setTransferStatus('signing')
      const signedBytes = await signTransactions([[algosdk.encodeUnsignedTransaction(txn)]])

      // Submit
      setTransferStatus('submitting')
      const client = getAlgodClient()
      const submitResult = await client.sendRawTransaction(signedBytes[0]).do()
      const txId: string = (submitResult as any).txid ?? (submitResult as any).txId

      await algosdk.waitForConfirmation(client, txId, 8)

      setLastTxId(txId)
      setTransferStatus('success')
      setAmount('')
      setRecipient('')

      // Refresh balance immediately
      await refreshBalance()
    } catch (err: any) {
      setTransferError(err?.message ?? 'Transaction failed')
      setTransferStatus('error')
    }
  }

  const resetTransfer = () => {
    setTransferStatus('idle')
    setTransferError(null)
    setLastTxId(null)
    setAmount('')
    setRecipient('')
  }

  // ── Derived UI state ───────────────────────────────────────────────────

  const amountError = amount ? validateTransferAmount(amount, balance) : null

  const canTransfer =
    transfersEnabled &&
    !!activeAddress &&
    recipient.length === 58 &&
    amount !== '' &&
    amountError === null &&
    transferStatus === 'idle'

  const isBusy = transferStatus === 'signing' || transferStatus === 'submitting'

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Equity Holdings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your kW token balance represents proportional equity in the Protius-001 solar project.
          Tokens are allocated during Financial Close — there is no open retail investment flow.
        </p>
      </div>

      {/* Wallet not connected */}
      {!activeAddress && (
        <Alert className="mb-6">
          <AlertDescription>
            Connect your wallet using the button in the top bar to view your equity holdings.
          </AlertDescription>
        </Alert>
      )}

      {/* Balance card */}
      {activeAddress && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium text-muted-foreground">
                  kW Token Balance
                </CardTitle>
                {transfersEnabled ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                    Transfers enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Transfers locked
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold tabular-nums">
                  {balance.toString()}
                </span>
                <span className="text-lg text-muted-foreground mb-1">kW</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Wallet:{' '}
                <a
                  href={explorerAddr(activeAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {shortAddr(activeAddress)}
                </a>
              </div>
              {asaId > 0 && (
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  KWToken contract:{' '}
                  <a
                    href={explorerApp(CONTRACTS.kwToken)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    App {CONTRACTS.kwToken}
                  </a>
                  {' · '}
                  ASA {asaId}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tabs */}
      {activeAddress && (
        <Tabs defaultValue="transfer">
          <TabsList className="mb-4">
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
            <TabsTrigger
              value="history"
              onClick={() => {
                if (history.length === 0) loadHistory()
              }}
            >
              History
            </TabsTrigger>
          </TabsList>

          {/* ── Transfer tab ── */}
          <TabsContent value="transfer">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transfer kW Tokens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!transfersEnabled && (
                  <Alert>
                    <AlertDescription>
                      Peer-to-peer transfers are not yet enabled. The operator activates them after
                      Financial Close is finalised.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Success state */}
                <AnimatePresence>
                  {transferStatus === 'success' && lastTxId && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-md border border-green-200 bg-green-50 p-4 text-sm"
                    >
                      <p className="font-semibold text-green-800 mb-1">Transfer confirmed</p>
                      <p className="text-green-700">
                        Transaction:{' '}
                        <a
                          href={explorerTx(lastTxId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline underline-offset-2"
                        >
                          {lastTxId.slice(0, 10)}…
                        </a>
                      </p>
                      <p className="text-green-700 mt-1">
                        New balance: <strong>{balance.toString()} kW</strong>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={resetTransfer}
                      >
                        Make another transfer
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {transferStatus !== 'success' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Recipient address</label>
                      <Input
                        value={recipient}
                        onChange={e => {
                          setRecipient(e.target.value.trim())
                          setTransferError(null)
                        }}
                        placeholder="ALGO address (58 characters)"
                        className="font-mono text-sm"
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Amount{' '}
                        <span className="text-muted-foreground font-normal">
                          (max {balance.toString()} kW)
                        </span>
                      </label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={amount}
                        onChange={e => {
                          setAmount(e.target.value)
                          setTransferError(null)
                        }}
                        placeholder={`1 – ${balance.toString()}`}
                        disabled={isBusy}
                      />
                      {amountError && (
                        <p className="text-destructive text-xs">{amountError}</p>
                      )}
                    </div>

                    {transferError && transferStatus === 'error' && (
                      <Alert variant="destructive">
                        <AlertDescription>{transferError}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      onClick={handleTransfer}
                      disabled={!canTransfer || isBusy}
                      className="w-full"
                    >
                      {isBusy
                        ? transferStatus === 'signing'
                          ? 'Waiting for wallet…'
                          : 'Submitting…'
                        : `Transfer ${amount || '0'} kW`}
                    </Button>

                    {balance === 0n && (
                      <p className="text-xs text-muted-foreground text-center">
                        You have no kW tokens. Tokens are allocated during the Financial Close
                        period by the project operator.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── History tab ── */}
          <TabsContent value="history">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Transaction History</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadHistory}
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Loading…' : 'Refresh'}
                </Button>
              </CardHeader>
              <CardContent>
                {historyLoading && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Loading history…
                  </p>
                )}

                {!historyLoading && history.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No kW token transactions found for this wallet.
                  </p>
                )}

                {!historyLoading && history.length > 0 && (
                  <div className="divide-y text-sm">
                    {history.map(tx => (
                      <div key={tx.txId} className="py-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge
                              variant={tx.direction === 'received' ? 'secondary' : 'outline'}
                              className={
                                tx.direction === 'received'
                                  ? 'bg-green-100 text-green-800 border-green-200 text-[10px]'
                                  : 'text-[10px]'
                              }
                            >
                              {tx.direction === 'received' ? '+ Received' : '- Sent'}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {fmtDate(tx.timestamp)}
                            </span>
                          </div>
                          <div className="font-mono text-xs truncate text-muted-foreground">
                            {tx.direction === 'sent' ? `To: ${shortAddr(tx.receiver)}` : `From: ${shortAddr(tx.sender)}`}
                          </div>
                          <a
                            href={explorerTx(tx.txId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          >
                            {tx.txId.slice(0, 10)}…
                          </a>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={
                              tx.direction === 'received'
                                ? 'font-semibold text-green-700'
                                : 'font-semibold'
                            }
                          >
                            {tx.direction === 'received' ? '+' : '-'}
                            {tx.amount.toString()} kW
                          </span>
                          <div className="text-xs text-muted-foreground">Round {tx.round}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground">
                  Full history:{' '}
                  <a
                    href={explorerAddr(activeAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    View on Pera Explorer
                  </a>
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
