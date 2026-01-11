# Protius SDK Outputs

This directory stores off-chain computation outputs for audit trails.

## Structure

```
outputs/
  entitlements/
    202501.json      ← Entitlements for January 2025
    202502.json      ← Entitlements for February 2025
    ...
  accruals/
    202501.json      ← Accrual reports
    ...
```

## Entitlements Format

```json
{
  "epochId": "202501",
  "snapshotId": "1",
  "totalKw": "5000",
  "netDeposited": "1000000",
  "platformKwhRateBps": "500",
  "treasuryBase": "50000",
  "treasuryRemainder": "42",
  "treasuryTotal": "50042",
  "holders": [
    {
      "address": "TREASURY_ADDRESS_HERE",
      "kwBalance": "0",
      "entitledAmount": "50042"
    },
    {
      "address": "HOLDER1_ADDRESS_HERE",
      "kwBalance": "2500",
      "entitledAmount": "474979"
    },
    {
      "address": "HOLDER2_ADDRESS_HERE",
      "kwBalance": "2500",
      "entitledAmount": "474979"
    }
  ],
  "hash": "abc123...",
  "computedAt": 1704067200,
  "sdkVersion": "1.0.0"
}
```

## Important Notes

- **DO NOT** modify these files after generation
- Hash is computed from canonical JSON (sorted keys)
- Conservation invariant: `sum(holders.entitledAmount) == netDeposited`
- These files serve as audit trail for on-chain entitlements
- Git commit these files after each epoch for historical record

## Verification

To verify an entitlements file:

```bash
ts-node -e "
const fs = require('fs');
const { hashCanonicalJson } = require('./src/lib/hash');
const data = JSON.parse(fs.readFileSync('./outputs/entitlements/202501.json'));
console.log('Computed hash:', hashCanonicalJson(data));
console.log('Recorded hash:', data.hash);
"
```
