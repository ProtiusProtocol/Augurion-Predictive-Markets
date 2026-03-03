/**
 * contractArtifacts.ts
 * 
 * Bundles the compiled TEAL source for all 4 Protius contracts so they can
 * be deployed directly from the browser (Operator Console "Deploy & Register").
 * 
 * Vite's `?raw` import returns the file contents as a plain string.
 */

// ─── ProjectRegistry ──────────────────────────────────────────────────────────
// @ts-ignore
import registryApproval from './artifacts/ProjectRegistry.approval.teal?raw'
// @ts-ignore
import registryClear from './artifacts/ProjectRegistry.clear.teal?raw'

// ─── KWToken ──────────────────────────────────────────────────────────────────
// @ts-ignore
import kwTokenApproval from './artifacts/KWToken.approval.teal?raw'
// @ts-ignore
import kwTokenClear from './artifacts/KWToken.clear.teal?raw'

// ─── RevenueVault ─────────────────────────────────────────────────────────────
// @ts-ignore
import revenueVaultApproval from './artifacts/RevenueVault.approval.teal?raw'
// @ts-ignore
import revenueVaultClear from './artifacts/RevenueVault.clear.teal?raw'

// ─── KWhReceipt ───────────────────────────────────────────────────────────────
// @ts-ignore
import kwhReceiptApproval from './artifacts/KWhReceipt.approval.teal?raw'
// @ts-ignore
import kwhReceiptClear from './artifacts/KWhReceipt.clear.teal?raw'

// ─── Schemas (from arc32.json state section) ─────────────────────────────────
// global.num_uints, global.num_byte_slices, local.num_uints, local.num_byte_slices

export interface ContractSchema {
  globalInts: number
  globalBytes: number
  localInts: number
  localBytes: number
  /** Recommended funding in ALGO to cover min-balance + box storage headroom */
  fundAlgo: number
  approval: string
  clear: string
}

export const ARTIFACTS: Record<string, ContractSchema> = {
  projectRegistry: {
    globalInts: 12,
    globalBytes: 7,
    localInts: 0,
    localBytes: 0,
    fundAlgo: 2,
    approval: registryApproval as string,
    clear: registryClear as string,
  },
  kwToken: {
    globalInts: 7,
    globalBytes: 5,
    localInts: 0,
    localBytes: 0,
    fundAlgo: 2,
    approval: kwTokenApproval as string,
    clear: kwTokenClear as string,
  },
  revenueVault: {
    globalInts: 4,
    globalBytes: 5,
    localInts: 0,
    localBytes: 0,
    fundAlgo: 2,
    approval: revenueVaultApproval as string,
    clear: revenueVaultClear as string,
  },
  kwhReceipt: {
    globalInts: 1,
    globalBytes: 3,
    localInts: 0,
    localBytes: 0,
    fundAlgo: 2,
    approval: kwhReceiptApproval as string,
    clear: kwhReceiptClear as string,
  },
}
