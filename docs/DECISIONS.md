# Decisions

Pinned toolchain and architecture decisions, newest at the bottom of each section.
Every version here was installed and verified in Phase 0 (Sun Oct 4, 2026).

## Toolchain (Phase 0)

| Tool                | Version                     | How installed                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anchor CLI          | **1.2.0**                   | Prebuilt release binary from `github.com/solana-foundation/anchor/releases` into `~/.local/bin` | Latest stable 1.x on crates.io at install time. `avm` was skipped: it installs via `cargo install --git`, and git clones of GitHub are blocked in the cloud sandbox. Locally, `avm install 1.2.0` is equivalent.                                                                                                                                            |
| `anchor-lang` crate | **1.2.0**                   | Cargo                                                                                           | Uses the `solana-*` 3.x crate line.                                                                                                                                                                                                                                                                                                                         |
| Solana CLI (Agave)  | **4.1.2**                   | `agave-install init 4.1.2`                                                                      | Anchor 1.2 release notes name 4.1.2 (platform-tools v1.57) as the recommended toolchain.                                                                                                                                                                                                                                                                    |
| platform-tools      | **v1.57** (rustc 1.95 fork) | Pulled by `cargo-build-sbf`                                                                     | Anchor 1.2 passes `--tools-version v1.57 --arch v3` by default.                                                                                                                                                                                                                                                                                             |
| sBPF target         | **v3**                      | Anchor 1.2 default                                                                              | Needs Agave ≥ 4.0 runtime and LiteSVM ≥ 0.13.1 to load. **Devnet support for v3 binaries must be confirmed at the Phase 2 deploy**; fallback is `anchor build --arch v1` (or `v0`).                                                                                                                                                                         |
| Host Rust           | **1.97.0**                  | rustup (pinned in `rust-toolchain.toml`)                                                        | The Anchor template pins 1.89, but LiteSVM 0.16 needs newer std APIs (`MaybeUninit::write_copy_of_slice`). The SBF program itself is compiled by platform-tools' own rustc, so this only affects IDL builds, clippy and tests. The workspace `rust-version` (MSRV) stays 1.89: cargo checks it against platform-tools rustc 1.95 when building the program. |
| LiteSVM             | **0.16.0**                  | Cargo (`tests/Cargo.toml`)                                                                      | 0.13.x pins `solana-instruction = 3.2.0`, which conflicts with `anchor-lang` 1.2 (`^3.3`). 0.17 requires rustc 1.97.1 and the Agave 4.3 line. 0.16 (Agave 4.2 runtime) resolves cleanly with Anchor 1.2.                                                                                                                                                    |
| Node.js             | **22.22.0**                 | Preinstalled                                                                                    | `.nvmrc` = 22.                                                                                                                                                                                                                                                                                                                                              |
| pnpm                | **10.28.0**                 | Preinstalled                                                                                    | `packageManager` field in the root `package.json`.                                                                                                                                                                                                                                                                                                          |
| TypeScript          | **5.9.3**                   | pnpm                                                                                            | TypeScript 7 (native compiler) is out, but `typescript-eslint` 8.71 supports `<6.1`, so 5.9 is the safe choice.                                                                                                                                                                                                                                             |
| ESLint              | **9.39.5**                  | pnpm                                                                                            | ESLint 10 is out, but `eslint-plugin-react` / `eslint-plugin-import` (pulled in by `eslint-config-next`) don't support it yet.                                                                                                                                                                                                                              |
| Next.js             | **16.3.8** (React 19.3)     | pnpm                                                                                            | App Router, Turbopack build.                                                                                                                                                                                                                                                                                                                                |
| Tailwind CSS        | **4.3.3**                   | pnpm                                                                                            | CSS-first config (`@theme` in `globals.css`).                                                                                                                                                                                                                                                                                                               |
| Vitest              | **5.0.3**                   | pnpm                                                                                            | SDK unit tests.                                                                                                                                                                                                                                                                                                                                             |

