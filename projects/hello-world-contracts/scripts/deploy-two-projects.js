/**
 * Deploys two fresh ProjectRegistry contracts:
 *   PROTIUS-001 → state 1 (REGISTERED / staking open)
 *   PROTIUS-002 → state 2 (FUNDED / equity raise open)
 */
const algosdk = require('algosdk')
const fs = require('fs')
const path = require('path')

const ALGOD = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
const MNEMONIC = 'solar funny mass kiss film argue journey enroll income caution jewel artist escape brother rebuild model dinosaur talk cave survey address type air able shy'

const ARTIFACTS = path.join(__dirname, '../smart_contracts/project_registry/smart_contracts/artifacts')
const APPROVAL_TEAL = fs.readFileSync(path.join(ARTIFACTS, 'ProjectRegistry.approval.teal'), 'utf8')
const CLEAR_TEAL    = fs.readFileSync(path.join(ARTIFACTS, 'ProjectRegistry.clear.teal'),    'utf8')

async function compileTeal(src) {
  const res = await ALGOD.compile(src).do()
  return new Uint8Array(Buffer.from(res.result, 'base64'))
}

async function deployContract(account, label) {
  console.log(`\nDeploying ${label}...`)
  const sp = await ALGOD.getTransactionParams().do()
  const approvalProg = await compileTeal(APPROVAL_TEAL)
  const clearProg    = await compileTeal(CLEAR_TEAL)

  const txn = algosdk.makeApplicationCreateTxnFromObject({
    sender: account.addr.toString(),
    suggestedParams: sp,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: approvalProg,
    clearProgram: clearProg,
    numLocalInts: 0,
    numLocalByteSlices: 0,
    numGlobalInts: 12,
    numGlobalByteSlices: 7,
    extraPages: 1,
  })

  const signed = txn.signTxn(account.sk)
  const res = await ALGOD.sendRawTransaction(signed).do()
  const txId = res.txid || res.txId
  const confirmed = await algosdk.waitForConfirmation(ALGOD, txId, 8)
  const appId = Number(confirmed['application-index'] ?? confirmed.applicationIndex)
  console.log(`  ${label} App ID: ${appId}`)

  // Fund app account with 0.5 ALGO for min balance
  const sp2 = await ALGOD.getTransactionParams().do()
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: account.addr.toString(),
    receiver: algosdk.getApplicationAddress(appId),
    amount: 500_000,
    suggestedParams: sp2,
  })
  const signedFund = fundTxn.signTxn(account.sk)
  const fundRes = await ALGOD.sendRawTransaction(signedFund).do()
  await algosdk.waitForConfirmation(ALGOD, fundRes.txid || fundRes.txId, 8)
  console.log(`  Funded app account`)
  return appId
}

async function callMethod(appId, method, methodArgs, account) {
  const signer = algosdk.makeBasicAccountTransactionSigner(account)
  const atc = new algosdk.AtomicTransactionComposer()
  atc.addMethodCall({
    appID: appId,
    method,
    methodArgs,
    sender: account.addr.toString(),
    signer,
    suggestedParams: await ALGOD.getTransactionParams().do(),
  })
  const r = await atc.execute(ALGOD, 4)
  return r.methodResults[0].returnValue
}

async function main() {
  const account = algosdk.mnemonicToSecretKey(MNEMONIC)
  const addr = account.addr.toString()
  console.log('Deployer:', addr)

  const info = await ALGOD.accountInformation(addr).do()
  console.log('Balance:', Number(info.amount) / 1e6, 'ALGO')

  const initMethod = new algosdk.ABIMethod({
    name: 'init_registry',
    args: [
      { type: 'byte[]', name: 'projectId' },
      { type: 'uint64', name: 'installedAcKw' },
      { type: 'address', name: 'treasury' },
      { type: 'uint64', name: 'platformKwBps' },
      { type: 'uint64', name: 'platformKwhRateBps' },
      { type: 'address', name: 'admin' },
    ],
    returns: { type: 'string' },
  })
  const setContractsMethod = new algosdk.ABIMethod({
    name: 'setContracts',
    args: [
      { type: 'address', name: 'kwToken' },
      { type: 'address', name: 'kwhReceipt' },
      { type: 'address', name: 'revenueVault' },
    ],
    returns: { type: 'string' },
  })
  const markFCMethod = new algosdk.ABIMethod({ name: 'markFCFinalised', args: [], returns: { type: 'string' } })
  const transMethod  = new algosdk.ABIMethod({ name: 'transitionState', args: [{ type: 'uint64', name: 'newState' }], returns: { type: 'string' } })

  // ─── PROTIUS-001: state 1 (REGISTERED / staking open) ────────────────────
  const appId1 = await deployContract(account, 'PROTIUS-001')

  console.log('\nInitialising PROTIUS-001...')
  await callMethod(appId1, initMethod, [new Uint8Array(Buffer.from('PROTIUS-001')), 1000, addr, 200, 100, addr], account)
  console.log('  init_registry OK')
  await callMethod(appId1, setContractsMethod, [addr, addr, addr], account)
  console.log('  setContracts OK')
  await callMethod(appId1, transMethod, [1], account)
  console.log('  transitionState(1) DRAFT→REGISTERED OK')
  // Leave at state 1 — staking open

  // ─── PROTIUS-002: state 2 (FUNDED / equity raise open) ───────────────────
  const appId2 = await deployContract(account, 'PROTIUS-002')

  console.log('\nInitialising PROTIUS-002...')
  await callMethod(appId2, initMethod, [new Uint8Array(Buffer.from('PROTIUS-002')), 500, addr, 200, 100, addr], account)
  console.log('  init_registry OK')
  await callMethod(appId2, setContractsMethod, [addr, addr, addr], account)
  console.log('  setContracts OK')
  await callMethod(appId2, transMethod, [1], account)
  console.log('  transitionState(1) DRAFT→REGISTERED OK')
  await callMethod(appId2, markFCMethod, [], account)
  console.log('  markFCFinalised OK')
  await callMethod(appId2, transMethod, [2], account)
  console.log('  transitionState(2) REGISTERED→FUNDED OK')
  // Leave at state 2 — equity raise open

  console.log('\n========================================')
  console.log(`PROTIUS-001 App ID : ${appId1}  (state 1 — REGISTERED / staking)`)
  console.log(`PROTIUS-002 App ID : ${appId2}  (state 2 — FUNDED / equity raise)`)
  console.log('========================================')
  console.log('\nUpdate these App IDs in:')
  console.log('  - lovable-export/src/lib/projects.ts  (registryAppId field)')
  console.log('  - web/src/OperatorConsole.tsx          (CONFIG.projectRegistryAppId)')
}

main().catch(e => console.error('ERROR:', e.message))
