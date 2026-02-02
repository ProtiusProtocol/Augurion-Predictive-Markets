import * as algokit from '@algorandfoundation/algokit-utils'
import { PPAContractClient } from '../artifacts/ppa_contract/PPAContractClient'

export async function deployPPAContract() {
  const algod = algokit.getAlgoClient()
  const indexer = algokit.getAlgoIndexerClient()
  const deployer = await algokit.getAccount(
    { config: algokit.getAccountConfigFromEnvironment('DEPLOYER') },
    algod
  )

  console.log('Deploying PPA Contract...')
  console.log('Deployer:', deployer.addr)

  const appClient = new PPAContractClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0, // Will be set after creation
    },
    algod
  )

  // Deploy the contract
  const app = await appClient.create.create({})
  
  console.log('✅ PPA Contract deployed!')
  console.log('App ID:', app.appId)
  console.log('App Address:', app.appAddress)

  return {
    appId: app.appId,
    appAddress: app.appAddress,
    client: appClient,
  }
}

export async function initializePPAContract(
  appId: number,
  registryAddress: string,
  kwhReceiptAddress: string,
  treasuryAddress: string,
  settlementAssetId: number = 0 // 0 = ALGO
) {
  const algod = algokit.getAlgoClient()
  const deployer = await algokit.getAccount(
    { config: algokit.getAccountConfigFromEnvironment('DEPLOYER') },
    algod
  )

  const appClient = new PPAContractClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: appId,
    },
    algod
  )

  console.log('Initializing PPA Contract...')
  
  await appClient.initPpa({
    registry: registryAddress,
    kwhReceipt: kwhReceiptAddress,
    treasury: treasuryAddress,
    settlementAssetId,
  })

  console.log('✅ PPA Contract initialized!')
  console.log('Registry:', registryAddress)
  console.log('KWh Receipt:', kwhReceiptAddress)
  console.log('Treasury:', treasuryAddress)
  console.log('Settlement Asset:', settlementAssetId === 0 ? 'ALGO' : settlementAssetId)
}

// Example: Create a PPA agreement
export async function createPPAgreement(
  appId: number,
  buyerAddress: string,
  pricePerKWh: number, // micro-ALGOs per kWh
  startEpoch: number,
  endEpoch: number,
  minKWhPerEpoch: number = 0,
  maxKWhPerEpoch: number = 0
) {
  const algod = algokit.getAlgoClient()
  const admin = await algokit.getAccount(
    { config: algokit.getAccountConfigFromEnvironment('DEPLOYER') },
    algod
  )

  const appClient = new PPAContractClient(
    {
      sender: admin,
      resolveBy: 'id',
      id: appId,
    },
    algod
  )

  console.log('Creating PPA Agreement...')
  console.log('Buyer:', buyerAddress)
  console.log('Price per kWh:', pricePerKWh, 'micro-ALGOs')
  console.log('Epoch range:', startEpoch, '-', endEpoch)

  const result = await appClient.createAgreement({
    buyer: buyerAddress,
    pricePerKWh,
    startEpoch,
    endEpoch,
    minKWhPerEpoch,
    maxKWhPerEpoch,
  })

  const agreementId = result.return?.valueOf() as number
  console.log('✅ Agreement created! ID:', agreementId)

  return agreementId
}

// Example: Allocate production
export async function allocateProduction(
  appId: number,
  epochId: number,
  agreementId: number,
  kWhAmount: number,
  expectedTotalGeneration: number
) {
  const algod = algokit.getAlgoClient()
  const admin = await algokit.getAccount(
    { config: algokit.getAccountConfigFromEnvironment('DEPLOYER') },
    algod
  )

  const appClient = new PPAContractClient(
    {
      sender: admin,
      resolveBy: 'id',
      id: appId,
    },
    algod
  )

  console.log('Allocating production...')
  console.log('Epoch:', epochId)
  console.log('Agreement:', agreementId)
  console.log('kWh:', kWhAmount)

  await appClient.allocateProduction({
    epochId,
    agreementId,
    kWhAmount,
    expectedTotalGeneration,
  })

  console.log('✅ Production allocated!')
}

// Example: Settle payment (buyer side)
export async function settlePayment(
  appId: number,
  agreementId: number,
  epochId: number,
  treasuryAddress: string,
  paymentAmount: number
) {
  const algod = algokit.getAlgoClient()
  const buyer = await algokit.getAccount(
    { config: algokit.getAccountConfigFromEnvironment('BUYER') },
    algod
  )

  const appClient = new PPAContractClient(
    {
      sender: buyer,
      resolveBy: 'id',
      id: appId,
    },
    algod
  )

  console.log('Settling payment...')
  console.log('Agreement:', agreementId)
  console.log('Epoch:', epochId)
  console.log('Amount:', paymentAmount, 'micro-ALGOs')

  // Create atomic group:
  // 1. Payment transaction
  // 2. settlePayment call

  const suggestedParams = await algod.getTransactionParams().do()

  const paymentTxn = algokit.makePaymentTxnWithSuggestedParamsFromObject({
    from: buyer.addr,
    to: treasuryAddress,
    amount: algokit.microAlgos(paymentAmount),
    suggestedParams,
  })

  // Group transactions
  const group = algokit.assignGroupID([
    paymentTxn,
    // Settlement call will be added by appClient
  ])

  // Sign payment
  const signedPayment = paymentTxn.signTxn(buyer.sk)

  // Call settlement with grouped payment
  await appClient.settlePayment(
    {
      agreementId,
      epochId,
    },
    {
      sendParams: {
        fee: algokit.microAlgos(2000), // Cover both txns
      },
    }
  )

  console.log('✅ Payment settled!')
}

// Main deployment script
if (require.main === module) {
  ;(async () => {
    try {
      const deployment = await deployPPAContract()
      
      // Save deployment info
      console.log('\nDeployment complete! Save these values:')
      console.log('PPA_APP_ID=' + deployment.appId)
      console.log('PPA_APP_ADDRESS=' + deployment.appAddress)
      
    } catch (error) {
      console.error('❌ Deployment failed:', error)
      process.exit(1)
    }
  })()
}