A first attempt with the Solana `stable` channel (4.3.0) built fine, but 4.3's
`cargo-build-sbf` also emits sBPF v3, and LiteSVM 0.10 (the Anchor template's pin) could
not load it (`InvalidAccountData`). That is what led to the LiteSVM upgrade and the pinned
4.1.2 above.

## Program testing

- **Rust LiteSVM tests in a separate workspace crate `tests/` (`manifest-tests`).** It
  depends on the program crate with `no-entrypoint`, so tests can use the generated
  `manifest::instruction::*` / `manifest::accounts::*` types and deserialize accounts
  directly, while loading the real compiled `.so` from `target/deploy/`. Keeping tests in
  Rust means one language for program + tests and no validator. TS is used only for SDK
  unit tests (Vitest).
- LiteSVM 0.16 uses `solana-address` 2.x while Anchor's `Pubkey` is `solana-address` 1.x, so
  both versions are in the test dependency graph. LiteSVM's APIs take `impl Into<Address>`,
  so Anchor pubkeys pass straight in; anything needing an explicit conversion lives in the
  test harness only.

## TypeScript client

- `@anchor-lang/core` 1.2.0 (the 1.x rename of `@coral-xyz/anchor`) on `@solana/web3.js` v1.
  Phantom's React SDK examples, `@solana/actions` 1.6 and `@sqds/multisig` 2.x all use
  web3.js v1, so one client stack covers the whole hackathon.
- **Kit migration note:** the Solana Foundation skills now default to `@solana/kit`. After the
  hackathon, generate a Kit client from the Anchor IDL with Codama
  (`@codama/nodes-from-anchor` + `@codama/renderers-js`) and migrate the SDK behind the same
  function signatures. Not done now because the sponsor SDKs above are web3.js v1.

## Repository and tooling

- pnpm workspaces: `packages/*`, `app`, `scripts`. The Cargo workspace is `programs/*` + `tests`.
- `@manifest/sdk` builds to ESM (`NodeNext`, explicit `.js` import extensions) so it works in
  Next.js and in Node scripts run with `tsx`.
- Solana MCP is registered at project scope in `.mcp.json`; Colosseum and Solana Foundation
  skills are vendored in `.claude/skills/` (tracked by `skills-lock.json`), so every session
  has them.
- A SessionStart hook (`.claude/hooks/session-start.sh`) reinstalls the pinned toolchain in
  ephemeral cloud containers.

## Keys and program ID

- The Phase 0 program ID `HQHe42ZUBWmrSbjW4zr9Qt2wdGDYyH1QpiYLJe3z7Jci` comes from
  `target/deploy/manifest-keypair.json`, generated by `anchor build` and **not committed**.
  It was never deployed. **Devnet deploy (Oct 6):** program ID `4DCvHBveVC31TztNNzJp65GeHxNNdPFVxH4vgwDwa7S9` from Greg's
  durable program keypair (environment secret `MANIFEST_PROGRAM_KEYPAIR`); upgrade authority
  `CMTu8vvApMUpP5QPK3r6S7SD6aTVXwUTWgjTzPPFN17n` (`manifest-dev.json`). The program ID is now fixed.

## Program design (Phase 1)

**Compute units (measured in LiteSVM, `tests/src/lifecycle.rs` and `approval.rs`):**

| Instruction        | CU               | Notes                                                                                   |
| ------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| `book_consignment` | ~28,500          | Creates consignment + vault, one transfer                                               |
| `approve_goods`    | ~130,000–140,000 | 3 transfers, up to 3 ATA creations, Token-2022 ticket mint with metadata, mint + revoke |
| `auto_approve`     | ~135,000–140,000 | Same settlement                                                                         |

Approval fits comfortably in one transaction (clients add a 400k CU limit for headroom), so
Cargo Ticket minting is **not** split into a separate `mint_cargo_ticket` instruction.
The variation comes from PDA bump searches and whether token accounts already exist.

**Decisions and small deviations from the spec, with reasons:**

- `initialize_config` is gated on the program's **upgrade authority** (checked through the
  ProgramData account), so nobody can front-run the real config right after deployment.
- Instructions with many arguments take a params struct (`ConfigParams`,
  `OpenContainerParams`, `BookConsignmentParams`) instead of long positional lists. Same
  fields as the spec.
- `register_forwarder` takes the bond mint as an account (it is needed to create the bond
  vault) rather than as a pubkey argument.
