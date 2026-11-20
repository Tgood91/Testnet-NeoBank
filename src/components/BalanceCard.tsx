import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { Amount } from '@/onchain-money'
import { glass } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'
import { requireChain } from '@/onchain-facts'

interface Props {
  connected: boolean
  wrongChain: boolean
  switching: boolean
  loading: boolean
  balance?: Amount
  onConnect: () => void
  onSwitch: () => void
  onSend: () => void
  onReceive: () => void
}

function splitBalance(balance?: Amount): { whole: string; cents: string } {
  if (!balance) return { whole: '0', cents: '00' }
  const [whole, cents = '00'] = balance.toFixed(2).split('.')
  return { whole: Number(whole).toLocaleString('en-US'), cents }
}

export function BalanceCard({ connected, wrongChain, switching, loading, balance, onConnect, onSwitch, onSend, onReceive }: Props) {
  const { network } = useNetwork()
  const CHAIN_NAME = network.name
  const feeToken = requireChain(network.id).nativeCurrency.symbol
  const { whole, cents } = splitBalance(balance)

  return (
    <section className="rounded-3xl p-6" style={glass.card} aria-label="Account balance">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
          Available balance
        </span>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ ...glass.pill, color: 'var(--muted)' }}>
          <TokenUSDC variant="branded" size={14} /> USDC
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1" aria-live="polite">
        {connected && loading && !balance ? (
          <div className="h-14 w-48 animate-pulse rounded-2xl bg-black/5" aria-label="Loading balance" />
        ) : (
          <>
            <span className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {connected ? `$${whole}` : '$0'}
            </span>
            <span className="display text-2xl font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>
              .{connected ? cents : '00'}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        {!connected
          ? 'Connect a wallet to see your balance and send dollars instantly.'
          : wrongChain
            ? `Your wallet is on another network. Switch to ${CHAIN_NAME} to continue.`
            : `Digital dollars on ${CHAIN_NAME}. Fees are paid in ${feeToken}.`}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {!connected ? (
          <button
            onClick={onConnect}
            className="col-span-2 min-h-12 rounded-2xl text-sm font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)' }}
          >
            Connect wallet
          </button>
        ) : wrongChain ? (
          <button
            onClick={onSwitch}
            disabled={switching}
            className="col-span-2 min-h-12 rounded-2xl text-sm font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {switching ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Switching…
              </span>
            ) : (
              `Switch to ${CHAIN_NAME}`
            )}
          </button>
        ) : (
          <>
            <button
              onClick={onSend}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'var(--accent)' }}
            >
              <ArrowUpRight className="size-4" /> Send
            </button>
            <button
              onClick={onReceive}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99]"
              style={{ ...glass.pill, color: 'var(--ink)' }}
            >
              <ArrowDownLeft className="size-4" /> Receive
            </button>
          </>
        )}
      </div>
    </section>
  )
}
