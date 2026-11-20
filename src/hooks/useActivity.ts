import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { useNetwork } from '@/hooks/useNetwork'

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

// Recent window only: never scan from genesis. Each network sets its own range size and count (see lib/bank.ts).
const CHUNK = 5
const MAX_ITEMS = 25

export interface ActivityItem {
  hash: `0x${string}`
  direction: 'in' | 'out' | 'self'
  counterparty: `0x${string}`
  value: bigint
  timestamp: number
  blockNumber: bigint
  logIndex: number
}

export interface ActivityResult {
  items: ActivityItem[]
  head: bigint
  fromBlock: bigint
  partial: boolean
}

const memoKey = (address: string) => `meridian:memos:${address.toLowerCase()}`

export function readMemos(address: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(memoKey(address)) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function saveMemo(address: string, hash: string, memo: string) {
  if (!memo.trim()) return
  const memos = readMemos(address)
  memos[hash.toLowerCase()] = memo.trim()
  localStorage.setItem(memoKey(address), JSON.stringify(memos))
}

export function useActivity() {
  const { address } = useAccount()
  const { network } = useNetwork()
  const client = usePublicClient({ chainId: network.id })
  const usdc = network.usdc

  return useQuery<ActivityResult>({
    queryKey: ['activity', address, network.id],
    enabled: !!address && !!client && !!usdc,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !address || !usdc) throw new Error('not ready')
      const head = await client.getBlockNumber()
      const logs: Awaited<ReturnType<typeof client.getLogs<typeof transferEvent>>> = []
      let partial = false
      let fromBlock = head
      const { logRange, logRanges } = network

      const ranges: { from: bigint; to: bigint }[] = []
      for (let i = 0; i < logRanges; i++) {
        const to = head - BigInt(i) * logRange
        if (to < 0n) break
        ranges.push({ from: to - logRange + 1n > 0n ? to - logRange + 1n : 0n, to })
      }

      // Newest first, a few ranges at a time. Stop at the first failed chunk and report a partial window.
      for (let i = 0; i < ranges.length && !partial; i += CHUNK) {
        const chunk = ranges.slice(i, i + CHUNK)
        const results = await Promise.all(
          chunk.map(async ({ from, to }) => {
            try {
              const [sent, received] = await Promise.all([
                client.getLogs({ address: usdc, event: transferEvent, args: { from: address }, fromBlock: from, toBlock: to }),
                client.getLogs({ address: usdc, event: transferEvent, args: { to: address }, fromBlock: from, toBlock: to }),
              ])
              return { from, logs: [...sent, ...received] }
            } catch {
              return null
            }
          }),
        )
        for (const r of results) {
          if (!r) {
            partial = true
            break
          }
          logs.push(...r.logs)
          fromBlock = r.from
        }
      }

      const seen = new Set<string>()
      const unique = logs
        .filter((l) => {
          const k = `${l.transactionHash}:${l.logIndex}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1))
        .slice(0, MAX_ITEMS)

      const blockNums = [...new Set(unique.map((l) => l.blockNumber))]
      const stamps = new Map<bigint, number>()
      await Promise.all(
        blockNums.map(async (bn) => {
          try {
            const b = await client.getBlock({ blockNumber: bn })
            stamps.set(bn, Number(b.timestamp) * 1000)
          } catch {
            /* timestamp stays unknown */
          }
        }),
      )

      const me = address.toLowerCase()
      const items: ActivityItem[] = unique.map((l) => {
        const from = l.args.from as `0x${string}`
        const to = l.args.to as `0x${string}`
        const out = from.toLowerCase() === me
        const inn = to.toLowerCase() === me
        return {
          hash: l.transactionHash,
          direction: out && inn ? 'self' : out ? 'out' : 'in',
          counterparty: out ? to : from,
          value: l.args.value as bigint,
          timestamp: stamps.get(l.blockNumber) ?? 0,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex ?? 0,
        }
      })

      return { items, head, fromBlock, partial }
    },
  })
}
