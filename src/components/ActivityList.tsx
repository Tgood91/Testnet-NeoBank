import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Repeat2 } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { formatAddress, glass, timeAgo } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'
import { readMemos } from '@/hooks/useActivity'
import type { ActivityResult } from '@/hooks/useActivity'
import type { Contact } from '@/hooks/useContacts'

interface Props {
  address?: string
  data?: ActivityResult
  loading: boolean
  failed: boolean
  contacts: Contact[]
  onRetry: () => void
  onSendTo: (address: string) => void
}

export function ActivityList({ address, data, loading, failed, contacts, onRetry, onSendTo }: Props) {
  const memos = address ? readMemos(address) : {}
  const names = useMemo(() => new Map(contacts.map((c) => [c.address.toLowerCase(), c.name])), [contacts])
  const CHAIN_ID = useNetwork().network.id
  const decimals = usdcDecimalsFor(CHAIN_ID)

  return (
    <section className="rounded-3xl p-5" style={glass.card} aria-label="Recent activity">
      <h2 className="display text-base font-bold">Activity</h2>

      {!address ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          Your payments will appear here once you connect.
        </p>
      ) : loading && !data ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-black/5" />
          ))}
        </div>
      ) : failed && !data ? (
        <div className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          We couldn't load your activity.{' '}
          <button onClick={onRetry} className="min-h-11 font-semibold" style={{ color: 'var(--accent-hover)' }}>
            Try again
          </button>
        </div>
      ) : data && data.items.length === 0 ? (
        <p className="mt-3 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          No recent payments. Send or receive USDC and it will show up here.
        </p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
          {data?.items.map((item) => {
            const name = names.get(item.counterparty.toLowerCase())
            const memo = memos[item.hash.toLowerCase()]
            const incoming = item.direction === 'in'
            const Icon = item.direction === 'self' ? Repeat2 : incoming ? ArrowDownLeft : ArrowUpRight
            const amount = Amount.fromRaw(item.value, decimals).toFixed(2)
            return (
              <li key={`${item.hash}:${item.logIndex}`} className="flex items-center gap-3 py-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: incoming ? 'rgba(26,128,71,0.12)' : 'rgba(18,45,69,0.07)' }}
                >
                  <Icon className="size-4" style={{ color: incoming ? 'var(--success)' : 'var(--ink)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {item.direction === 'self' ? 'To yourself' : `${incoming ? 'From' : 'To'} ${name ?? formatAddress(item.counterparty)}`}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--subtle)' }}>
                    {item.timestamp ? timeAgo(item.timestamp) : 'Recently'}
                    {memo ? ` · ${memo}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="display text-sm font-bold tabular-nums" style={{ color: incoming ? 'var(--success)' : 'var(--ink)' }}>
                    {incoming ? '+' : item.direction === 'self' ? '' : '−'}${amount}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {!incoming && item.direction !== 'self' && !name && (
                      <button
                        onClick={() => onSendTo(item.counterparty)}
                        className="min-h-8 text-xs font-semibold"
                        style={{ color: 'var(--accent-hover)' }}
                      >
                        Send again
                      </button>
                    )}
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, item.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View receipt on explorer"
                      className="flex size-8 items-center justify-center"
                      style={{ color: 'var(--subtle)' }}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data && (
        <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
          {data.partial
            ? 'Showing part of your recent history. The network did not return older payments.'
            : `Showing payments from the last ${(data.head - data.fromBlock + 1n).toLocaleString('en-US')} blocks.`}
        </p>
      )}
    </section>
  )
}
