import { Suspense, lazy, useMemo, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { BridgeResult } from '@circle-fin/app-kit'
import type { EIP1193Provider } from 'viem'
import { ArrowRight, Check, ExternalLink, Loader2, Network as NetworkIcon, TriangleAlert } from 'lucide-react'
import { Sheet } from './Sheet'
import { CCIP_EXPLORER_URL, fetchCcipLane } from '@/lib/ccip'
import { BRIDGE_CHAINS, getAppKit, withAddChainFallback } from '@/lib/bridge'
import { PAYABLE_NETWORKS, glass, sanitizeAmount } from '@/lib/bank'
import type { Network } from '@/lib/bank'
import { AmountError, parseAmount } from '@/onchain-money'
import type { Amount } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useNetwork } from '@/hooks/useNetwork'

// The 1Click SDK loads only when its tab is opened.
const OneClickBridge = lazy(() => import('./OneClickBridge').then((m) => ({ default: m.OneClickBridge })))

interface Props {
  open: boolean
  onClose: () => void
  balance?: Amount
  onSettled: () => void
}

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
interface StepState {
  done: boolean
  txHash?: string
  failed?: boolean
}

const STEPS: { name: StepName; label: string; where: 'source' | 'destination' | 'circle' }[] = [
  { name: 'approve', label: 'Approve USDC', where: 'source' },
  { name: 'burn', label: 'Burn on source network', where: 'source' },
  { name: 'fetchAttestation', label: 'Circle attestation', where: 'circle' },
  { name: 'mint', label: 'Mint on destination network', where: 'destination' },
]

const isStepName = (v: unknown): v is StepName => STEPS.some((s) => s.name === v)

export function BridgeSheet(props: Props) {
  const [route, setRoute] = useState<'cctp' | '1click'>('cctp')
  // The body remounts on every open, so a finished transfer never leaks into the next one.
  return (
    <Sheet open={props.open} title="Bridge USDC" onClose={props.onClose}>
      <div className="mb-3 flex rounded-full p-1" style={glass.pill} role="radiogroup" aria-label="Bridge route">
        {(
          [
            ['cctp', 'CCTP v2'],
            ['1click', 'NEAR Intents'],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            role="radio"
            aria-checked={route === id}
            onClick={() => setRoute(id)}
            className="min-h-11 flex-1 rounded-full text-sm font-semibold transition-colors"
            style={{ background: route === id ? 'var(--accent)' : 'transparent', color: route === id ? 'white' : 'var(--ink)' }}
          >
            {name}
          </button>
        ))}
      </div>
      {route === 'cctp' ? (
        <BridgeBody {...props} />
      ) : (
        <Suspense fallback={<p className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</p>}>
          <OneClickBridge balance={props.balance} onSettled={props.onSettled} onClose={props.onClose} />
        </Suspense>
      )}
    </Sheet>
  )
}

