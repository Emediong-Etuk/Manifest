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

After Phase 4's `squads-setup`, `init-config --update` points arbitrator and treasury at
the Squads vault.

## 4. Record and verify

- Put the program ID in `.env.example`, the README and `docs/SUBMISSION_CHECKLIST.md`.
- Check the program and config accounts on Solana Explorer (`?cluster=devnet`).
- The upgrade authority stays on `manifest-dev.json` (documented in `docs/SECURITY.md`).

## Local rehearsal (no SOL needed)

```bash
solana-test-validator --reset \
  --upgradeable-program $(solana address -k target/deploy/manifest-keypair.json) \
  target/deploy/manifest.so $(solana address -k ~/.config/solana/manifest-dev.json)
NEXT_PUBLIC_CLUSTER=localnet pnpm --filter @manifest/scripts e2e:local
```
