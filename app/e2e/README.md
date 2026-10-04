# Browser tests

Full trader + forwarder lifecycle through the UI, in two browser contexts, against a
local validator. Uses the localnet-only test wallet (keypair in localStorage).

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
NEXT_PUBLIC_CLUSTER=localnet ... pnpm --filter @manifest/app start

# 4. Tests (E2E_MINT = the same mint; the dev keypair mints test dollars)
E2E_MINT=<mint> pnpm --filter @manifest/app e2e
```
