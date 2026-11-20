import { arc, arcTestnet, base, baseSepolia, monadTestnet } from 'viem/chains'
import { getAddress, isAddress } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'

export interface Network {
  id: number
  name: string
  /** Mainnets move real funds. */
  isTestnet: boolean
  /** ERC-20 USDC address from the registry. Undefined when USDC is not registered for the chain. */
  usdc?: `0x${string}`
  /** Block window used when scanning transfer logs. Public RPCs cap eth_getLogs ranges differently. */
  logRange: bigint
  logRanges: number
  /** Circle bridge chain identifier. Undefined when the chain cannot be bridged with CCTP here. */
  bridgeChain?: 'Arc_Testnet' | 'Base_Sepolia' | 'Arc' | 'Base'
  /** Circle swap chain identifier. Undefined when swaps are not offered here. */
  swapChain?: 'Arc_Testnet' | 'Arc' | 'Base'
}

function toNetwork(id: number, logRange: bigint, logRanges: number, bridgeChain?: Network['bridgeChain'], swapChain?: Network['swapChain']): Network {
  const usdc = getUsdc(id)
  const fact = requireChain(id)
  return { id, name: fact.name, isTestnet: fact.isTestnet, usdc: usdc ? (usdc.address as `0x${string}`) : undefined, logRange, logRanges, bridgeChain, swapChain }
}

export const NETWORKS: readonly Network[] = [
  toNetwork(arcTestnet.id, 10_000n, 5, 'Arc_Testnet', 'Arc_Testnet'),
  // Base Sepolia's public RPC rejects eth_getLogs ranges above 200 blocks (measured).
  toNetwork(baseSepolia.id, 200n, 25, 'Base_Sepolia'),
  toNetwork(monadTestnet.id, 100n, 10),
  // Mainnets. Public RPC log limits are unknown, so the windows are small and a failed range is reported as partial.
  toNetwork(arc.id, 1_000n, 10, 'Arc', 'Arc'),
  toNetwork(base.id, 200n, 25, 'Base', 'Base'),
]

export const DEFAULT_CHAIN_ID: number = arcTestnet.id

export function getNetwork(chainId: number): Network {
  return NETWORKS.find((n) => n.id === chainId) ?? NETWORKS[0]
}

/** Networks where Meridian can move USDC. */
export const PAYABLE_NETWORKS = NETWORKS.filter((n) => n.usdc)

export const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(18,45,69,0.08)',
  } as React.CSSProperties,
  pill: {
    background: 'rgba(255,255,255,0.58)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.66)',
  } as React.CSSProperties,
}

export const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

export const formatAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export function normalizeAddress(value: string): `0x${string}` | null {
  const v = value.trim()
  return isAddress(v, { strict: false }) ? getAddress(v) : null
}

export function sanitizeAmount(value: string): string | null {
  const v = value.replace(/[^0-9.]/g, '')
  if (!/^\d*\.?\d{0,6}$/.test(v)) return null
  return v
}

export function parseOnchainError(error: unknown): string | null {
  const e = error as { message?: string; code?: number } | null
  const message = e?.message?.toLowerCase() ?? ''
  if (message.includes('user rejected') || message.includes('user denied') || e?.code === 4001) return null
  if (message.includes('insufficient funds') || message.includes('exceeds balance'))
    return 'Insufficient balance to cover this payment and the network fee.'
  if (message.includes('reverted')) return 'The transfer was rejected by the network. Please try again.'
  if (message.includes('network') || message.includes('timeout')) return 'Network issue. Check your connection and retry.'
  return 'Something went wrong. Please try again.'
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
