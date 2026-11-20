import { TriangleAlert } from 'lucide-react'
import { NETWORKS, glass } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'

const firstOf = (testnet: boolean) => NETWORKS.find((n) => n.isTestnet === testnet && n.usdc)

export function NetworkSwitcher() {
  const { network, select } = useNetwork()
  const testnet = network.isTestnet
  const visible = NETWORKS.filter((n) => n.isTestnet === testnet)
  const unavailable = visible.filter((n) => !n.usdc)

  return (
    <div className="space-y-2">
      <div className="flex rounded-full p-1" style={glass.pill} role="radiogroup" aria-label="Environment">
        {[true, false].map((isTest) => {
          const active = testnet === isTest
          return (
            <button
              key={String(isTest)}
              role="radio"
              aria-checked={active}
              onClick={() => {
                const target = firstOf(isTest)
                if (target) select(target.id)
              }}
              className="min-h-11 flex-1 rounded-full text-sm font-semibold transition-colors"
              style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? 'white' : 'var(--ink)' }}
            >
              {isTest ? 'Testnet' : 'Mainnet'}
            </button>
          )
        })}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Network">
        {visible.map((n) => {
          const active = n.id === network.id
          return (
            <button
              key={n.id}
              role="radio"
              aria-checked={active}
              disabled={!n.usdc}
              onClick={() => select(n.id)}
              className="min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                ...glass.pill,
                color: active ? 'white' : 'var(--ink)',
                background: active ? 'var(--accent)' : glass.pill.background,
              }}
            >
              {n.name}
            </button>
          )
        })}
      </div>

      {!testnet && (
        <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-xs text-pretty" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--ink-2)' }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <span>Mainnet uses real funds, and transactions cannot be undone. Check the network, address and amount before you confirm anything in your wallet.</span>
        </div>
      )}

      {unavailable.length > 0 && (
        <p className="px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          {unavailable.map((n) => n.name).join(', ')} {unavailable.length > 1 ? 'are' : 'is'} connected, but USDC payments are not available there yet.
        </p>
      )}
    </div>
  )
}
