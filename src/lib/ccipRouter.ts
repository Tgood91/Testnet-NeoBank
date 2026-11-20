import { concatHex, encodeAbiParameters, pad, zeroAddress } from 'viem'

export const routerAbi = [
  {
    type: 'function',
    name: 'getFee',
    stateMutability: 'view',
    inputs: [
      { name: 'destinationChainSelector', type: 'uint64' },
      {
        name: 'message',
        type: 'tuple',
        components: [
          { name: 'receiver', type: 'bytes' },
          { name: 'data', type: 'bytes' },
          {
            name: 'tokenAmounts',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'feeToken', type: 'address' },
          { name: 'extraArgs', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ccipSend',
    stateMutability: 'payable',
    inputs: [
      { name: 'destinationChainSelector', type: 'uint64' },
      {
        name: 'message',
        type: 'tuple',
        components: [
          { name: 'receiver', type: 'bytes' },
          { name: 'data', type: 'bytes' },
          {
            name: 'tokenAmounts',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'feeToken', type: 'address' },
          { name: 'extraArgs', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ type: 'bytes32' }],
  },
] as const

// GenericExtraArgsV2 tag. Token-only transfers to a wallet need no receiver gas (gasLimit 0).
const GENERIC_EXTRA_ARGS_V2_TAG = '0x181dcf10'

/** A token-only transfer to the same address on the destination chain, with the fee paid in the source chain's native token. */
export function buildTokenMessage(receiver: `0x${string}`, token: `0x${string}`, amount: bigint) {
  return {
    receiver: pad(receiver),
    data: '0x' as const,
    tokenAmounts: [{ token, amount }],
    feeToken: zeroAddress,
    extraArgs: concatHex([GENERIC_EXTRA_ARGS_V2_TAG, encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }], [0n, true])]),
  }
}
