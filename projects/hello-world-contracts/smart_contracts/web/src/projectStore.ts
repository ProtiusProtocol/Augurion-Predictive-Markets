/**
 * Project Store — localStorage-backed persistence for the project registration workflow.
 *
 * Lifecycle:
 *   PENDING   → submitted by user, awaiting admin review
 *   APPROVED  → admin has called init_registry on-chain; project is live in selector
 *   REJECTED  → admin rejected; stays in store for audit trail
 */

export type EnergyType = 'Solar' | 'Wind' | 'Hydro' | 'Geothermal' | 'Battery Storage' | 'Other'
export type ProjectStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ProjectSubmission {
  // Generated on submission
  submissionId: string          // uuid-style local ID
  submittedAt: string           // ISO timestamp
  status: ProjectStatus

  // Metadata (entered by submitter)
  displayName: string
  energyType: EnergyType
  location: string              // e.g. "Sydney, NSW, Australia"
  installedAcKw: number         // AC capacity in kW
  platformKwBps: number         // platform fee in basis points (0-10000)
  platformKwhRateBps: number    // kWh rate in basis points
  treasuryAddress: string       // ALGO address for revenue
  permits: string               // free text: permit numbers / notes
  description: string           // project description

  // Filled in by admin during approval
  registryAppId?: number
  kwTokenAppId?: number
  revenueVaultAppId?: number
  kwhReceiptAppId?: number
  approvedAt?: string
  approvalTxId?: string
  rejectionNote?: string
}

const STORE_KEY = 'protius:project_submissions'

function loadAll(): ProjectSubmission[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAll(items: ProjectSubmission[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(items))
}

function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const projectStore = {
  getAll(): ProjectSubmission[] {
    return loadAll()
  },

  getPending(): ProjectSubmission[] {
    return loadAll().filter(s => s.status === 'PENDING')
  },

  getApproved(): ProjectSubmission[] {
    return loadAll().filter(s => s.status === 'APPROVED')
  },

  submit(data: Omit<ProjectSubmission, 'submissionId' | 'submittedAt' | 'status'>): ProjectSubmission {
    const all = loadAll()
    const submission: ProjectSubmission = {
      ...data,
      submissionId: generateId(),
      submittedAt: new Date().toISOString(),
      status: 'PENDING',
    }
    all.push(submission)
    saveAll(all)
    return submission
  },

  approve(
    submissionId: string,
    appIds: { registryAppId: number; kwTokenAppId: number; revenueVaultAppId: number; kwhReceiptAppId: number },
    txId: string,
  ): ProjectSubmission | null {
    const all = loadAll()
    const idx = all.findIndex(s => s.submissionId === submissionId)
    if (idx === -1) return null
    all[idx] = {
      ...all[idx],
      ...appIds,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvalTxId: txId,
    }
    saveAll(all)
    return all[idx]
  },

  reject(submissionId: string, note: string): void {
    const all = loadAll()
    const idx = all.findIndex(s => s.submissionId === submissionId)
    if (idx === -1) return
    all[idx] = { ...all[idx], status: 'REJECTED', rejectionNote: note }
    saveAll(all)
  },

  delete(submissionId: string): void {
    saveAll(loadAll().filter(s => s.submissionId !== submissionId))
  },
}
