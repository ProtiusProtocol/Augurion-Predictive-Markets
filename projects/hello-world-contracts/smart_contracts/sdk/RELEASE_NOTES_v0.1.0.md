# Release v0.1.0 — V1 Epoch Settlement (Deposit Flow)

Date: 2026-01-12
Tag: v0.1.0

## Highlights
- Operator epoch settlement deposit flow completed and verified on LocalNet.
- Added automatic app account funding for `RevenueVault` to satisfy minimum balance before box usage.
- Idempotent epoch lifecycle management: attempt `createEpoch` and `closeEpoch` safely without redundant reads.
- Corrected grouped deposit by including required box references.
- New CLI for operators to run a JSON-driven epoch settlement.

## Changes
- `sdk/src/ops/operator.ts`
  - Auto-fund `RevenueVault` app address prior to epoch operations.
  - Idempotent `createEpoch` → `closeEpoch` handling.
  - Box references added to `depositNetRevenue` app call (epoch_status, epoch_hash, epoch_net).
  - Fixed default signer setup and transaction ID handling; resolved BigInt/number mismatches.
- `sdk/src/lib/group.ts`
  - Added `boxes` support in `makeAppCallTxn()` and forward to Algorand SDK.
- `sdk/scripts/operator/epoch.ts`
  - New script to run epoch settlement from a JSON file.
- `sdk/outputs/epoch-202501.json`
  - Sample epoch input used for verification.

## Usage
1) Ensure protocol is activated and LocalNet is running
- Run activation once (idempotent):
  - `npm run operator:activate`

2) Run epoch settlement with JSON input
- Example (using the included sample file):
  - `npm run operator:epoch sdk/outputs/epoch-202501.json`

Expectations:
- Anchors accrual report if not set.
- Groups payment → `RevenueVault.depositNetRevenue()`.
- Prints a settlement summary.

## Notes & Limitations
- `kWhReceipt.markEpochSettled` is restricted to `RevenueVault`; current flow logs and skips this step if called directly by the operator.
- Entitlements flow (anchor entitlements, set entitlements, and finalize `settleEpochEntitlements`) is not implemented here; to be delivered in the next milestone.
- Optional snapshot step (e.g., `kWToken.snapshotEpoch`) is not included yet; the V1 settlement model currently treats snapshot ID conceptually.

## Next Milestones
- v1.1:
  - Entitlements anchoring (`anchorEntitlements`) and batch `setEntitlement` support.
  - Finalization (`settleEpochEntitlements`) and claim path validation.
- v1.2:
  - Snapshot orchestration and indexer-based holder balance retrieval.
  - Additional operator diagnostics and richer summaries.

## Acknowledgements
- LocalNet: Algod at http://127.0.0.1:4001.
- Contracts involved: `ProjectRegistry`, `KWToken`, `KWhReceipt`, `RevenueVault`.
