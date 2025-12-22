// Compose a [Payment, AppCall] group to call bet_yes(amount)
// Usage (PowerShell):
//   $env:ALGOD_TOKEN='a'; node scripts/place_bet_yes.js --app 1120 --microalgos 1000000
// Or in ALGO units:
//   node scripts/place_bet_yes.js --app 1120 --algo 1

const fs = require('fs');
const path = require('path');
const algosdk = require('algosdk');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { appId: null, microalgos: null, algo: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--app' || a === '-a') { out.appId = parseInt(args[++i], 10); }
    else if (a === '--microalgos' || a === '--micro') { out.microalgos = BigInt(args[++i]); }
    else if (a === '--algo') { out.algo = Number(args[++i]); }
  }
  if (!out.appId) out.appId = process.env.APP_ID ? parseInt(process.env.APP_ID, 10) : 1120;
  if (out.algo != null && out.microalgos == null) out.microalgos = BigInt(Math.round(out.algo * 1_000_000));
  if (out.microalgos == null) throw new Error('Provide amount via --microalgos <uAlgo> or --algo <ALGO>');
  return out;
}

function loadDeployer() {
  if (process.env.DEPLOYER_MNEMONIC) {
    return algosdk.mnemonicToSecretKey(process.env.DEPLOYER_MNEMONIC.trim());
  }
  const p = path.join(process.cwd(), 'scripts', 'deployer.json');
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.mnemonic) return algosdk.mnemonicToSecretKey(j.mnemonic);
  }
  throw new Error('Set DEPLOYER_MNEMONIC or provide scripts/deployer.json');
}

function getAlgod() {
  const server = process.env.ALGOD_SERVER || 'http://127.0.0.1';
  const port = process.env.ALGOD_PORT || 4001; // default to sandbox proxy
  const token = process.env.ALGOD_TOKEN || 'a';
  return new algosdk.Algodv2(token, server, port);
}

function yesBoxKey(senderAddr) {
  const dec = algosdk.decodeAddress(senderAddr);
  return Buffer.concat([Buffer.from('yes:'), Buffer.from(dec.publicKey)]);
}

async function main() {
  const { appId, microalgos } = parseArgs();
  const algod = getAlgod();
  const deployer = loadDeployer();
  const from = typeof deployer.addr === 'string' ? deployer.addr : algosdk.encodeAddress(deployer.publicKey || deployer.addr.publicKey);

  const params = await algod.getTransactionParams().do();
  const appAddr = algosdk.getApplicationAddress(appId);

  // Txn 1: Payment -> app address
  const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from,
    to: appAddr,
    amount: Number(microalgos),
    suggestedParams: params,
  });

  // ABI method selector for bet_yes(uint64)string
  const method = new algosdk.ABIMethod({ name: 'bet_yes', args: [{ type: 'uint64' }], returns: { type: 'string' } });
  const selector = method.getSelector(); // 4 bytes
  const encodedAmount = algosdk.ABIType.from('uint64').encode(microalgos);

  const boxName = yesBoxKey(from);

  // Txn 2: App call with selector + encoded args and box ref
  const appTxn = algosdk.makeApplicationNoOpTxnFromObject({
    from,
    appIndex: appId,
    appArgs: [selector, encodedAmount],
    boxes: [{ appIndex: appId, name: boxName }],
    suggestedParams: { ...params, flatFee: true, fee: 2000 },
  });

  // Group and sign
  algosdk.assignGroupID([payTxn, appTxn]);
  const signed = [payTxn.signTxn(deployer.sk), appTxn.signTxn(deployer.sk)];
  const { txId } = await algod.sendRawTransaction(signed).do();
  const confirmed = await algosdk.waitForConfirmation(algod, txId, 4);
  console.log('Group sent. First txId:', txId);
  console.log('Confirmed in round', confirmed['confirmed-round']);
}

main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
