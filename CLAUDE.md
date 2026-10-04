# CLAUDE.md: Manifest project memory

Read this first in every session, then `PROGRESS.md` (live status) and, for the full
spec, `MANIFEST_BUILD_PROMPT.md` (the master build prompt; phase N scope is in its section 13).

## Product in one paragraph

Manifest is a programmable letter of credit for small Nigerian importers who ship from
China in shared containers. A trader books space with a bonded freight forwarder and
locks goods payment + protocol fee + estimated freight in a per-consignment onchain
escrow. The forwarder photographs and measures the goods at the China warehouse and
writes the evidence hash onchain; only when the trader approves (or the review window
lapses) is the supplier paid, and the trader receives a transferable Cargo Ticket
(Token-2022 NFT) carrying pickup and dispute rights. Freight releases to the forwarder at
pickup in Lagos. Disputes go to a Squads multisig arbitrator that can refund escrow or
slash the forwarder's bond. Hackathon: Colosseum Crypto World's Fair, Solana track.

## Deadline

- Submission closes **Mon Oct 12, 2026, 11:59 PM PT = Tue Oct 13, 7:59 AM WAT**.
- **Code freeze: Mon Oct 12, 6:00 PM WAT.**
- Owner: Greg (Emediong Etuk Gregory), solo founder in Nigeria. Strongest in TypeScript /
  Next.js and PHP / Laravel; illustrator and designer; newer to Rust.

## Non-negotiables

1. Real onchain logic, no fakes. Every state change the UI shows comes from the deployed
   program. Never mock transactions or onchain state in the UI.
2. Tests before progress. Never start a new phase with failing program tests.
3. Current docs over memory. Query the Solana MCP (`.mcp.json`) and the skills in
   `.claude/skills/` before writing Solana-specific code. Don't guess APIs.
4. No token launch: no governance token, memecoin or bonding curve.
5. Devnet only. Never print, log or commit private keys or secrets. Secrets live in
   `.env.local` (gitignored); `.env.example` documents every variable.
6. Never invent addresses. Program IDs, mints and multisigs come from config/env or a
   verified doc cited in a code comment.
7. Open source: MIT, public repo (github.com/Emediong-Etuk/Manifest), clear README.
8. The deadline is fixed.

## Toolchain (pinned; details and rationale in docs/DECISIONS.md)

Anchor CLI + `anchor-lang` 1.2.0 · Solana CLI (Agave) 4.1.2 · platform-tools v1.57,
sBPF v3 (Anchor 1.2 default) · host Rust 1.97.0 (`rust-toolchain.toml`) · LiteSVM 0.16.0 ·
Node 22 · pnpm 10.28 · TypeScript 5.9.3 · Next.js 16.3 · Tailwind 4.3.

Cloud sessions: `.claude/hooks/session-start.sh` installs the toolchain and restores
keypairs from the `MANIFEST_DEV_KEYPAIR` / `MANIFEST_PROGRAM_KEYPAIR` environment secrets.
PATH needs `~/.local/bin` (anchor) and `~/.local/share/solana/install/active_release/bin`.

## Commands

```bash
pnpm install                  # JS deps
anchor build                  # program -> target/deploy/manifest.so + target/idl + target/types
cargo test -p manifest        # program unit tests (math, validation)
cargo test -p manifest-tests  # LiteSVM program tests (needs anchor build first)
pnpm program:test             # all of the above
pnpm program:lint             # cargo fmt --check + clippy -D warnings
pnpm -r build                 # sdk, scripts (typecheck), app (next build)
pnpm -r lint && pnpm -r typecheck && pnpm -r test
pnpm format                   # prettier
pnpm check-env                # which .env.local vars are set (never prints values)
anchor deploy --provider.cluster devnet   # Phase 2+, uses ~/.config/solana/manifest-dev.json
```

Phase gate (every phase): tests green; `pnpm -r lint && pnpm -r typecheck && pnpm -r build`;
`pnpm program:lint`; commit + tag `phase-N`; PROGRESS.md updated; summary to Greg.

## Layout

- `programs/manifest/` Anchor program (state/, instructions/{admin,forwarder,trader,permissionless,arbitrator}/, utils/)
- `tests/` Rust LiteSVM integration tests (crate `manifest-tests`)
- `packages/sdk/` `@manifest/sdk`, the only place instructions are built in TS
- `app/` Next.js App Router frontend + route handlers (evidence, tickets, OG, Blinks, faucet, cron)
- `scripts/` devnet operator scripts (tsx), read `.env.local`
- `docs/` decisions, architecture, security, business, scripts, checklists

## House rules

1. **Plan before each phase.** Start each phase by writing a short plan into PROGRESS.md
   (tasks, order, risks), then execute.
2. **Docs first for Solana APIs.** Query Solana MCP and the installed skills before using any
   Solana, Anchor, Token-2022, Actions, Phantom or Squads API. Cite the doc URL in a code
   comment for anything non-obvious.
3. **Small verifiable steps.** Write the instruction, write its tests, run them, commit. Never
   write five instructions and then test.
4. **Never fake success.** If something is blocked (missing key, faucet limit, SDK limitation),
   stop that thread, record it under "Blockers" in PROGRESS.md, tell Greg exactly what you
   need, and continue with unblocked work.
5. **Ask Greg** for anything requiring his accounts, money, identity or judgment: Phantom
   Portal, Helius, Pinata, Vercel, GitHub, Colosseum Copilot sign-in, Dialect registration,
   devnet SOL top-ups, product decisions that change scope, and his social handles.
6. **Secrets.** Never echo secrets to the terminal, never commit them, and check
   `git diff --staged` for keys before every commit.
7. **Destructive actions.** Never run `rm -rf` outside build artifacts, force-push, or redeploy
   to a new program ID without asking.
8. **Explain Rust.** Add brief comments on PDAs, CPI signer seeds, account constraints and
   Token-2022 extension setup, and give a 5-line "what this does" summary at the top of each
   instruction file.
9. **Keep PROGRESS.md current** after every meaningful step: Done / In progress / Next /
   Blockers / Decisions.
10. **Prefer boring and correct** over clever. A finished, tested, deployed MVP beats an
    ambitious broken one. The judges score functionality first.

Also: run the Solana MCP `program_autofixer` on program Rust you write or change; use
conventional commits (`feat(program): ...`); no `unwrap()`/`expect()` in program code.

## Glossary

- **CBM:** cubic metre; the shared-container billing unit (L × W × H in metres × cartons).
  Stored onchain as milli-CBM (`u32`, 1.250 CBM = 1250).
- **Consolidator / freight forwarder:** a company that collects many traders' goods into one container.
- **Shared container / groupage / LCL:** a "less than container load" shipment with many owners.
- **B/L (bill of lading):** the carrier's document of title for shipped cargo.
- **ISO 6346:** the container number format (4 letters incl. category identifier + 6 digits +
  check digit), e.g. `MSCU1234566`.
- **UN/LOCODE:** a 5-character port code (`CNCAN` Guangzhou, `CNYIW` Yiwu, `NGAPP` Apapa, `NGTIN` Tin Can).
- **Letter of credit (LC):** a bank guarantee that pays the seller when the agreed documents
  are presented. Manifest is a programmable LC for micro-importers.
- **Payment agent:** an informal intermediary who converts naira/USDT into RMB to pay Chinese suppliers.
- **Cargo Ticket:** Manifest's Token-2022 NFT representing the right to collect one consignment.
- **Bond / coverage:** the forwarder's slashable deposit; coverage = the share of open goods
  value the bond must back.
