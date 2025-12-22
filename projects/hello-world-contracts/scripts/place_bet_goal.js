// Helper to place a YES/NO bet using goal inside the sandbox container.
// Requires the sender account to exist in the `unencrypted-default-wallet` inside the sandbox (EOHI... does).
// Usage examples (PowerShell):
//   node scripts/place_bet_goal.js --app 1120 --sender EOHIS7... --side yes --algo 1
//   node scripts/place_bet_goal.js --app 1120 --sender EOHIS7... --side no --microalgos 500000

const { execSync } = require('child_process')
const algosdk = require('algosdk')

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { app: null, sender: null, side: 'yes', microalgos: null, algo: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--app') out.app = parseInt(args[++i], 10)
    else if (a === '--sender') out.sender = args[++i]
    else if (a === '--side') out.side = args[++i].toLowerCase()
    else if (a === '--microalgos') out.microalgos = BigInt(args[++i])
    else if (a === '--algo') out.algo = Number(args[++i])
  }
  if (!out.app) throw new Error('Missing --app')
  if (!out.sender) throw new Error('Missing --sender')
  if (out.algo != null && out.microalgos == null) out.microalgos = BigInt(Math.round(out.algo * 1_000_000))
  if (out.microalgos == null) throw new Error('Provide --microalgos or --algo')
  if (out.side !== 'yes' && out.side !== 'no') throw new Error('--side must be yes|no')
  return out
}

function getMethodSelector(name) {
  const method = new algosdk.ABIMethod({ name, args: [{ type: 'uint64' }], returns: { type: 'string' } })
  const sel = method.getSelector()
  return Buffer.from(sel).toString('base64')
}

function boxNameBase64(prefix, addr) {
  const dec = algosdk.decodeAddress(addr)
  const buf = Buffer.concat([Buffer.from(prefix, 'utf8'), Buffer.from(':'), Buffer.from(dec.publicKey)])
  return buf.toString('base64')
}

function run(cmd) {
  // Display a short log for visibility
  // console.log('> ', cmd)
  return execSync(cmd, { stdio: 'pipe' }).toString()
}

function main() {
  const { app, sender, side, microalgos } = parseArgs()
  const appAddr = algosdk.getApplicationAddress(app)

  const selectorB64 = side === 'yes'
    ? getMethodSelector('bet_yes')
    : getMethodSelector('bet_no')

  const boxB64 = boxNameBase64(side, sender)

  // 1) Build Payment txn: sender -> appAddr for microalgos
  run(`docker exec algokit_sandbox_algod goal clerk send -a ${microalgos} -f ${sender} -t ${algosdk.encodeAddress(appAddr.publicKey)} -o /tmp/pay.txn -w unencrypted-default-wallet`)

  // 2) Build AppCall txn with selector + uint64 arg + box + extra fee
  run(`docker exec algokit_sandbox_algod goal app call --app-id ${app} --from ${sender} --app-arg "b64:${selectorB64}" --app-arg "int:${microalgos}" --box "b64:${boxB64}" --fee 2000 -o /tmp/app.txn -w unencrypted-default-wallet`)

  // 3) Concatenate and group to preserve order [Payment, AppCall]
  run(`docker exec algokit_sandbox_algod sh -c "cat /tmp/pay.txn /tmp/app.txn > /tmp/two.txn && goal clerk group -i /tmp/two.txn -o /tmp/group.txn"`)

  // 4) Sign and send
  run(`docker exec algokit_sandbox_algod goal clerk sign -i /tmp/group.txn -o /tmp/group.stxn -w unencrypted-default-wallet`)
  const out = run(`docker exec algokit_sandbox_algod goal clerk rawsend -f /tmp/group.stxn`)
  process.stdout.write(out)
}

try {
  main()
} catch (e) {
  console.error(e && e.message ? e.message : e)
  process.exit(1)
}
