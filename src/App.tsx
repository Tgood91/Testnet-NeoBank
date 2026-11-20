import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton, useModal } from 'connectkit'
import { Landmark, Menu } from 'lucide-react'
import { BalanceCard } from '@/components/BalanceCard'
import { ActivityList } from '@/components/ActivityList'
import { ContactsCard } from '@/components/ContactsCard'
import { ReceiveSheet } from '@/components/ReceiveSheet'
import { MenuDrawer } from '@/components/MenuDrawer'

// The bridge SDK is large, so it loads only when someone opens the bridge.
const SwapSheet = lazy(() => import('@/components/SwapSheet').then((m) => ({ default: m.SwapSheet })))
const BridgeSheet = lazy(() => import('@/components/BridgeSheet').then((m) => ({ default: m.BridgeSheet })))
import { SendSheet } from '@/components/SendSheet'
import type { Prefill } from '@/components/SendSheet'
import { useActivity } from '@/hooks/useActivity'
import { useUsdcBalance } from '@/hooks/useBalance'
import { useContacts } from '@/hooks/useContacts'
import { NetworkSwitcher } from '@/components/NetworkSwitcher'
import { NetworkProvider, useNetwork } from '@/hooks/useNetwork'
import { PAYABLE_NETWORKS, formatAddress, normalizeAddress, sanitizeAmount } from '@/lib/bank'

/** Reads a payment request from the page URL (?to=&amount=&memo=). Values are validated, never trusted. */
function readRequestFromUrl(): { request: Prefill | null; unsupportedChain: boolean } {
  const params = new URLSearchParams(window.location.search)
  const chain = params.get('chain')
  if (chain !== null && !PAYABLE_NETWORKS.some((n) => String(n.id) === chain)) return { request: null, unsupportedChain: true }
  const to = normalizeAddress(params.get('to') ?? '')
  if (!to) return { request: null, unsupportedChain: false }
  const rawAmount = params.get('amount') ?? ''
  const amount = sanitizeAmount(rawAmount) && Number(rawAmount) > 0 ? rawAmount : undefined
  const memo = (params.get('memo') ?? '').slice(0, 60) || undefined
  return { request: { to, amount, memo }, unsupportedChain: false }
}

function clearRequestFromUrl() {
  const url = new URL(window.location.href)
  for (const key of ['to', 'amount', 'memo', 'chain']) url.searchParams.delete(key)
  window.history.replaceState(null, '', url.pathname + url.search)
}

const { request: initialRequest, unsupportedChain: initialUnsupported } = readRequestFromUrl()

export default function App() {
  return (
    <NetworkProvider>
      <Meridian />
    </NetworkProvider>
  )
}

function Meridian() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { setOpen: openConnectModal } = useModal()
  const { network } = useNetwork()
  const CHAIN_ID = network.id
  const { amount: balance, isLoading: balanceLoading, refetch: refetchBalance } = useUsdcBalance()
  const activity = useActivity()
  const { contacts, add, remove } = useContacts()

  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [prefill, setPrefill] = useState<Prefill>({})
  const [pending, setPending] = useState<Prefill | null>(initialRequest)

  const wrongChain = isConnected && chainId !== CHAIN_ID

  const openSend = useCallback((next: Prefill = {}) => {
    setPrefill(next)
    setSendOpen(true)
  }, [])

  // A payment link opens the send sheet once the wallet is connected.
  if (pending && isConnected) {
    setPending(null)
    setPrefill(pending)
    setSendOpen(true)
  }

  useEffect(() => {
    if (!pending && (initialRequest || initialUnsupported)) clearRequestFromUrl()
  }, [pending])

  const onSettled = useCallback(() => {
    void refetchBalance()
    void activity.refetch()
  }, [refetchBalance, activity])

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          style={{
            position: 'absolute',
            top: '6%',
            left: '4%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            right: '6%',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="-ml-2 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            >
              <Menu className="size-5" />
            </button>
            <span className="display flex items-center gap-2 text-lg font-bold">
              <span className="flex size-8 items-center justify-center rounded-xl text-white" style={{ background: 'var(--accent)' }}>
                <Landmark className="size-4" />
              </span>
              Meridian
            </span>
          </div>
          <ConnectKitButton.Custom>
            {({ isConnected: connected, show, address: shown }) => (
              <button
                onClick={show}
                className="min-h-11 rounded-full px-4 text-xs font-semibold transition-colors"
                style={connected ? { background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border)', color: 'var(--ink)' } : { background: 'var(--accent)', color: 'white' }}
              >
                {connected && shown ? <span className="mono">{formatAddress(shown)}</span> : 'Connect'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </header>

        <main className="space-y-3">
          <BalanceCard
            connected={isConnected}
            wrongChain={wrongChain}
            switching={switching}
            loading={balanceLoading}
            balance={balance}
            onConnect={() => openConnectModal(true)}
            onSwitch={() => switchChain({ chainId: CHAIN_ID })}
            onSend={() => openSend()}
            onReceive={() => setReceiveOpen(true)}
            onBridge={() => setBridgeOpen(true)}
          />

          {initialUnsupported && (
            <div className="rounded-2xl px-4 py-3 text-sm text-pretty" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--ink-2)' }}>
              This payment link is for a network where USDC payments are not available yet, so it was not opened.
            </div>
          )}

          <NetworkSwitcher />

          {pending && !isConnected && (
            <div className="rounded-2xl px-4 py-3 text-sm text-pretty" style={{ background: 'rgba(133,177,237,0.16)', color: 'var(--ink-2)' }}>
              Someone asked you to pay {pending.amount ? `${pending.amount} USDC` : 'USDC'}. Connect your wallet to review the payment.
            </div>
          )}

          <ContactsCard contacts={contacts} onSend={(to) => openSend({ to })} onRemove={remove} />

          <ActivityList
            address={address}
            data={activity.data}
            loading={activity.isLoading}
            failed={activity.isError}
            contacts={contacts}
            onRetry={() => void activity.refetch()}
            onSendTo={(to) => openSend({ to })}
          />

          {isConnected && (
            <p className="px-2 text-center text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
              Need test USDC? Use "Get test USDC" in the Arc Studio sidebar.
            </p>
          )}
        </main>
      </div>

      <SendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        prefill={prefill}
        balance={balance}
        contacts={contacts}
        onSaveContact={add}
        onSettled={onSettled}
      />
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSend={() => openSend()}
        onReceive={() => setReceiveOpen(true)}
        onBridge={() => setBridgeOpen(true)}
        onSwap={() => setSwapOpen(true)}
      />
      <ReceiveSheet open={receiveOpen} address={address} onClose={() => setReceiveOpen(false)} />
      {swapOpen && (
        <Suspense fallback={null}>
          <SwapSheet open={swapOpen} onClose={() => setSwapOpen(false)} balance={balance} onSettled={onSettled} />
        </Suspense>
      )}
      {bridgeOpen && (
        <Suspense fallback={null}>
          <BridgeSheet open={bridgeOpen} onClose={() => setBridgeOpen(false)} balance={balance} onSettled={onSettled} />
        </Suspense>
      )}
    </div>
  )
}