- `approve_goods` and `auto_approve` share one accounts struct, `SettleApproval`, and one
  settlement function. `approve_goods` additionally requires `payer == consignment.trader`
  and `now <= review_deadline`; `auto_approve` requires `now > review_deadline`.
- Refunds (reject, refund after cut-off, freight excess) go to the trader's **associated
  token account**, created on demand, so the destination is deterministic.
- At booking, the payee must differ from the trader, the treasury owner, the vault and the
  consignment, and the trader must differ from the treasury owner. Anchor 1.x rejects
  duplicate mutable accounts, so if these coincided the approval transaction could never
  succeed and funds would be stuck until arbitration.
- `refund_after_cutoff` frees the booked volume as well as the coverage (the spec lists
  only coverage; freeing volume keeps the container counters consistent).
- `record_receipt` has no time check, as in the spec: a forwarder may still record goods
  that arrive after the cut-off, as long as the trader hasn't refunded yet. Whichever
  transaction lands first wins.
- Token-2022 payment/bond mints are rejected if they carry transfer fees, transfer hooks,
  a permanent delegate, non-transferable, default account state, confidential transfers,
  pausable or scaled-UI-amount extensions. Those would break the "vault == state"
  invariant or let a third party move escrowed tokens.
- New fields beyond the spec tables: `Config.ticket_authority_bump`,
  `Forwarder.bond_vault_bump`, `Consignment.vault_bump` (cached PDA bumps).
- Cargo Ticket: the `["ticket_authority"]` PDA is mint authority (revoked after minting
  1), metadata update authority, metadata-pointer authority and permanent delegate. No
  freeze authority. The metadata TLV size is computed in `utils/cargo_ticket.rs`; if the
  rent top-up were short, the transaction would fail, so the tests cover it.

## Program design (Phase 2)

**Compute units:** `confirm_pickup` ~38,000 · `claim_freight_after_grace` ~53,000 ·
`resolve_slash_bond` ~43,500. All post-approval paths fit easily in one transaction.

- **Dispute resolution is four instructions**, not one `resolve_dispute(resolution)`:
  `resolve_refund_escrow`, `resolve_force_approve`, `resolve_dismiss`,
  `resolve_slash_bond`. Each resolution needs different accounts (ForceApprove needs the
  whole approval settlement, SlashBond needs the bond vault and ticket accounts), and
  separate instructions keep every account typed and checked. The SDK exposes one
  `resolveDispute({ resolution })` builder that picks the right instruction. The
  `DisputeResolved` event carries a `Resolution` enum.
- `resolve_force_approve` reuses the `SettleApproval` accounts with `payer ==
config.arbitrator` (the Squads vault pays the rent, so it needs a little SOL).
- `resolve_slash_bond` takes the holder's bond-mint token account as an **optional**
  account: `None` when the bond mint equals the payment mint (otherwise the two holder
  accounts would alias), required and pre-created (idempotent ATA instruction in the same
  transaction) when they differ.
