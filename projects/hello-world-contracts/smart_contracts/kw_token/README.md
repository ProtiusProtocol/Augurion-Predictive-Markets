# Protius V1 Core - kW Token

## Overview

Per-project kW token representing installed AC capacity at grid connection point.

**SSOT Principle**: 1 kW token = 1 kW installed AC capacity

## Key Constraints (SSOT)

### Minting
- **One-time only**: At Financial Close (FC)
- **Total supply**: Equals `installedAcKw` from ProjectRegistry
- **Platform allocation**: Treasury receives `floor(installedAcKw × platformKwBps / 10000)`
- **Investor allocation**: Remainder goes to initial subscribers
- **Post-FC**: Minting permanently disabled

### Transfers
- **Disabled**: During FC window (before finalization)
- **Enabled**: After FC finalized
- **Admin control**: Can toggle in emergencies

### Snapshots
- **Purpose**: Enable RevenueVault to calculate epoch-based distributions
- **Mechanism**: `snapshotEpoch(epochId)` creates snapshot binding
- **Queries**: 
  - `balanceOfAt(account, snapshotId)` → historical balance
  - `totalSupplyAt(snapshotId)` → historical supply
- **Access**: Only RevenueVault can create snapshots (or admin if vault unset)

## Integration with ProjectRegistry

The kW Token reads configuration from ProjectRegistry:
- `installedAcKw` (total supply target)
- `platformKwBps` (treasury allocation %)
- `treasury` (platform address)
- `isFCFinalised()` (FC status flag)

On successful FC finalization, kW Token calls `ProjectRegistry.markFCFinalised()`.

## Deployment Flow

1. **Deploy ProjectRegistry**
   ```bash
   ts-node smart_contracts/index.ts project_registry
   ```

2. **Deploy kW Token**
   ```bash
   ts-node smart_contracts/index.ts kw_token
   ```

3. **Initialize kW Token**
   ```typescript
   await kwTokenClient.send.initToken({
     args: [
       registryAddress,
       Buffer.from('Project Solar ABC kW Token'),
       Buffer.from('kW-SOLAR-ABC'),
     ],
   })
   ```

4. **Link contracts in ProjectRegistry**
   ```typescript
   await registryClient.send.setContracts({
     args: [kwTokenAddress, kwhReceiptAddress, revenueVaultAddress],
   })
   ```

## Financial Close Flow

### Option A: Single-call (small investor list)
```typescript
await kwTokenClient.send.finalizeFinancialCloseSimple({
  args: [investorAddress, investorAmount],
})
```

### Option B: Multi-call (large investor list)
```typescript
// Mint allocations (multiple calls)
await kwTokenClient.send.mintAllocation({
  args: [investor1Address, amount1],
})
await kwTokenClient.send.mintAllocation({
  args: [investor2Address, amount2],
})
// ... more allocations

// Close FC
await kwTokenClient.send.closeFinancialClose({
  args: [expectedTotalSupply],
})
```

## Snapshot Usage (by RevenueVault)

```typescript
// At epoch close
await kwTokenClient.send.snapshotEpoch({
  args: [epochId],
})

// Later: query historical balances
const snapshotId = await kwTokenClient.send.snapshotIdForEpoch({ args: [epochId] })
const balance = await kwTokenClient.send.balanceOfAt({ args: [accountAddress, snapshotId] })
```

## Storage Layout

### Global State
- `registry`: ProjectRegistry app address (immutable)
- `totalSupply`: Total kW tokens minted (= installedAcKw)
- `fcFinalized`: FC status flag (monotonic)
- `transfersEnabled`: Transfer permission flag
- `currentSnapshotId`: Latest snapshot counter
- `revenueVault`: Authorized vault for snapshots

### Box Storage
- `balances`: Per-account kW token holdings
- `allowances`: ERC-20 style approvals
- `epochSnapshots`: epochId → snapshotId mapping
- `accountSnapshotBalances`: Historical balances per snapshot
- `supplySnapshots`: Historical total supply per snapshot

## Invariants

1. `totalSupply == installedAcKw` after FC
2. `sum(balances) == totalSupply` always
3. `fcFinalized` monotonic: false → true only
4. Minting disabled when `fcOpen == false`
5. Transfers disabled when `transfersEnabled == false`
6. Each `epochId` has at most one snapshot
7. Platform allocation uses floor rounding; no leakage

## Security Considerations

- **No post-FC minting**: Prevents supply inflation
- **Snapshot immutability**: Epoch snapshots cannot be overwritten
- **Admin controls**: Limited to emergency transfers toggle and vault setup
- **Balance conservation**: Transfer logic enforces conservation of supply
- **Allowance checks**: `transferFrom` validates approved amounts

## Testing Checklist

- [ ] Deploy registry and token
- [ ] Initialize token with registry reference
- [ ] Finalize FC once; verify second call reverts
- [ ] Verify `totalSupply == installedAcKw`
- [ ] Verify treasury received correct platform %
- [ ] Verify minting disabled post-FC
- [ ] Test transfers disabled during FC
- [ ] Test transfers enabled post-FC
- [ ] Snapshot epoch; verify no duplicate
- [ ] Query `balanceOfAt` before/after transfers
- [ ] Verify `totalSupplyAt` correctness
- [ ] Test edge case: `platformKwBps == 0` (all investor)
- [ ] Test edge case: `platformKwBps == 10000` (all treasury)

## Known Limitations (V1)

1. **Cross-contract calls**: Algorand contract-to-contract calls require additional wiring. Current implementation has placeholder comments for `ProjectRegistry.markFCFinalised()`.

2. **Gas optimization**: Snapshot mechanism stores per-account snapshots lazily. Large-scale snapshots may require batching.

3. **Registry validation**: `finalizeFinancialCloseSimple` requires manual parameter passing. Full integration would read directly from registry.

4. **Multi-call coordination**: `mintAllocation` + `closeFinancialClose` requires off-chain coordination to ensure allocation sum equals target.

## Next Steps

After kW Token deployment:
1. Implement `kWhReceipt` contract (energy production tracking)
2. Implement `RevenueVault` contract (epoch settlement + distributions)
3. Wire all four contracts together
4. Test end-to-end: project → FC → production → settlement → claims
