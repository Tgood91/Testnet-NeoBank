import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from './Sheet'
import { glass, sanitizeAmount } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'
import { buildShareLink } from '@/lib/share'

interface Props {
  open: boolean
  address?: string
  onClose: () => void
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Copy failed. Select the text and copy it manually.')
  }
}

export function ReceiveSheet({ open, address, onClose }: Props) {
  return (
    <Sheet open={open} title="Receive money" onClose={onClose}>
      <ReceiveBody address={address} />
    </Sheet>
  )
}

function ReceiveBody({ address }: { address?: string }) {
  const { network } = useNetwork()
  const CHAIN_NAME = network.name
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)

  // Rebuild the link whenever the request changes. Only the path and query are kept; the base is resolved at display time.
  useEffect(() => {
    if (!address) return
    let alive = true
    const params = new URLSearchParams({ to: address, chain: String(network.id) })
    if (Number(amount) > 0) params.set('amount', amount)
    if (memo.trim()) params.set('memo', memo.trim())
    void buildShareLink(`/?${params.toString()}`).then((url) => {
      if (alive) setLink(url)
    })
    return () => {
      alive = false
    }
  }, [address, amount, memo, network.id])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: 'Payment request', text: 'Pay me in USDC', url: link })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') void copy(link, 'Link')
    }
  }

  return (
    <>
      {!address ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Connect your wallet to receive payments.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={glass.inner}>
            <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Your address on {CHAIN_NAME}
            </span>
            <p className="mono mt-1 break-all text-sm">{address}</p>
            <button
              onClick={() => void copy(address, 'Address')}
              className="mt-2 flex min-h-11 items-center gap-1.5 text-xs font-semibold"
              style={{ color: 'var(--accent-hover)' }}
            >
              <Copy className="size-3.5" /> Copy address
            </button>
          </div>

          <div className="rounded-2xl p-4" style={glass.inner}>
            <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Request a specific amount (optional)
            </span>
            <input
              inputMode="decimal"
              aria-label="Requested amount in USDC"
              value={amount}
              onChange={(e) => {
                const v = sanitizeAmount(e.target.value)
                if (v !== null) setAmount(v)
              }}
              placeholder="0.00"
              className="display mt-1 w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            />
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 60))}
              placeholder="What is it for?"
              aria-label="Note"
              className="mt-2 min-h-11 w-full rounded-xl bg-white/70 px-3 text-sm outline-none"
              style={{ border: '1px solid var(--border)' }}
            />
          </div>

          <div className="rounded-2xl p-4" style={glass.inner}>
            <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Payment link
            </span>
            <p className="mono mt-1 break-all text-xs" style={{ color: 'var(--ink-2)' }}>
              {link ?? 'Preparing link…'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={!link}
              onClick={() => {
                if (!link) return
                void copy(link, 'Link')
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              }}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              disabled={!link || !canShare}
              onClick={() => void share()}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ ...glass.pill, color: 'var(--ink)' }}
            >
              <Share2 className="size-4" /> Share
            </button>
          </div>
          <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
            The link opens this app with the payment details filled in. It contains your public address only.
          </p>
        </div>
      )}
    </>
  )
}
