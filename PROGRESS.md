# PROGRESS

Living checklist. Update after every meaningful step. Times are WAT.
Code freeze: **Mon Oct 12, 6:00 PM WAT**. Submission deadline: **Tue Oct 13, 7:59 AM WAT**.

## Phase status

| Phase                        | Dates     | Status                                                 |
| ---------------------------- | --------- | ------------------------------------------------------ |
| 0: Setup                     | Sun Oct 4 | ✅ Done (Copilot novelty check pending Greg's sign-in) |
| 1: Program core              | Oct 4–6   | 🔨 In progress                                         |
| 2: Program complete + devnet | Oct 6–7   | —                                                      |
| 3: Frontend core             | Oct 7–9   | —                                                      |
| 4: Integrations              | Oct 9–10  | —                                                      |
| 5: Polish + docs + deploy    | Oct 10–11 | —                                                      |
| 6: Videos + submission       | Oct 11–12 | —                                                      |

## Phase 1 plan (Oct 4–6): program core

Order (each step: code → LiteSVM tests → green → commit):

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

- Phase 1, step 1 (foundations).

## Next (Phase 1: program core)

Config, Forwarder + bond, Container (open/close/cancel), Consignment (book, reject, refund,
record_receipt, approve, auto_approve, reject_goods), approval settlement incl. Cargo Ticket,
events, errors; happy-path + must-fail LiteSVM tests; measure CU.

## Blockers

1. **Colosseum Copilot sign-in (novelty check).** Copilot v2 uses a device login, not a PAT.
   Greg needs to approve a device code while a session is active. Until then
   `docs/COMPETITIVE_LANDSCAPE.md` has the off-chain section only.
2. **Phantom Portal is not accepting new applications** (warning on
   docs.phantom.com/recipes/quickstarts/nextjs, checked Oct 4). Google/Apple embedded
   wallets require a Portal App ID; the injected (extension/app) provider does not. If Greg
   has no existing Portal app, we need a decision before Phase 3 (see summary).
3. **Durable keypairs before the Phase 2 deploy.** Cloud containers are ephemeral; the
   program and deploy keypairs must come from Greg via environment secrets
   (`docs/SETUP_CHECKLIST.md`). Not blocking Phase 1.

## Decisions

- Rust LiteSVM tests in a separate `tests/` crate (not TS).
- web3.js v1 + `@anchor-lang/core` client stack; Kit migration via Codama after the hackathon.
- Copilot uses the v2 device sign-in; `COLOSSEUM_COPILOT_PAT` is a v1 leftover.
- Full list: `docs/DECISIONS.md`.
