/**
 * Protius Project Registry (Frontend)
 *
 * Each entry represents a deployed project with its on-chain contract App IDs.
 * To add a new project, append an entry to the PROJECTS array:
 *
 *   {
 *     id: 'unique-id',
 *     name: 'Display Name',
 *     location: 'Optional description e.g. "Sydney, AU – 500 kW"',
 *     registryAppId: <ProjectRegistry App ID>,
 *     kwTokenAppId:  <KWToken App ID>,
 *     revenueVaultAppId: <RevenueVault App ID>,
 *     kwhReceiptAppId:   <KWhReceipt App ID>,
 *   }
 *
 * The network (algod server/token) comes from .env and is shared across all projects.
 */

export interface ProjectEntry {
  id: string
  name: string
  location?: string
  registryAppId: number
  kwTokenAppId: number
  revenueVaultAppId: number
  kwhReceiptAppId: number
  /** ISO date string e.g. "2026-12-15" — target commercial operation date */
  expectedCodDate?: string
  /** Days after COD that Provisional Acceptance is granted (default 30) */
  provisionalAcceptanceOffsetDays?: number
  /** Full name of the project manager investors can contact */
  managerName?: string
  /** Contact detail for the project manager (email or phone) */
  managerContact?: string
}

export const PROJECTS: ProjectEntry[] = [
  {
    id: 'protius-001-testnet',
    name: 'PROTIUS-001',
    location: 'TestNet – 1000 kW solar',
    registryAppId: 756428038,
    kwTokenAppId: 756198809,
    revenueVaultAppId: 756074359,
    kwhReceiptAppId: 756074340,
    expectedCodDate: '2026-12-15',
    provisionalAcceptanceOffsetDays: 30,
    managerName: 'Giorgio Mauro',
    managerContact: 'giorgio@protius.io',
  },
  {
    id: 'protius-002-testnet',
    name: 'PROTIUS-002',
    location: 'TestNet – 500 kW solar',
    registryAppId: 756428065,
    kwTokenAppId: 756198809,
    revenueVaultAppId: 756074359,
    kwhReceiptAppId: 756074340,
    expectedCodDate: '2027-06-15',
    provisionalAcceptanceOffsetDays: 30,
    managerName: 'Giorgio Mauro',
    managerContact: 'giorgio@protius.io',
  },
]

export const DEFAULT_PROJECT: ProjectEntry = PROJECTS[0]
