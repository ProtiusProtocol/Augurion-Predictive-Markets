// Simple test using existing app ID 1080 that's already deployed and funded
const algosdk = require('algosdk');
const execSync = require('child_process').execSync;

const APP_ID = 1080;
// Using sandbox account that's in the wallet
const SENDER_ADDR = 'EOHIS7GPAWMTPGDGMQP26FMFD6O7FKAEX4ZOTISTIW3NULONPITILYZRPA';

async function testWithGoal() {
  console.log('=== Testing with goal commands directly ===');
  console.log('App ID:', APP_ID);
  console.log('Sender:', SENDER_ADDR);

  try {
    // App already initialized with status=OPEN, skip create

    // 1. Place YES bet (method selector: 0xa4216c09 for bet_yes(uint64)string)
    console.log('\n1. Placing YES bet (5 ALGO)...');
    //Box name is "yes:" + sender address
    const yesBoxKey = Buffer.concat([Buffer.from('yes:'), algosdk.decodeAddress(SENDER_ADDR).publicKey]).toString('base64');
    const betCmd = `docker exec algokit_sandbox_algod goal app call --app-id ${APP_ID} --from ${SENDER_ADDR} --app-arg "b64:pCFsCQ==" --app-arg "int:5000000" --box "b64:${yesBoxKey}" -w unencrypted-default-wallet`;
    const betResult = execSync(betCmd, { encoding: 'utf-8' });
    console.log(betResult);

    // 2. Resolve market (method selector: 0xf13c55c7 for resolve_market(uint64)string, winningSide=1)
    console.log('\n2. Resolving market with YES winning...');
    const resolveCmd = `docker exec algokit_sandbox_algod goal app call --app-id ${APP_ID} --from ${SENDER_ADDR} --app-arg "b64:8TxVxw==" --app-arg "int:1" -w unencrypted-default-wallet`;
    const resolveResult = execSync(resolveCmd, { encoding: 'utf-8' });
    console.log(resolveResult);

    // 3. Claim payout (method selector: 0x41ad20e0 for claim_payout()string)
    console.log('\n3. Claiming payout...');
    const claimedBoxKey = Buffer.concat([Buffer.from('claimed:'), algosdk.decodeAddress(SENDER_ADDR).publicKey]).toString('base64');
    // Need extra fee budget for inner transaction
    const claimCmd = `docker exec algokit_sandbox_algod goal app call --app-id ${APP_ID} --from ${SENDER_ADDR} --app-arg "b64:Qa0g4A==" --box "b64:${yesBoxKey}" --box "b64:${claimedBoxKey}" --fee 2000 -w unencrypted-default-wallet`;
    const claimResult = execSync(claimCmd, { encoding: 'utf-8' });
    console.log(claimResult);

    console.log('\n=== SUCCESS! All functions executed ===');

  } catch (err) {
    console.error('Error:', err.message);
    if (err.stderr) console.error('Stderr:', err.stderr.toString());
    if (err.stdout) console.error('Stdout:', err.stdout.toString());
  }
}

testWithGoal();
