import { AlgorandClient } from '@algorandfoundation/algokit-utils'

/**
 * Diagnostic script to check app state and identify the double-bet bug
 */
async function diagnose() {
  const appId = 1120

  console.log(`=== Diagnosing App ID ${appId} ===\n`)

  const algorand = AlgorandClient.fromEnvironment()
  const appClient = await algorand.client.getAppById({ id: BigInt(appId) })

  console.log('Global State:')
  for (const [key, value] of Object.entries(appClient.globalState || {})) {
    console.log(`  ${key}: ${value}`)
  }

  console.log('\n--- Analysis ---')
  const yesTotal = appClient.globalState?.['yesTotal']?.valueRaw as bigint | undefined
  const noTotal = appClient.globalState?.['noTotal']?.valueRaw as bigint | undefined
  const totalBets = appClient.globalState?.['totalBets']?.valueRaw as bigint | undefined

  if (yesTotal !== undefined && noTotal !== undefined && totalBets !== undefined) {
    console.log(`\nyesTotal: ${yesTotal}`)
    console.log(`noTotal: ${noTotal}`)
    console.log(`totalBets: ${totalBets}`)
    console.log(`Sum (yesTotal + noTotal): ${yesTotal + noTotal}`)

    if (totalBets === yesTotal + noTotal) {
      console.log('\n✅ totalBets matches sum of yesTotal + noTotal')
    } else {
      console.log(`\n❌ totalBets does NOT match sum (expected ${yesTotal + noTotal}, got ${totalBets})`)
    }

    // Check for doubling
    console.log('\n--- Doubling Check ---')
    console.log('If you bet 1M YES and 1M NO:')
    console.log(`  Expected: yesTotal=1M (1000000), noTotal=1M (1000000), total=2M`)
    console.log(`  Actual:   yesTotal=${yesTotal}, noTotal=${noTotal}, total=${yesTotal + noTotal}`)

    if (yesTotal === 2000000n && noTotal === 2000000n) {
      console.log('\n🐛 CONFIRMED: Double-bet bug detected!')
      console.log('   Each 1M bet is being recorded as 2M')
    } else if (yesTotal === 1000000n && noTotal === 1000000n) {
      console.log('\n✅ No doubling detected - values are correct')
    }
  }

  console.log('\n--- Possible Causes ---')
  console.log('1. Wrong contract version deployed (V2/V3 instead of V4)')
  console.log('2. Multiple bet calls in a loop')
  console.log('3. Box initialization bug')
  console.log('4. Frontend submitting transactions twice')

  console.log('\n--- Recommended Actions ---')
  console.log('1. Check contract approval program hash to verify version')
  console.log('2. Review transaction history for this app')
  console.log('3. Deploy fresh V4 contract with fix')
  console.log('4. Test with small bet amounts first')
}

diagnose().catch(console.error)