- Excess freight (from top-ups beyond what's due) goes to the **current ticket holder** in
  both `confirm_pickup` and `claim_freight_after_grace` (the spec says "trader" for the
  claim path; the holder is who paid the top-up in practice and holds the rights).
- `claim_freight_after_grace` does not count as a delivery in forwarder stats; only a
  holder-confirmed pickup does. Neither changes `stats_volume`.
- `confirm_pickup` also closes the holder's empty ticket token account, returning its rent.
- `top_up_freight` is open to any signer (it can only add money, capped at the shortfall).
- `mark_arrived` marks the container `Completed` immediately if every consignment was
  already compensated while it was overdue.
- `resolve_refund_escrow` also frees the consignment's measured volume from
  `received_cbm_milli`.
- ISO 6346 is validated onchain, including the check digit (`utils/validation.rs`); the
  SDK runs the same algorithm client-side.

## SDK and scripts (Phase 2)

- The SDK commits the generated IDL (`packages/sdk/src/idl/`, synced by `pnpm idl:sync`)
  so the app builds on Vercel without the Rust toolchain. CI fails if it drifts.
- Instruction builders use `accountsStrict` (no implicit account resolution) and add a
  400k compute-unit limit to approval, pickup, claim and slash transactions.
- memcmp offsets are computed from the IDL and pinned by tests in both Rust
  (`tests/src/layout.rs`) and TypeScript (`packages/sdk/test/core.test.ts`).
- `deriveStage` shows "Loaded" for 2 days after loading, then "Sailing". There is no
  onchain departure event; this is display only.
- Manifest Score = `100 x on-time rate x (1 - disputes lost / (delivered + disputes lost))`,
  "New forwarder" under 3 deliveries.
- `scripts/src/e2e-local.ts` drives the whole lifecycle through the SDK against
  `solana-test-validator`; it passes.
- Circle devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` verified against
  Circle's docs and onchain (SPL Token, 6 decimals).
- **sBPF v3:** Solana is making v3 the only format accepted for new deployments
  (SIMD-0500, mainnet Nov 2026), so the Anchor 1.2 default is the right target.

## Frontend (Phase 3)

**Phantom Connect findings** (docs.phantom.com, checked Oct 4, 2026; spec 9.1):

1. **`signAllTransactions` and sign-only `signTransaction` are not supported for embedded
   (Google/Apple) wallets**; only `signAndSendTransaction`
   (docs.phantom.com/sdks/react-sdk/sign-and-send-transaction). Every user action is one
   transaction. This also rules out a plain Kora flow for embedded wallets.
2. **Dapp fee payer is possible**: `signAndSendTransaction(tx, { presignTransaction })`
   lets our backend co-sign as fee payer for embedded wallets. That is the gasless path to
   evaluate in Phase 4 (gas tank as fee payer) instead of Kora.
3. **Embedded wallets have a $1,000 per app per user per day spending limit**
   (docs.phantom.com/phantom-connect#spending-limits). The booking summary warns when an
   embedded-wallet booking exceeds $1,000 and recommends the Phantom app/extension. The
   SDK also exposes `usePhantom().errors.spendingLimit`.
4. **Portal settings:** allowed origins (localhost, Vercel preview, production) and the
   redirect URL `/auth/callback`. Domain verification isn't required in development.
   **Phantom Portal is not accepting new applications** (warning on the React SDK docs);
   without an App ID the app runs in extension-only mode (`providers: ["injected"]`).
   Phantom injects its provider only on https or localhost.

**Other decisions:**

- The wallet SDK is mounted lazily _beside_ the app (it reports state through a context),
  not around it, so every page still server-renders.
- **Localnet-only test wallet** (keypair in localStorage) exists so the full app can be
  exercised by automated browser tests; it signs real transactions against a local
  validator and is never enabled on devnet/mainnet (`config.burnerWallet`).
- Every transaction is **simulated before the wallet prompt** so program errors come back as
  friendly messages (SDK `friendlyError`) instead of a raw wallet failure.
- Booking amounts come from `quoteBooking` in the SDK, which mirrors the program's
  rounding exactly (unit-tested against the Rust numbers).
- Evidence: the forwarder signs `manifest-evidence:<consignment>:<sha256 of fields and
photo hashes>:<ts>`; the server verifies the signature against the onchain forwarder,
  strips EXIF/resizes with sharp, builds the canonical manifest and returns its SHA-256,
  which the client writes onchain with `record_receipt`. Storage: Pinata (public IPFS) when
  `PINATA_JWT` + `PINATA_GATEWAY` are set, else `.data/` on local disk (dev only).
  Pinata's latest manifest is found by file name (`manifest-<consignment>.json`); the
  Pinata path is untested until a JWT is available.
- Pickup proof: the holder signs `manifest-pickup:<consignment>:<nonce>:<ts>`; the QR
  payload is verified client-side by the forwarder (signature, 10-minute freshness,
  current ticket holder, container arrived, freight funded), with
  `POST /api/pickup/verify` as a server fallback.
- Plain `<img>` is used only for data-URL QR codes and evidence photos (IPFS/local URLs);
  static illustrations use `next/image`.
- Verified in Playwright (Chromium 1194 / `@playwright/test` 1.56.1): the full two-browser
  lifecycle passes on a local validator (`app/e2e/`).

## Integrations (Phase 4)

- **Faucet / gas tank:** `POST /api/faucet` signs with `GAS_TANK_SECRET_KEY`, which is also
  the demo mint authority on devnet. Limits live in Vercel KV / Upstash Redis (REST
  `SET NX EX`, `INCR` + `EXPIRE`) when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set,
  else in process memory (dev only). Disabled on mainnet; enabled on devnet and localnet.
- **Crank cadence:** Vercel Hobby crons run at most once a day and an expression that runs
  more often fails the deploy (vercel.com/docs/cron-jobs/usage-and-pricing, checked Oct 5).
  So `app/vercel.json` has one daily run and `.github/workflows/crank.yml` calls
  `/api/cron/crank` every 5 minutes with the same `CRON_SECRET` (a no-op until the
  `APP_URL` and `CRON_SECRET` repository secrets exist). The planner reads the cluster
  clock (block time) and mirrors the program's conditions (`now > review_deadline`,
  `now >= cutoff_ts`). Duplicate runs are harmless: the program rejects the second call.
  In practice GitHub delays scheduled runs on this repo to roughly every 6–7 hours (Oct 5–6),
  so before a demo use Run workflow on the crank workflow, or run
  `pnpm --filter @manifest/scripts crank`; the instructions it calls are permissionless.
- **OG and ticket images:** `next/og` in the Node runtime with static OFL `.woff` fonts
  from the Fontsource packages (Satori reads ttf/otf/woff, not woff2), included in the
  serverless trace via `outputFileTracingIncludes`. Images are always light-theme.
  Ticket art is square (1080²) for wallet galleries.
- **Cargo Ticket metadata** follows the Metaplex JSON standard
  (metaplex.com/docs/token-metadata/token-standard): attributes are strings, goods value
  is never included, `external_url` is the public shipment page.
- **Blinks:** `@solana/actions` 1.6.6 for types and `createActionHeaders` (devnet CAIP-2
  id, action version 2.4). POST builds an unsigned v0 transaction with the requesting
  account as fee payer (clients refresh the blockhash), simulates it with
  `sigVerify: false` and returns a friendly `ActionError` instead of a doomed wallet
  prompt. The trader's ATA is created idempotently. Testing on dial.to needs a public
  HTTPS deploy (Phase 5).
- **Squads v4** (`@sqds/multisig` 2.1.4; program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`
  from docs.squads.so quickstart, same id on devnet). 2-of-3, `configAuthority: null`,
  time lock 0 for the demo (timelock is a roadmap item). The vault holds a 0.2 SOL float
  because the arbitrator pays rent inside resolutions (force-approve spent ~0.006 SOL).
  Compute-budget instructions are stripped from the vault transaction and set on the
  outer execute transaction: they can't run via CPI. Local testing clones the program,
  its program config (`BSTq9w3k…`) and the devnet treasury (`HM5y4mz3…`, read from the
  program config) from devnet.
