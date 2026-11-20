import { AppKit } from '@circle-fin/app-kit'
import { numberToHex, type Chain, type EIP1193Provider } from 'viem'
import { arc, arcTestnet, base, baseSepolia } from 'viem/chains'

/** Chains the bridge can add to a wallet that does not know them yet. */
export const BRIDGE_CHAINS: readonly Chain[] = [arcTestnet, baseSepolia, arc, base]

let kit: AppKit | undefined

/** One shared kit. Created on first use so the SDK loads only when someone opens the bridge. */
export function getAppKit(): AppKit {
  kit ??= new AppKit()
  return kit
}

const isUnrecognizedChain = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } }
  return e?.code === 4902 || e?.data?.originalError?.code === 4902 // nested on MetaMask mobile
}

/**
 * Without the forwarding service the adapter switches the wallet to the destination chain for the mint.
 * A wallet that lacks that chain rejects with 4902 after the burn already happened, so add the chain and retry.
 */
export function withAddChainFallback(provider: EIP1193Provider, chains: readonly Chain[]): EIP1193Provider {
  const send = provider.request.bind(provider) as (args: { method: string; params?: unknown }) => Promise<unknown>
  const request = (async (args: { method: string; params?: unknown }) => {
    try {
      return await send(args)
    } catch (error) {
      if (args.method !== 'wallet_switchEthereumChain' || !isUnrecognizedChain(error)) throw error
      const [{ chainId }] = args.params as [{ chainId: string }]
      const chain = chains.find((c) => c.id === Number(chainId))
      if (!chain) throw error
      await send({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: numberToHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
          },
        ],
      })
      return send(args)
    }
  }) as EIP1193Provider['request']

  // A Proxy, not a spread: wallet providers are class instances.
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'request') return request
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}
