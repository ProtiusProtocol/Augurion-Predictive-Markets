/**
 * Deploy ProtiusStaking contract to TestNet.
 *
 * Uses the pre-compiled TEAL from the Algorand-dApp-Quick-Start-Template.
 * After deployment, calls init(developer, fundingGoal, minimumGoal, stakingPeriodSeconds).
 *
 * Run from hello-world-contracts/:
 *   node scripts/deploy-staking.js
 */

import algosdk from 'algosdk'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Config ────────────────────────────────────────────────────────────────

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud'
const ALGOD_PORT = ''
const ALGOD_TOKEN = ''

// Equity wallet = admin / developer for the staking contract
const EQUITY_MNEMONIC =
  'solar funny mass kiss film argue journey enroll income caution jewel artist escape brother rebuild model dinosaur talk cave survey address type air able shy'

// Staking pool params
const FUNDING_GOAL_MICROALGO = 200_000_000_000  // 200,000 ALGO worth of commitments
const MINIMUM_GOAL_MICROALGO  = 10_000_000_000  // 10,000 ALGO minimum
const STAKING_PERIOD_SECONDS  = 157_680_000     // 5 years (keeps staking open)

// Path to compiled TEAL artifacts (from QuickStart template)
const ARTIFACTS_DIR = path.resolve(
  __dirname,
  '..', '..', '..', '..',  // up to Protius/
  'Algorand-dApp-Quick-Start-Template-TypeScript',
  'QuickStartTemplate',
  'projects',
  'QuickStartTemplate-contracts',
  'smart_contracts',
  'artifacts',
  'protius_staking',
)

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT)

  // Restore equity wallet
  const account = algosdk.mnemonicToSecretKey(EQUITY_MNEMONIC)
  console.log('Deployer:', account.addr)

  // ── 1. Load TEAL ──────────────────────────────────────────────────────────
  const approvalTeal = fs.readFileSync(
    path.join(ARTIFACTS_DIR, 'ProtiusStaking.approval.teal'),
    'utf8',
  )
  const clearTeal = fs.readFileSync(
    path.join(ARTIFACTS_DIR, 'ProtiusStaking.clear.teal'),
    'utf8',
  )

  // Compile TEAL
  const approvalCompile = await algod.compile(approvalTeal).do()
  const clearCompile    = await algod.compile(clearTeal).do()

  const approvalProgram = new Uint8Array(Buffer.from(approvalCompile.result, 'base64'))
  const clearProgram    = new Uint8Array(Buffer.from(clearCompile.result, 'base64'))

  // ── 2. Create application ─────────────────────────────────────────────────
  // Global state: 7 uints + 1 byte slice (developer address)
  // Local state : 2 uints
  const params = await algod.getTransactionParams().do()

  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    from: account.addr,
    suggestedParams: params,
    approvalProgram,
    clearProgram,
    numGlobalByteSlices: 1,  // developer (Account)
    numGlobalInts: 7,        // fundingGoal, minimumGoal, stakingDeadline, totalStaked, isFunded, financialCloseReached, premiumPool
    numLocalByteSlices: 0,
    numLocalInts: 2,         // stakeAmount, hasWithdrawn
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  })

  const signedCreate = createTxn.signTxn(account.sk)
  const { txId: createTxId } = await algod.sendRawTransaction(signedCreate).do()
  console.log('Create txn:', createTxId)

  const createResult = await algosdk.waitForConfirmation(algod, createTxId, 4)
  const appId = Number(createResult['application-index'])
  console.log('✅ ProtiusStaking deployed! App ID:', appId)

  // Fund the app for min balance
  const params2 = await algod.getTransactionParams().do()
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: account.addr,
    to: algosdk.getApplicationAddress(appId),
    amount: 200_000,  // 0.2 ALGO for min balance
    suggestedParams: params2,
  })
  const signedFund = fundTxn.signTxn(account.sk)
  const { txId: fundTxId } = await algod.sendRawTransaction(signedFund).do()
  await algosdk.waitForConfirmation(algod, fundTxId, 4)
  console.log('Funded app min balance:', fundTxId)

  // ── 3. Call init(developer, fundingGoal, minimumGoal, stakingPeriodSeconds) ─
  // ABI method selector: SHA-512/256 of "init(account,uint64,uint64,uint64)void"
  const abiContract = new algosdk.ABIContract({
    name: 'ProtiusStaking',
    methods: [
      {
        name: 'init',
        args: [
          { type: 'account', name: 'developer' },
          { type: 'uint64',  name: 'fundingGoal' },
          { type: 'uint64',  name: 'minimumGoal' },
          { type: 'uint64',  name: 'stakingPeriodSeconds' },
        ],
        returns: { type: 'void' },
      },
    ],
    desc: '',
  })

  const params3 = await algod.getTransactionParams().do()
  const atc = new algosdk.AtomicTransactionComposer()

  atc.addMethodCall({
    appID: appId,
    method: abiContract.getMethodByName('init'),
    methodArgs: [
      account.addr,              // developer (account type → address in accounts[])
      FUNDING_GOAL_MICROALGO,
      MINIMUM_GOAL_MICROALGO,
      STAKING_PERIOD_SECONDS,
    ],
    sender: account.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(account),
    suggestedParams: params3,
  })

  const result = await atc.execute(algod, 4)
  console.log('✅ init() called. Txn:', result.txIDs[0])

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════')
  console.log('ProtiusStaking App ID :', appId)
  console.log('App Address           :', algosdk.getApplicationAddress(appId))
  console.log('AlgoExplorer          :', `https://testnet.algoexplorer.io/application/${appId}`)
  console.log('Funding Goal          :', FUNDING_GOAL_MICROALGO / 1_000_000, 'ALGO')
  console.log('Minimum Goal          :', MINIMUM_GOAL_MICROALGO  / 1_000_000, 'ALGO')
  console.log('Staking open for      : 5 years')
  console.log('══════════════════════════════════════════')
  console.log('\nNext: update stakingAppId in Lovable src/lib/projects.ts to', appId)
}

main().catch(err => {
  console.error('❌ Deploy failed:', err.message || err)
  process.exit(1)
})
