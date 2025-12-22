const algosdk = require('algosdk');
(async ()=>{
  try {
    const client = new algosdk.Algodv2('a', 'http://localhost', 4001);
    const res = await client.healthCheck().do();
    console.log('ok', res);
  } catch (e) {
    console.error('err', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
