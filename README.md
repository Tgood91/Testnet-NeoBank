# Meridian

A USDC neo bank on Arc and Base, with testnets (Arc Testnet, Base Sepolia) as the default and mainnet as an opt-in switch: see your balance, send dollars to any address, request payments with a shareable link, and review recent activity, connect with browser, Coinbase or WalletConnect wallets, swap tokens, and bridge USDC between chains with Circle CCTP v2 or, on mainnet from Base, with NEAR Intents (1Click). A live Chainlink CCIP route check shows what each lane can carry. Monad Testnet is connected, but USDC payments are not available there yet.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
- Circle App Kit (CCTP v2 bridging and swaps)
- NEAR Intents 1Click SDK (`@defuse-protocol/one-click-sdk-typescript`) for the mainnet cross-chain USDC route
- HOT Labs Omni SDK (`@hot-labs/omni-sdk`) and `@defuse-protocol/intents-sdk`, installed and not yet used by any screen and the Chainlink CCIP directory API (read-only)
- Arc Testnet, Base Sepolia and Monad Testnet (USDC payments on Arc and Base Sepolia)

## Development

Prerequisites: [Bun](https://bun.sh) and a browser wallet.

```bash
bun install
bun run dev
bun run build
bun run check
```

### Environment variables

- `VITE_WALLETCONNECT_PROJECT_ID`: public WalletConnect / Reown project ID that enables WalletConnect wallets. Optional: without it, browser and Coinbase wallets still work.

## Mainnet

Mainnet uses real funds and transactions cannot be undone. Test on testnet first, review every address, network and amount, and have the app independently reviewed before you use it with real money.
