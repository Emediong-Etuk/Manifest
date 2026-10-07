# PROGRESS

Living checklist. Update after every meaningful step. Times are WAT.
Code freeze: **Mon Oct 12, 6:00 PM WAT**. Submission deadline: **Tue Oct 13, 7:59 AM WAT**.

## Phase status

| Phase                        | Dates     | Status                                             |
| ---------------------------- | --------- | -------------------------------------------------- |
| 0: Setup                     | Sun Oct 4 | ✅ Done (Copilot novelty check done Oct 5)         |
| 1: Program core              | Oct 4–6   | ✅ Done (Oct 4)                                    |
| 2: Program complete + devnet | Oct 6–7   | ✅ Done; deployed to devnet Oct 6                  |
| 3: Frontend core             | Oct 7–9   | ✅ Done on localnet (devnet pending deploy)        |
| 4: Integrations              | Oct 9–10  | ✅ Done on localnet (Oct 5; devnet pending deploy) |
| 5: Polish + docs + deploy    | Oct 10–11 | ✅ Done (Oct 5) except deploys (blocked on Greg)   |
| 6: Videos + submission       | Oct 11–12 | 🔨 In progress; recording waits on Vercel + Pinata |

## Phase 6 plan (Oct 5–12): videos and submission

Steps 1–4 done ✅ (Oct 5). Remaining Phase 6 work is Greg's or waits on the deploys:
deploy → seed → record → Arena → post (schedule in `docs/SUBMISSION_CHECKLIST.md`).

Blocked on Greg: durable keypairs + devnet SOL, Vercel, Pinata. Recording needs the devnet
deploy, so the work here makes deploy day and recording day fast and safe:

1. `pnpm --filter @manifest/scripts preflight`: one command that checks everything the
   deploy and the demo need (keys, balances, program ID match, env vars, config, Squads,
   demo world, app endpoints) and prints exactly what's missing.
2. Rehearse `docs/DEMO_SCRIPT.md` end to end in Playwright on a local validator (Blink POST,
   receipt with photo, VERIFIED, approve, ticket transfer, pickup code paste, confirm,
   Squads slash, `/admin`); fix any label or step the script gets wrong. Keep it as an
   e2e test so the demo path can't silently break before code freeze.
3. Arena submission draft (`docs/ARENA_SUBMISSION.md`) and launch posts
   (`docs/LAUNCH_POSTS.md`), with placeholders only where Greg's facts are needed.
4. Day-by-day schedule to the deadline; code-freeze checklist.

Risks: the deploy keeps slipping (recording window shrinks; fallback is the scripted local
recording, which the spec allows only as a last resort since the devnet program is
"never cut"); Phantom on devnet untested; Arena form fields may differ from the guide.

## Phase 5 plan (Oct 5–11): polish, docs, deploy

Steps 1–8 done ✅. Step 9: deploy readiness done; the Vercel and devnet deploys are blocked
on Greg (accounts and keys).

1. Local demo environment: validator with Squads, seed world, production build.
2. Mobile QA at 360 px: Playwright screenshots of every page with seeded data and an
   automatic horizontal-overflow check; fix what breaks.
3. States: audit loading / empty / error on every page; app-level `error.tsx`; query
   errors shown with a retry instead of an endless skeleton.
4. Accessibility: axe-core on every page (Playwright), keyboard focus, labels, contrast;
   fix violations.
5. "Judge in 2 minutes" on mobile: landing → test dollars → book. Time it in Playwright
   at 360 px and remove friction (faucet prompt on the booking page when the balance is
   short).
6. Copy pass: plain language, one name per concept.
7. Tests: Playwright smoke (landing → containers → container detail), mobile overflow and
   axe checks added to the e2e suite.
