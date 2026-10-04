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
  It is not deployed yet, so it can still change. Before the Phase 2 deploy, the program and
  deploy keypairs must be stored durably (see `docs/SETUP_CHECKLIST.md`), and from then on the
  program ID is fixed.

## Pending decisions (later phases)

- Compute units of `approve_goods` / `book_consignment` (Phase 1), and whether Cargo Ticket
  minting splits into its own instruction.
- Phantom embedded-wallet capabilities: `signAllTransactions`, sign-only, daily limits (Phase 3).
- Reflect devnet availability (Phase 4 stretch).
