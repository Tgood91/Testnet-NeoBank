import { NETWORKS, glass } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'

export function NetworkSwitcher() {
  const { network, select } = useNetwork()
  const unavailable = NETWORKS.filter((n) => !n.usdc)

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Network">
        {NETWORKS.map((n) => {
          const active = n.id === network.id
          const disabled = !n.usdc
          return (
            <button
              key={n.id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
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
      {unavailable.length > 0 && (
        <p className="mt-1 px-1 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          {unavailable.map((n) => n.name).join(', ')} {unavailable.length > 1 ? 'are' : 'is'} connected, but USDC payments are not available there yet.
        </p>
      )}
    </div>
  )
}
