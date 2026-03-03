/**
 * Finishes initialization of PROTIUS-002 (already deployed at App ID 756428065)
 * and advances it to state 2 (FUNDED / equity raise open).
 * Run AFTER topping up the equity wallet with testnet ALGO.
 */
const algosdk = require('algosdk')

const ALGOD = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
const MNEMONIC = 'solar funny mass kiss film argue journey enroll income caution jewel artist escape brother rebuild model dinosaur talk cave survey address type air able shy'

const APP_ID_001 = 756428038  // PROTIUS-001 — already at state 1, no action needed
const APP_ID_002 = 756428065  // PROTIUS-002 — needs funding + init + transitions

async function callMethod(appId, method, methodArgs, account, label) {
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
  console.log(`  ${label} OK →`, r.methodResults[0].returnValue)
  return r
}

async function main() {
  const account = algosdk.mnemonicToSecretKey(MNEMONIC)
  const addr = account.addr.toString()
  const info = await ALGOD.accountInformation(addr).do()
  console.log('Deployer:', addr)
  console.log('Balance:', Number(info.amount) / 1e6, 'ALGO')

  if (Number(info.amount) < 2_000_000) {
    console.error('ERROR: Balance too low. Please top up at https://bank.testnet.algorand.network/')
    process.exit(1)
  }

  // Fund PROTIUS-002 app account with 0.3 ALGO for min balance
  console.log('\nFunding PROTIUS-002 app account...')
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: addr,
    receiver: algosdk.getApplicationAddress(APP_ID_002),
    amount: 300_000, // 0.3 ALGO
    suggestedParams: await ALGOD.getTransactionParams().do(),
  })
  const signedFund = fundTxn.signTxn(account.sk)
  const fundRes = await ALGOD.sendRawTransaction(signedFund).do()
  await algosdk.waitForConfirmation(ALGOD, fundRes.txid || fundRes.txId, 8)
  console.log('  Funded OK')

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

  console.log('\nInitialising PROTIUS-002...')
  await callMethod(APP_ID_002, initMethod, [new Uint8Array(Buffer.from('PROTIUS-002')), 500, addr, 200, 100, addr], account, 'init_registry')
  await callMethod(APP_ID_002, setContractsMethod, [addr, addr, addr], account, 'setContracts')
  await callMethod(APP_ID_002, transMethod, [1], account, 'transitionState(1) DRAFT→REGISTERED')
  await callMethod(APP_ID_002, markFCMethod, [], account, 'markFCFinalised')
  await callMethod(APP_ID_002, transMethod, [2], account, 'transitionState(2) REGISTERED→FUNDED')

  console.log('\n========================================')
  console.log(`PROTIUS-001 App ID : ${APP_ID_001}  (state 1 — REGISTERED / staking open)`)
  console.log(`PROTIUS-002 App ID : ${APP_ID_002}  (state 2 — FUNDED / equity raise open)`)
  console.log('========================================')
  console.log('\nNext: update lovable-export/src/lib/projects.ts with these App IDs')
}

main().catch(e => console.error('ERROR:', e.message))
