const algosdk = require('algosdk')
const ALGOD = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')

async function dumpState(appId, name) {
  const info = await ALGOD.getApplicationByID(appId).do()
  const gs = info.params['global-state'] || []
  console.log(`\n=== ${name} (App ${appId}) — ${gs.length} keys ===`)
  for (const kv of gs) {
    const keyBuf = Buffer.from(kv.key, 'base64')
    const keyStr = keyBuf.toString('utf8')
    const keyHex = keyBuf.toString('hex')
    let val
    if (kv.value.type === 1) {
      const vBuf = Buffer.from(kv.value.bytes, 'base64')
      try { val = algosdk.encodeAddress(vBuf) + ' (addr)' } catch { val = vBuf.toString('utf8') + ' (str)' }
    } else {
      val = kv.value.uint + ' (uint)'
    }
    console.log(`  [${keyHex}] "${keyStr}" = ${val}`)
  }
}

async function main() {
  await dumpState(756428038, 'PROTIUS-001')
  await dumpState(756428065, 'PROTIUS-002')
}
main().catch(e => console.error('ERR:', e.message))
