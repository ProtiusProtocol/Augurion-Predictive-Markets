import { useState, useEffect } from 'react'
import algosdk from 'algosdk'
import ProjectStatusPanel from './ProjectStatusPanel'
import { CONFIG } from './config'
import { projectStore, ProjectSubmission } from './projectStore'
import { ARTIFACTS } from './contractArtifacts'

// LocalNet test credentials (only used for local development)
const LOCAL_ADMIN_ADDRESS = 'ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA'
const LOCAL_ADMIN_MNEMONIC = 'solar funny mass kiss film argue journey enroll income caution jewel artist escape brother rebuild model dinosaur talk cave survey address type air able shy'

interface EpochState {
  epochId: number
  status: 'NOT_FOUND' | 'OPEN' | 'CLOSED' | 'SETTLED'
  netDeposited: bigint
  revenuePerKw: bigint
  reportHash: string | null
}

interface FCStatus {
  fcOpen: boolean
  fcFinalized: boolean
  transfersEnabled: boolean
  investorMintedAmount: bigint
  totalSupply: bigint
  loaded: boolean
}

interface NetworkStatus {
  connected: boolean
  lastRound: number
  error: string | null
}

export default function OperatorConsole() {
  const [network, setNetwork] = useState<NetworkStatus>({ connected: false, lastRound: 0, error: null })
  const [epochState, setEpochState] = useState<EpochState | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number>(202501)
  const [loading, setLoading] = useState<string | null>(null)
  const [actionLog, setActionLog] = useState<string[]>([])
  const [fcStatus, setFcStatus] = useState<FCStatus>({
    fcOpen: false, fcFinalized: false, transfersEnabled: false,
    investorMintedAmount: 0n, totalSupply: 0n, loaded: false,
  })
  const [fcForm, setFcForm] = useState({
    installedAcKw: '1000',
    platformKwBps: '200',
    treasury: LOCAL_ADMIN_ADDRESS,
    singleInvestor: '',
  })
  const [pendingSubmissions, setPendingSubmissions] = useState<ProjectSubmission[]>(() => projectStore.getPending())
  const [approvalForms, setApprovalForms] = useState<Record<string, { registryAppId: string; kwTokenAppId: string; revenueVaultAppId: string; kwhReceiptAppId: string }>>({})

  // Project state machine
  const [registryStateInfo, setRegistryStateInfo] = useState<{ current: number; label: string } | null>(null)
  const [targetState, setTargetState] = useState<number>(1)
  const REGISTRY_PROJECTS = [
    { label: 'PROTIUS-001 (staking open)', appId: 756428038 },
    { label: 'PROTIUS-002 (equity raise)', appId: 756428065 },
  ]
  const [selectedRegistryAppId, setSelectedRegistryAppId] = useState<number>(REGISTRY_PROJECTS[0].appId)

  // Project initialization form state
  const [projectForm, setProjectForm] = useState({
    projectId: 'PROTIUS-001',
    installedAcKw: '1000',
    treasury: '',
    platformKwBps: '200',
    platformKwhRateBps: '100',
    admin: LOCAL_ADMIN_ADDRESS,
    peoFile: null as File | null,
    peoNumber: ''
  })

  const algodClient = new algosdk.Algodv2(CONFIG.algodToken, CONFIG.algodServer, CONFIG.algodPort)
  const adminAccount = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)

  // Read network status
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const status = await algodClient.status().do()
        setNetwork({ connected: true, lastRound: status['last-round'], error: null })
      } catch (err: any) {
        setNetwork({ connected: false, lastRound: 0, error: err.message })
      }
    }
    checkNetwork()
    const interval = setInterval(checkNetwork, 5000)
    return () => clearInterval(interval)
  }, [])

  // Read epoch state
  const readEpochState = async (epochId: number) => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.revenueVaultAppId).do()
      const globalState = appInfo.params['global-state'] || []

      // Read boxes for epoch-specific data
      const epochIdBytes = algosdk.encodeUint64(epochId)
      
      const statusKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_status:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const hashKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_hash:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const netKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_net_deposited:', 'utf-8'), Buffer.from(epochIdBytes)]))
      const revKey = new Uint8Array(Buffer.concat([Buffer.from('epoch_rev_kw:', 'utf-8'), Buffer.from(epochIdBytes)]))

      let status: 'NOT_FOUND' | 'OPEN' | 'CLOSED' | 'SETTLED' = 'NOT_FOUND'
      let netDeposited = 0n
      let revenuePerKw = 0n
      let reportHash: string | null = null

      try {
        const statusBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, statusKey).do()
        const statusValue = new DataView(statusBox.value.buffer).getBigUint64(0, false)
        if (statusValue === 1n) status = 'OPEN'
        else if (statusValue === 2n) status = 'CLOSED'
      } catch {}

      try {
        const hashBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, hashKey).do()
        reportHash = Buffer.from(hashBox.value).toString('base64')
      } catch {}

      try {
        const netBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, netKey).do()
        netDeposited = new DataView(netBox.value.buffer).getBigUint64(0, false)
      } catch {}

      try {
        const revBox = await algodClient.getApplicationBoxByName(CONFIG.revenueVaultAppId, revKey).do()
        revenuePerKw = new DataView(revBox.value.buffer).getBigUint64(0, false)
        if (revenuePerKw > 0n) status = 'SETTLED'
      } catch {}

      setEpochState({ epochId, status, netDeposited, revenuePerKw, reportHash })
    } catch (err: any) {
      log(`❌ Failed to read epoch state: ${err.message}`)
      setEpochState(null)
    }
  }

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setActionLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 20))
  }

  const executeAction = async (actionName: string, action: () => Promise<void>) => {
    setLoading(actionName)
    try {
      await action()
      await readEpochState(currentEpochId) // Re-read state after action
    } catch (err: any) {
      log(`❌ ${actionName} failed: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  const initializeProject = async () => {
    // TODO: In production, validate PEO is attached and completed via Infrapilot
    // TODO: Store PEO in backend database with unique number
    if (projectForm.peoFile) {
      log(`📎 PEO attached: ${projectForm.peoFile.name} (${projectForm.peoNumber || 'auto-generated ID'})`)
      // TODO: Upload PEO to backend storage service
    }

    const suggestedParams = await algodClient.getTransactionParams().do()
    
    // Encode project ID as bytes (UTF-8)
    const projectIdBytes = new Uint8Array(Buffer.from(projectForm.projectId, 'utf-8'))
    const installedKw = algosdk.encodeUint64(Number(projectForm.installedAcKw))
    const platformKwBps = algosdk.encodeUint64(Number(projectForm.platformKwBps))
    const platformKwhRateBps = algosdk.encodeUint64(Number(projectForm.platformKwhRateBps))

    // Method: init_registry(bytes,uint64,account,uint64,uint64,account)
    const methodSelector = new Uint8Array(Buffer.from('init_registry', 'utf-8').slice(0, 4))

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.projectRegistryAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        methodSelector,
        projectIdBytes,
        installedKw,
        platformKwBps,
        platformKwhRateBps,
      ],
      accounts: [
        projectForm.treasury || adminAccount.addr,
        projectForm.admin || adminAccount.addr,
      ],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const _r1 = await algodClient.sendRawTransaction(signedTxn).do()
    const txId = (_r1 as any).txid || (_r1 as any).txId
    await algosdk.waitForConfirmation(algodClient, txId, 8)
    log(`✅ Project initialized: ${projectForm.projectId} (PEO: ${projectForm.peoNumber || 'N/A'}) → ${txId.slice(0, 8)}`)
  }

  const createEpoch = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    // Simple app call to createEpoch
    const methodSelector = new Uint8Array(Buffer.from('createEpoch(uint64,uint64,uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)
    const startBytes = algosdk.encodeUint64(1735689600) // 2025-01-01
    const endBytes = algosdk.encodeUint64(1738367999) // 2025-01-31

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes, startBytes, endBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const _r2 = await algodClient.sendRawTransaction(signedTxn).do()
    const txId = (_r2 as any).txid || (_r2 as any).txId
    await algosdk.waitForConfirmation(algodClient, txId, 8)
    log(`✅ createEpoch(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  const closeEpoch = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    const methodSelector = new Uint8Array(Buffer.from('closeEpoch(uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const _r3 = await algodClient.sendRawTransaction(signedTxn).do()
    const txId = (_r3 as any).txid || (_r3 as any).txId
    await algosdk.waitForConfirmation(algodClient, txId, 8)
    log(`✅ closeEpoch(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  const depositRevenue = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    const revenueAmount = 30000000 // 30 ALGO in microAlgos
    const appAddress = algosdk.getApplicationAddress(CONFIG.revenueVaultAppId)

    // Payment transaction
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: adminAccount.addr,
      to: appAddress,
      amount: revenueAmount,
      suggestedParams,
    })

    // App call transaction
    const methodSelector = new Uint8Array(Buffer.from('depositNetRevenue(uint64,uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)
    const amountBytes = algosdk.encodeUint64(revenueAmount)

    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes, amountBytes],
      suggestedParams,
    })

    // Group transactions
    const txnGroup = [payTxn, appCallTxn]
    algosdk.assignGroupID(txnGroup)

    const signedGroup = txnGroup.map(txn => txn.signTxn(adminAccount.sk))
    const _r4 = await algodClient.sendRawTransaction(signedGroup).do()
    const txId = (_r4 as any).txid || (_r4 as any).txId
    await algosdk.waitForConfirmation(algodClient, txId, 8)
    log(`✅ depositRevenue(${currentEpochId}, ${revenueAmount}µA) → ${txId.slice(0, 8)}`)
  }

  const computeEntitlements = async () => {
    const suggestedParams = await algodClient.getTransactionParams().do()
    
    const methodSelector = new Uint8Array(Buffer.from('computeRevenuePerKw(uint64)', 'utf-8').slice(0, 4))
    const epochIdBytes = algosdk.encodeUint64(currentEpochId)

    const txn = algosdk.makeApplicationCallTxnFromObject({
      from: adminAccount.addr,
      appIndex: CONFIG.revenueVaultAppId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [methodSelector, epochIdBytes],
      suggestedParams,
    })

    const signedTxn = txn.signTxn(adminAccount.sk)
    const _r5 = await algodClient.sendRawTransaction(signedTxn).do()
    const txId = (_r5 as any).txid || (_r5 as any).txId
    await algosdk.waitForConfirmation(algodClient, txId, 8)
    log(`✅ computeEntitlements(${currentEpochId}) → ${txId.slice(0, 8)}`)
  }

  // ── FC helpers ────────────────────────────────────────────────────────────
  const makeBalBoxName = (address: string): Uint8Array => {
    const pubKey = algosdk.decodeAddress(address).publicKey
    const prefix = new TextEncoder().encode('bal:')
    const key = new Uint8Array(prefix.length + pubKey.length)
    key.set(prefix)
    key.set(pubKey, prefix.length)
    return key
  }

  const readFCStatus = async () => {
    try {
      const appInfo = await algodClient.getApplicationByID(CONFIG.kwTokenAppId).do()
      const gs: Array<{ key: string; value: { type: number; uint: number; bytes: string } }> =
        (appInfo.params as any)['global-state'] || (appInfo.params as any).globalState || []
      const decodeUint = (k: string): bigint => {
        const entry = gs.find((e: any) => {
          const decoded = (() => { try { return e.key instanceof Uint8Array ? new TextDecoder().decode(e.key) : atob(e.key) } catch { return null } })()
          return decoded === k
        })
        return entry ? BigInt(entry.value?.uint ?? entry.value?.Uint ?? 0) : 0n
      }
      setFcStatus({
        fcOpen: decodeUint('fcOpen') === 1n,
        fcFinalized: decodeUint('fcFinalized') === 1n,
        transfersEnabled: decodeUint('transfersEnabled') === 1n,
        investorMintedAmount: decodeUint('investorMintedAmount'),
        totalSupply: decodeUint('totalSupply'),
        loaded: true,
      })
    } catch (err: any) {
      log(`❌ Failed to read FC status: ${err.message}`)
    }
  }

  const closeFCWithAllocation = async () => {
    await executeAction('closeFinancialClose', async () => {
      const adminAccount = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)
      const sp = await algodClient.getTransactionParams().do()
      const installedAcKw = BigInt(fcForm.installedAcKw)
      const platformKwBps = BigInt(fcForm.platformKwBps)
      const treasury = fcForm.treasury
      const selector = new Uint8Array([0x07, 0x42, 0x95, 0x6b])
      const u64a = new Uint8Array(8); new DataView(u64a.buffer).setBigUint64(0, installedAcKw)
      const u64b = new Uint8Array(8); new DataView(u64b.buffer).setBigUint64(0, platformKwBps)
      const addrArg = new Uint8Array([1])
      const txn = algosdk.makeApplicationCallTxnFromObject({
        sender: adminAccount.addr,
        suggestedParams: sp,
        appIndex: CONFIG.kwTokenAppId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [selector, u64a, u64b, addrArg],
        accounts: [treasury],
        boxes: [{ appIndex: 0, name: makeBalBoxName(treasury) }],
      })
      const signed = txn.signTxn(adminAccount.sk)
      const _r = await algodClient.sendRawTransaction(signed).do()
      const txId = (_r as any).txid || (_r as any).txId
      await algosdk.waitForConfirmation(algodClient, txId, 8)
      log(`✅ closeFinancialClose → ${txId.slice(0, 8)}`)
      await readFCStatus()
    })
  }

  const finalizeFCSimple = async () => {
    await executeAction('finalizeFinancialCloseSimple', async () => {
      const adminAccount = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)
      const sp = await algodClient.getTransactionParams().do()
      const installedAcKw = BigInt(fcForm.installedAcKw)
      const platformKwBps = BigInt(fcForm.platformKwBps)
      const treasury = fcForm.treasury
      const investor = fcForm.singleInvestor
      const selector = new Uint8Array([0xe7, 0x26, 0x63, 0x8e])
      const u64a = new Uint8Array(8); new DataView(u64a.buffer).setBigUint64(0, installedAcKw)
      const u64b = new Uint8Array(8); new DataView(u64b.buffer).setBigUint64(0, platformKwBps)
      const addrArg1 = new Uint8Array([1])
      const addrArg2 = new Uint8Array([2])
      const txn = algosdk.makeApplicationCallTxnFromObject({
        sender: adminAccount.addr,
        suggestedParams: sp,
        appIndex: CONFIG.kwTokenAppId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [selector, u64a, u64b, addrArg1, addrArg2],
        accounts: [treasury, investor],
        boxes: [
          { appIndex: 0, name: makeBalBoxName(treasury) },
          { appIndex: 0, name: makeBalBoxName(investor) },
        ],
      })
      const signed = txn.signTxn(adminAccount.sk)
      const _r = await algodClient.sendRawTransaction(signed).do()
      const txId = (_r as any).txid || (_r as any).txId
      await algosdk.waitForConfirmation(algodClient, txId, 8)
      log(`✅ finalizeFinancialCloseSimple → ${txId.slice(0, 8)}`)
      await readFCStatus()
    })
  }
  // ── End FC helpers ─────────────────────────────────────────────────────────

  // ── Project Approval ────────────────────────────────────────────────────────
  const refreshPending = () => setPendingSubmissions(projectStore.getPending())

  const approveSubmission = async (sub: ProjectSubmission) => {
    const f = approvalForms[sub.submissionId] || {}
    const registryAppId = Number(f.registryAppId)
    const kwTokenAppId = Number(f.kwTokenAppId)
    const revenueVaultAppId = Number(f.revenueVaultAppId)
    const kwhReceiptAppId = Number(f.kwhReceiptAppId)
    if (!registryAppId || !kwTokenAppId || !revenueVaultAppId || !kwhReceiptAppId) {
      log('❌ All 4 App IDs are required before approving.')
      return
    }
    await executeAction(`APPROVE_${sub.submissionId}`, async () => {
      const adminAccount = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)
      const sp = await algodClient.getTransactionParams().do()
      // ARC-4 selector for init_registry(byte[],uint64,address,uint64,uint64,address)string
      const selector = new Uint8Array([0x2b, 0xce, 0x98, 0xeb])
      // ARC-4 byte[]: 2-byte big-endian length prefix + UTF-8 bytes
      const idBytes = new TextEncoder().encode(sub.displayName)
      const idLen = new Uint8Array(2)
      new DataView(idLen.buffer).setUint16(0, idBytes.length)
      const idArg = new Uint8Array([...idLen, ...idBytes])
      const kw = new Uint8Array(8); new DataView(kw.buffer).setBigUint64(0, BigInt(Math.round(sub.installedAcKw)))
      const kwBps = new Uint8Array(8); new DataView(kwBps.buffer).setBigUint64(0, BigInt(sub.platformKwBps))
      const kwhBps = new Uint8Array(8); new DataView(kwhBps.buffer).setBigUint64(0, BigInt(sub.platformKwhRateBps))
      const treasuryAddr = sub.treasuryAddress || adminAccount.addr
      const adminAddr = adminAccount.addr
      const txn = algosdk.makeApplicationCallTxnFromObject({
        sender: adminAccount.addr,
        suggestedParams: sp,
        appIndex: registryAppId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [selector, idArg, kw, new Uint8Array([1]), kwBps, kwhBps, new Uint8Array([2])],
        accounts: [treasuryAddr, adminAddr],
      })
      const signed = txn.signTxn(adminAccount.sk)
      const _r = await algodClient.sendRawTransaction(signed).do()
      const txId = (_r as any).txid || (_r as any).txId
      await algosdk.waitForConfirmation(algodClient, txId, 8)
      log(`✅ Project approved on-chain: ${sub.displayName} → registry ${registryAppId} (${txId.slice(0, 8)})`)
      projectStore.approve(sub.submissionId, { registryAppId, kwTokenAppId, revenueVaultAppId, kwhReceiptAppId }, txId)
      refreshPending()
      window.dispatchEvent(new CustomEvent('protius:project-approved'))
    })
  }

  const rejectSubmission = (sub: ProjectSubmission) => {
    const note = window.prompt(`Reason for rejecting "${sub.displayName}"?`, '')
    if (note === null) return
    projectStore.reject(sub.submissionId, note)
    refreshPending()
    log(`❌ Rejected: ${sub.displayName}`)
  }

  const STATE_LABELS: Record<number, string> = {
    0: 'DRAFT', 1: 'REGISTERED', 2: 'FUNDED', 3: 'UNDER_CONSTRUCTION',
    4: 'COMMISSIONING', 5: 'OPERATING', 6: 'SUSPENDED', 7: 'EXITED',
  }

  // Safely decode a global-state key (handles both base64 string and Uint8Array from algosdk v3)
  const decodeGsKey = (key: any): string | null => {
    try {
      if (key instanceof Uint8Array) return new TextDecoder().decode(key)
      if (typeof key === 'string') return atob(key)
    } catch { /* binary key, not a utf8 string */ }
    return null
  }

  const readRegistryState = async () => {
    try {
      const appInfo = await algodClient.getApplicationByID(selectedRegistryAppId).do()
      const gs: Array<any> =
        (appInfo.params as any)['global-state'] || (appInfo.params as any).globalState || []
      let current = 0
      for (const kv of gs) {
        const k = decodeGsKey(kv.key)
        if (k === 'projectState') {
          current = Number(kv.value?.uint ?? kv.value?.Uint ?? 0)
          break
        }
      }
      setRegistryStateInfo({ current, label: STATE_LABELS[current] ?? 'UNKNOWN' })
    } catch (err: any) {
      log(`❌ Failed to read registry state: ${err.message}`)
    }
  }

  const transitionProjectState = async () => {
    await executeAction('TRANSITION_STATE', async () => {
      const admin = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)
      const transMethod = new algosdk.ABIMethod({
        name: 'transitionState',
        args: [{ type: 'uint64', name: 'newState' }],
        returns: { type: 'string' },
      })
      const signer = algosdk.makeBasicAccountTransactionSigner(admin)
      const atc = new algosdk.AtomicTransactionComposer()
      atc.addMethodCall({
        appID: selectedRegistryAppId,
        method: transMethod,
        methodArgs: [targetState],
        sender: admin.addr.toString(),
        signer,
        suggestedParams: await algodClient.getTransactionParams().do(),
      })
      const result = await atc.execute(algodClient, 4)
      log(`✅ transitionState → ${result.methodResults[0].returnValue} (App ${selectedRegistryAppId})`)
      await readRegistryState()
    })
  }

  const exportSubmissionConfig = (sub: ProjectSubmission) => {
    const config = {
      submissionId: sub.submissionId,
      displayName: sub.displayName,
      energyType: sub.energyType,
      location: sub.location,
      installedAcKw: sub.installedAcKw,
      platformKwBps: sub.platformKwBps,
      platformKwhRateBps: sub.platformKwhRateBps,
      treasuryAddress: sub.treasuryAddress || '',
      permits: sub.permits || '',
      description: sub.description || '',
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sub.displayName.replace(/\s+/g, '-').toLowerCase()}-deploy-config.json`
    a.click()
    URL.revokeObjectURL(url)
    log(`⬇️ Exported deploy config for ${sub.displayName}`)
  }

  const setApprovalField = (id: string, field: string, value: string) =>
    setApprovalForms(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))

  // ── Browser-based Deploy & Register ─────────────────────────────────────────
  const deployAndRegister = async (sub: ProjectSubmission) => {
    await executeAction(`DEPLOY_${sub.submissionId}`, async () => {
      const admin = algosdk.mnemonicToSecretKey(LOCAL_ADMIN_MNEMONIC)

      /** Compile TEAL source via algod and return bytes */
      const compileTeal = async (tealSource: string): Promise<Uint8Array> => {
        const r = await (algodClient.compile(tealSource) as any).do()
        return Uint8Array.from(atob(r.result), c => c.charCodeAt(0))
      }

      /** Deploy one application and fund its account */
      const deployApp = async (artifact: typeof ARTIFACTS.projectRegistry) => {
        log(`   Compiling ${artifact.globalInts}u/${artifact.globalBytes}b contract...`)
        const approval = await compileTeal(artifact.approval)
        const clear = await compileTeal(artifact.clear)
        const sp = await algodClient.getTransactionParams().do()
        const createTxn = algosdk.makeApplicationCreateTxnFromObject({
          sender: admin.addr,
          suggestedParams: sp,
          onComplete: algosdk.OnApplicationComplete.NoOpOC,
          approvalProgram: approval,
          clearProgram: clear,
          numGlobalInts: artifact.globalInts,
          numGlobalByteSlices: artifact.globalBytes,
          numLocalInts: artifact.localInts,
          numLocalByteSlices: artifact.localBytes,
        })
        const signedCreate = createTxn.signTxn(admin.sk)
        const createRes = await algodClient.sendRawTransaction(signedCreate).do()
        const createTxId = (createRes as any).txid || (createRes as any).txId
        const createConf = await algosdk.waitForConfirmation(algodClient, createTxId, 8)
        const appId = Number((createConf as any)['application-index'])
        const appAddr = algosdk.getApplicationAddress(appId)
        // Fund the application account
        const sp2 = await algodClient.getTransactionParams().do()
        const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: admin.addr,
          receiver: appAddr,
          amount: artifact.fundAlgo * 1_000_000,
          suggestedParams: sp2,
        })
        const signedFund = fundTxn.signTxn(admin.sk)
        const fundRes = await algodClient.sendRawTransaction(signedFund).do()
        const fundTxId = (fundRes as any).txid || (fundRes as any).txId
        await algosdk.waitForConfirmation(algodClient, fundTxId, 8)
        log(`   App ${appId} deployed & funded ${artifact.fundAlgo} ALGO`)
        return { appId, appAddr: appAddr.toString() }
      }

      log('🚀 [1/4] Deploying ProjectRegistry...')
      const registry = await deployApp(ARTIFACTS.projectRegistry)
      log('🚀 [2/4] Deploying KWToken...')
      const kwToken = await deployApp(ARTIFACTS.kwToken)
      log('🚀 [3/4] Deploying RevenueVault...')
      const revenueVault = await deployApp(ARTIFACTS.revenueVault)
      log('🚀 [4/4] Deploying KWhReceipt...')
      const kwhReceipt = await deployApp(ARTIFACTS.kwhReceipt)

      // ── setContracts(kwToken, kwhReceipt, revenueVault) ──────────────────
      log('🔗 Wiring contracts via setContracts...')
      const sp3 = await algodClient.getTransactionParams().do()
      const setContractsSel = new Uint8Array([0x85, 0xe0, 0x36, 0x8f])
      const kwTokenPk = algosdk.decodeAddress(kwToken.appAddr).publicKey
      const kwhReceiptPk = algosdk.decodeAddress(kwhReceipt.appAddr).publicKey
      const revenueVaultPk = algosdk.decodeAddress(revenueVault.appAddr).publicKey
      const setContractsTxn = algosdk.makeApplicationCallTxnFromObject({
        sender: admin.addr,
        suggestedParams: sp3,
        appIndex: registry.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [setContractsSel, kwTokenPk, kwhReceiptPk, revenueVaultPk],
        accounts: [kwToken.appAddr, kwhReceipt.appAddr, revenueVault.appAddr],
      })
      const signedSC = setContractsTxn.signTxn(admin.sk)
      const scRes = await algodClient.sendRawTransaction(signedSC).do()
      const scTxId = (scRes as any).txid || (scRes as any).txId
      await algosdk.waitForConfirmation(algodClient, scTxId, 8)
      log(`✅ setContracts OK`)

      // ── init_registry ─────────────────────────────────────────────────────
      log('📋 Calling init_registry...')
      const sp4 = await algodClient.getTransactionParams().do()
      const selector = new Uint8Array([0x2b, 0xce, 0x98, 0xeb])
      const idBytes = new TextEncoder().encode(sub.displayName)
      const idLen = new Uint8Array(2)
      new DataView(idLen.buffer).setUint16(0, idBytes.length)
      const idArg = new Uint8Array([...idLen, ...idBytes])
      const kw = new Uint8Array(8); new DataView(kw.buffer).setBigUint64(0, BigInt(Math.round(sub.installedAcKw)))
      const kwBps = new Uint8Array(8); new DataView(kwBps.buffer).setBigUint64(0, BigInt(sub.platformKwBps))
      const kwhBps = new Uint8Array(8); new DataView(kwhBps.buffer).setBigUint64(0, BigInt(sub.platformKwhRateBps))
      const treasuryAddr = sub.treasuryAddress || admin.addr.toString()
      const adminAddr = admin.addr.toString()
      const initTxn = algosdk.makeApplicationCallTxnFromObject({
        sender: admin.addr,
        suggestedParams: sp4,
        appIndex: registry.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [selector, idArg, kw, new Uint8Array([1]), kwBps, kwhBps, new Uint8Array([2])],
        accounts: [treasuryAddr, adminAddr],
      })
      const signedInit = initTxn.signTxn(admin.sk)
      const initRes = await algodClient.sendRawTransaction(signedInit).do()
      const initTxId = (initRes as any).txid || (initRes as any).txId
      await algosdk.waitForConfirmation(algodClient, initTxId, 8)
      log(`✅ init_registry OK (txId: ${initTxId.slice(0, 8)}...)`)

      // ── Auto-fill form + mark approved ────────────────────────────────────
      const updates = {
        registryAppId: String(registry.appId),
        kwTokenAppId: String(kwToken.appId),
        revenueVaultAppId: String(revenueVault.appId),
        kwhReceiptAppId: String(kwhReceipt.appId),
      }
      setApprovalForms(prev => ({ ...prev, [sub.submissionId]: updates }))
      projectStore.approve(sub.submissionId, {
        registryAppId: registry.appId,
        kwTokenAppId: kwToken.appId,
        revenueVaultAppId: revenueVault.appId,
        kwhReceiptAppId: kwhReceipt.appId,
      }, initTxId)
      refreshPending()
      window.dispatchEvent(new CustomEvent('protius:project-approved'))
      log(`🎉 All done! ProjectRegistry App ID: ${registry.appId}`)
    })
  }
  // ── End Deploy & Register ───────────────────────────────────────────────────

  // ── End Project Approval ────────────────────────────────────────────────────

  // Initial load
  useEffect(() => {
    if (network.connected) {
      readEpochState(currentEpochId)
      readFCStatus()
    }
  }, [network.connected, currentEpochId])

  // Action button states
  const canCreateEpoch = epochState?.status === 'NOT_FOUND'
  const canCloseEpoch = epochState?.status === 'OPEN'
  const canDepositRevenue = epochState?.status === 'CLOSED' && epochState.netDeposited === 0n
  const canComputeEntitlements = epochState?.status === 'CLOSED' && epochState.netDeposited > 0n && epochState.revenuePerKw === 0n

  const getButtonDisabledReason = (action: string): string | null => {
    if (!network.connected) return 'Network not connected'
    if (!epochState) return 'Loading epoch state...'
    
    switch (action) {
      case 'create':
        if (epochState.status !== 'NOT_FOUND') return `Epoch already exists (status: ${epochState.status})`
        return null
      case 'close':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'OPEN') return `Epoch not OPEN (status: ${epochState.status})`
        return null
      case 'deposit':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'CLOSED') return `Epoch not CLOSED (status: ${epochState.status})`
        if (epochState.netDeposited > 0n) return 'Revenue already deposited (idempotent)'
        return null
      case 'compute':
        if (epochState.status === 'NOT_FOUND') return 'Epoch does not exist'
        if (epochState.status !== 'CLOSED' && epochState.status !== 'SETTLED') return `Epoch not CLOSED (status: ${epochState.status})`
        if (epochState.netDeposited === 0n) return 'No revenue deposited yet'
        if (epochState.revenuePerKw > 0n) return 'Entitlements already computed (idempotent)'
        return null
      default:
        return null
    }
  }

  // Generate protocol summary
  const getProtocolSummary = (): string => {
    if (!epochState) return 'Epoch state loading...'
    if (epochState.status === 'NOT_FOUND') return `Epoch ${epochState.epochId} does not exist yet.`
    if (epochState.status === 'OPEN') return `Epoch ${epochState.epochId} is OPEN. Ready to be closed.`
    if (epochState.status === 'CLOSED' && epochState.netDeposited === 0n) return `Epoch ${epochState.epochId} is CLOSED. Ready to deposit revenue.`
    if (epochState.status === 'CLOSED' && epochState.netDeposited > 0n && epochState.revenuePerKw === 0n) return `Epoch ${epochState.epochId} has ${epochState.netDeposited.toString()} µAlgos deposited. Ready to compute entitlements.`
    if (epochState.status === 'SETTLED') return `Epoch ${epochState.epochId} is SETTLED with revenuePerKw = ${epochState.revenuePerKw.toString()} µAlgos/kW.`
    return `Epoch ${epochState.epochId} state: ${epochState.status}`
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Protius Protocol Control UI</h1>
      <p style={{ color: '#666' }}>Phase 1: Operator Console (state-gated actions only)</p>
      
      {/* Project State Machine Panel */}
      <ProjectStatusPanel
        projectRegistryAppId={CONFIG.projectRegistryAppId}
        algodClient={algodClient}
        readOnly={false}
      />
      
      <hr />

      {/* Protocol Summary */}
      <section>
        <div style={{ 
          backgroundColor: '#f0f0f0', 
          padding: '12px', 
          border: '1px solid #999',
          borderRadius: '4px',
          fontSize: '14px',
          marginBottom: '20px'
        }}>
          <strong>Protocol State:</strong> {getProtocolSummary()}
        </div>
      </section>

      {/* Network Status */}
      <section>
        <h2>Network Status</h2>
        <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td><strong>Algod</strong></td>
              <td>{CONFIG.algodServer}:{CONFIG.algodPort}</td>
            </tr>
            <tr>
              <td><strong>Connected</strong></td>
              <td style={{ color: network.connected ? 'green' : 'red' }}>
                {network.connected ? '✓ Connected' : '✗ Disconnected'}
              </td>
            </tr>
            <tr>
              <td><strong>Last Round</strong></td>
              <td>{network.lastRound}</td>
            </tr>
            {network.error && (
              <tr>
                <td><strong>Error</strong></td>
                <td style={{ color: 'red' }}>{network.error}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <hr />

      {/* Project Management */}
      <section>
        <h2>🏗️ Project Management</h2>
        <div style={{ 
          backgroundColor: '#fff3cd', 
          border: '2px solid #ff9800',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '15px'
        }}>
          <strong>⚠️ Testing Tool Only</strong>
          <p style={{ fontSize: '12px', margin: '8px 0 0 0' }}>
            <strong>Production:</strong> Projects must come from <strong>Infrapilot</strong> with completed <strong>PEO (Project Entry Object)</strong> before onboarding to investment pool.
            This form is for LocalNet testing and development only.
          </p>
        </div>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Initialize a new project in the ProjectRegistry contract. This sets immutable project parameters.
        </p>
        
        <div style={{ 
          backgroundColor: '#f9f9f9', 
          padding: '15px', 
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '15px'
        }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              📎 Project Entry Object (PEO):
            </label>
            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                value={projectForm.peoNumber}
                onChange={(e) => setProjectForm({ ...projectForm, peoNumber: e.target.value })}
                style={{ width: '100%', padding: '6px', fontFamily: 'monospace', marginBottom: '6px' }}
                placeholder="PEO Unique Number (auto-generated if empty)"
              />
              <input
                type="file"
                accept=".pdf,.doc,.docx,.json"
                onChange={(e) => setProjectForm({ ...projectForm, peoFile: e.target.files?.[0] || null })}
                style={{ width: '100%', padding: '6px', fontSize: '12px' }}
              />
              {projectForm.peoFile && (
                <div style={{ fontSize: '11px', color: '#2e7d32', marginTop: '4px' }}>
                  ✓ Attached: {projectForm.peoFile.name}
                </div>
              )}
            </div>
            <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
              In production, PEO is validated from Infrapilot and stored in backend database.
            </p>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Project ID (string):
            </label>
            <input
              type="text"
              value={projectForm.projectId}
              onChange={(e) => setProjectForm({ ...projectForm, projectId: e.target.value })}
              style={{ width: '100%', padding: '6px', fontFamily: 'monospace' }}
              placeholder="e.g., PROTIUS-001"
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Installed AC Capacity (kW):
            </label>
            <input
              type="number"
              value={projectForm.installedAcKw}
              onChange={(e) => setProjectForm({ ...projectForm, installedAcKw: e.target.value })}
              style={{ width: '100%', padding: '6px', fontFamily: 'monospace' }}
              placeholder="e.g., 1000"
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Treasury Address (optional, defaults to admin):
            </label>
            <input
              type="text"
              value={projectForm.treasury}
              onChange={(e) => setProjectForm({ ...projectForm, treasury: e.target.value })}
              style={{ width: '100%', padding: '6px', fontFamily: 'monospace', fontSize: '11px' }}
              placeholder="Algorand address (leave empty for admin)"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Platform kW Fee (BPS, 0-10000):
              </label>
              <input
                type="number"
                value={projectForm.platformKwBps}
                onChange={(e) => setProjectForm({ ...projectForm, platformKwBps: e.target.value })}
                style={{ width: '100%', padding: '6px', fontFamily: 'monospace' }}
                placeholder="500 = 5%"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Platform kWh Rate (BPS, 0-10000):
              </label>
              <input
                type="number"
                value={projectForm.platformKwhRateBps}
                onChange={(e) => setProjectForm({ ...projectForm, platformKwhRateBps: e.target.value })}
                style={{ width: '100%', padding: '6px', fontFamily: 'monospace' }}
                placeholder="100 = 1%"
              />
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Admin Address:
            </label>
            <input
              type="text"
              value={projectForm.admin}
              onChange={(e) => setProjectForm({ ...projectForm, admin: e.target.value })}
              style={{ width: '100%', padding: '6px', fontFamily: 'monospace', fontSize: '11px' }}
            />
          </div>

          <button
            onClick={() => executeAction('INIT_PROJECT', initializeProject)}
            disabled={!network.connected || !!loading || !projectForm.projectId || !projectForm.installedAcKw}
            style={{
              padding: '12px 24px',
              cursor: network.connected && !loading && projectForm.projectId && projectForm.installedAcKw ? 'pointer' : 'not-allowed',
              backgroundColor: network.connected && !loading ? '#2196f3' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            {loading === 'INIT_PROJECT' ? '⏳ Initializing...' : '🚀 Initialize Project'}
          </button>
        </div>
      </section>

      <hr />

      {/* Project Approval Queue */}
      <section>
        <h2>📥 Project Approval Queue</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: 0 }}>
          Projects submitted via the Registration form appear here. Use the <strong>Deploy &amp; Register Contracts</strong> button to deploy all 4 contracts and activate a project in one click.
        </p>
        <div style={{ background: '#eef6ff', border: '1px solid #b0d0f0', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
          <strong>How to approve a project:</strong>
          <ol style={{ margin: '6px 0 0 0', paddingLeft: '20px', lineHeight: '1.9' }}>
            <li><strong>Option A (recommended):</strong> Click the green <strong>Deploy &amp; Register Contracts</strong> button on the submission — deploys all 4 contracts and initialises the registry directly from this page. No terminal needed.</li>
            <li><strong>Option B (manual):</strong> Deploy the contracts separately, enter the 4 App IDs into the fields, then click <strong>Approve &amp; Initialize On-Chain</strong>.</li>
          </ol>
        </div>
        <button onClick={refreshPending} style={{ marginBottom: '16px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}>🔄 Refresh</button>

        {pendingSubmissions.length === 0 ? (
          <p style={{ color: '#888', fontStyle: 'italic' }}>No pending submissions.</p>
        ) : (
          pendingSubmissions.map(sub => {
            const f = approvalForms[sub.submissionId] || {}
            const canApprove = !!(f.registryAppId && f.kwTokenAppId && f.revenueVaultAppId && f.kwhReceiptAppId)
            return (
              <div key={sub.submissionId} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px', marginBottom: '16px', background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>{sub.displayName}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{sub.energyType} · {sub.location} · Submitted {new Date(sub.submittedAt).toLocaleString()}</div>
                  </div>
                  <span style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>PENDING</span>
                </div>

                <table style={{ fontSize: '13px', borderCollapse: 'collapse', width: '100%', marginBottom: '14px' }}>
                  <tbody>
                    {[
                      ['Capacity', `${sub.installedAcKw} kW`],
                      ['Platform kW Fee', `${sub.platformKwBps} BPS (${(sub.platformKwBps / 100).toFixed(2)}%)`],
                      ['Platform kWh Rate', `${sub.platformKwhRateBps} BPS`],
                      ['Treasury', sub.treasuryAddress || '(use admin default)'],
                      ['Permits', sub.permits || '—'],
                      ['Description', sub.description || '—'],
                    ].map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '4px 10px 4px 0', fontWeight: 600, width: '160px', color: '#444' }}>{label}</td>
                        <td style={{ padding: '4px 0', wordBreak: 'break-all' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ background: '#f0f4ff', border: '1px solid #c0d0f0', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>🔢 Enter pre-deployed App IDs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      ['registryAppId', 'ProjectRegistry App ID'],
                      ['kwTokenAppId', 'KWToken App ID'],
                      ['revenueVaultAppId', 'RevenueVault App ID'],
                      ['kwhReceiptAppId', 'KWhReceipt App ID'],
                    ].map(([field, label]) => (
                      <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', fontWeight: 600 }}>
                        {label}
                        <input
                          type="number"
                          value={f[field as keyof typeof f] || ''}
                          onChange={e => setApprovalField(sub.submissionId, field, e.target.value)}
                          placeholder="App ID"
                          style={{ padding: '6px', fontFamily: 'monospace', border: '1px solid #bbb', borderRadius: '4px' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* One-click Deploy & Register */}
                <div style={{ background: '#eaf4eb', border: '1px solid #a8d5b0', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>🚀 One-click Deploy</div>
                  <p style={{ fontSize: '12px', color: '#444', margin: '0 0 10px 0' }}>
                    Deploys all 4 contracts from the browser, wires them together, and initialises the registry — no terminal required.
                    The App IDs will be auto-filled below.
                  </p>
                  <button
                    onClick={() => deployAndRegister(sub)}
                    disabled={!!loading}
                    style={{
                      padding: '10px 22px', fontWeight: 700, fontSize: '13px', border: 'none', borderRadius: '6px',
                      cursor: !loading ? 'pointer' : 'not-allowed',
                      background: !loading ? '#0a5c1a' : '#888', color: '#fff',
                    }}
                  >
                    {loading === `DEPLOY_${sub.submissionId}` ? '⏳ Deploying… (watch Action Log below)' : '🚀 Deploy & Register Contracts'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => approveSubmission(sub)}
                    disabled={!canApprove || !!loading}
                    style={{
                      padding: '10px 20px', fontWeight: 700, fontSize: '13px', border: 'none', borderRadius: '6px', cursor: canApprove && !loading ? 'pointer' : 'not-allowed',
                      background: canApprove && !loading ? '#1a6b2a' : '#aaa', color: '#fff',
                    }}
                  >
                    {loading === `APPROVE_${sub.submissionId}` ? '⏳ Approving…' : '✅ Approve & Initialize On-Chain'}
                  </button>
                  <button
                    onClick={() => rejectSubmission(sub)}
                    disabled={!!loading}
                    style={{ padding: '10px 20px', fontSize: '13px', border: '1px solid #c00', borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#c00', fontWeight: 600 }}
                  >
                    ❌ Reject
                  </button>
                  <button
                    onClick={() => exportSubmissionConfig(sub)}
                    style={{ padding: '10px 20px', fontSize: '13px', border: '1px solid #0066cc', borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#0066cc', fontWeight: 600 }}
                  >
                    ⬇️ Export Config
                  </button>
                </div>
              </div>
            )
          })
        )}
      </section>

      <hr />

      {/* Financial Close Management */}
      <section>
        <h2>🔒 Financial Close Management</h2>
        <div style={{ marginBottom: '16px' }}>
          <strong>KWToken App ID:</strong> {CONFIG.kwTokenAppId}
          <button
            onClick={readFCStatus}
            style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '12px' }}
            disabled={!!loading}
          >
            Refresh FC Status
          </button>
        </div>

        {fcStatus.loaded ? (
          <table style={{ borderCollapse: 'collapse', marginBottom: '16px', width: '100%' }}>
            <tbody>
              {[
                ['FC Open', fcStatus.fcOpen ? '✅ Yes' : '❌ No'],
                ['FC Finalized', fcStatus.fcFinalized ? '✅ Yes' : '⏳ No'],
                ['Transfers Enabled', fcStatus.transfersEnabled ? '✅ Yes' : '❌ No'],
                ['Investor Minted (kW)', fcStatus.investorMintedAmount.toString()],
                ['Total Supply (kW)', fcStatus.totalSupply.toString()],
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 500, width: '220px' }}>{label}</td>
                  <td style={{ padding: '6px 12px' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>Loading FC status…</p>
        )}

        <div style={{ display: 'grid', gap: '8px', maxWidth: '480px', marginBottom: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>Installed AC kW</span>
            <input
              type="number"
              value={fcForm.installedAcKw}
              onChange={e => setFcForm(f => ({ ...f, installedAcKw: e.target.value }))}
              style={{ padding: '6px', fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>Platform kW BPS</span>
            <input
              type="number"
              value={fcForm.platformKwBps}
              onChange={e => setFcForm(f => ({ ...f, platformKwBps: e.target.value }))}
              style={{ padding: '6px', fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>Treasury Address</span>
            <input
              type="text"
              value={fcForm.treasury}
              onChange={e => setFcForm(f => ({ ...f, treasury: e.target.value }))}
              style={{ padding: '6px', fontFamily: 'monospace', fontSize: '12px' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '8px' }}>
          {fcStatus.loaded && (() => {
            const expected = BigInt(fcForm.installedAcKw || '0') - BigInt(fcForm.installedAcKw || '0') * BigInt(fcForm.platformKwBps || '0') / 10000n
            const ok = fcStatus.investorMintedAmount === expected
            return (
              <p style={{ fontSize: '13px', color: ok ? '#2a7a2a' : '#9a3a3a' }}>
                {`closeFinancialClose precondition: investorMinted=${fcStatus.investorMintedAmount} kW, expected=${expected} kW ${ok ? '✅ PASS' : '❌ FAIL'}`}
              </p>
            )
          })()}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={closeFCWithAllocation}
            disabled={!!loading || !fcStatus.fcOpen || fcStatus.fcFinalized}
            style={{
              padding: '10px 18px',
              background: (!loading && fcStatus.fcOpen && !fcStatus.fcFinalized) ? '#1a6b2a' : '#aaa',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: (!loading && fcStatus.fcOpen && !fcStatus.fcFinalized) ? 'pointer' : 'not-allowed',
            }}
          >
            {loading === 'closeFinancialClose' ? '⏳ Closing…' : '🔒 Close FC (respects invest() allocations)'}
          </button>
        </div>

        <details style={{ marginTop: '16px' }}>
          <summary style={{ cursor: 'pointer', color: '#c05000', fontWeight: 600 }}>
            ⚠️ Force Close FC (single-investor override — overwrites existing balances)
          </summary>
          <div style={{ background: '#fff3e0', border: '1px solid #e6a020', borderRadius: '6px', padding: '12px', marginTop: '8px' }}>
            <p style={{ fontSize: '13px', color: '#7a4000', marginTop: 0 }}>
              This calls <code>finalizeFinancialCloseSimple</code>. It ignores existing <code>invest()</code>
              positions and overwrites both the treasury and investor allocations from scratch.
              Use only if you want to bypass the investorMintedAmount precondition.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '480px', marginBottom: '12px' }}>
              <span>Single Investor Address</span>
              <input
                type="text"
                value={fcForm.singleInvestor}
                onChange={e => setFcForm(f => ({ ...f, singleInvestor: e.target.value }))}
                placeholder="ALGO address of the single investor"
                style={{ padding: '6px', fontFamily: 'monospace', fontSize: '12px' }}
              />
            </label>
            <button
              onClick={finalizeFCSimple}
              disabled={!!loading || !fcStatus.fcOpen || fcStatus.fcFinalized || !fcForm.singleInvestor}
              style={{
                padding: '10px 18px',
                background: (!loading && fcStatus.fcOpen && !fcStatus.fcFinalized && fcForm.singleInvestor) ? '#b83a00' : '#aaa',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {loading === 'finalizeFinancialCloseSimple' ? '⏳ Finalizing…' : '⚡ Force Close FC (override)'}
            </button>
          </div>
        </details>
      </section>

      <hr />

      {/* Epoch State */}
      <section>
        <h2>Epoch State</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Epoch ID:{' '}
            <input 
              type="number" 
              value={currentEpochId} 
              onChange={(e) => setCurrentEpochId(Number(e.target.value))}
              style={{ padding: '4px', width: '100px' }}
            />
          </label>
          {' '}
          <button onClick={() => readEpochState(currentEpochId)}>
            🔄 Refresh State
          </button>
        </div>

        {epochState ? (
          <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td><strong>Epoch ID</strong></td>
                <td>{epochState.epochId}</td>
              </tr>
              <tr>
                <td><strong>Status</strong></td>
                <td style={{ 
                  color: epochState.status === 'SETTLED' ? 'green' : 
                         epochState.status === 'CLOSED' ? 'orange' : 
                         epochState.status === 'OPEN' ? 'blue' : 'gray'
                }}>
                  <strong>{epochState.status}</strong>
                </td>
              </tr>
              <tr>
                <td><strong>Net Deposited</strong></td>
                <td>{epochState.netDeposited.toString()} µAlgos {epochState.netDeposited > 0n && '✓'}</td>
              </tr>
              <tr>
                <td><strong>Revenue per kW</strong></td>
                <td>{epochState.revenuePerKw.toString()} µAlgos {epochState.revenuePerKw > 0n && '✓'}</td>
              </tr>
              <tr>
                <td><strong>Report Hash</strong></td>
                <td style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                  {epochState.reportHash || '(not anchored)'}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>Loading epoch state...</p>
        )}
      </section>

      <hr />

      {/* Action Disable Reasons Table */}
      <section>
        <h2>Action States</h2>
        <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '20px' }}>
          <thead style={{ backgroundColor: '#f5f5f5' }}>
            <tr>
              <th style={{ textAlign: 'left' }}>Action</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Precondition</th>
              <th style={{ textAlign: 'left' }}>Reason Disabled (if any)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1. Create Epoch</strong></td>
              <td style={{ color: canCreateEpoch ? 'green' : '#999' }}>
                {canCreateEpoch ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must not exist (NOT_FOUND)</td>
              <td>{!canCreateEpoch && getButtonDisabledReason('create')}</td>
            </tr>
            <tr>
              <td><strong>2. Close Epoch</strong></td>
              <td style={{ color: canCloseEpoch ? 'green' : '#999' }}>
                {canCloseEpoch ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be OPEN</td>
              <td>{!canCloseEpoch && getButtonDisabledReason('close')}</td>
            </tr>
            <tr>
              <td><strong>3. Deposit Revenue</strong></td>
              <td style={{ color: canDepositRevenue ? 'green' : '#999' }}>
                {canDepositRevenue ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be CLOSED, netDeposited = 0</td>
              <td>{!canDepositRevenue && getButtonDisabledReason('deposit')}</td>
            </tr>
            <tr>
              <td><strong>4. Compute Entitlements</strong></td>
              <td style={{ color: canComputeEntitlements ? 'green' : '#999' }}>
                {canComputeEntitlements ? '✓ READY' : '⊘ BLOCKED'}
              </td>
              <td>Epoch must be CLOSED, revenue deposited, not yet computed</td>
              <td>{!canComputeEntitlements && getButtonDisabledReason('compute')}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <hr />

      {/* Operator Actions */}
      <section>
        <h2>Operator Actions</h2>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          Click an action button to execute. Disabled buttons explain why. Protocol state auto-refreshes every 5 seconds or after each action.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <button 
              onClick={() => executeAction('CREATE_EPOCH', createEpoch)}
              disabled={!canCreateEpoch || loading !== null}
              title={getButtonDisabledReason('create') || 'Create new epoch'}
              style={{ 
                padding: '10px 20px', 
                cursor: canCreateEpoch && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canCreateEpoch ? '#e8f5e9' : '#f5f5f5',
                color: canCreateEpoch ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'CREATE_EPOCH' ? '⏳ Creating...' : '1. Create Epoch'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('CLOSE_EPOCH', closeEpoch)}
              disabled={!canCloseEpoch || loading !== null}
              title={getButtonDisabledReason('close') || 'Close epoch for settlement'}
              style={{ 
                padding: '10px 20px', 
                cursor: canCloseEpoch && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canCloseEpoch ? '#e8f5e9' : '#f5f5f5',
                color: canCloseEpoch ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'CLOSE_EPOCH' ? '⏳ Closing...' : '2. Close Epoch'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('DEPOSIT_REVENUE', depositRevenue)}
              disabled={!canDepositRevenue || loading !== null}
              title={getButtonDisabledReason('deposit') || 'Deposit net revenue (grouped txn)'}
              style={{ 
                padding: '10px 20px', 
                cursor: canDepositRevenue && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canDepositRevenue ? '#e8f5e9' : '#f5f5f5',
                color: canDepositRevenue ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'DEPOSIT_REVENUE' ? '⏳ Depositing...' : '3. Deposit Revenue (30 ALGO)'}
            </button>
          </div>

          <div>
            <button 
              onClick={() => executeAction('COMPUTE_ENTITLEMENTS', computeEntitlements)}
              disabled={!canComputeEntitlements || loading !== null}
              title={getButtonDisabledReason('compute') || 'Compute revenuePerKw on-chain'}
              style={{ 
                padding: '10px 20px', 
                cursor: canComputeEntitlements && !loading ? 'pointer' : 'not-allowed',
                backgroundColor: canComputeEntitlements ? '#e8f5e9' : '#f5f5f5',
                color: canComputeEntitlements ? '#2e7d32' : '#999',
                border: '1px solid #ddd',
                fontWeight: 'bold'
              }}
            >
              {loading === 'COMPUTE_ENTITLEMENTS' ? '⏳ Computing...' : '4. Compute Entitlements'}
            </button>
          </div>
        </div>
      </section>

      <hr />

      {/* Project State Machine */}
      <section>
        <h2>Project State Machine</h2>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
          Advance the on-chain projectState. Transitions are enforced by the contract (DRAFT→REGISTERED→FUNDED→…).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Project:</label>
          <select
            value={selectedRegistryAppId}
            onChange={e => { setSelectedRegistryAppId(Number(e.target.value)); setRegistryStateInfo(null) }}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            {REGISTRY_PROJECTS.map(p => (
              <option key={p.appId} value={p.appId}>{p.label} (App {p.appId})</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={readRegistryState}
            style={{ padding: '6px 14px', border: '1px solid #ddd', cursor: 'pointer', borderRadius: '4px' }}
          >
            🔍 Read Current State
          </button>
          {registryStateInfo && (
            <span style={{ fontFamily: 'monospace', fontSize: '13px', background: '#f0f0f0', padding: '4px 10px', borderRadius: '4px' }}>
              Current: <strong>{registryStateInfo.current} — {registryStateInfo.label}</strong>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Transition to:</label>
          <select
            value={targetState}
            onChange={e => setTargetState(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value={1}>1 — REGISTERED (staking open)</option>
            <option value={2}>2 — FUNDED (equity raise)</option>
            <option value={3}>3 — UNDER CONSTRUCTION</option>
            <option value={4}>4 — COMMISSIONING</option>
            <option value={5}>5 — OPERATING</option>
            <option value={6}>6 — SUSPENDED</option>
          </select>
          <button
            onClick={transitionProjectState}
            disabled={loading !== null}
            style={{
              padding: '8px 18px',
              cursor: loading ? 'not-allowed' : 'pointer',
              backgroundColor: loading ? '#f5f5f5' : '#e3f2fd',
              color: loading ? '#999' : '#1565c0',
              border: '1px solid #90caf9',
              borderRadius: '4px',
              fontWeight: 'bold',
            }}
          >
            {loading === 'TRANSITION_STATE' ? '⏳ Transitioning...' : '▶ Execute Transition'}
          </button>
        </div>
      </section>

      <hr />

      {/* Action Log */}
      <section>
        <h2>Action Log (Local)</h2>
        <p style={{ fontSize: '12px', color: '#666' }}>
          All actions executed locally. Each action shows timestamp, result, and transaction ID.
        </p>
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '12px', 
          height: '250px', 
          overflowY: 'scroll',
          fontFamily: 'monospace',
          fontSize: '12px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          {actionLog.length === 0 ? (
            <div style={{ color: '#999' }}>No actions yet. Protocol state will auto-refresh.</div>
          ) : (
            actionLog.map((entry, idx) => (
              <div key={idx} style={{ marginBottom: '4px', lineHeight: '1.4' }}>
                {entry}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
