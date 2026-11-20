import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CHAIN_ID, PAYABLE_NETWORKS, getNetwork } from '@/lib/bank'
import type { Network } from '@/lib/bank'

const KEY = 'meridian:network'

function load(): number {
  // A payment link names the network it was created on.
  const linked = Number(new URLSearchParams(window.location.search).get('chain'))
  if (PAYABLE_NETWORKS.some((n) => n.id === linked)) return linked
  // Only testnets are restored from a previous visit: a mainnet session always starts on purpose.
  const saved = Number(localStorage.getItem(KEY))
  return PAYABLE_NETWORKS.some((n) => n.id === saved && n.isTestnet) ? saved : DEFAULT_CHAIN_ID
}

interface NetworkState {
  network: Network
  /** Selects a network that has USDC registered. Returns false for any other chain. */
  select: (chainId: number) => boolean
}

const Ctx = createContext<NetworkState | null>(null)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState<number>(load)

  const select = useCallback((id: number) => {
    if (!PAYABLE_NETWORKS.some((n) => n.id === id)) return false
    setChainId(id)
    if (getNetwork(id).isTestnet) localStorage.setItem(KEY, String(id))
    return true
  }, [])

  const value = useMemo(() => ({ network: getNetwork(chainId), select }), [chainId, select])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNetwork(): NetworkState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNetwork must be used inside NetworkProvider')
  return ctx
}
