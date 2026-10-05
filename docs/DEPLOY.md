# Devnet deploy runbook

Everything except the keys is ready: the program builds, 95 LiteSVM tests pass, and
`pnpm --filter @manifest/scripts e2e:local` runs the full lifecycle through the SDK on a
local validator. Follow these steps once, in order. Commands run from the repo root.

## 0. Prerequisites (Greg)

1. **Keypairs, created on your own machine** (see `docs/SETUP_CHECKLIST.md`):
   - `manifest-dev.json`: deploy key and upgrade authority. **Fund it with ~12 devnet SOL.**
     The program is ~760 KB: about 5.3 SOL stays locked as program rent, and during
     deployment a buffer of the same size is funded temporarily (refunded afterwards).
   - `manifest-program.json`: fixes the program ID.
   - `gas-tank.json`: faucet + demo-mint authority. Fund with ~5 devnet SOL.
2. **For cloud sessions:** add the three JSON arrays as environment secrets
   `MANIFEST_DEV_KEYPAIR`, `MANIFEST_PROGRAM_KEYPAIR` and `GAS_TANK_SECRET_KEY`. The
   SessionStart hook writes the first two into place. Locally, put the files in
   `~/.config/solana/` and `target/deploy/manifest-keypair.json`.

## 1. Switch the program ID to the durable keypair

```bash
cp ~/.config/solana/manifest-program.json target/deploy/manifest-keypair.json  # local only
anchor keys sync          # updates declare_id! and Anchor.toml
pnpm program:test         # rebuild, sync IDL into the SDK, run all program tests
git commit -am "chore: set devnet program id"
```

## 2. Deploy

```bash
solana config set --url devnet --keypair ~/.config/solana/manifest-dev.json
solana balance            # expect >= 12 SOL
NO_DNA=1 anchor deploy --provider.cluster devnet
solana program show <PROGRAM_ID> --url devnet   # authority = manifest-dev pubkey
```

`anchor deploy` (Anchor 1.x) also uploads the IDL through the Program Metadata program.
If it was skipped: `anchor idl init -f target/idl/manifest.json --provider.cluster devnet`.

The build targets **sBPF v3** (Anchor 1.2 default). Solana is making v3 the only format
accepted for new deployments (SIMD-0500, mainnet with Agave 4.4, Nov 2026), so this
binary stays deployable after that change.

## 3. Demo mint and config

```bash
# .env.local needs: NEXT_PUBLIC_CLUSTER=devnet, NEXT_PUBLIC_PROGRAM_ID, GAS_TANK_SECRET_KEY,
# NEXT_PUBLIC_USDC_MINT (already in .env.example), NEXT_PUBLIC_APP_URL
pnpm --filter @manifest/scripts create-demo-mint   # prints NEXT_PUBLIC_DEMO_MINT
pnpm --filter @manifest/scripts init-config        # demo windows; arbitrator = admin for now
```

## 4. Squads arbitration

```bash
# Optional: SQUADS_OWNER_WALLET=<Greg's Phantom public key> (defaults to the admin key)
pnpm --filter @manifest/scripts squads-setup
```

Creates the 2-of-3 multisig (Greg + `.keys/arbitrator-1.json` + `.keys/arbitrator-2.json`),
funds the vault with 0.2 SOL and points `config.arbitrator` and `config.treasury_owner`
at the vault. Copy the printed `NEXT_PUBLIC_SQUADS_MULTISIG` / `NEXT_PUBLIC_SQUADS_VAULT`
into `.env.local` and Vercel. Back up `.keys/` (it holds the two demo member keys).

## 5. Demo world

The evidence upload goes through the app, so the app must be running with Pinata
configured (Vercel's disk is not durable):

```bash
NEXT_PUBLIC_APP_URL=https://<app> pnpm --filter @manifest/scripts seed-demo
pnpm --filter @manifest/scripts resolve-dispute --consignment <printed> --resolution slash --amount 500  # demo only
pnpm --filter @manifest/scripts demo-reset   # fresh containers before each video take
pnpm --filter @manifest/scripts fund-wallet --address <pubkey>
```

## 6. Crank

- Vercel: set `CRON_SECRET` (16+ random characters) and `CRANK_SECRET_KEY` (or rely on
  `GAS_TANK_SECRET_KEY`). `app/vercel.json` runs the crank daily.
- GitHub repository secrets `APP_URL` and `CRON_SECRET` turn on the 5-minute schedule in
  `.github/workflows/crank.yml`.
- Locally: `pnpm --filter @manifest/scripts crank --watch`.

## 7. Record and verify

- Put the program ID in `.env.example`, the README and `docs/SUBMISSION_CHECKLIST.md`.
- Check the program and config accounts on Solana Explorer (`?cluster=devnet`).
- The upgrade authority stays on `manifest-dev.json` (documented in `docs/SECURITY.md`).

## Local rehearsal (no SOL needed)

```bash
# Squads v4 cloned from devnet: program, program config, and the devnet treasury
# (read from the program config). Drop the --url/--clone lines if you don't need Squads.
solana-test-validator --reset --url https://api.devnet.solana.com \
  --clone-upgradeable-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf \
  --clone BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr \
  --clone HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK \
  --upgradeable-program $(solana address -k target/deploy/manifest-keypair.json) \
  target/deploy/manifest.so $(solana address -k ~/.config/solana/manifest-dev.json)

NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts e2e:local   # SDK lifecycle (own config)
# or, for the demo world on a fresh validator:
NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts seed:local  # prints NEXT_PUBLIC_DEMO_MINT
NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts squads-setup
# start the app with NEXT_PUBLIC_CLUSTER=localnet + the printed values, then:
NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts seed-demo
```
