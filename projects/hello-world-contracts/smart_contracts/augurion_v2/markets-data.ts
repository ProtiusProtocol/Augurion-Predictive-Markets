/**
 * Augurion v1 — Southern Africa Launch Markets
 * 
 * 9 prediction markets covering:
 * - Economic & System Fragility (E1-E6)
 * - National Sport Confidence Signals (S1-S3)
 */

export interface MarketConfig {
  id: string
  category: 'economic' | 'sport'
  title: string
  description: string
  marketRef: string // Short on-chain reference (e.g., SA-ENERGY-ESKOM-001)
  expiryDate: string
  expiryRound: number // Will be calculated based on current round
  feeBps: number
  resolutionSource: string
  tags: string[]
}

export const SOUTHERN_AFRICA_MARKETS: MarketConfig[] = [
  // ========================================
  // ECONOMIC & SYSTEM FRAGILITY MARKETS
  // ========================================
  {
    id: 'E1',
    category: 'economic',
    title: 'Eskom Stage 6+ Load-Shedding',
    description: 'Will Eskom implement Stage 6 or higher load-shedding again before 31 March 2026?',
    marketRef: 'SA-ENERGY-ESKOM-001',
    expiryDate: '2026-03-31',
    expiryRound: 0, // Calculate: rounds until March 31, 2026
    feeBps: 200, // 2% fee
    resolutionSource: 'Official Eskom declarations',
    tags: ['energy', 'infrastructure', 'governance']
  },
  {
    id: 'E2',
    category: 'economic',
    title: 'Unplanned Generation Outages >15,000 MW',
    description: 'Will unplanned generation outages in South Africa exceed 15,000 MW at any point in the next 3 months?',
    marketRef: 'SA-ENERGY-OUTAGE-002',
    expiryDate: '2026-03-15',
    expiryRound: 0, // Calculate: rounds until March 15, 2026
    feeBps: 200,
    resolutionSource: 'Eskom daily system status reports',
    tags: ['energy', 'short-term', 'technical']
  },
  {
    id: 'E3',
    category: 'economic',
    title: 'SA Renewable Energy Build Targets',
    description: 'Will South Africa miss its 2026 renewable-energy build targets under the REIPPPP programme?',
    marketRef: 'SA-ENERGY-REIPPPP-003',
    expiryDate: '2026-12-31',
    expiryRound: 0, // Calculate: rounds until December 31, 2026
    feeBps: 200,
    resolutionSource: 'DMRE / IPP Office published commissioning data',
    tags: ['energy', 'renewable', 'policy']
  },
  {
    id: 'E4',
    category: 'economic',
    title: 'Multi-Country Drought Emergency',
    description: 'Will Southern Africa experience a declared multi-country drought emergency before the end of October 2026 season?',
    marketRef: 'SA-CLIMATE-DROUGHT-004',
    expiryDate: '2026-09-30',
    expiryRound: 0, // Calculate: rounds until September 30, 2026
    feeBps: 200,
    resolutionSource: 'Formal disaster declarations by ≥2 governments',
    tags: ['climate', 'regional', 'agriculture']
  },
  {
    id: 'E5',
    category: 'economic',
    title: 'Major Metro Water Restrictions',
    description: 'Will water restrictions be imposed or tightened by 30% per household in at least one major Southern African metro before end of 2026? (e.g. Cape Town, Gqeberha, Harare, Windhoek)',
    marketRef: 'SA-WATER-METRO-005',
    expiryDate: '2026-12-30',
    expiryRound: 0, // Calculate: rounds until December 30, 2026
    feeBps: 200,
    resolutionSource: 'Official municipal notices',
    tags: ['water', 'municipal', 'climate']
  },
  {
    id: 'E6',
    category: 'economic',
    title: 'SA Government Coalition Change',
    description: 'Will South Africa\'s national government change coalition composition before the end of the current parliamentary term?',
    marketRef: 'SA-POLITICS-COALITION-006',
    expiryDate: '2026-12-16',
    expiryRound: 0, // Calculate: rounds until December 16, 2026
    feeBps: 200,
    resolutionSource: 'Formal parliamentary or cabinet announcements',
    tags: ['politics', 'governance', 'policy-risk']
  },

  // ========================================
  // NATIONAL SPORT — CONFIDENCE SIGNALS
  // ========================================
  {
    id: 'S1',
    category: 'sport',
    title: 'Springboks Win Rate >50%',
    description: 'Will the South Africa Springboks win more than 50% of their officially scheduled test matches in 2026, until 30 June 2026?',
    marketRef: 'SA-SPORT-RUGBY-001',
    expiryDate: '2026-06-30',
    expiryRound: 0, // Calculate: rounds until June 30, 2026
    feeBps: 200,
    resolutionSource: 'Official World Rugby match records',
    tags: ['sport', 'rugby', 'national-confidence']
  },
  {
    id: 'S2',
    category: 'sport',
    title: 'Proteas Lose 2+ Series',
    description: 'Will the Proteas lose at least two official home or neutral-venue series in 2026, and until 30 June 2026?',
    marketRef: 'SA-SPORT-CRICKET-002',
    expiryDate: '2026-06-30',
    expiryRound: 0, // Calculate: rounds until June 30, 2026
    feeBps: 200,
    resolutionSource: 'Cricket South Africa / ICC official records',
    tags: ['sport', 'cricket', 'sentiment']
  },
  {
    id: 'S3',
    category: 'sport',
    title: 'Bafana Bafana 3 Consecutive Wins',
    description: 'Will Bafana Bafana win 3 back-to-back competitive (non-friendly) international matches in 2026, before July 2026?',
    marketRef: 'SA-SPORT-FOOTBALL-003',
    expiryDate: '2026-07-30',
    expiryRound: 0, // Calculate: rounds until July 30, 2026
    feeBps: 200,
    resolutionSource: 'FIFA / SAFA official match records',
    tags: ['sport', 'football', 'underdog']
  }
]

/**
 * Calculate expiry round from target date
 * Algorand produces ~1 block every 3.3 seconds
 * @param targetDate ISO date string (YYYY-MM-DD)
 * @param currentRound Current blockchain round
 * @returns Estimated round at target date
 */
export function calculateExpiryRound(targetDate: string, currentRound: number): number {
  const now = Date.now()
  const target = new Date(targetDate).getTime()
  const secondsUntilExpiry = (target - now) / 1000
  const roundsUntilExpiry = Math.floor(secondsUntilExpiry / 3.3)
  return currentRound + roundsUntilExpiry
}

/**
 * Update all market expiry rounds based on current blockchain round
 */
export function updateExpiryRounds(currentRound: number): MarketConfig[] {
  return SOUTHERN_AFRICA_MARKETS.map(market => ({
    ...market,
    expiryRound: calculateExpiryRound(market.expiryDate, currentRound)
  }))
}
