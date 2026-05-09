# Cipher Duel

Cipher Duel is a private two-player strategy game prototype for Arcium-style encrypted compute.

Players spend 9 hidden points across strike, guard, and focus. Each player seals an encrypted move, then the resolver computes the winner and publishes only the final outcome, score margin, and proof digest.

## Live site (Vercel)

[https://cipher-eight-nu.vercel.app/](https://cipher-eight-nu.vercel.app/)

## What is included

- Vite + React playable game in [`src`](./src)
- Browser encryption and private resolver adapter in [`src/lib/arciumPrivacy.ts`](./src/lib/arciumPrivacy.ts)
- Arcium Arcis confidential instruction sketch in [`contracts/arcium_cipher_duel.rs`](./contracts/arcium_cipher_duel.rs)

## Why Arcium fits

Arcium lets apps process encrypted data through MPC. For games, that means hidden moves, private hands, sealed bids, and secret strategy can remain private during computation, while the game still emits a public, verifiable result.

This prototype uses Web Crypto locally so the game works immediately. The production path is to deploy the Arcis circuit as an Arcium MXE and replace the local resolver with `@arcium-hq/client` calls that encrypt inputs, submit the confidential computation, and read the callback result.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Arcium integration path

1. Create an Arcium project with the `arcium` CLI.
2. Move `contracts/arcium_cipher_duel.rs` into the Arcis program module.
3. Generate callback types for the `resolve_duel` instruction.
4. Use `@arcium-hq/client` in `src/lib/arciumPrivacy.ts` to encrypt `Loadout` values as `Enc<Shared, Loadout>`.
5. Submit both encrypted moves to the MXE and update the UI from the returned `DuelOutcome`.
