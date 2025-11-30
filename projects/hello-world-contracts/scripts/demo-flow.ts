// Demo script (non-submitting) to build transactions for the flow:
// 1) bet_yes / bet_no (user places bet)
// 2) resolve_market (admin resolves market)
// 3) claim (user claims payout)
//
// This script constructs method call builder objects from the generated client
// so you can inspect the transaction parameters before submitting to algod.

// NOTE: This is a demonstration helper only. To actually submit the transactions
// you'll need to wire up `algosdk` or `algokit` with credentials and signing.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// Only import the ParamsFactory to build call parameters without creating an AppClient
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { AugurionMarketV2ParamsFactory } from '../smart_contracts/artifacts/augurion_v2/AugurionMarketV2Client'

async function main() {
  console.log('Demo: build bet -> resolve -> claim transaction calls')

  // Example placeholders (replace with real values when submitting):
    // Read configuration from environment variables to avoid editing the file.
    const appIdEnv = process.env.APP_ID || process.env.APPID || process.env.APP_ID_ENV
    if (!appIdEnv) {
      console.error('Missing APP_ID environment variable. Set APP_ID before running the demo.')
      process.exit(1)
    }
    const appId = Number(appIdEnv)
    if (Number.isNaN(appId)) {
      console.error('Invalid APP_ID environment variable; must be an integer.')
      process.exit(1)
    }

    const senderAddr = process.env.SENDER || process.env.SENDER_ADDR || process.env.SENDER_ADDRESS
    if (!senderAddr) {
      console.error('Missing SENDER environment variable. Set SENDER to the sender address.')
      process.exit(1)
    }

  // Create a client instance using the generated client factory.
  // The generated client expects an AppClient or network params; for demo we
  // only show method builders, so cast to any to avoid runtime dependency.
    // We purposely do NOT instantiate the generated client (it depends on
    // runtime AppClient). Instead use the ParamsFactory static methods below
    // to build call parameter objects without creating network clients.

  // 1) Build a bet_yes call (amount in microAlgos)
  const betAmount = 1_000_000 // 1 Algo in microAlgos
  const betYesCall = AugurionMarketV2ParamsFactory.betYes({ args: [betAmount] })
  console.log('\n=== bet_yes call builder ===')
  console.dir(betYesCall, { depth: 2 })

  // 2) Build a bet_no call
  const betNoCall = AugurionMarketV2ParamsFactory.betNo({ args: [betAmount] })
  console.log('\n=== bet_no call builder ===')
  console.dir(betNoCall, { depth: 2 })

  // 3) Build resolve_market admin call
  const winningSide = 1 // 1 = YES, 2 = NO
  const resolveCall = AugurionMarketV2ParamsFactory.resolveMarket({ args: [winningSide] })
  console.log('\n=== resolve_market call builder ===')
  console.dir(resolveCall, { depth: 2 })

  // 4) Build claim call for the user to claim payout
  const claimCall = AugurionMarketV2ParamsFactory.claim({ args: [] })
  console.log('\n=== claim call builder ===')
  console.dir(claimCall, { depth: 2 })

  console.log('\nNote: these builder objects show method names and arguments.')
  console.log('To actually submit, sign and send transactions to algod using algosdk or algokit.')
}

main().catch((err) => {
  console.error('Demo error:', err)
  process.exit(1)
})
