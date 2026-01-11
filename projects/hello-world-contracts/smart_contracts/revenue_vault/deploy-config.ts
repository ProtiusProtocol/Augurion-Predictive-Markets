import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import * as algokit from '@algorandfoundation/algokit-utils'
import { RevenueVaultClient } from '../artifacts/revenue_vault/RevenueVaultClient'

/**
 * Protius V1 Core: RevenueVault — Entitlements Settlement Workflow
 *
 * ARCHITECTURE: CLIENT-ORCHESTRATED GROUP TRANSACTIONS + ENTITLEMENTS
 * ==================================================================
 *
 * RevenueVault uses an ENTITLEMENTS MODEL where all claims are pre-computed
 * and committed on-chain. This eliminates on-chain balance lookups and enables
 * inputless claim(epochId) calls.
 *
 * WORKFLOW: Epoch Settlement + Distribution
 * ==========================================
 *
 * 1. EPOCH SETUP (Admin)
 *    - Call: revenueVault.createEpoch(epochId, startTs, endTs)
 *    - Call: revenueVault.closeEpoch(epochId)
 *
 * 2. ACCRUAL ANCHORING (Admin)
 *    - Off-chain: Produce accrual report (kWh, gross revenue, OPEX, net distributable)
 *    - On-chain: Call: revenueVault.anchorAccrualReport(epochId, reportHash)
 *    - reportHash: SHA-256 of accrual report (immutable once set)
 *
 * 3. REVENUE DEPOSIT (Admin)
 *    Client must submit GROUPED transaction:
 *    - Txn 1: Asset/ALGO transfer (vault ← admin, amount = netDeposited)
 *    - Txn 2: revenueVault.depositNetRevenue(epochId, amount)
 *
 * 4. ENTITLEMENTS ANCHORING (Admin)
 *    - Off-chain: Compute entitlements list from FC holder set
 *      * For each kW holder H:
 *        - baseShare[H] = floor(remainingForKwHolders * holderKw[H] / totalKw)
 *      * For Treasury:
 *        - treasuryKwhShare = floor(R * alpha / 10000)
 *        - remainder = R - sum(all baseShares) - treasuryKwhShare
 *        - entitlements[Treasury] = baseShare[Treasury] + treasuryKwhShare + remainder
 *      * Verify: sum(all entitlements) == netDeposited exactly
 *      * Hash: entHash = SHA-256(accounts[], amounts[])
 *
 *    - On-chain: Call: revenueVault.anchorEntitlements(epochId, entHash)
 *      * entHash is immutable once set (write-once)
 *
 * 5. ENTITLEMENTS SETTING (Admin)
 *    Client must submit N separate transactions (one per entitled account):
 *    - For each account A in entitlements list:
 *      * Txn: revenueVault.setEntitlement(epochId, A, entitlements[A])
 *      * Contract accumulates sumEntitlements[epochId]
 *
 *    - Admin must ensure: sumEntitlements[epochId] == netDeposited (verified at settlement)
 *
 * 6. EPOCH SETTLEMENT (Admin)
 *    - Call: revenueVault.settleEpochEntitlements(epochId)
 *      * Asserts:
 *        - reportHash anchored ✓
 *        - netDeposited present ✓
 *        - entitlementsHash anchored ✓
 *        - entitlements set (sumEntitlements > 0) ✓
 *        - sumEntitlements == netDeposited (exact invariant) ✓
 *      * Transitions epoch to SETTLED
 *      * Claims become available
 *    - [Optional] Txn: kWhReceipt.markEpochSettled(epochId) to lock production records
 *
 * 7. CLAIMS (Anyone, per-account)
 *    Claimant submits GROUPED transaction:
 *    - Txn A: revenueVault.claim(epochId)
 *      * Contract reads entitledAmount[epochId, Txn.sender]
 *      * No client-supplied inputs (inputless)
 *      * Marks claimer as claimed (prevents double-claim)
 *      * Returns: claimAmount
 *    - Txn B: Asset/ALGO transfer (vault → claimer, amount=claimAmount)
 *
 * SECURITY NOTES
 * ==============
 *
 * Entitlements Commitment:
 * - entitlementsHash is immutable once anchored (write-once)
 * - Provides commitment to off-chain entitlements calculation
 * - Off-chain audit verifies that stored amounts match hash
 *
 * Conservation Invariant:
 * - sumEntitlements == netDeposited enforced at settlement
 * - Ensures no rounding dust is lost
 * - Treasury receives all rounding remainders (encoded in entitlements)
 *
 * Inputless Claims:
 * - claim(epochId) requires no client-supplied holderKw
 * - Entitlements are fixed at settlement, cannot change post-settlement
 * - Simplifies client logic and eliminates balance lookup requirements
 *
 * V1 Limitation (By Design):
 * - Post-FC transfers of kW do NOT affect entitlements (V1 only)
 * - Entitlements freeze at Financial Close
 * - V2 will support dynamic balance tracking if needed
 *
 * GROUP TRANSACTION ORDERING
 * ==========================
 *
 * All operations must preserve group txn semantics:
 * - All contract calls must occur AFTER data reads
 * - All payments must occur AFTER contract validation
 * - Revert on any assertion failure (group atomic)
 *
 * Example: Claim group txn
 *   [RevenueVault.claim(epochId) → claimAmount, mark claimed]
 *   [Asset transfer: vault → claimer, amount=claimAmount]
 *
 * If any txn fails, entire group reverts (atomic).
 */

// Deployment configuration for RevenueVault contract
const deploy = async () => {
  console.log('=== Deploying RevenueVault ===')

  const algod = algokit.getAlgoClient()
  const indexer = algokit.getAlgoIndexerClient()

  const deployer = await algokit.getLocalNetAccount('DEPLOYER', algod)
  console.log(`Deployer: ${deployer.addr}`)

  // Deploy RevenueVault
  const vaultClient = new RevenueVaultClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0,
    },
    algod
  )

  await vaultClient.create.createApplication({})
  console.log(`RevenueVault App ID: ${(await vaultClient.appClient.getAppReference()).appId}`)

  // Fund contract
  await algokit.ensureFunded(
    {
      accountToFund: (await vaultClient.appClient.getAppReference()).appAddress,
      minSpendingBalance: algokit.algos(10),
    },
    algod
  )

  console.log('RevenueVault deployed and funded')

  // TODO: Call initVault() with correct parameters:
  // - registry: ProjectRegistry address
  // - kwToken: kWToken address
  // - kwhReceipt: kWhReceipt address
  // - treasury: Treasury address
  // - settlementAssetId: ASA ID or 0 for ALGO
  // - platformKwhRateBps: e.g., 500 for 5%

  console.log('=== RevenueVault Deployment Complete ===')
}

export default deploy
