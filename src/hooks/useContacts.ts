import { useCallback, useEffect, useState } from 'react'

export interface Contact {
  name: string
  address: `0x${string}`
}

const KEY = 'meridian:contacts'

function load(): Contact[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Contact[]) : []
  } catch {
    return []
  }
}

/** Saved payees, kept in this browser only. */
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(contacts))
  }, [contacts])

  const add = useCallback((c: Contact) => {
    setContacts((prev) => [c, ...prev.filter((p) => p.address.toLowerCase() !== c.address.toLowerCase())].slice(0, 20))
  }, [])

  const remove = useCallback((address: string) => {
    setContacts((prev) => prev.filter((p) => p.address.toLowerCase() !== address.toLowerCase()))
  }, [])

  return { contacts, add, remove }
}
