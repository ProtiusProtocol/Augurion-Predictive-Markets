# Protius SDK

## Overview

The **Protius SDK** is the authorised execution gateway for **Protius V1 Core** smart contracts. It enforces strict role separation between Operator (admin) and Claimant (public) workflows.

## Installation

```bash
cd sdk
npm install
```

## Build

```bash
npm run build
```

## Configuration

Update `src/config/project.ts` with your deployed contract addresses:

```typescript
export const TESTNET_CONFIG: ProtiusProjectConfig = {
  registryAppId: 123456n,
  kwTokenAppId: 123457n,
  kwhReceiptAppId: 123458n,
  revenueVaultAppId: 123459n,
  kwAssetId: 789012n,
  kwhAssetId: 789013n,
  adminAddress: 'YOUR_ADMIN_ADDRESS',
  treasuryAddress: 'YOUR_TREASURY_ADDRESS',
  revenueAssetId: 0n, // 0 for ALGO
  projectId: 'your-project-id',
}
```

## Operator Usage

### Execute Financial Close

```typescript
import { ProtiusOperator } from '@protius/sdk'
import { TESTNET_CONFIG, TESTNET } from '@protius/sdk'

const operator = new ProtiusOperator(TESTNET_CONFIG, TESTNET)

await operator.runFinancialClose({
  peo: infrapilotPEO,
  operator: operatorAccount,
  installedAcKw: 5000n,
})
```

### Execute Monthly Epoch

```bash
export OPERATOR_MNEMONIC="your operator mnemonic here"
npm run operator:epoch -- --epochId 202501 --netRevenue 1000000 --accrualFile ./accruals/202501.json
```

Or programmatically:

```typescript
await operator.runMonthlyEpoch({
  epochId: 202501n,
  startDate: 1704067200n,
  endDate: 1706745599n,
  accrualReport: reportData,
  netRevenue: 1000000n,
  platformKwhRateBps: 500n, // 5%
  operator: operatorAccount,
  peo: infrapilotPEO,
})
```

## Claimant Usage

### Execute Claim

```bash
export CLAIMANT_MNEMONIC="your claimant mnemonic here"
npm run claimant:claim -- --epochId 202501
```

Or programmatically:

```typescript
import { ProtiusClaimant } from '@protius/sdk'

const claimant = new ProtiusClaimant(TESTNET_CONFIG, TESTNET)

const result = await claimant.claim(202501n, claimantAccount)
console.log(`Claimed: ${result.amountClaimed}`)
```

### View Claimable Amount

```typescript
const claimable = await claimant.viewClaimable(202501n, holderAddress)
console.log(`Claimable: ${claimable}`)
```

## Architecture

- **Two-Role Model**: Operator (admin) vs Claimant (public)
- **Client-Orchestrated**: SDK builds group transactions, contracts validate
- **Deterministic**: Canonical JSON, SHA-256 hashing, floor division only
- **PEO Integration**: Enforces InfraPilot-determined maturity gates

See [main README](./README.md) for comprehensive documentation.

## Security

- **Never commit private keys or mnemonics**
- Use environment variables for sensitive data
- Operator account has privileged access - protect accordingly
- Claimants should use wallet integration in production

## Support

For questions, contact the Protius engineering team or open an issue on GitHub.