8. Docs (spec section 12): README (verified market numbers with sources, Mermaid flow +
   architecture, accounts and instructions tables, sponsor tech, security, run locally),
   BUSINESS, FORWARDER_ONEPAGER, LOI_TEMPLATE, INTERVIEW_QUESTIONS, PITCH_SCRIPT,
   DEMO_SCRIPT (exact click paths with seeded accounts), SUBMISSION_CHECKLIST, full-system
   ARCHITECTURE diagram, README screenshots.
9. Deploy readiness: Vercel monorepo settings documented and a devnet-config build checked;
   secret scan of the repository. The actual deploy needs Greg's Vercel + devnet keys.

Risks: market statistics must be verified from sources (never invented); Vercel and devnet
deploys are blocked on Greg; Phantom flows can't be exercised in this container.

## Phase 4 plan (Oct 5–10): integrations

Steps 1–6 done ✅ (verified on a local validator). Step 7: Reflect/Kora roadmap notes
done; Phantom fee sponsorship deferred (untestable here without the Phantom extension).

1. Faucet / gas tank: `POST /api/faucet` (devnet/localnet only): SOL top-up below 0.02 +
   500 test dollars; per-address 24h limit + global daily cap (Upstash/Vercel KV when
   configured, in-memory otherwise); DevnetBanner button.
2. Crank: `scripts/crank.ts` (`--watch`) + `GET /api/cron/crank` (CRON_SECRET) +
   `vercel.json` cron: `auto_approve` past review deadline, `close_booking` past cut-off.
3. Share previews: server `generateMetadata` for `/c/[id]` and `/s/[id]`; `next/og`
   images `/api/og/container/[id]`; Cargo Ticket metadata `/api/tickets/[c]` and image
   `/api/tickets/[c]/image` (boarding-pass design, VOID stamp when settled).
4. Solana Actions / Blinks: `/actions.json`, `GET/POST /api/actions/book/[container]`
   with `@solana/actions` headers + CORS; "Share as Blink" button.
5. Squads v4: `scripts/squads-setup.ts` (2-of-3 multisig, vault PDA → config arbitrator +
   treasury), `scripts/resolve-dispute.ts` (vault transaction → proposal → 2 approvals →
   execute); `/admin` dispute queue that prepares the resolution. Verified on a local
   validator with the Squads program cloned from devnet.
6. Demo data: `seed-demo.ts` (Eastline Cargo, Harbour Link, LAG-1014/2207/0930, resale,
   dispute), `fund-wallet.ts`, `demo-reset.ts`.
7. Stretch (only if ahead): fee sponsorship via Phantom `presignTransaction`; Reflect and
   Kora notes for the roadmap.

Risks: Squads SDK on web3.js v1 versions; Actions spec details (verify against docs);
devnet still blocked (everything verified on localnet); fonts for `next/og` (bundle OFL
TTFs).

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

### Phase 6, prep (Oct 5)

- `preflight`: deploy- and recording-day readiness in one command (RPC, durable key,
  program ID consistency, balances, upgrade authority, config, mint + gas tank, metadata
  URL, Squads, demo world, app endpoints, HTTPS, Pinata), with the next step for each
  failure. All green on the local rehearsal; on devnet it lists exactly the 9 missing items.
- `docs/DEMO_SCRIPT.md` rehearsed click for click as `app/e2e/rehearsal.spec.ts` (passed
  in 24 s); the script gained the last-4 confirmation on ticket transfer.
