/**
 * Read-only Chainlink CCIP lane lookup. Route and token availability always comes from the live
 * CCIP API, never from a cached assumption. Nothing here sends a transaction.
 */

const LANES_URL = 'https://docs.chain.link/api/ccip/v1/lanes'

export const CCIP_EXPLORER_URL = 'https://ccip.chain.link/'

export interface CcipLane {
  source: { name: string; selector: string }
  destination: { name: string; selector: string }
  onRampVersion: string
  /** Token symbols the lane can carry. Empty means the lane carries messages only. */
  tokens: string[]
}

interface LaneEntry {
  sourceChain: { displayName: string; selector: string }
  destinationChain: { displayName: string; selector: string }
  onRamp?: { version?: string }
  supportedTokens?: string[]
}

interface LanesResponse {
  data?: Record<string, LaneEntry>
}

/** Returns the lane for a chain pair, or null when CCIP has no lane between them. */
export async function fetchCcipLane(sourceChainId: number, destinationChainId: number, testnet: boolean, signal?: AbortSignal): Promise<CcipLane | null> {
  const url = `${LANES_URL}?environment=${testnet ? 'testnet' : 'mainnet'}&sourceChainId=${sourceChainId}&destinationChainId=${destinationChainId}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`CCIP API responded with ${res.status}`)
  const body = (await res.json()) as LanesResponse
  // The API returns the whole lane map, so pick the pair by key.
  const lane = body.data?.[`${sourceChainId}_to_${destinationChainId}`]
  if (!lane) return null
  return {
    source: { name: lane.sourceChain.displayName, selector: lane.sourceChain.selector },
    destination: { name: lane.destinationChain.displayName, selector: lane.destinationChain.selector },
    onRampVersion: lane.onRamp?.version ?? 'unknown',
    tokens: lane.supportedTokens ?? [],
  }
}

// ---------------------------------------------------------------------------
// Token transfer routes. Everything below comes from the live CCIP directory.
// ---------------------------------------------------------------------------

const API = 'https://docs.chain.link/api/ccip/v1'

export interface CcipDestination {
  chainId: number
  name: string
  selector: string
}

export interface CcipToken {
  symbol: string
  address: `0x${string}`
  decimals: number
  /** EVM destination chains this token can reach from the source chain. */
  destinations: CcipDestination[]
}

export interface CcipRoutes {
  router: `0x${string}`
  tokens: CcipToken[]
}

interface ChainsResponse {
  data?: { evm?: Record<string, { displayName: string; selector: string; router: string }> }
}

interface TokensResponse {
  data?: Record<string, Record<string, { tokenAddress: string; decimals: number; destinations: string[] }>>
}

/** Tokens a wallet on `sourceChainId` can send over CCIP, with the EVM chains each one reaches. */
export async function fetchCcipRoutes(sourceChainId: number, testnet: boolean, signal?: AbortSignal): Promise<CcipRoutes | null> {
  const environment = testnet ? 'testnet' : 'mainnet'
  const [chainsRes, tokensRes] = await Promise.all([
    fetch(`${API}/chains?environment=${environment}`, { signal }),
    fetch(`${API}/tokens?environment=${environment}`, { signal }),
  ])
  if (!chainsRes.ok || !tokensRes.ok) throw new Error('CCIP API unavailable')
  const chains = ((await chainsRes.json()) as ChainsResponse).data?.evm ?? {}
  const tokens = ((await tokensRes.json()) as TokensResponse).data ?? {}

  const source = chains[String(sourceChainId)]
  if (!source) return null

  const out: CcipToken[] = []
  for (const [symbol, perChain] of Object.entries(tokens)) {
    const entry = perChain[String(sourceChainId)]
    if (!entry) continue
    const destinations: CcipDestination[] = []
    for (const id of entry.destinations) {
      // Only numeric ids are EVM chains this wallet can receive on. Solana, Aptos and others are skipped.
      const dest = /^\d+$/.test(id) ? chains[id] : undefined
      if (dest) destinations.push({ chainId: Number(id), name: dest.displayName, selector: dest.selector })
    }
    if (destinations.length > 0) {
      out.push({ symbol, address: entry.tokenAddress as `0x${string}`, decimals: entry.decimals, destinations })
    }
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol))
  return { router: source.router as `0x${string}`, tokens: out }
}
