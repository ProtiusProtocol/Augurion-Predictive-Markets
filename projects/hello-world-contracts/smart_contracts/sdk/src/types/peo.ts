/**
 * PEO (Project Evaluation Output) Schema
 * 
 * Represents the output from InfraPilot contract evaluation.
 * SDK enforces maturity gates based on PEO status.
 * 
 * **SDK does NOT recalculate PEO scores.** It trusts InfraPilot as SSOT.
 */

/**
 * PEO maturity stages (InfraPilot-determined)
 */
export enum PEOMaturityStatus {
  /** Initial stage: Project registered, evaluation pending */
  PENDING = 'PENDING',

  /** Pre-Financial Close: Engineering + commercial validated */
  FC_APPROVED = 'FC_APPROVED',

  /** Post-COD: Project generating production */
  OPERATING = 'OPERATING',

  /** Final stage: All obligations settled */
  SETTLED = 'SETTLED',

  /** Project evaluation failed */
  REJECTED = 'REJECTED',
}

/**
 * PEO data structure from InfraPilot
 */
export interface PEO {
  /** Project identifier (matches ProjectRegistry) */
  projectId: string

  /** Current maturity status */
  status: PEOMaturityStatus

  /** Last evaluation timestamp (Unix epoch) */
  evaluatedAt: bigint

  /** Installed AC capacity (kW) - validated by InfraPilot */
  installedAcKw: bigint

  /** Treasury address (protocol fee recipient) */
  treasuryAddress: string

  /** Commercial Operations Date (Unix epoch) */
  codDate?: bigint

  /** Financial Close Date (Unix epoch) */
  fcDate?: bigint

  /** Platform kWh rate in basis points (e.g., 500 = 5%) */
  platformKwhRateBps?: bigint

  /** Additional metadata from InfraPilot (optional) */
  metadata?: Record<string, unknown>
}

/**
 * Maturity gate validation
 */
export interface MaturityGate {
  /** Required minimum status */
  requiredStatus: PEOMaturityStatus

  /** Human-readable gate name */
  gateName: string

  /** Validation error message */
  errorMessage: string
}

/**
 * Predefined maturity gates for SDK operations
 */
export const MATURITY_GATES = {
  FINANCIAL_CLOSE: {
    requiredStatus: PEOMaturityStatus.FC_APPROVED,
    gateName: 'Financial Close',
    errorMessage: 'Project must be FC_APPROVED to execute Financial Close',
  } as MaturityGate,

  MONTHLY_EPOCH: {
    requiredStatus: PEOMaturityStatus.OPERATING,
    gateName: 'Monthly Epoch',
    errorMessage: 'Project must be OPERATING to execute monthly epochs',
  } as MaturityGate,
}

/**
 * Validate PEO maturity against required gate
 */
export function validateMaturity(peo: PEO, gate: MaturityGate): void {
  const statusOrder: Record<PEOMaturityStatus, number> = {
    [PEOMaturityStatus.PENDING]: 0,
    [PEOMaturityStatus.REJECTED]: -1,
    [PEOMaturityStatus.FC_APPROVED]: 1,
    [PEOMaturityStatus.OPERATING]: 2,
    [PEOMaturityStatus.SETTLED]: 3,
  }

  const currentLevel = statusOrder[peo.status]
  const requiredLevel = statusOrder[gate.requiredStatus]

  if (currentLevel < requiredLevel) {
    throw new Error(
      `${gate.errorMessage}. Current status: ${peo.status}, required: ${gate.requiredStatus}`
    )
  }

  if (peo.status === PEOMaturityStatus.REJECTED) {
    throw new Error(`Project has been rejected by InfraPilot and cannot proceed`)
  }
}
