/**
 * Test Script: Token Transfer
 * 
 * Tests the transfer functionality post-Financial Close:
 * - Queries balance
 * - Executes transfer
 * - Verifies new balance
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { KwTokenClient } from './artifacts/kw_token/KWTokenClient'
import algosdk from 'algosdk'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.testnet' })

async function testTransfer() {
  console.log('🔄 Starting Transfer Test...\n')

  // Initialize Algorand client
  const algodClient = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud',
    process.env.ALGOD_PORT || 443
  )

  const algorand = AlgorandClient.fromClients({ algod: algodClient })

  // Load deployer account
  const sender = algosdk.mnemonicToSecretKey(process.env.DEPLOYER_MNEMONIC!)
  console.log(`✅ Sender: ${sender.addr}`)

  // For testing, create a recipient address (or use another test address)
  const recipient = algosdk.generateAccount()
  console.log(`✅ Recipient: ${recipient.addr}\n`)

  // Get KWToken client
  const kwTokenAppId = 756074167
  const kwToken = algorand.client.getTypedAppClientById(KwTokenClient, {
    id: kwTokenAppId,
    sender: sender,
  })

  // Check if transfers enabled
  console.log('📊 Checking transfer status...')
  const globalState = await kwToken.appClient.getGlobalState()
  const transfersEnabled = globalState.transfersEnabled?.asNumber() ?? 0
  
  if (transfersEnabled !== 1) {
    console.log('❌ Transfers not enabled yet!')
    console.log('   Run test-financial-close.ts first')
    return
  }
  console.log('✅ Transfers enabled\n')

  // Query sender balance
  console.log('💰 Checking sender balance...')
  try {
    const balanceResult = await kwToken.send.balanceOf({
      args: { account: sender.addr },
    })
    
    const senderBalance = balanceResult.return?.valueOf() as bigint
    console.log(`   Sender balance: ${senderBalance.toString()} kW\n`)

    if (senderBalance === 0n) {
      console.log('❌ Sender has no tokens to transfer!')
      return
    }

    // Execute transfer
    const transferAmount = 50_000n // Transfer 50k kW
    console.log(`🚀 Executing transfer...`)
    console.log(`   Amount: ${transferAmount} kW`)
    console.log(`   To: ${recipient.addr}\n`)

    const transferResult = await kwToken.send.transfer({
      args: {
        to: recipient.addr,
        amount: transferAmount,
      },
    })

    console.log('✅ Transfer successful!')
    console.log(`   Transaction ID: ${transferResult.transaction.txID()}`)
    console.log(`   Explorer: https://testnet.explorer.perawallet.app/tx/${transferResult.transaction.txID()}\n`)

    // Verify new balances
    console.log('📊 Verifying new balances...')
    
    const newSenderBalance = await kwToken.send.balanceOf({
      args: { account: sender.addr },
    })
    
    const newRecipientBalance = await kwToken.send.balanceOf({
      args: { account: recipient.addr },
    })

    console.log(`   Sender new balance: ${newSenderBalance.return?.valueOf()} kW`)
    console.log(`   Recipient balance: ${newRecipientBalance.return?.valueOf()} kW\n`)

    console.log('🎉 Transfer test complete!')
    console.log('   Check TestNet explorer for transaction details')

  } catch (error: any) {
    console.error('❌ Error during transfer test:', error.message)
    throw error
  }
}

// Run
testTransfer()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