- `docs/ARENA_SUBMISSION.md` (every Arena field, verified facts only, placeholders for
  Greg's) and `docs/LAUNCH_POSTS.md` (X thread, WhatsApp, LinkedIn).
- Day-by-day schedule to the deadline in `docs/SUBMISSION_CHECKLIST.md`.
- PR Emediong-Etuk/Manifest#1 merged by Greg; CI green on `main` (program + TypeScript jobs).
- Colosseum Copilot novelty check (Greg signed in): ~30 related past projects; closest is
  Tradeos (Frontier, West Africa ↔ UAE milestone escrow). Not near-identical: none combines
  forwarder-verified warehouse evidence with a bond, a transferable Cargo Ticket and freight
  escrowed to pickup. Written up in `docs/COMPETITIVE_LANDSCAPE.md`; Arena competition field
  updated. Pitch must not claim "first trade escrow".

### Phase 5 (Oct 5)

- **Mobile QA at 360 px**: every page (24 page states as visitor, trader and forwarder)
  audited in Playwright for horizontal overflow, axe WCAG 2.1 AA violations and console
  errors, in light and dark mode: all clean. Fixes: mobile nav row, wallet button
  nowrap, photos before the approve button, large photo picker with thumbnails, stamp
  green contrast 4.47 → 5.19:1, tap-to-open explanations instead of hover tooltips,
  one date format, honest landing stat.
- **Judge path**: "Try it in 2 minutes" card (sign in → 500 test dollars → book the
  soonest open container), "Use a test supplier address", faucet button on the booking
  summary. Playwright at 360 px: landing → booked in 3–5 s of app time.
- **States**: `NetworkError` + retry on every page when the RPC fails (verified with the
  RPC blocked), `app/error.tsx`, skip-to-content link, plain-language messages for every
  user-reachable program error, copy pass ("guarantee", "shipment").
- **Tests**: Playwright suite is now lifecycle + judge + smoke (axe + overflow); 142
  tests in total (95 + 12 Rust, 32 SDK, 3 browser).
- **Docs**: README (verified market sources, diagrams, tables, screenshots), BUSINESS,
  FORWARDER_ONEPAGER, LOI_TEMPLATE, INTERVIEW_QUESTIONS, PITCH_SCRIPT, DEMO_SCRIPT,
  SUBMISSION_CHECKLIST, full-system ARCHITECTURE (and a broken Mermaid diagram fixed; all
  diagrams validated by rendering), Vercel runbook in DEPLOY.
- **Deploy readiness**: `app/vercel.json` builds the SDK first; a clean devnet-config build
  verified. `export-wallet` prepares demo keys for Phantom import without printing them.
- **Secret scan**: all 19 commits scanned locally (keypair arrays, base58 private keys,
  secret env values, key files): clean. GitHub secret scanning isn't enabled on the repo.

### Phase 4 (Oct 5)

- **Faucet / gas tank:** `POST /api/faucet` (0.05 SOL if below 0.02 + 500 test dollars;
  once per address per day + global daily cap via Vercel KV, in-memory fallback) and a
  "Get test dollars" button in the demo banner.
- **Crank:** shared planner in the SDK (`findCrankJobs`, mirrors the program's checks, uses
  the cluster clock), `pnpm --filter @manifest/scripts crank [--watch]`, and
  `GET /api/cron/crank` (Bearer `CRON_SECRET`). Vercel Hobby only allows daily crons, so
  `app/vercel.json` runs daily and `.github/workflows/crank.yml` calls the endpoint every
  5 minutes once the `APP_URL` + `CRON_SECRET` repo secrets exist.
- **Share previews:** `/api/og/container/[id]` (route, space left, rate, cut-off countdown,
  forwarder score, guarantee) and server `generateMetadata` on `/c/[id]` and `/s/[id]`.
- **Cargo Ticket metadata + artwork:** `/api/tickets/[c]` (Metaplex JSON at the URI the
  program writes; no goods value) and `/api/tickets/[c]/image` (printed ticket, QR to the
  shipment page, VOID stamp when final). OFL fonts bundled and traced for Vercel.
- **Blinks:** `/actions.json`, `GET/POST /api/actions/book/[container]` (zod, pre-checks,
  SDK-built `book_consignment`, simulated before returning, inline "completed" next
  action), `createActionHeaders` on every response incl. OPTIONS; "Share as Blink"
  (dial.to) on container pages. A booking made through the Blink POST landed onchain.
- **Squads v4:** `squads-setup` (2-of-3, vault float, config arbitrator + treasury → vault)
  and `resolve-dispute` (vault tx → proposal → 2 approvals → execute). Slash,
  force-approve and refund all executed through the multisig on a local validator with
  the Squads program cloned from devnet. `/admin` dispute queue.
- **Demo world:** `seed-demo` (64 transactions, evidence through the real upload API,
  idempotent), `demo-reset`, `fund-wallet`; placeholder photos in `scripts/demo-assets/`.
- Gate: 95 LiteSVM + 12 unit tests, fmt/clippy, `pnpm -r lint/typecheck/test/build`,
  Playwright lifecycle on the production build: all green.

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

- **Devnet deploy done (Oct 6).** Program `4DCvHBveVC31TztNNzJp65GeHxNNdPFVxH4vgwDwa7S9`
  (upgrade authority `CMTu8vvApMUpP5QPK3r6S7SD6aTVXwUTWgjTzPPFN17n`), demo mint
  `AyNo7xwBF2U1SQj6fkSwHJXVgnQUoka8ez5UuaFpkguc` (gas tank `bk9qwBh3…9B2` is mint authority),
  config initialized, Squads 2-of-3 multisig `9uyFwN6dHKPMFLVLq8qr8ndk5gGTWUGgtWzuHJCFMxtq`
  (vault `DB2eDNrN7qFxMTo9Vvm4bnipP6PZrmNR81iCJpEaBFEX`) as arbitrator and treasury. Preflight:
  all chain checks green; open: seed-demo, app, Pinata. Demo and Squads member keys are now
  derived from the dev key, so any session with `MANIFEST_DEV_KEYPAIR` recreates `.keys/`.
- **Vercel live (Oct 6):** https://manifest-seven-tau.vercel.app (Hobby). Checked: pages 200,
  `/actions.json`, crank endpoint returns 401 without the secret, client bundle has the devnet
  program, mint and Squads addresses. `init-config --update` pointed Cargo Ticket metadata at
  the production URL. Bug found: an empty `FAUCET_DAILY_CAP` meant a cap of 0 (`Number("")`);
  fixed (`||` instead of `??`, also for the scripts' optional env vars).
- **Demo world seeded on devnet (Oct 6)** through the live app; evidence on IPFS (Pinata).
  LAG-1014 (open) `4tVzQf56kRS7kXE3fVGM4AoTgDtaJFqkv9TEfEiRCytG`, LAG-2207 (Harbour Link)
  `B1Ct8dwkafWpa1emRQKmY7XCgj7xoqs4GFJBnB2tNehK`, resold blenders ticket
  `9w4uDLqJCAhnKBatWx2K2viYy5Ko8CTnKtpXYMStLD1R`, open dispute
  `C8wcJQYNVsR5XgnPYTB2FvvjdkQVq7AkoEsWVA3KsoAm`. `preflight`: all checks passed. Scripts now
  back off patiently on public-RPC 429s; preflight asks the app where evidence is stored.
- **Oct 6 (later):** logo (header, favicon, app icons); hero, empty-state and 404
  illustrations; Phantom bridge render loop fixed (devnet pages re-rendered without end)
  with `e2e/phantom.spec.ts` as a guard (fails on the old code). Devnet dress rehearsal:
  a dispute on Harbour Link's REH-1006 resolved (dismiss) through the Squads 2-of-3 on
  devnet: proposal, two approvals, execute all confirmed. The recorded demo's LAG-1014,
  LAG-0930 and Eastline dispute are untouched.
- **Greg's live walkthrough (Oct 6):** booked LAG-1014-0 with Phantom, receipt recorded,
  approved; LAG-1014 then taken to arrived for his pickup (remaining staged shipments
  received/approved; one auto-approved, so the GitHub crank isn't running yet). New open
  container for judges: **LAG-1021** `G5F8Jpy2NrcgNZySHWiC2Wq92cMuEbW4iSGYQcUwsHnM`
  (45-day cut-off; phone cases approved, speakers received, fabric booked). LAG-1016
  (empty walkthrough container) cancelled. README, Arena draft and Blink link updated.
- **Recording prep (Oct 6):** demo-reset now also makes a fresh arrived container (Ada's
  pickup, resold ticket, open dispute) per take and tops up Eastline's guarantee first
  (each reset adds $14,300 of open goods; coverage 20%). Tested on devnet: LAG-1017 (open),
  LAG-2208, LAG-931 (arrived). DEMO_SCRIPT and rehearsal.spec use the printed pickup and
  dispute. Fixed: Cargo Tickets showed VOID on the public RPC (holder lookup). LAG-1015
  holds a partial staging from a failed run (left open).
- **Clean Containers page (Oct 7, Greg's request):** every open container cleared onchain:
  unpaid bookings rejected (refunded), empty containers cancelled (Harbour LAG-2207/2208/2209
  and a test "10" registered from the Ada key), Eastline LAG-1015/1017/1018/1021 sailed to
  arrived (their approved shipments stay as history). One fresh open container for the demo
  and judges: **LAG-1101** `BEb5XEiDaFVeFoxkiPvqZy9vTXqvzpoWA1raF8oyEMWX` (Eastline,
  CNCAN→NGAPP, 45-day cut-off, empty). Launch-post Blink points at it.
- **Crank secrets (Oct 6):** Greg added APP_URL and CRON_SECRET. The first run with them
  got Vercel's 308 "Redirecting..." (APP_URL with a trailing slash or http://), and curl
  doesn't treat a 3xx as a failure, so the run showed green without cranking. The workflow
  now strips a trailing slash and follows HTTPS redirects. After Greg fixed the secret, a
  manual run auto-approved 2 consignments (`{"due":2,"ran":2}`). GitHub runs the schedule
  only every 6–7 hours, so trigger it by hand before a demo.
- Next for Greg: live phone check (Phantom devnet sign-in, faucet, booking, WhatsApp
  preview, Blink on dial.to); optional Helius key for the server RPC.

## Next

2. ~~Devnet deploy~~ ✅ Oct 6.
3. **Vercel deploy** (`docs/DEPLOY.md` step 7), then `init-config --update` with the Vercel
   URL (ticket metadata), `seed-demo` against it, and the real-world checks: Blink on
   dial.to, WhatsApp preview, judge path on a real phone, README links and screenshots
   retaken on devnet.
4. **Phase 6:** demo-reset, rehearse the scripts, Greg records, Arena form, X post.

## Blockers

1. **Phantom Portal is not accepting new applications** (warning on
   docs.phantom.com/recipes/quickstarts/nextjs, checked Oct 4). Google/Apple embedded
   wallets require a Portal App ID; the injected (extension/app) provider does not. If Greg
   has no existing Portal app, we need a decision before Phase 3 (see summary).
2. ~~Devnet deploy~~ resolved Oct 6 (Greg's keys as environment secrets; deploy key left
   with ~5.8 SOL, gas tank 5 SOL).
3. ~~Pinata for deployed evidence~~ resolved Oct 6 (set in Vercel; evidence verified on IPFS).

## Decisions

- Rust LiteSVM tests in a separate `tests/` crate (not TS).
- web3.js v1 + `@anchor-lang/core` client stack; Kit migration via Codama after the hackathon.
- Copilot uses the v2 device sign-in; `COLOSSEUM_COPILOT_PAT` is a v1 leftover.
- Crank every 5 min via GitHub Actions (Vercel Hobby crons are daily only).
- Arbitration resolutions run from scripts (Squads proposals); `/admin` shows the queue
  and the exact commands rather than a one-wallet button.
- Faucet stays at 500 test dollars (spec 7.5); the landing card suggests a booking that
  fits ($300 of goods, 0.25 CBM).
- Market numbers: Afreximbank's African Trade Report 2025 (primary source, ~$100B a year)
  instead of the $80–120B range, which only secondary coverage of the 2026 report states.
- Full list: `docs/DECISIONS.md`.
