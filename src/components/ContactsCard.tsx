import { Trash2 } from 'lucide-react'
import { formatAddress, glass } from '@/lib/bank'
import type { Contact } from '@/hooks/useContacts'

interface Props {
  contacts: Contact[]
  onSend: (address: string) => void
  onRemove: (address: string) => void
}

export function ContactsCard({ contacts, onSend, onRemove }: Props) {
  if (contacts.length === 0) return null
  return (
    <section className="rounded-3xl p-5" style={glass.card} aria-label="Saved payees">
      <h2 className="display text-base font-bold">Payees</h2>
      <ul className="mt-2">
        {contacts.map((c) => (
          <li key={c.address} className="flex items-center gap-3 py-1.5">
            <button onClick={() => onSend(c.address)} className="flex min-h-11 flex-1 items-center gap-3 text-left" aria-label={`Send to ${c.name}`}>
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: 'rgba(18,45,69,0.07)', color: 'var(--ink)' }}
              >
                {c.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="mono block text-xs" style={{ color: 'var(--subtle)' }}>
                  {formatAddress(c.address)}
                </span>
              </span>
            </button>
            <button
              onClick={() => onRemove(c.address)}
              aria-label={`Remove ${c.name}`}
              className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            >
              <Trash2 className="size-4" style={{ color: 'var(--subtle)' }} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
