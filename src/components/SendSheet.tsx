import { useEffect, useMemo, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Check, ExternalLink, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from './Sheet'
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { AmountError, parseAmount } from '@/onchain-money'
import type { Amount } from '@/onchain-money'
import { formatAddress, glass, normalizeAddress, parseOnchainError, sanitizeAmount } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'
import { saveMemo } from '@/hooks/useActivity'
import type { Contact } from '@/hooks/useContacts'

export interface Prefill {
  to?: string
  amount?: string
  memo?: string
}

interface Props {
  open: boolean
  onClose: () => void
  prefill: Prefill
  balance?: Amount
  contacts: Contact[]
  onSaveContact: (c: Contact) => void
  onSettled: () => void
}

export function SendSheet({ open, onClose, prefill, balance, contacts, onSaveContact, onSettled }: Props) {
  const { address, chainId } = useAccount()
  const { network } = useNetwork()
  const CHAIN_ID = network.id
  const CHAIN_NAME = network.name
  const feeToken = requireChain(CHAIN_ID).nativeCurrency.symbol
  const { switchChain, isPending: switching } = useSwitchChain()
  const queryClient = useQueryClient()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [contactName, setContactName] = useState('')
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess, isError: receiptFailed } = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID })

  useEffect(() => {
    if (!open) return
    setTo(prefill.to ?? '')
    setAmount(prefill.amount ?? '')
    setMemo(prefill.memo ?? '')
    setContactName('')
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill.to, prefill.amount, prefill.memo])

  const recipient = normalizeAddress(to)
  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      return parseAmount(CHAIN_ID, amount)
    } catch (e) {
      if (e instanceof AmountError) return undefined
      throw e
    }
  }, [amount, CHAIN_ID])

  const isSelf = !!recipient && !!address && recipient.toLowerCase() === address.toLowerCase()
  const overBalance = !!parsed && !!balance && parsed.gt(balance)
  const wrongChain = chainId !== CHAIN_ID
  const valid = !!recipient && !isSelf && !!parsed && parsed.isPositive() && !overBalance
  const txError = error ? parseOnchainError(error) : null

  useEffect(() => {
    if (!isSuccess || !hash || !address) return
    saveMemo(address, hash, memo)
    toast.success('Payment sent')
    onSettled()
    void queryClient.invalidateQueries({ queryKey: ['activity'] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash])

  const submit = () => {
    if (wrongChain) {
      switchChain({ chainId: CHAIN_ID })
      return
    }
    if (!valid || !recipient || !parsed || !network.usdc) return
    writeContract({
      address: network.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, parsed.raw],
      chainId: CHAIN_ID,
    })
  }

  const known = recipient ? contacts.find((c) => c.address.toLowerCase() === recipient.toLowerCase()) : undefined
  const busy = isPending || confirming

  return (
    <Sheet open={open} title={isSuccess ? 'Payment sent' : 'Send money'} onClose={onClose}>
      {isSuccess && hash ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl p-4" style={glass.inner}>
            <div className="flex size-10 items-center justify-center rounded-full" style={{ background: 'rgba(26,128,71,0.12)' }}>
              <Check className="size-5" style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <div className="display text-xl font-bold tabular-nums">{amount} USDC</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                to {known?.name ?? (recipient ? formatAddress(recipient) : '')}
              </div>
            </div>
          </div>
          <a
            href={buildTxExplorerUrl(CHAIN_ID, hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: 'var(--accent-hover)' }}
          >
            View receipt on explorer <ExternalLink className="size-3.5" />
          </a>
          {!known && recipient && (
            <div className="rounded-2xl p-4" style={glass.inner}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                <UserPlus className="size-3.5" /> Save this payee
              </div>
              <div className="flex gap-2">
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value.slice(0, 24))}
                  placeholder="Name"
                  className="min-h-11 flex-1 rounded-xl bg-white/70 px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border)' }}
                />
                <button
                  disabled={!contactName.trim()}
                  onClick={() => {
                    onSaveContact({ name: contactName.trim(), address: recipient })
                    toast.success('Payee saved')
                    onClose()
                  }}
                  className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          <button onClick={onClose} className="min-h-12 w-full rounded-2xl text-sm font-semibold" style={{ ...glass.pill, color: 'var(--ink)' }}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {contacts.map((c) => (
                <button
                  key={c.address}
                  onClick={() => setTo(c.address)}
                  className="min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors"
                  style={{
                    ...glass.pill,
                    color: 'var(--ink)',
                    borderColor: recipient?.toLowerCase() === c.address.toLowerCase() ? 'var(--accent)' : undefined,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <label className="block rounded-2xl p-4" style={glass.inner}>
            <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              To
            </span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x… wallet address"
              spellCheck={false}
              autoComplete="off"
              className="mono mt-1 w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
            />
            {to && !recipient && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>
                Enter a valid wallet address.
              </span>
            )}
            {isSelf && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>
                You can't send to your own account.
              </span>
            )}
          </label>

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

          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 60))}
            placeholder="Add a note (saved on this device)"
            className="min-h-11 w-full rounded-2xl px-4 text-sm outline-none"
            style={glass.inner}
          />

          <div className="flex items-center justify-between rounded-2xl px-4 py-3 text-xs" style={glass.inner}>
            <span style={{ color: 'var(--muted)' }}>Network</span>
            <span className="font-semibold">{CHAIN_NAME} · fee paid in {feeToken}</span>
          </div>

          {txError && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {txError}
            </p>
          )}
          {receiptFailed && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              We couldn't confirm this payment. Check your balance before retrying.
            </p>
          )}

          <button
            disabled={(!wrongChain && !valid) || busy || switching}
            onClick={submit}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {wrongChain ? (
              `Switch to ${CHAIN_NAME}`
            ) : isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
              </span>
            ) : confirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirming…
              </span>
            ) : parsed?.isPositive() ? (
              `Send ${amount} USDC`
            ) : (
              'Send'
            )}
          </button>
        </div>
      )}
    </Sheet>
  )
}
