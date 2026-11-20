import { useMemo, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { SwapEstimate, SwapResult } from '@circle-fin/app-kit'
import type { EIP1193Provider } from 'viem'
import { ArrowDownUp, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { Sheet } from './Sheet'
import { getAppKit } from '@/lib/bridge'
import { glass, sanitizeAmount } from '@/lib/bank'
import type { Network } from '@/lib/bank'
import { AmountError, parseAmount } from '@/onchain-money'
import type { Amount } from '@/onchain-money'
import { useNetwork } from '@/hooks/useNetwork'

interface Props {
  open: boolean
  onClose: () => void
  balance?: Amount
  onSettled: () => void
}

type Token = 'USDC' | 'EURC' | 'CIRBTC' | 'USDT' | 'WETH'

// On Arc, swaps accept only USDC, EURC and cirBTC. NATIVE is never offered: on Arc it is the same asset as USDC.
const TOKENS: Record<NonNullable<Network['swapChain']>, readonly Token[]> = {
  Arc_Testnet: ['USDC', 'EURC', 'CIRBTC'],
  Arc: ['USDC', 'EURC', 'CIRBTC'],
  Base: ['USDC', 'EURC', 'USDT', 'WETH'],
}

const SLIPPAGE_CHOICES = [50, 100, 200] as const
const STABLES: readonly Token[] = ['USDC', 'EURC', 'USDT']

const label = (t: Token) => (t === 'CIRBTC' ? 'cirBTC' : t)

interface Reviewed {
  key: string
  estimate: SwapEstimate
  account?: string
}

export function SwapSheet(props: Props) {
  // The body remounts on every open, so a finished swap never leaks into the next one.
  return (
    <Sheet open={props.open} title="Swap" onClose={props.onClose}>
      <SwapBody {...props} />
    </Sheet>
  )
}

function SwapBody({ onClose, balance, onSettled }: Props) {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { network } = useNetwork()
  const swapChain = network.swapChain

  const tokens = swapChain ? TOKENS[swapChain] : []
  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>(tokens.find((t) => t !== 'USDC') ?? 'EURC')
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(100)
  const [reviewed, setReviewed] = useState<Reviewed | null>(null)
  const [busy, setBusy] = useState<'quote' | 'swap' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwapResult | null>(null)

  const requestKey = `${network.id}|${tokenIn}|${tokenOut}|${amount}|${slippageBps}|${address ?? ''}`
  const fresh = reviewed?.key === requestKey ? reviewed : null

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      return parseAmount(network.id, amount)
    } catch (e) {
      if (e instanceof AmountError) return undefined
      throw e
    }
  }, [amount, network.id])
  const overBalance = tokenIn === 'USDC' && !!parsed && !!balance && parsed.gt(balance)
  const valid = !!swapChain && !!address && !!parsed && parsed.isPositive() && !overBalance && tokenIn !== tokenOut
  const large = STABLES.includes(tokenIn) && Number(amount) > 100

  const pickIn = (t: Token) => {
    setTokenIn(t)
    if (t === tokenOut) setTokenOut(tokenIn)
  }
  const pickOut = (t: Token) => {
    setTokenOut(t)
    if (t === tokenIn) setTokenIn(tokenOut)
  }

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (walletChainId !== network.id) await switchChainAsync({ chainId: network.id })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const describe = (e: unknown): string | null => {
    const err = e as { code?: number; message?: string }
    if (err.code === 4001 || /user rejected|user denied/i.test(err.message ?? '')) return null
    return 'No route or quote is available for this swap right now. Try a smaller amount or a different pair.'
  }

  const review = async () => {
    if (!valid || !swapChain) return
    setError(null)
    setBusy('quote')
    try {
      const adapter = await getAdapter()
      const estimate = await getAppKit().estimateSwap({
        from: { adapter, chain: swapChain },
        tokenIn,
        tokenOut,
        amountIn: amount,
        config: { slippageBps },
      })
      setReviewed({ key: requestKey, estimate, account: address })
    } catch (e) {
      setReviewed(null)
      setError(describe(e))
    } finally {
      setBusy(null)
    }
  }

  // Runs only from the Swap button click, after the quote above is on screen.
  const execute = async () => {
    if (!fresh || !swapChain) return
    if (address !== fresh.account) {
      setError('Your wallet account changed since the quote. Review the quote again.')
      setReviewed(null)
      return
    }
    setError(null)
    setBusy('swap')
    try {
      const adapter = await getAdapter()
      const res = await getAppKit().swap({
        from: { adapter, chain: swapChain },
        tokenIn,
        tokenOut,
        amountIn: amount,
        config: { slippageBps },
      })
      setResult(res)
      setReviewed(null)
      onSettled()
    } catch (e) {
      setError(describe(e) === null ? null : 'The swap could not be completed. Nothing was swapped unless your wallet shows a confirmed transaction.')
    } finally {
      setBusy(null)
    }
  }

  if (!swapChain) {
    return (
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        Swaps are available on Arc Testnet, Arc and Base. Switch network to continue.
      </p>
    )
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl p-4" style={glass.inner}>
          <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Swap submitted
          </div>
          <div className="display mt-1 text-2xl font-bold tabular-nums">
            {result.amountIn} {String(result.tokenIn)}
          </div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            {result.amountOut ? `Received ${result.amountOut} ${String(result.tokenOut)}` : `to ${String(result.tokenOut)} on ${network.name}`}
          </div>
          {result.explorerUrl && (
            <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
              View receipt on explorer <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <button onClick={onClose} className="min-h-12 w-full rounded-2xl text-sm font-semibold" style={{ ...glass.pill, color: 'var(--ink)' }}>
          Done
        </button>
      </div>
    )
  }

  const select = (value: Token, onChange: (t: Token) => void, aria: string) => (
    <select
      aria-label={aria}
      value={value}
      disabled={busy !== null}
      onChange={(e) => onChange(e.target.value as Token)}
      className="min-h-11 rounded-xl bg-white/70 px-3 text-sm font-semibold outline-none"
      style={{ border: '1px solid var(--border)' }}
    >
      {tokens.map((t) => (
        <option key={t} value={t}>
          {label(t)}
        </option>
      ))}
    </select>
  )

  return (
    <div className="space-y-3">
      {!network.isTestnet && (
        <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-xs text-pretty" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--ink-2)' }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <span>This swap uses real funds on {network.name} and cannot be undone. Try a small amount first.</span>
        </div>
      )}

      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="flex items-center gap-2">
          <span className="w-10 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Pay
          </span>
          {select(tokenIn, pickIn, 'Token to pay with')}
          <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>
            {network.name}
          </span>
        </div>
        <input
          inputMode="decimal"
          aria-label={`Amount in ${label(tokenIn)}`}
          value={amount}
          onChange={(e) => {
            const v = sanitizeAmount(e.target.value)
            if (v !== null) setAmount(v)
          }}
          placeholder="0.00"
          className="display mt-2 w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
        />
        {tokenIn === 'USDC' && (
          <button
            disabled={!balance}
            onClick={() => balance && setAmount(balance.toFixed(6).replace(/\.?0+$/, ''))}
            className="min-h-8 text-xs font-semibold disabled:opacity-40"
            style={{ color: 'var(--accent-hover)' }}
          >
            {balance ? `Balance ${balance.toFixed(2)} · Max` : 'Balance unavailable'}
          </button>
        )}
        {overBalance && (
          <span className="block text-xs" style={{ color: 'var(--danger)' }}>
            That's more than your available balance.
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <button
          aria-label="Flip tokens"
          disabled={busy !== null}
          onClick={() => {
            setTokenIn(tokenOut)
            setTokenOut(tokenIn)
          }}
          className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={glass.pill}
        >
          <ArrowDownUp className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-2xl p-4" style={glass.inner}>
        <span className="w-14 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
          Receive
        </span>
        {select(tokenOut, pickOut, 'Token to receive')}
        <span className="ml-auto text-sm font-semibold tabular-nums">{fresh ? `≈ ${fresh.estimate.estimatedOutput.amount}` : ''}</span>
      </div>

      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          Slippage tolerance
        </div>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Slippage tolerance">
          {SLIPPAGE_CHOICES.map((bps) => (
            <button
              key={bps}
              role="radio"
              aria-checked={slippageBps === bps}
              disabled={busy !== null}
              onClick={() => setSlippageBps(bps)}
              className="min-h-11 flex-1 rounded-full text-sm font-semibold"
              style={{ ...glass.pill, background: slippageBps === bps ? 'var(--accent)' : glass.pill.background, color: slippageBps === bps ? 'white' : 'var(--ink)' }}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Tighter slippage protects you from price moves and sandwich attacks, but the swap fails more often when prices are volatile.
        </p>
      </div>

      {fresh && (
        <div className="space-y-1 rounded-2xl px-4 py-3 text-xs" style={glass.inner}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>You pay</span>
            <span className="font-semibold tabular-nums">
              {fresh.estimate.amountIn} {label(tokenIn)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Estimated receive</span>
            <span className="font-semibold tabular-nums">
              {fresh.estimate.estimatedOutput.amount} {fresh.estimate.estimatedOutput.token}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Minimum receive</span>
            <span className="font-semibold tabular-nums">
              {fresh.estimate.stopLimit.amount} {fresh.estimate.stopLimit.token}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--muted)' }}>Fees</span>
            <span className="text-right font-semibold tabular-nums">
              {fresh.estimate.fees && fresh.estimate.fees.length > 0 ? fresh.estimate.fees.map((f) => `${f.amount} ${f.token}`).join(' + ') : 'None quoted'}
            </span>
          </div>
        </div>
      )}

      {large && (
        <p className="text-xs text-pretty" style={{ color: 'var(--danger)' }}>
          This is a large amount. Consider swapping a smaller amount first.
        </p>
      )}
      {error && (
        <p className="text-xs text-pretty" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {fresh ? (
        <button
          disabled={busy !== null}
          onClick={() => void execute()}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {busy === 'swap' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
            </span>
          ) : (
            `Swap ${amount} ${label(tokenIn)} to ${label(tokenOut)}`
          )}
        </button>
      ) : (
        <button
          disabled={!valid || busy !== null}
          onClick={() => void review()}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {busy === 'quote' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Getting quote…
            </span>
          ) : (
            'Review quote'
          )}
        </button>
      )}

      <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Swaps are routed through a swap provider, either a third-party aggregator such as LiFi or Circle. The provider can change by route, and you are subject to its terms of service.
      </p>
    </div>
  )
}
