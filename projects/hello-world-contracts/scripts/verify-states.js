const algosdk = require('algosdk')
const ALGOD = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')

const STATE_LABELS = {0:'DRAFT',1:'REGISTERED',2:'FUNDED',3:'UNDER_CONSTRUCTION',4:'COMMISSIONING',5:'OPERATING',6:'SUSPENDED',7:'EXITED'}

async function check(appId, name) {
  const info = await ALGOD.getApplicationByID(appId).do()
  const gs = info.params['global-state'] || []
  for (const kv of gs) {
    const k = Buffer.from(kv.key, 'base64').toString('utf8')
    if (k === 'projectState') {
      const s = Number(kv.value.uint)
      console.log(`${name} (App ${appId}): projectState = ${s} — ${STATE_LABELS[s]}`)
      return
    }
  }
  console.log(`${name} (App ${appId}): projectState key not found`)
}

async function main() {
  await check(756428038, 'PROTIUS-001')
  await check(756428065, 'PROTIUS-002')
}
main().catch(e => console.error('ERR:', e.message))
