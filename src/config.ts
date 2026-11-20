/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet, base, baseSepolia, monadTestnet } from 'viem/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(baseSepolia.id, baseSepolia.rpcUrls.default.http[0])
registerChain(monadTestnet.id, monadTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])
registerChain(base.id, base.rpcUrls.default.http[0])

// A public WalletConnect / Reown project ID. Without one, the app still offers browser and Coinbase wallets.
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined

const appName = 'Meridian'

export const config = createConfig({
  chains: [arcTestnet, baseSepolia, monadTestnet, arc, base, mainnet], // mainnet needed for ENS resolution
  connectors: [
    injected(),
    coinbaseWallet({ appName }),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            metadata: {
              name: appName,
              description: 'A USDC neo bank',
              url: window.location.origin,
              icons: [],
            },
            showQrModal: false, // ConnectKit renders the QR code itself
          }),
        ]
      : []),
  ],
  transports: {
    [arcTestnet.id]: http(),
    [baseSepolia.id]: http(),
    [monadTestnet.id]: http(),
    [arc.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