- **Arbitration UI:** `/admin` lists disputes from the chain and shows the exact
  `resolve-dispute` commands. A browser button would need one wallet to create, two to
  approve and one to execute; the Squads app or the script does that better.
- **Demo data:** stable demo keypairs in `.keys/` (gitignored; derived from the dev key with
  HMAC-SHA256, so a fresh cloud session holding `MANIFEST_DEV_KEYPAIR` recreates the same
  demo cast and Squads members without extra secrets), evidence uploaded through
  the real `/api/evidence` with original placeholder photos (`scripts/demo-assets/`).
  The disputed shipment belongs to Eastline, so its "disputes opened" stat is 1; a slash
  makes it a lost dispute and lowers the score, which is the honest outcome.
- Evidence signing helpers (`evidenceFieldsHash`, `evidenceMessage`) moved into the SDK so
  the app and scripts can't drift.

## Pending decisions (later phases)

- Phantom embedded-wallet capabilities: `signAllTransactions`, sign-only, daily limits (Phase 3).
- Reflect: no devnet deployment found (Oct 5); roadmap note in `docs/ROADMAP.md#reflect`.
- Fee sponsorship with Phantom `presignTransaction`: deferred until it can be tested with
  a real Phantom wallet (see `docs/ROADMAP.md#kora`).
