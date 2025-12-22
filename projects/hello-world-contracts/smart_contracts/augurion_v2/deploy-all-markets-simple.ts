import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AugurionMarketV4Factory } from '../artifacts/augurion_v2/AugurionMarketV4Client'
import { SOUTHERN_AFRICA_MARKETS, updateExpiryRounds, type MarketConfig } from './markets-data'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Deployed market registry entry
 */
interface DeployedMarket extends MarketConfig {
  appId: bigint
  appAddress: string
  deployedAt: string
  deployedBy: string
  txId: string
}

/**
 * Markets registry structure
 */
interface MarketsRegistry {
  version: string
  deployedAt: string
  network: string
  markets: DeployedMarket[]
}

/**
 * Deploy all 9 Southern Africa markets
 */
async function deployAllMarkets() {
  console.log('🚀 Deploying Augurion v1 — Southern Africa Launch Markets\n')

  // Initialize Algorand client for LocalNet
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  console.log(`📍 Deployer: ${deployer.addr}`)
  const accountInfo = await algorand.client.algod.accountInformation(deployer.addr).do()
  console.log(`💰 Balance: ${accountInfo.amount} microALGOs\n`)

  // Get current round for expiry calculation
  const status = await algorand.client.algod.status().do()
  const currentRound = Number(status.lastRound)
  console.log(`⛓️  Current Round: ${currentRound}\n`)

  // Update markets with calculated expiry rounds
  const marketsToDeploy = updateExpiryRounds(currentRound)

  // Initialize factory
  const factory = algorand.client.getTypedAppFactory(AugurionMarketV4Factory, {
    defaultSender: deployer.addr,
  })

  const deployedMarkets: DeployedMarket[] = []
  const FUNDING_AMOUNT = 10_000_000 // 10 ALGO per contract

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Deploy each market
  for (const market of marketsToDeploy) {
    console.log(`📦 Deploying ${market.id}: ${market.title}`)
    console.log(`   Market Ref: ${market.marketRef}`)
    console.log(`   Question: ${market.description}`)
    console.log(`   Expires: ${market.expiryDate} (Round ${market.expiryRound})`)

    try {
      // Deploy a NEW contract instance for this market with unique name
      const { appClient, result } = await factory.deploy({
        onSchemaBreak: 'append',
        onUpdate: 'append',
        name: `AugurionMarketV4-${market.id}`, // Unique name per market
      })

      const appId = appClient.appId
      const appAddress = appClient.appClient.appAddress

      console.log(`   ✅ Deployed! App ID: ${appId}`)
      console.log(`   📍 App Address: ${appAddress}`)

      // Fund the app account
      console.log(`   💰 Funding app with ${FUNDING_AMOUNT / 1_000_000} ALGO...`)
      await algorand.send.payment({
        sender: deployer.addr,
        receiver: appAddress,
        amount: (10_000_000).microAlgo(),
      })
      console.log(`   ✅ Funded!`)

      // Configure the market with SHORT on-chain reference
      console.log(`   ⚙️  Configuring market with ref: ${market.marketRef}`)
      const configResult = await appClient.send.configureMarket({
        args: [
          new Uint8Array(Buffer.from(market.marketRef, 'utf-8')), // SHORT REF
          market.expiryRound,
          market.feeBps,
        ],
      })

      console.log(`   ✅ Configured! TxID: ${configResult.transaction.txID()}`)

      // Open the market
      console.log(`   🔓 Opening market...`)
      const openResult = await appClient.send.openMarket({
        args: [],
      })

      console.log(`   ✅ Market OPEN! TxID: ${openResult.transaction.txID()}`)
      console.log(`   🎯 Status: LIVE and accepting bets\n`)

      // Record deployment - use the deploy txID or first config txID
      const deployTxId = result.transaction?.txID() || configResult.transaction.txID()
      deployedMarkets.push({
        ...market,
        appId,
        appAddress,
        deployedAt: new Date().toISOString(),
        deployedBy: deployer.addr,
        txId: deployTxId,
      })

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    } catch (error) {
      console.error(`   ❌ Failed to deploy ${market.id}:`, error)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    }
  }

  // Create registry
  const registry: MarketsRegistry = {
    version: '1.0',
    deployedAt: new Date().toISOString(),
    network: 'localnet',
    markets: deployedMarkets,
  }

  // Save registry to file
  const registryPath = path.join(__dirname, 'markets-registry.json')
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2))

  console.log('\n✨ DEPLOYMENT COMPLETE!\n')
  console.log(`📊 Summary:`)
  console.log(`   • Total Markets: ${deployedMarkets.length}`)
  console.log(`   • Economic Markets: ${deployedMarkets.filter(m => m.category === 'economic').length}`)
  console.log(`   • Sport Markets: ${deployedMarkets.filter(m => m.category === 'sport').length}`)
  console.log(`   • Registry saved: ${registryPath}\n`)

  // Display App IDs
  console.log('📋 Deployed App IDs:')
  deployedMarkets.forEach(market => {
    console.log(`   ${market.id}: ${market.appId} - ${market.title}`)
  })

  console.log('\n🎉 All markets are LIVE and ready for trading!')
}

// Run deployment
deployAllMarkets().catch((error) => {
  console.error('❌ Deployment failed:', error)
  process.exit(1)
})
