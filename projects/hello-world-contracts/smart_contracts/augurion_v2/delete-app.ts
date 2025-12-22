import { AlgorandClient } from '@algorandfoundation/algokit-utils'

async function deleteApp() {
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const appId = 1120

  console.log(`Deleting app ${appId}...`)

  await algorand.send.appDelete({
    sender: deployer.addr,
    appId: BigInt(appId),
  })

  console.log(`✅ App ${appId} deleted!`)
}

deleteApp().catch(console.error)
