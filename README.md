# Manifest

**Pay-on-proof escrow for traders who ship in shared containers.**

> 🚧 Under active development for the Colosseum Crypto World's Fair Hackathon (Solana track).
> Devnet only. The full README (live demo, architecture, sponsor tech) lands in Phase 5.

Small importers in Lagos markets pay Chinese suppliers and agents upfront and blind, then
wait 45–60 days to find out whether the right goods arrived. Manifest is a programmable
letter of credit for them:

1. **Book space** in a bonded forwarder's shared container. Goods payment, fee and estimated
   freight are locked in an onchain escrow vault.
2. **Pay on proof.** The forwarder photographs and measures the goods at the China warehouse
   and writes the evidence hash onchain. The supplier is paid only when the trader approves.
3. **Cargo Ticket.** Approval mints a transferable Token-2022 ticket that carries pickup and
   dispute rights, so goods in transit can be sold onward.
4. **Collect in Lagos.** Freight releases to the forwarder at pickup. Disputes go to a Squads
   multisig that can slash the forwarder's bond.

## Repository

| Path                | What                                           |
| ------------------- | ---------------------------------------------- |
| `programs/manifest` | Anchor program (Rust)                          |
| `tests`             | LiteSVM program tests (Rust)                   |
| `packages/sdk`      | `@manifest/sdk` TypeScript client              |
| `app`               | Next.js web app                                |
| `scripts`           | Devnet operator scripts                        |
| `docs`              | Decisions, security, business plan, checklists |

## Run locally

Prerequisites (exact versions in [`docs/DECISIONS.md`](docs/DECISIONS.md)): Rust, Solana CLI
4.1.2, Anchor CLI 1.2.0, Node 22, pnpm 10.

```bash
pnpm install
anchor build && cargo test -p manifest-tests   # program + LiteSVM tests
pnpm -r build && pnpm -r test                   # SDK, scripts, app
pnpm --filter @manifest/app dev                 # http://localhost:3000
```

## License

[MIT](LICENSE) © 2026 Emediong Etuk Gregory
