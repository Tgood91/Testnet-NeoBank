import { useMemo, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, isAddress } from 'viem'
import type { QuoteResponse } from '@defuse-protocol/one-click-sdk-typescript'
import { Check, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { glass, parseOnchainError, sanitizeAmount } from '@/lib/bank'
import { ONECLICK_EXPLORER_URL, fetchRoutes, fetchStatus, isOneClickSource, isTerminal, requestQuote, submitDeposit } from '@/lib/oneclick'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { AmountError, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import type { Amount } from '@/onchain-money'
import { useNetwork } from '@/hooks/useNetwork'

interface Props {
  balance?: Amount
  onSettled: () => void
  onClose: () => void
}

const SLIPPAGE = [50, 100, 200] as const

const STATUS_TEXT: Record<string, string> = {
  PENDING_DEPOSIT: 'Waiting for your deposit to be detected',
  KNOWN_DEPOSIT_TX: 'Deposit detected',
  PROCESSING: 'Swapping and sending to the destination',
  INCOMPLETE_DEPOSIT: 'Deposit was below the required amount',
  SUCCESS: 'Delivered',
  REFUNDED: 'The transfer failed and your USDC was refunded',
  FAILED: 'The transfer failed',
}

export function OneClickBridge({ balance, onSettled, onClose }: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { network } = useNetwork()
  const { writeContractAsync } = useWriteContract()

  const [destChain, setDestChain] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(100)
  const [reviewed, setReviewed] = useState<{ key: string; quote: QuoteResponse } | null>(null)
  const [busy, setBusy] = useState<'quote' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deposit, setDeposit] = useState<{ address: string; hash: `0x${string}` } | null>(null)

  const routes = useQuery({
    queryKey: ['oneclick-routes', network.id, network.usdc],
    enabled: !network.isTestnet && isOneClickSource(network.id) && !!network.usdc,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchRoutes(network.id, network.usdc!),
  })

  const destination = routes.data?.destinations.find((d) => d.blockchain === destChain) ?? routes.data?.destinations[0]

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      return parseAmount(network.id, amount)
    } catch (e) {
      if (e instanceof AmountError) return undefined
      throw e
    }
  }, [amount, network.id])
  const overBalance = !!parsed && !!balance && parsed.gt(balance)
  const valid = !!routes.data && !!destination && !!address && !!parsed && parsed.isPositive() && !overBalance
  const requestKey = `${network.id}|${destination?.assetId}|${amount}|${slippageBps}|${address ?? ''}`
  const fresh = reviewed?.key === requestKey ? reviewed.quote : null

  const status = useQuery({
    queryKey: ['oneclick-status', deposit?.address],
    enabled: !!deposit,
    refetchInterval: (q) => (isTerminal(q.state.data) ? false : 5_000),
    queryFn: () => fetchStatus(deposit!.address),
  })
  const receipt = useWaitForTransactionReceipt({ hash: deposit?.hash, chainId: network.id })

  const review = async () => {
    if (!valid || !routes.data || !destination || !address || !parsed) return
    setError(null)
    setBusy('quote')
    try {
      const quote = await requestQuote({
        dry: true,
        originAsset: routes.data.source.assetId,
        destinationAsset: destination.assetId,
        amount: parsed.raw.toString(),
        slippageBps,
        recipient: address,
        refundTo: address,
      })
      setReviewed({ key: requestKey, quote })
    } catch {
      setReviewed(null)
      setError('No quote is available for this transfer right now. Try a different amount or destination.')
    } finally {
      setBusy(null)
    }
  }

  // Runs only from the Bridge button click, after the reviewed quote is on screen.
  const send = async () => {
    if (!fresh || !routes.data || !destination || !address || !parsed || !network.usdc) return
    setError(null)
    setBusy('send')
    try {
      if (walletChainId !== network.id) await switchChainAsync({ chainId: network.id })
      const live = await requestQuote({
        dry: false,
        originAsset: routes.data.source.assetId,
        destinationAsset: destination.assetId,
        amount: parsed.raw.toString(),
        slippageBps,
        recipient: address,
        refundTo: address,
      })
      const q = live.quote
      const depositAddress = q.depositAddress
      // Never send funds to anything that is not a plain EVM address, or to a quote that changed under the user.
      if (!depositAddress || !isAddress(depositAddress, { strict: false }) || q.depositMemo) {
        setError('The quote did not return a usable deposit address. Nothing was sent.')
        return
      }
      if (q.amountIn !== parsed.raw.toString() || BigInt(q.amountOut) < BigInt(fresh.quote.minAmountOut)) {
        setReviewed(null)
        setError('The price moved since your review. Review the quote again. Nothing was sent.')
        return
      }
      const hash = await writeContractAsync({
        address: network.usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [depositAddress, parsed.raw],
        chainId: network.id,
      })
      setDeposit({ address: depositAddress, hash })
      // Telling 1Click about the deposit only speeds things up, so a failure here is not an error.
      void submitDeposit(hash, depositAddress).catch(() => undefined)
      onSettled()
    } catch (e) {
      setError(parseOnchainError(e))
    } finally {
      setBusy(null)
    }
  }

  if (network.isTestnet) {
    return (
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        1Click transfers run on mainnet only. Switch to Mainnet to use this route.
      </p>
    )
  }
  if (!isOneClickSource(network.id)) {
    return (
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        1Click can send from Base. {network.name} is not supported as a starting network, so use CCTP v2 for this network.
      </p>
    )
  }
  if (routes.isLoading) return <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading live routes…</p>
  if (routes.isError || !routes.data || !destination) {
    return (
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        No 1Click USDC route was found for {network.name} right now.
      </p>
    )
  }

  if (deposit) {
    const s = status.data
    const done = isTerminal(s)
    return (
      <div className="space-y-3">
        <div className="rounded-2xl p-4" style={glass.inner}>
          <div className="display text-2xl font-bold tabular-nums">{amount} USDC</div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            {network.name} to {destination.label}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm" aria-live="polite">
            {s === 'SUCCESS' ? (
              <Check className="size-4" style={{ color: 'var(--success)' }} />
            ) : !done ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            <span style={{ color: s === 'REFUNDED' || s === 'FAILED' ? 'var(--danger)' : 'var(--ink)' }}>
              {s ? STATUS_TEXT[s] ?? s : receipt.isLoading ? 'Confirming your deposit' : 'Checking status'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4">
            <a href={buildTxExplorerUrl(network.id, deposit.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
              Your deposit <ExternalLink className="size-3" />
            </a>
            <a href={ONECLICK_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
              NEAR Intents explorer <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
        {done && (
          <button onClick={onClose} className="min-h-12 w-full rounded-2xl text-sm font-semibold" style={{ ...glass.pill, color: 'var(--ink)' }}>
            Done
          </button>
        )}
      </div>
    )
  }

  const q = fresh?.quote
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-xs text-pretty" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--ink-2)' }}>
        <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
        <span>This moves real USDC and cannot be undone. Send a small test amount first. The funds go to a one-time deposit address from the quote and arrive at your own address on the destination.</span>
      </div>

      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{network.name}</span>
          <select
            aria-label="Destination network"
            value={destination.blockchain}
            disabled={busy !== null}
            onChange={(e) => setDestChain(e.target.value)}
            className="min-h-11 rounded-xl bg-white/70 px-3 text-sm font-semibold outline-none"
            style={{ border: '1px solid var(--border)' }}
          >
            {routes.data.destinations.map((d) => (
              <option key={d.blockchain} value={d.blockchain}>
                to {d.label}
              </option>
            ))}
          </select>
        </div>
        <input
          inputMode="decimal"
          aria-label="Amount in USDC"
          value={amount}
          onChange={(e) => {
            const v = sanitizeAmount(e.target.value)
            if (v !== null) setAmount(v)
          }}
          placeholder="0.00"
          className="display mt-2 w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
        />
        <button
          disabled={!balance}
          onClick={() => balance && setAmount(balance.toFixed(6).replace(/\.?0+$/, ''))}
          className="min-h-8 text-xs font-semibold disabled:opacity-40"
          style={{ color: 'var(--accent-hover)' }}
        >
          {balance ? `Balance ${balance.toFixed(2)} · Max` : 'Balance unavailable'}
        </button>
        {overBalance && (
          <span className="block text-xs" style={{ color: 'var(--danger)' }}>
            That's more than your available balance.
          </span>
        )}
      </div>

      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          Slippage tolerance
        </div>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Slippage tolerance">
          {SLIPPAGE.map((bps) => (
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
      </div>

      {q && (
        <div className="space-y-1 rounded-2xl px-4 py-3 text-xs" style={glass.inner}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>You send</span>
            <span className="font-semibold tabular-nums">{q.amountInFormatted} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Estimated receive</span>
            <span className="font-semibold tabular-nums">
              {q.amountOutFormatted} USDC on {destination.label}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Minimum receive</span>
            <span className="font-semibold tabular-nums">{(Number(q.minAmountOut) / 10 ** usdcDecimalsFor(network.id)).toFixed(6)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Estimated time</span>
            <span className="font-semibold tabular-nums">about {q.timeEstimate} seconds</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-pretty" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {fresh ? (
        <button
          disabled={busy !== null}
          onClick={() => void send()}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {busy === 'send' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
            </span>
          ) : (
            `Bridge ${amount} USDC to ${destination.label}`
          )}
        </button>
      ) : (
        <button
          disabled={!valid || busy !== null}
          onClick={() => void review()}
          className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
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
        Transfers use NEAR Intents (1Click) without an API key, which adds a provider fee already included in the quote. Review the destination address: it is your connected wallet address.
      </p>
    </div>
  )
}
