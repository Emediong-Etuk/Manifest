# Browser tests

Against a local validator, with the localnet-only test wallet (keypair in localStorage):

- `lifecycle.spec.ts`: full trader + forwarder lifecycle in two browser contexts.
- `judge.spec.ts`: on a 360 px phone, landing → test wallet → faucet → booked in under
  2 minutes. Needs the app started with `GAS_TANK_SECRET_KEY` = the dev key (the
  test-dollar mint authority after `seed:local`) and `NEXT_PUBLIC_DEMO_MINT` = `E2E_MINT`.
- `smoke.spec.ts`: landing → containers → container detail, plus no horizontal scroll at
  360 px and no axe WCAG 2.1 AA violations on the public pages. Needs at least one
  container (run `seed-demo`, or the lifecycle test first).
- `rehearsal.spec.ts`: `docs/DEMO_SCRIPT.md` click for click (demo-reset, Blink booking,
  receipt, approve, ticket transfer, pickup, Squads slash, `/admin`). Needs the `seed-demo`
  world and its `.keys/`; skipped without them. Each run uses up Ada's LAG-0930 pickup and
  the dispute, so re-seed on a fresh validator before running it again in full.

```bash
# 1. Validator with the program (admin = upgrade authority)
solana-test-validator --reset \
  --upgradeable-program $(solana address -k target/deploy/manifest-keypair.json) \
  target/deploy/manifest.so $(solana address -k ~/.config/solana/manifest-dev.json)

# 2. Test mint + config (prints NEXT_PUBLIC_DEMO_MINT)
pnpm --filter @manifest/scripts seed:local

# 3. App on localnet
NEXT_PUBLIC_CLUSTER=localnet NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899 \
NEXT_PUBLIC_DEMO_MINT=<mint> pnpm --filter @manifest/app build
GAS_TANK_SECRET_KEY="$(cat ~/.config/solana/manifest-dev.json)" \
NEXT_PUBLIC_CLUSTER=localnet ... pnpm --filter @manifest/app start

# 4. Tests (E2E_MINT = the same mint; the dev keypair mints test dollars)
E2E_MINT=<mint> pnpm --filter @manifest/app e2e
```
