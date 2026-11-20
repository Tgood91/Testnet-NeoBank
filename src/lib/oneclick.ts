import { isAddress } from 'viem'
import type { QuoteRequest, QuoteResponse, TokenResponse } from '@defuse-protocol/one-click-sdk-typescript'

/**
 * NEAR Intents "1Click" cross-chain transfers. The user sends USDC to a one-time deposit address on the
 * origin chain and the recipient gets USDC on the destination chain. Mainnet only, no API key or JWT:
 * unauthenticated quotes carry the provider's extra fee, which the quote shows.
 */

export const ONECLICK_API = 'https://1click.chaindefuser.com'
export const ONECLICK_EXPLORER_URL = 'https://explorer.near-intents.org'

/** Meridian networks that 1Click can send from, by chain id, mapped to the 1Click blockchain key. */
const SOURCES: Record<number, string> = { 8453: 'base' }

const LABELS: Record<string, string> = {
  eth: 'Ethereum',
  arb: 'Arbitrum',
  op: 'Optimism',
  pol: 'Polygon',
  avax: 'Avalanche',
  bsc: 'BNB Chain',
  base: 'Base',
  gnosis: 'Gnosis',
  monad: 'Monad',
  xlayer: 'X Layer',
}

export interface OneClickAsset {
  assetId: string
  blockchain: string
  label: string
  contractAddress: string
}

export interface OneClickRoutes {
  source: OneClickAsset
  destinations: OneClickAsset[]
}

export const isOneClickSource = (chainId: number) => chainId in SOURCES

async function sdk() {
  const mod = await import('@defuse-protocol/one-click-sdk-typescript')
  mod.OpenAPI.BASE = ONECLICK_API
  return mod
}

const toAsset = (t: TokenResponse): OneClickAsset => ({
  assetId: t.assetId,
  blockchain: String(t.blockchain),
  label: LABELS[String(t.blockchain)] ?? String(t.blockchain),
  contractAddress: t.contractAddress ?? '',
})

/**
 * Finds the live USDC route list. The source token must match the USDC address from Arc Studio's
 * registry exactly, otherwise there is no route: a mismatch is never papered over.
 */
export async function fetchRoutes(chainId: number, registryUsdc: string): Promise<OneClickRoutes | null> {
  const key = SOURCES[chainId]
  if (!key) return null
  const { OneClickService } = await sdk()
  const tokens = await OneClickService.getTokens()
  const usdc = tokens.filter((t) => t.symbol === 'USDC' && t.contractAddress && isAddress(t.contractAddress, { strict: false }))
  const source = usdc.find((t) => String(t.blockchain) === key && t.contractAddress?.toLowerCase() === registryUsdc.toLowerCase())
  if (!source) return null
  const seen = new Set<string>()
  const destinations: OneClickAsset[] = []
  for (const t of usdc) {
    const chain = String(t.blockchain)
    if (chain === key || seen.has(chain)) continue
    seen.add(chain)
    destinations.push(toAsset(t))
  }
  destinations.sort((a, b) => a.label.localeCompare(b.label))
  return { source: toAsset(source), destinations }
}

export interface QuoteInput {
  dry: boolean
  originAsset: string
  destinationAsset: string
  /** Raw USDC units on the origin chain. */
  amount: string
  slippageBps: number
  recipient: string
  refundTo: string
}

export async function requestQuote(input: QuoteInput): Promise<QuoteResponse> {
  const { OneClickService, QuoteRequest: Q } = await sdk()
  const request: QuoteRequest = {
    dry: input.dry,
    swapType: Q.swapType.EXACT_INPUT,
    slippageTolerance: input.slippageBps,
    originAsset: input.originAsset,
    depositType: Q.depositType.ORIGIN_CHAIN,
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    recipient: input.recipient,
    recipientType: Q.recipientType.DESTINATION_CHAIN,
    refundTo: input.refundTo,
    refundType: Q.refundType.ORIGIN_CHAIN,
    deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
  return OneClickService.getQuote(request)
}

export async function submitDeposit(txHash: string, depositAddress: string): Promise<void> {
  const { OneClickService } = await sdk()
  await OneClickService.submitDepositTx({ txHash, depositAddress })
}

export type OneClickStatus = 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED'

export const isTerminal = (s?: string) => s === 'SUCCESS' || s === 'REFUNDED' || s === 'FAILED'

export async function fetchStatus(depositAddress: string): Promise<OneClickStatus> {
  const { OneClickService } = await sdk()
  const res = await OneClickService.getExecutionStatus(depositAddress)
  return res.status
}