function BridgeBody({ onClose, balance, onSettled }: Props) {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { network: source } = useNetwork()

  const destinations = useMemo(() => PAYABLE_NETWORKS.filter((n) => n.id !== source.id && n.bridgeChain && n.isTestnet === source.isTestnet), [source.id, source.isTestnet])
  const [destId, setDestId] = useState<number | undefined>(undefined)
  const destination: Network | undefined = destinations.find((n) => n.id === destId) ?? destinations[0]

  const [amount, setAmount] = useState('')
  const [forward, setForward] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [steps, setSteps] = useState<Partial<Record<StepName, StepState>>>({})
  const [errorText, setErrorText] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<BridgeResult | null>(null)

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      return parseAmount(source.id, amount)
    } catch (e) {
      if (e instanceof AmountError) return undefined
      throw e
    }
  }, [amount, source.id])
  const overBalance = !!parsed && !!balance && parsed.gt(balance)
  const valid = !!parsed && parsed.isPositive() && !overBalance && !!destination && !!source.bridgeChain && !!address

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider: withAddChainFallback(provider, BRIDGE_CHAINS) })
  }

  const ccip = useQuery({
    queryKey: ['ccip-lane', source.id, destination?.id, source.isTestnet],
    enabled: !!destination,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: ({ signal }) => fetchCcipLane(source.id, destination.id, source.isTestnet, signal),
  })

  const quote = useQuery({
    queryKey: ['bridge-quote', address, source.id, destination?.id, amount, forward],
    enabled: valid && phase === 'idle',
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const adapter = await getAdapter()
      return getAppKit().estimateBridge({
        from: { adapter, chain: source.bridgeChain! },
        to: { adapter, chain: destination.bridgeChain!, useForwarder: forward },
        amount,
      })
    },
  })

  const run = async (resume?: BridgeResult) => {
    if (!valid || !destination || !source.bridgeChain || !destination.bridgeChain) return
    const kit = getAppKit()
    let produced: BridgeResult | null = resume ?? null
    setErrorText(null)
    setPhase('running')
    if (!resume) setSteps({})

    const onEvent = (payload: unknown) => {
      const e = payload as { method?: string; values?: { state?: string; txHash?: string } }
      const name = e.method?.replace(/^bridge\./, '')
      if (!isStepName(name) || e.values?.state === 'error' || e.values?.state === 'pending') return
      setSteps((prev) => ({ ...prev, [name]: { done: true, txHash: e.values?.txHash ?? prev[name]?.txHash } }))
    }
    kit.on('*', onEvent)

    try {
      if (walletChainId !== source.id) await switchChainAsync({ chainId: source.id })
      const adapter = await getAdapter()
      const result = resume
        ? await kit.retryBridge(resume, { from: adapter, to: adapter })
        : await kit.bridge({
            from: { adapter, chain: source.bridgeChain },
            to: { adapter, chain: destination.bridgeChain, useForwarder: forward },
            amount,
          })
      produced = result
      setLastResult(result)

      const next: Partial<Record<StepName, StepState>> = {}
      for (const s of result.steps) {
        if (isStepName(s.name)) next[s.name] = { done: s.state === 'success', failed: s.state === 'error', txHash: s.txHash }
      }
      setSteps((prev) => ({ ...prev, ...next }))

      if (result.state === 'success') {
        setPhase('success')
        onSettled()
      } else {
        setPhase('error')
        setErrorText('The transfer stopped before it finished. Your funds are safe: retry to continue from the step that failed.')
      }
    } catch (error) {
      const e = error as { code?: number; message?: string }
      const rejected = e.code === 4001 || /user rejected|user denied/i.test(e.message ?? '')
      setPhase(produced || Object.keys(steps).length > 0 ? 'error' : 'idle')
      setErrorText(rejected ? null : 'The bridge could not complete. Check your balance and network fees, then try again.')
    } finally {
      kit.off('*', onEvent)
    }
  }

  const stepLink = (name: StepName, hash?: string) => {
    if (!hash || !destination) return undefined
    return buildTxExplorerUrl(name === 'mint' ? destination.id : source.id, hash)
  }

  const activeIndex = STEPS.findIndex((s) => !steps[s.name]?.done)
  const ccipLane = ccip.data

  if (!source.bridgeChain || !destination) {
    return (
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        Bridging needs two networks that support USDC transfers. Switch to Arc or Base to start.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl p-4" style={glass.inner}>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            From
          </div>
          <div className="truncate text-sm font-semibold">{source.name}</div>
        </div>
        <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
        <div className="min-w-0 flex-1 text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            To
          </div>
          {destinations.length > 1 ? (
            <select
              aria-label="Destination network"
              value={destination.id}
              disabled={phase !== 'idle'}
              onChange={(e) => setDestId(Number(e.target.value))}
              className="min-h-8 max-w-full bg-transparent text-right text-sm font-semibold outline-none"
            >
              {destinations.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="truncate text-sm font-semibold">{destination.name}</div>
          )}
        </div>
      </div>

      {!source.isTestnet && (
        <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-xs text-pretty" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--ink-2)' }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <span>
            This moves real USDC on mainnet and cannot be undone.{' '}
            {Number(amount) > 100 ? 'This is a large amount: consider sending a small test amount first.' : 'Consider sending a small test amount first.'}
          </span>
        </div>
      )}

      {phase === 'idle' || (phase === 'error' && Object.keys(steps).length === 0) ? (
        <>
          <div className="rounded-2xl p-4" style={glass.inner}>
            <input
              inputMode="decimal"
              aria-label="Amount in USDC"
              value={amount}
              onChange={(e) => {
                const v = sanitizeAmount(e.target.value)
                if (v !== null) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
              <button
                disabled={!balance}
                onClick={() => balance && setAmount(balance.toFixed(6).replace(/\.?0+$/, ''))}
                className="min-h-8 text-xs font-semibold disabled:opacity-40"
                style={{ color: 'var(--accent-hover)' }}
              >
                {balance ? `Balance ${balance.toFixed(2)} · Max` : 'Balance unavailable'}
              </button>
            </div>
            {overBalance && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>
                That's more than your available balance.
              </span>
            )}
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-4 py-3" style={glass.inner}>
            <input type="checkbox" checked={forward} onChange={(e) => setForward(e.target.checked)} className="mt-1 size-4" />
            <span className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
              <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Let Circle finish the transfer
              </span>
              Circle submits the final step, so you don't need gas on {destination.name}. A forwarding fee applies.
            </span>
          </label>

          <div className="space-y-1 rounded-2xl px-4 py-3 text-xs" style={glass.inner}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Protocol</span>
              <span className="font-semibold">Circle CCTP v2 (fast transfer)</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--muted)' }}>Fees</span>
              <span className="text-right font-semibold tabular-nums">
                {!valid
                  ? 'Enter an amount'
                  : quote.isFetching
                    ? 'Estimating…'
                    : quote.data
                      ? [
                          ...(quote.data.fees ?? []).map((f) => (f.amount ? `${f.amount} ${f.token}` : null)),
                          ...(quote.data.gasFees ?? []).map((g) => (g.fees?.fee ? `${g.fees.fee} gas on ${g.blockchain}` : null)),
                        ]
                          .filter(Boolean)
                          .join(' + ') || 'None quoted'
                      : 'Estimate unavailable'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl p-4" style={glass.inner}>
          <div className="display text-2xl font-bold tabular-nums">{amount} USDC</div>
          <ol className="mt-3 space-y-2" aria-live="polite">
            {STEPS.map((s, i) => {
              const st = steps[s.name]
              const active = phase === 'running' && i === activeIndex
              const link = stepLink(s.name, st?.txHash)
              return (
                <li key={s.name} className="flex items-center gap-3 text-sm">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: st?.done ? 'rgba(26,128,71,0.14)' : st?.failed ? 'rgba(186,43,76,0.12)' : 'rgba(18,45,69,0.07)' }}
                  >
                    {st?.done ? (
                      <Check className="size-3.5" style={{ color: 'var(--success)' }} />
                    ) : active ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                  </span>
                  <span className="flex-1" style={{ color: st?.done || active ? 'var(--ink)' : 'var(--subtle)' }}>
                    {s.label}
                  </span>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`View ${s.label} on explorer`} className="flex size-8 items-center justify-center" style={{ color: 'var(--subtle)' }}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
          {phase === 'running' && (
            <p className="mt-3 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
              Confirm each prompt in your wallet. Your wallet may switch networks for the final step.
            </p>
          )}
          {phase === 'success' && (
            <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--success)' }}>
              {amount} USDC arrived on {destination.name}.
            </p>
          )}
        </div>
      )}

      {errorText && (
        <p className="text-xs text-pretty" style={{ color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}

      {phase === 'success' ? (
        <button onClick={onClose} className="min-h-12 w-full rounded-2xl text-sm font-semibold" style={{ ...glass.pill, color: 'var(--ink)' }}>
          Done
        </button>
      ) : phase === 'error' && lastResult ? (
        <button
          onClick={() => void run(lastResult)}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Retry from the failed step
        </button>
      ) : (
        <button
          disabled={!valid || phase === 'running'}
          onClick={() => void run()}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {phase === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Bridging…
            </span>
          ) : parsed?.isPositive() ? (
            `Bridge ${amount} USDC to ${destination.name}`
          ) : (
            'Bridge'
          )}
        </button>
      )}

      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          <NetworkIcon className="size-3.5" /> Chainlink CCIP route
        </div>
        <p className="mt-1 text-xs text-pretty" style={{ color: 'var(--ink-2)' }}>
          {ccip.isLoading
            ? 'Checking the live CCIP directory…'
            : ccip.isError
              ? 'Could not reach the CCIP directory right now.'
              : !ccipLane
                ? `CCIP has no lane from ${source.name} to ${destination.name}.`
                : ccipLane.tokens.length === 0
                  ? `A CCIP lane is live (onRamp v${ccipLane.onRampVersion}), but it carries messages only. No tokens, including USDC, can move over it, so USDC bridges use CCTP.`
                  : ccipLane.tokens.includes('USDC')
                    ? `A CCIP lane is live (onRamp v${ccipLane.onRampVersion}) and lists USDC among ${ccipLane.tokens.join(', ')}.`
                    : `A CCIP lane is live (onRamp v${ccipLane.onRampVersion}) for ${ccipLane.tokens.join(', ')}, but not USDC, so USDC bridges use CCTP.`}
        </p>
        <a href={CCIP_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
          Open CCIP explorer <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}
