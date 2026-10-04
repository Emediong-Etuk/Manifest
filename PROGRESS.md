# PROGRESS

Living checklist. Update after every meaningful step. Times are WAT.
Code freeze: **Mon Oct 12, 6:00 PM WAT**. Submission deadline: **Tue Oct 13, 7:59 AM WAT**.

## Phase status

| Phase                        | Dates     | Status                                                 |
| ---------------------------- | --------- | ------------------------------------------------------ |
| 0: Setup                     | Sun Oct 4 | ✅ Done (Copilot novelty check pending Greg's sign-in) |
| 1: Program core              | Oct 4–6   | ✅ Done (Oct 4)                                        |
| 2: Program complete + devnet | Oct 6–7   | ✅ Done except devnet deploy (blocked on keys/SOL)     |
| 3: Frontend core             | Oct 7–9   | ✅ Done on localnet (devnet pending deploy)            |
| 4: Integrations              | Oct 9–10  | ⏳ Waiting for Greg's go-ahead                         |
| 5: Polish + docs + deploy    | Oct 10–11 | —                                                      |
| 6: Videos + submission       | Oct 11–12 | —                                                      |

## Phase 3 plan (Oct 4–9): frontend core

All 7 steps done ✅ (verified on a local validator; devnet pending the deploy).

1. App foundations: env config, connection/program singletons, TanStack Query, design
   tokens + base components (Button, Card, Stamp, RouteLine, MoneyInput, AddressInput,
   CbmCalculator, CountdownChip, TimelineStepper, CargoTicketCard, CoverageMeter, EmptyState,
   DevnetBanner, Toasts).
2. Wallet layer: Phantom Connect React SDK (`google`/`apple`/`injected` when an App ID is
   set, `injected` only otherwise) behind one `useWallet()` interface; `/auth/callback`.
   A localnet-only burner wallet for automated browser tests (real transactions, local
   validator only; never enabled on devnet).
3. `TxButton`: build via SDK → sign & send → confirm → toast with explorer link →
   refetch; friendly errors with a details disclosure; confirmation sheets.
4. Trader pages: `/`, `/containers`, `/c/[id]`, `/book/[id]`, `/me`, `/s/[id]`
   (approve/reject, top-up, transfer, dispute, pickup QR).
5. Forwarder pages: `/forwarder` (register, bond, coverage meter, open container),
   `/forwarder/c/[id]` (record receipt with evidence upload, load, arrive, pickup
   scanner, claim). Evidence API: `POST/GET /api/evidence` (signed by the forwarder,
   EXIF-stripped, hashed; Pinata or local storage).
6. `/f/[id]` forwarder profile + Manifest Score, `/verify`.
7. Verification: Playwright run of the full trader + forwarder lifecycle in two browser
   contexts against `solana-test-validator` (burner wallets).

Risks: Phantom Portal App ID unavailable (injected-only fallback); devnet not deployed
(develop and test against a local validator); Phantom embedded wallets' $1,000/day limit
(notice on large bookings).

## Phase 2 plan (Oct 4–7): program complete + devnet

Steps 1–9 done ✅. Step 10 (devnet deploy) ⛔ blocked: needs durable funded keypairs.

1. ISO 6346 validation (format + check digit) in program utils.
2. `top_up_freight`, `mark_loaded`, `mark_arrived` + tests.
3. `confirm_pickup` (holder proves ticket ownership, burns it), `claim_freight_after_grace`
   (permanent-delegate burn) + forwarder stats + container completion + tests, including
   Cargo Ticket transfer (buyer picks up, seller can't).
4. `open_dispute` (post-arrival window or overdue past ETA) and dispute resolution:
   RefundEscrow / ForceApprove / Dismiss / SlashBond + tests.
5. Full lifecycle test (3 traders through pickup → Completed) and the rest of the 5.7 matrix.
6. Security pass: autofixer, Blueshift checklist, `docs/SECURITY.md` threat model.
7. `@manifest/sdk`: IDL copy script, PDAs, account fetchers (memcmp offsets from IDL),
   instruction builders, `deriveStage` / `allowedActions`, formatting, ISO 6346, errors,
   evidence hashing; Vitest.
8. Scripts: `create-demo-mint`, `init-config`; verified against a local validator.
9. CI: program build + LiteSVM tests job.
10. Devnet deploy + `init-config` on devnet. ⛔ blocked on durable funded keypairs.

Risks: account-count/CU of pickup and slash; holder detection via token accounts;
devnet deploy blocked on keys and SOL.

## Phase 1 plan (Oct 4–6): program core

Order (each step: code → LiteSVM tests → green → commit):

All nine steps done ✅ (65 LiteSVM tests + 10 unit tests green).

1. Foundations: constants (seeds, defaults), `ManifestError`, events, account structs
   (Config, Forwarder, Container, Consignment), utils (checked math, fixed-string and
   UN/LOCODE validation, `transfer_checked` with PDA signer).
2. Test harness: LiteSVM with SPL Token / Token-2022 / ATA, 6-decimal test mint, funded
   wallets, clock warp, account decoding, error-code assertions.
3. Admin: `initialize_config` (mint decimals == 6 via remaining accounts, bps ≤ 10_000,
   windows > 0), `update_config`, `transfer_admin`.
4. Forwarder: `register_forwarder` (+ bond vault PDA), `deposit_bond`, `withdraw_bond`.
5. Container: `open_container`, `close_booking` (forwarder, or anyone after cut-off),
   `cancel_container`.
6. Consignment: `book_consignment` (coverage + capacity + fee + buffered freight),
   `reject_booking`, `refund_after_cutoff`, `record_receipt`, `reject_goods`.
7. Approval settlement shared by `approve_goods` and `auto_approve`: payee payout, fee to
   treasury ATA, freight re-pricing refund, Cargo Ticket (Token-2022 mint PDA with
   MetadataPointer + TokenMetadata + PermanentDelegate, mint 1, revoke mint authority).
8. Measure CU for `book_consignment` and `approve_goods`; record in DECISIONS.md.
9. Solana MCP `program_autofixer` pass on every program file; clippy/fmt; tag `phase-1`.

Risks: Token-2022 metadata sizing/rent inside one approval tx; transaction size and CU of
approval (fallback: split `mint_cargo_ticket`); Anchor 1.x duplicate-mutable-account rule
when payee/trader/treasury coincide (guarded at booking); LiteSVM vs Anchor crate-version
friction in tests.

## Phase 0 plan (Sun Oct 4)

1. Install and pin the toolchain; confirm compatibility via Solana MCP. ✅
2. Connect Solana MCP; install Colosseum + Solana Foundation skills. ✅
3. Novelty check with Colosseum Copilot. ⛔ needs Greg's sign-in
4. Scaffold the monorepo; `anchor build` on an empty program; `pnpm -r build`. ✅
5. CLAUDE.md, DECISIONS.md, SETUP_CHECKLIST.md, COMPETITIVE_LANDSCAPE.md draft. ✅
6. Commit, push, tag `phase-0`, summarize for Greg. ✅

Risks found: toolchain version mismatches (resolved, see DECISIONS.md); Phantom Portal
not accepting new apps (see Blockers).

## Done

### Phase 3 (Oct 4)

- Wallets: Phantom Connect (Google/Apple + extension with an App ID; extension-only
  without), lazily mounted; localnet-only test wallet for automated tests.
- Pages: `/`, `/containers`, `/c/[id]`, `/book/[id]`, `/me`, `/s/[id]`, `/forwarder`,
  `/forwarder/c/[id]`, `/f/[id]`, `/verify`, `/auth/callback`, 404.
- Shipment actions: approve (confirmation sheet), reject, refund, auto-approve, top-up,
  ticket transfer (confirm-last-4), dispute, pickup QR (signed, refreshes every 5 min),
  confirm pickup, claim freight.
- Forwarder console: register, guarantee deposit/withdraw with coverage meter, open
  container, evidence upload + receipt, close/load (ISO 6346 + B/L hash)/arrive/cancel,
  pickup scanner (camera or paste), freight claims.
- APIs: `POST /api/evidence`, `GET /api/evidence/[c]`, `GET /api/files/[name]`,
  `POST /api/pickup/verify`.
- **Playwright: the full two-browser lifecycle passes on a local validator** (forwarder
  registers → trader books → receipt with photo → verified evidence → approval → load →
  arrive → pickup code checked → pickup confirmed).
- Phantom findings recorded in DECISIONS.md (no sign-only for embedded wallets, $1,000/day
  limit, presign fee-payer option, Portal paused).

### Phase 2 (Oct 4)

- 10 more instructions (26 total): `top_up_freight`, `mark_loaded` (ISO 6346 + check
  digit), `mark_arrived`, `confirm_pickup`, `claim_freight_after_grace`, `open_dispute`,
  `resolve_refund_escrow`, `resolve_force_approve`, `resolve_dismiss`, `resolve_slash_bond`.
- Full spec 5.7 matrix: 95 LiteSVM tests + 12 unit tests green, including a 3-trader
  lifecycle to `Completed` with money conservation, Cargo Ticket resale, slash caps,
  overdue disputes and layout offsets.
- Autofixer: 0 issues on every program file. `docs/SECURITY.md` (invariants, threat
  model, checklist walk) and `docs/ARCHITECTURE.md` written.
- `@manifest/sdk`: PDAs, fetchers (IDL-derived memcmp offsets), 26 instruction builders,
  `deriveStage` / `allowedActions` / Manifest Score, formatting, ISO 6346, friendly
  errors, evidence hashing; 28 Vitest tests.
- Scripts: `create-demo-mint`, `init-config`, `e2e-local`; all verified on
  `solana-test-validator` (the e2e drives the whole lifecycle through the SDK).
- CI: program job (fmt, clippy, build, LiteSVM tests, IDL drift check).
- `docs/DEPLOY.md`: exact devnet runbook.

### Phase 1 (Oct 4)

- 16 instructions: `initialize_config` (upgrade-authority gated), `update_config`,
  `transfer_admin`, `register_forwarder`, `deposit_bond`, `withdraw_bond`, `open_container`,
  `close_booking`, `cancel_container`, `book_consignment`, `reject_booking`,
  `refund_after_cutoff`, `record_receipt`, `approve_goods`, `auto_approve`, `reject_goods`.
- Approval settlement in one transaction: payee payout, treasury fee, freight re-pricing
  refund, Token-2022 Cargo Ticket (MetadataPointer + TokenMetadata + PermanentDelegate,
  supply 1, mint authority revoked).
- Tests: 65 LiteSVM integration tests (happy paths, every Phase 1 must-fail case from spec
  5.7, account-substitution attempts, invariants 2/3/6 asserted) + 10 unit tests.
- CU: book ~28.5k, approve ~130–140k (DECISIONS.md). No need to split ticket minting.
- Solana MCP `program_autofixer`: 0 issues on every program file (after making two u128
  multiplications explicit `checked_mul`).
- Hardening: Token-2022 payment/bond mints with unsafe extensions are rejected.

### Phase 0 (Oct 4)

- Toolchain: Anchor 1.2.0, Solana CLI 4.1.2, host Rust 1.97.0, LiteSVM 0.16.0, Node 22,
  pnpm 10.28 (versions and reasons in `docs/DECISIONS.md`).
- Solana MCP verified over HTTP and registered in `.mcp.json`.
- Skills vendored in `.claude/skills/`: `colosseum-resources`, `colosseum-copilot`,
  `solana-dev` (Solana Foundation).
- Monorepo scaffold: Anchor program skeleton matching spec 5.x layout, `tests/` LiteSVM crate
  with a passing smoke test, `@manifest/sdk` (cluster + explorer helpers, 6 Vitest tests),
  `@manifest/scripts` (`check-env`), Next.js 16 app with design tokens, fonts, PWA manifest
  and illustration slots.
- `anchor build` ✅ · `cargo test -p manifest-tests` ✅ · `cargo fmt --check` + `clippy -D warnings` ✅
  · `pnpm -r build/lint/typecheck/test` ✅.
- CI workflow (TypeScript job + Rust fmt/clippy job). Program build/tests join CI in Phase 2.
- SessionStart hook for cloud sessions (toolchain install + keypair restore from env secrets).
- Container dev keypair `865LQnRkyX7M46yRhHRHMUEFeKNycdPqJ4geNtkF6QT8` created for local
  tooling only. It lives in an ephemeral container, so **do not fund it**; see Blockers.

## In progress

- Nothing. Waiting for Greg (devnet keys, Phantom App ID answer, go-ahead for Phase 4).

## Next

1. **Devnet deploy** as soon as keys exist: `docs/DEPLOY.md` (about 15 minutes).
2. **Phase 4, integrations:** devnet faucet + gas tank (possibly as fee payer via Phantom's
   `presignTransaction`), crank + Vercel cron, OG images (container previews for WhatsApp,
   Cargo Ticket metadata + image), Solana Actions/Blinks, Squads scripts + `/admin`,
   seed world.

## Blockers

1. **Colosseum Copilot sign-in (novelty check).** Copilot v2 uses a device login, not a PAT.
   Greg needs to approve a device code while a session is active. Until then
   `docs/COMPETITIVE_LANDSCAPE.md` has the off-chain section only.
2. **Phantom Portal is not accepting new applications** (warning on
   docs.phantom.com/recipes/quickstarts/nextjs, checked Oct 4). Google/Apple embedded
   wallets require a Portal App ID; the injected (extension/app) provider does not. If Greg
   has no existing Portal app, we need a decision before Phase 3 (see summary).
3. **Devnet deploy (Phase 2, step 10).** Needs durable keypairs from Greg (environment
   secrets) and ~12 devnet SOL on the deploy key + ~5 on the gas tank. The devnet faucet
   rate-limits this container (airdrop failed Oct 4). Runbook: `docs/DEPLOY.md`.

## Decisions

- Rust LiteSVM tests in a separate `tests/` crate (not TS).
- web3.js v1 + `@anchor-lang/core` client stack; Kit migration via Codama after the hackathon.
- Copilot uses the v2 device sign-in; `COLOSSEUM_COPILOT_PAT` is a v1 leftover.
- Full list: `docs/DECISIONS.md`.
