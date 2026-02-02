# Team Setup - Protius State Machine

## Quick Start (5 minutes)

### Prerequisites
- Docker Desktop running
- Node.js 18+ installed
- AlgoKit CLI: `pipx install algokit`

### Setup Steps

```bash
# 1. Clone and install
git pull
npm install

# 2. Start LocalNet
algokit localnet start

# 3. Compile contract
npx puya-ts project_registry/contract.algo.ts

# 4. Deploy to LocalNet
npx tsx deploy-registry.ts

# 5. Start web UI
cd web
npm run dev
```

Open http://localhost:8080 → Operator Console

## What's New

### ✅ Implemented: Project State Machine
- **8 States**: DRAFT (0) → REGISTERED (1) → FUNDED (2) → UNDER_CONSTRUCTION (3) → COMMISSIONING (4) → OPERATING (5) → SUSPENDED (6) → EXITED (7)
- **Operator Role**: Day-to-day state transitions (cannot EXIT)
- **State Guards**: markCOD() requires COMMISSIONING, markFCFinalised() requires REGISTERED
- **UI Component**: Real-time state display with transition buttons

### 📂 Key Files
- `project_registry/contract.algo.ts` - Contract with state machine (lines 1-400)
- `web/src/ProjectStatusPanel.tsx` - UI component (450 lines)
- `STATE_MACHINE_GUIDE.md` - Implementation guide
- `COMPLETE_LIFECYCLE.md` - Updated with states

### ⚠️ Known Limitation
**Algorand TypeScript doesn't support enums!** States are literal numbers:
```typescript
// WRONG (doesn't compile):
enum ProjectState { DRAFT = 0, REGISTERED = 1 }

// CORRECT (what we use):
// State 0 = DRAFT
// State 1 = REGISTERED
// ... etc
projectState.value = Uint64(0)  // Set to DRAFT
```

## Next Steps for Team

### Phase 2: Wire UI Transitions
Currently buttons show alerts. Need to:
1. **Add wallet integration** (Pera/Defly) to `ProjectStatusPanel.tsx`
2. **Replace stubs** in `handleTransition()` with real algosdk calls
3. **Call contract methods**: `updateOperator()`, `transitionState()`

Example:
```typescript
// Replace this stub (line ~130):
alert(`Transitioning to state ${newState}`)

// With real transaction:
const suggestedParams = await algodClient.getTransactionParams().do()
const txn = await registryClient.transitionState({ newState }, { sender: walletAddress })
await walletSignAndSend(txn)
```

### Phase 3: Add State Guards to Other Contracts
Apply same pattern to:
- `kwh_receipt/contract.algo.ts` - Only mint if project OPERATING
- `ppa_contract/contract.algo.ts` - Only execute if project OPERATING
- `revenue_vault/contract.algo.ts` - Only distribute if project OPERATING

### Phase 4: Testing
- Test all 9 valid transitions
- Test invalid transitions (should fail)
- Test markCOD() in wrong state (should fail)
- Test operator cannot EXIT project

## Current LocalNet State
- **ProjectRegistry App ID**: 1003
- **Deployer Address**: ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA
- **State**: Uninitialized (call `init_registry()` first)

## Troubleshooting

### Contract won't compile
```bash
# Clean artifacts
rm -rf artifacts/project_registry

# Recompile
npx puya-ts project_registry/contract.algo.ts
```

### Web UI shows wrong App ID
Update in all CONFIG objects:
- `web/src/OperatorConsole.tsx` (line 10)
- `web/src/BuyerPortal.tsx` (line 11)
- `web/src/EquityInvestment.tsx` (line 9)

### LocalNet reset needed
```bash
algokit localnet reset
npx tsx deploy-registry.ts
```

## Questions?
- Review `STATE_MACHINE_GUIDE.md` for detailed design decisions
- Check `COMPLETE_LIFECYCLE.md` for business logic
- See contract comments in `project_registry/contract.algo.ts`

---
**Last Updated**: February 2, 2026  
**Contract Version**: 1.0 (with state machine)  
**Deployed App ID**: 1003 (LocalNet only)
