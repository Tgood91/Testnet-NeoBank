import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { useNetwork } from '@/hooks/useNetwork'

/** Single USDC balance (ERC-20 view) on the selected network. On Arc this is the same pool that pays gas. */
export function useUsdcBalance() {
  const { address } = useAccount()
  const { network } = useNetwork()
  const query = useReadContract({
    address: network.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: network.id,
    query: { enabled: !!address && !!network.usdc, refetchInterval: 8_000 },
  })
  const amount = query.data !== undefined ? Amount.fromRaw(query.data, usdcDecimalsFor(network.id)) : undefined
  return { amount, isLoading: query.isLoading, refetch: query.refetch }
}
