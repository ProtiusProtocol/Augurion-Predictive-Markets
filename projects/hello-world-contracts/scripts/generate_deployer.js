const algosdk = require('algosdk');
const a = algosdk.generateAccount();
let addr = null;
if (typeof a.addr === 'string') {
	addr = a.addr;
} else if (a.publicKey || (a.addr && a.addr.publicKey)) {
	try {
		let pk = a.publicKey || a.addr.publicKey;
		if (!(pk instanceof Uint8Array) && typeof pk === 'object') {
			pk = Uint8Array.from(Object.values(pk));
		}
		addr = algosdk.encodeAddress(pk);
	} catch (e) {
		// ignore
	}
}
const m = algosdk.secretKeyToMnemonic(a.sk);
console.log(JSON.stringify({ address: addr, mnemonic: m, raw: a }));
