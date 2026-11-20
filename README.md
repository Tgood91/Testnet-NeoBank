# Meridian

A USDC neo bank on Arc Testnet and Base Sepolia: see your balance, send dollars to any address, request payments with a shareable link, and review recent activity. Monad Testnet is connected, but USDC payments are not available there yet.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
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

None.
