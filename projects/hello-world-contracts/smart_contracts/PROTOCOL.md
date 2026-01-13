# Protius Protocol Specification (v0.2.0+)

## Claim Execution Semantics

**Status**: Protocol-Level Guarantee (v0.2.0+)

### Claim Execution Contract Guarantees

#### 1. Full Remaining Claim Only
- Claimants **must** claim their **entire remaining entitlement** in a single transaction
- **No partial claims allowed** - claiming X < remaining raises an error
- **No custom amounts** - the contract reads `entitlements[epochId][claimant] - claimed[epochId][claimant]` and transfers exactly that
- **Read-only from blockchain** - claimant cannot specify amount; contract computes it

#### 2. Idempotency (Safe Retries)
- **Retry-safe**: If a claim transaction fails after initial submission (timeout, network lag), the claimant may resubmit the same transaction
- **Idempotent logic**: Contract checks `claimed[epochId][claimant]` before transfer
  - If already fully claimed: Transaction returns success message "Already claimed"
  - If partially claimed (error case): Reverts with explicit error
  - If not yet claimed: Executes transfer and updates `claimed[epochId][claimant]`
- **No double-payment**: Even with multiple submissions, claimant receives exactly `remainingClaimable` once
- **Proof**: The `claimed` box is immutable during execution; contract writes only once

#### 3. No Partial Claims
- **Atomicity**: Claim is all-or-nothing - either full remaining is transferred or transaction fails
- **Contract enforcement**:
  ```teal
  // Pseudocode from RevenueVault.claim()
  let claimableAmount = entitlements[epochId][claimant] - claimed[epochId][claimant]
  if claimableAmount == 0:
    return "Already claimed"
  
  // Transfer FULL amount (not partial)
  transfer(claimant, claimableAmount)
  
  // Update claimed (atomic with transfer)
  claimed[epochId][claimant] += claimableAmount
  ```
- **No recovery from partial state** - if a claim partially executes (impossible in AVM), the contract halts
- **UI constraint**: ClaimExecution.tsx enforces read-only amount, explicit confirmation required

### Implications for External Systems

#### For Claimant UIs
- Display **remaining claimable** (not editable)
- Require **explicit checkbox confirmation** (irreversible)
- Show **pre-claim and post-claim state** (blockchain-verified)
- Allow **retry on failure** (safe via idempotency)

#### For Operator Systems
- Settling epochs must mark `epochSettled[epochId] = 1` before claims begin
- Entitlements must be anchored before claims can execute
- Claimed tracking provides audit trail

#### For Auditors
- Claim amount = `claimed[epochId][address]` (single immutable write)
- Total payouts per epoch = sum of all `claimed[epochId][*]` values
- Idempotent retries do not affect payment totals

### Versions

#### v0.2.0
- Protocol semantics defined (this document)
- ClaimExecution.tsx implements full remaining claim semantics
- SDK restructured with generated client re-exports
- Phase 4 Claim Execution complete

#### v0.1.x (Pre-Specification)
- No protocol-level guarantee documentation
- Claim execution was TODOs and placeholders

### Testing Requirements

**Unit Test**: Claim with various states
```
✓ Claim when fully unclaimed (success, transfer full amount)
✓ Claim when fully claimed (idempotent, return "Already claimed")
✓ Claim when partially claimed (error, revert)
✓ Claim with zero entitlement (error, revert)
```

**Integration Test**: Multiple claims and retries
```
✓ First claim succeeds, updates claimed box
✓ Retry claim within same block (idempotent, no double payment)
✓ Claim from different account (isolated entitlements)
✓ Claim different epochs (separate claimed boxes)
```

**Audit Test**: Claim atomicity
```
✓ If claim fails mid-transfer, claimed box not updated
✓ If claim succeeds, claimed box updated atomically
✓ Sum of all claimed ≤ sum of all entitlements (per epoch)
```

### Changelog

#### 2026-01-13 (v0.2.0 Release)
- [SPEC] Added protocol-level guarantees for claim execution
- [FEATURE] Phase 4 Claim Execution UI with full remaining claim semantics
- [SDK] Restructured client exports to use generated clients directly
- [DOC] Created PROTOCOL.md specification document

#### 2026-01-12 (v0.1.x)
- Protocol semantics undocumented (implicit in contract code)

---

**Last Updated**: 2026-01-13  
**Specification Version**: v0.2.0  
**Protocol Level**: Stable
