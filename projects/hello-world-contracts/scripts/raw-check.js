const https = require('https')

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

const STATE_LABELS = {0:'DRAFT',1:'REGISTERED',2:'FUNDED',3:'UNDER_CONSTRUCTION',4:'COMMISSIONING',5:'OPERATING',6:'SUSPENDED',7:'EXITED'}

async function check(appId, name) {
  const data = await get(`https://testnet-api.algonode.cloud/v2/applications/${appId}`)
  const gs = data.params['global-state'] || []
  console.log(`\n${name} (App ${appId}) — ${gs.length} keys`)
  for (const kv of gs) {
    const keyBuf = Buffer.from(kv.key, 'base64')
    const keyStr = keyBuf.toString('utf8')
    let val
    if (kv.value.type === 1) {
      val = Buffer.from(kv.value.bytes || '', 'base64').toString('hex')
    } else {
      val = kv.value.uint
    }
    console.log(`  "${keyStr}" = ${val}`)
  }
}

async function main() {
  await check(756428038, 'PROTIUS-001')
  await check(756428065, 'PROTIUS-002')
}
main().catch(e => console.error('ERR:', e.message))
