import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAccount, useDisconnect } from 'wagmi'
import { ArrowDownLeft, ArrowDownUp, ArrowLeftRight, ArrowUpRight, ExternalLink, LogOut, X } from 'lucide-react'
import { CCIP_EXPLORER_URL } from '@/lib/ccip'
import { formatAddress, glass, spectral } from '@/lib/bank'
import { useNetwork } from '@/hooks/useNetwork'

interface Props {
  open: boolean
  onClose: () => void
  onSend: () => void
  onReceive: () => void
  onBridge: () => void
  onSwap: () => void
}

function Item({ icon, title, hint, onClick, disabled }: { icon: ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(18,45,69,0.07)' }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          {hint}
        </span>
      </span>
    </button>
  )
}

export function MenuDrawer({ open, onClose, onSend, onReceive, onBridge, onSwap }: Props) {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { network } = useNetwork()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.nav
            aria-label="Main menu"
            className="relative flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 shrink-0" style={{ background: spectral }} />
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="display text-lg font-bold">Menu</h2>
              <button onClick={onClose} aria-label="Close menu" className="flex size-11 items-center justify-center rounded-full hover:bg-black/5">
                <X className="size-5" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="space-y-1 px-3">
              <Item icon={<ArrowUpRight className="size-4" />} title="Send" hint={`USDC on ${network.name}`} onClick={go(onSend)} disabled={!isConnected} />
              <Item icon={<ArrowDownLeft className="size-4" />} title="Receive" hint="Address and payment link" onClick={go(onReceive)} disabled={!isConnected} />
              <Item
                icon={<ArrowDownUp className="size-4" />}
                title="Swap"
                hint={network.swapChain ? `Swap tokens on ${network.name}` : 'Available on Arc Testnet, Arc and Base'}
                onClick={go(onSwap)}
                disabled={!isConnected || !network.swapChain}
              />
              <Item
                icon={<ArrowLeftRight className="size-4" />}
                title="Bridge USDC"
                hint="Circle CCTP v2, with a live Chainlink CCIP route check"
                onClick={go(onBridge)}
                disabled={!isConnected}
              />
              <a
                href={CCIP_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-14 items-center gap-3 rounded-2xl px-3 transition-colors hover:bg-black/5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(18,45,69,0.07)' }}>
                  <ExternalLink className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">CCIP explorer</span>
                  <span className="block text-xs" style={{ color: 'var(--subtle)' }}>
                    Track Chainlink cross-chain messages
                  </span>
                </span>
              </a>
            </div>

            <div className="mt-auto p-4">
              {isConnected && address ? (
                <div className="rounded-2xl p-4" style={glass.inner}>
                  <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
                    Connected{connector ? ` with ${connector.name}` : ''}
                  </div>
                  <div className="mono mt-1 text-sm">{formatAddress(address)}</div>
                  <button
                    onClick={() => {
                      disconnect()
                      onClose()
                    }}
                    className="mt-2 flex min-h-11 items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--danger)' }}
                  >
                    <LogOut className="size-3.5" /> Disconnect
                  </button>
                </div>
              ) : (
                <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
                  Connect a wallet to send, receive and bridge.
                </p>
              )}
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
