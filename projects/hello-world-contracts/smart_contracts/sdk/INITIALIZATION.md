# Protius V1 Core — SDK Initialization

## Overview

One-time initialization of all 4 Protius V1 Core contracts. Must be run by the admin account after deployment.

## Prerequisites

- ✅ All 4 contracts deployed (ProjectRegistry, kWToken, kWhReceipt, RevenueVault)
- ✅ App IDs configured in [sdk/src/config/project.ts](sdk/src/config/project.ts)
- ✅ Admin account mnemonic exported to `DEPLOYER_MNEMONIC`

## Command

```bash
cd sdk
npm run operator:init
```

## What It Does

The initialization process executes 5 atomic transactions:

1. **ProjectRegistry.init_registry()** — Sets project configuration (ID, capacity, treasury, platform fees, admin)
2. **kWToken.initToken()** — Links token to registry, sets metadata ("Protius kW Token", "PKW")
3. **kWhReceipt.initReceipt()** — Links receipt to registry and vault
4. **RevenueVault.initVault()** — Links vault to all contracts (registry, token, receipt) and sets treasury
5. **ProjectRegistry.setContracts()** — Wires all contracts together with cross-references

## Default Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PROJECT_ID` | `ProtProject` | Project identifier |
| `INSTALLED_AC_KW` | `5000` | Installed AC capacity (5 MW) |
| `PLATFORM_KW_BPS` | `500` | Platform kW allocation (5%) |
| `PLATFORM_KWH_BPS` | `500` | Platform kWh rate (5%) |
| `TREASURY_ADDRESS` | Admin address | Treasury receiving protocol fees |

## Custom Parameters

Override defaults with environment variables:

```bash
PROJECT_ID="MyProject" \
INSTALLED_AC_KW=10000 \
PLATFORM_KW_BPS=1000 \
PLATFORM_KWH_BPS=250 \
TREASURY_ADDRESS=AAAAA...ZZZZ \
npm run operator:init
```

## Idempotency

✅ **Safe to run once only**
- Will throw error if already initialized
- Contract assertions prevent duplicate initialization
- All 5 transactions must succeed or all revert

## After Initialization

Once initialized, the system is ready for:

- **Financial Close** (`npm run operator:fc`) — Mint kW tokens to investors
- **Monthly Epochs** (`npm run operator:epoch`) — Distribute revenue to token holders

## Implementation

The initialization logic is in:
- SDK Layer: [sdk/src/ops/operator.ts](sdk/src/ops/operator.ts) → `ProtiusOperator.init()`
- CLI Script: [sdk/scripts/operator/init.ts](sdk/scripts/operator/init.ts)

## Troubleshooting

**Error: "ContractsAlreadySet"**
- Contracts are already initialized
- Query contract state to verify: `algokit task execute getProjectId --app-id <REGISTRY_APP_ID>`

**Error: "NotAdmin"**
- Wrong account used for initialization
- Ensure `DEPLOYER_MNEMONIC` matches the account that deployed the contracts

**Error: "InvalidAddress"**
- Treasury address is zero address or invalid
- Set valid `TREASURY_ADDRESS` environment variable
