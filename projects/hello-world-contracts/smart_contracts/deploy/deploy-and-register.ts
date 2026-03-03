/**
 * deploy-and-register.ts
 *
 * All-in-one script: deploys all 4 Protius contracts for a new project
 * and immediately calls init_registry to write the project on-chain.
 *
 * Usage:
 *   npm run deploy:project -- path/to/project-config.json
 *
 * The JSON file is exported from the Operator Console "⬇️ Export Config" button.
 * It must contain:
 *   {
 *     "submissionId": "...",
 *     "displayName": "Drombeg1",
 *     "installedAcKw": 63500,
 *     "platformKwBps": 500,
 *     "platformKwhRateBps": 100,
 *     "treasuryAddress": "" | "ALGO_ADDRESS"
 *   }
 *
 * Requirements:
 *   - .env.testnet (or .env) with DEPLOYER_MNEMONIC, ALGOD_SERVER, ALGOD_PORT
 *   - Deployer account funded with ~40 ALGO (10 ALGO per contract)
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { ProjectRegistryFactory } from '../artifacts/project_registry/ProjectRegistryClient'
import { KwTokenFactory } from '../artifacts/kw_token/KWTokenClient'
import { KWhReceiptFactory } from '../artifacts/kwh_receipt/KWhReceiptClient'
import { RevenueVaultFactory } from '../artifacts/revenue_vault/RevenueVaultClient'
import algosdk from 'algosdk'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load .env.testnet if it exists, otherwise .env
const envFile = fs.existsSync(path.resolve('.env.testnet')) ? '.env.testnet' : '.env'
dotenv.config({ path: path.resolve(envFile) })
console.log(`Using env: ${envFile}`)

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectConfig {
  submissionId?: string
  displayName: string
  installedAcKw: number
  platformKwBps: number
  platformKwhRateBps: number
  treasuryAddress?: string
  energyType?: string
  location?: string
}

interface DeployResult {
  projectName: string
  registryAppId: number
  kwTokenAppId: number
  kwhReceiptAppId: number
  revenueVaultAppId: number
  initRegistryTxId: string
  deployedAt: string
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const configPath = process.argv[2]
  if (!configPath) {
    console.error('Usage: npm run deploy:project -- <path-to-project-config.json>')
    console.error('Example: npm run deploy:project -- drombeg1-deploy-config.json')
    process.exit(1)
  }

  const absPath = path.resolve(configPath)
  if (!fs.existsSync(absPath)) {
    console.error(`Config file not found: ${absPath}`)
    process.exit(1)
  }

  const config: ProjectConfig = JSON.parse(fs.readFileSync(absPath, 'utf-8'))
  console.log()
  console.log('=== Protius Deploy & Register ===')
  console.log(`Project:    ${config.displayName}`)
  console.log(`Capacity:   ${config.installedAcKw} kW`)
  console.log(`kW Fee:     ${config.platformKwBps} BPS (${(config.platformKwBps / 100).toFixed(2)}%)`)
  console.log(`kWh Rate:   ${config.platformKwhRateBps} BPS (${(config.platformKwhRateBps / 100).toFixed(2)}%)`)
  console.log(`Treasury:   ${config.treasuryAddress || '(deployer account)'}`)
  console.log()

  // ── Connect ────────────────────────────────────────────────────────────────
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment()
  console.log(`Deployer:   ${deployer.addr}`)
  console.log()

  const result: Partial<DeployResult> = { projectName: config.displayName }

  // ── 1. ProjectRegistry ─────────────────────────────────────────────────────
  console.log('[1/4] Deploying ProjectRegistry...')
  const registryFactory = algorand.client.getTypedAppFactory(ProjectRegistryFactory, {
    defaultSender: deployer.addr,
  })
  const { appClient: registryClient, result: registryOp } = await registryFactory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })
  if (['create', 'replace'].includes(registryOp.operationPerformed)) {
    await algorand.send.payment({
      amount: (5).algo(),
      sender: deployer.addr,
      receiver: registryClient.appAddress,
    })
    console.log('  Funded with 5 ALGO')
  }
  result.registryAppId = Number(registryClient.appId)
  console.log(`✅ ProjectRegistry App ID: ${result.registryAppId}`)
  console.log()

  // ── 2. KWToken ─────────────────────────────────────────────────────────────
  console.log('[2/4] Deploying KWToken...')
  const kwTokenFactory = algorand.client.getTypedAppFactory(KwTokenFactory, {
    defaultSender: deployer.addr,
  })
  const { appClient: kwTokenClient, result: kwTokenOp } = await kwTokenFactory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })
  if (['create', 'replace'].includes(kwTokenOp.operationPerformed)) {
    await algorand.send.payment({
      amount: (10).algo(),
      sender: deployer.addr,
      receiver: kwTokenClient.appAddress,
    })
    console.log('  Funded with 10 ALGO')
  }
  result.kwTokenAppId = Number(kwTokenClient.appId)
  console.log(`✅ KWToken App ID: ${result.kwTokenAppId}`)
  console.log()

  // ── 3. KWhReceipt ──────────────────────────────────────────────────────────
  console.log('[3/4] Deploying KWhReceipt...')
  const kwhReceiptFactory = algorand.client.getTypedAppFactory(KWhReceiptFactory, {
    defaultSender: deployer.addr,
  })
  const { appClient: kwhReceiptClient, result: kwhReceiptOp } = await kwhReceiptFactory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })
  if (['create', 'replace'].includes(kwhReceiptOp.operationPerformed)) {
    await algorand.send.payment({
      amount: (10).algo(),
      sender: deployer.addr,
      receiver: kwhReceiptClient.appAddress,
    })
    console.log('  Funded with 10 ALGO')
  }
  result.kwhReceiptAppId = Number(kwhReceiptClient.appId)
  console.log(`✅ KWhReceipt App ID: ${result.kwhReceiptAppId}`)
  console.log()

  // ── 4. RevenueVault ────────────────────────────────────────────────────────
  console.log('[4/4] Deploying RevenueVault...')
  const vaultFactory = algorand.client.getTypedAppFactory(RevenueVaultFactory, {
    defaultSender: deployer.addr,
  })
  const { appClient: vaultClient, result: vaultOp } = await vaultFactory.deploy({
    onUpdate: 'replace',
    onSchemaBreak: 'replace',
  })
  if (['create', 'replace'].includes(vaultOp.operationPerformed)) {
    await algorand.send.payment({
      amount: (10).algo(),
      sender: deployer.addr,
      receiver: vaultClient.appAddress,
    })
    console.log('  Funded with 10 ALGO')
  }
  result.revenueVaultAppId = Number(vaultClient.appId)
  console.log(`✅ RevenueVault App ID: ${result.revenueVaultAppId}`)
  console.log()

  // ── 5. Call init_registry ──────────────────────────────────────────────────
  console.log('[5/5] Calling init_registry on ProjectRegistry...')

  const mnemonic = process.env.DEPLOYER_MNEMONIC!
  const adminAccount = algosdk.mnemonicToSecretKey(mnemonic)

  const algodServer = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud'
  const algodPort = process.env.ALGOD_PORT || '443'
  const algodClient = new algosdk.Algodv2('', algodServer, algodPort)

  const sp = await algodClient.getTransactionParams().do()

  // ARC-4 selector: SHA-512/256("init_registry(byte[],uint64,address,uint64,uint64,address)string")[0:4]
  const selector = new Uint8Array([0x2b, 0xce, 0x98, 0xeb])

  // ARC-4 byte[]: 2-byte big-endian length + UTF-8 bytes
  const idBytes = new TextEncoder().encode(config.displayName)
  const idLen = new Uint8Array(2)
  new DataView(idLen.buffer).setUint16(0, idBytes.length)
  const idArg = new Uint8Array([...idLen, ...idBytes])

  // uint64 args
  const kw = new Uint8Array(8)
  new DataView(kw.buffer).setBigUint64(0, BigInt(Math.round(config.installedAcKw)))

  const kwBps = new Uint8Array(8)
  new DataView(kwBps.buffer).setBigUint64(0, BigInt(config.platformKwBps))

  const kwhBps = new Uint8Array(8)
  new DataView(kwhBps.buffer).setBigUint64(0, BigInt(config.platformKwhRateBps))

  // Address args encoded as 1-byte index into accounts array
  const treasuryAddr = config.treasuryAddress && algosdk.isValidAddress(config.treasuryAddress)
    ? config.treasuryAddress
    : adminAccount.addr.toString()

  const txn = algosdk.makeApplicationCallTxnFromObject({
    sender: adminAccount.addr,
    suggestedParams: sp,
    appIndex: result.registryAppId!,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    appArgs: [selector, idArg, kw, new Uint8Array([1]), kwBps, kwhBps, new Uint8Array([2])],
    accounts: [treasuryAddr, adminAccount.addr.toString()],
  })

  const signed = txn.signTxn(adminAccount.sk)
  const sendResult = await algodClient.sendRawTransaction(signed).do()
  const txId = (sendResult as any).txid || (sendResult as any).txId
  await algosdk.waitForConfirmation(algodClient, txId, 8)

  result.initRegistryTxId = txId
  result.deployedAt = new Date().toISOString()

  console.log(`✅ init_registry confirmed: ${txId}`)
  console.log()

  // ── Summary ────────────────────────────────────────────────────────────────
  const final = result as DeployResult
  console.log('════════════════════════════════════════')
  console.log('  DEPLOYMENT COMPLETE')
  console.log('════════════════════════════════════════')
  console.log(`  Project:        ${final.projectName}`)
  console.log(`  ProjectRegistry: ${final.registryAppId}`)
  console.log(`  KWToken:         ${final.kwTokenAppId}`)
  console.log(`  KWhReceipt:      ${final.kwhReceiptAppId}`)
  console.log(`  RevenueVault:    ${final.revenueVaultAppId}`)
  console.log(`  init_registry:   ${final.initRegistryTxId}`)
  console.log('════════════════════════════════════════')
  console.log()

  // ── Write result JSON ──────────────────────────────────────────────────────
  const resultPath = configPath.replace('.json', '-deployed.json').replace('-deploy-config', '')
  const resultJson = {
    ...final,
    submissionId: config.submissionId,
    energyType: config.energyType,
    location: config.location,
    installedAcKw: config.installedAcKw,
    platformKwBps: config.platformKwBps,
    platformKwhRateBps: config.platformKwhRateBps,
    treasuryAddress: treasuryAddr,
  }
  fs.writeFileSync(resultPath, JSON.stringify(resultJson, null, 2))
  console.log(`Result saved to: ${path.resolve(resultPath)}`)
  console.log()
  console.log('The project is now live on-chain. Refresh the Operator Console to see it in the project dropdown.')
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
