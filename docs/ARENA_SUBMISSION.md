# Arena submission draft

Copy-paste drafts for the Colosseum Arena project form. Field names follow the Arena
submission fields as exposed by the Colosseum Copilot API
(`.claude/skills/colosseum-copilot/references/api-reference.md`); the live form may label
or order them differently, so check each one in the form. **Greg submits as team leader.**

Everything in `[brackets]` is Greg's to fill. Don't estimate validation or traction:
leave a field short rather than inflate it.

## Basics

| Field                             | Draft                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Project name                      | Manifest                                                                        |
| One-liner / description           | Pay-on-proof escrow for traders who ship in shared containers.                  |
| Tracks                            | Solana                                                                          |
| Chains                            | Solana                                                                          |
| Category                          | [pick the closest: Payments / DeFi / Infrastructure / RWA]                      |
| Country                           | Nigeria                                                                         |
| Website / live product link       | [Vercel production URL]                                                         |
| Repo link                         | https://github.com/Emediong-Etuk/Manifest                                       |
| Pitch video link                  | [unlisted YouTube / Loom, ≤ 3 min]                                              |
| Technical demo / demo video link  | [unlisted YouTube / Loom, 2–3 min]                                              |
| Presentation link                 | [optional: slides, if any]                                                      |
| X / Telegram handles              | [Greg's handles]                                                                |
| Live token                        | No. Manifest has no token.                                                      |
| Solana Mobile                     | No                                                                              |
| University project                | No                                                                              |
| Legal entity                      | [No / yes + details]. Planned: incorporation via the Stablecorp Colosseum perk. |
| Investment received / fundraising | [Greg's facts]                                                                  |
| Accelerator opt-in                | [Greg's choice]                                                                 |

## Live product access instructions

> Open [URL] on your phone. It runs on Solana devnet with free test money.
>
> 1. Tap **Sign in** (Phantom: Google/Apple or the Phantom app) in the "Try it in 2
>    minutes" card.
> 2. Tap **Get 500 test dollars** (also sends a little devnet SOL for fees).
> 3. Tap **Book on LAG-…**, enter $300 of goods and 0.25 CBM, tap **Use a test supplier
>    address**, then **Lock … and book**.
> 4. Your shipment page shows the timeline. To see the rest of the lifecycle, open
>    container LAG-1014 (a shipment waiting for photo review) and LAG-0930 (arrived, with a
>    resold Cargo Ticket and a dispute resolved by the Squads multisig).
>    Every status is read from the Solana program; every button sends a real devnet transaction.

## What are you building?

Manifest is a programmable letter of credit for small importers who ship from China in
shared containers. A trader books space in a forwarder's container and locks the goods
payment, a 0.75% fee and the estimated freight in a Solana escrow owned by the program.
The forwarder photographs and measures the cartons at the China warehouse; the evidence is
hashed onchain. The supplier is paid only when the trader approves (or after a review
window), and the trader receives a Cargo Ticket, a transferable Token-2022 NFT that
carries the right to collect the goods and to open disputes, so goods in transit can be
sold. Freight is released to the forwarder at pickup in Lagos. Every forwarder posts a
slashable guarantee and builds a public track record; disputes are decided by a 2-of-3
Squads multisig that can refund the trader or pay the ticket holder from the guarantee.

## Why now?

China's exports to Nigeria hit a record $24.9B in 2025 (China NBS via BusinessDay) and
China's exports to Africa $225B (Chinese customs). Africa's trade finance gap is about
$100B a year (Afreximbank, African Trade Report 2025), and the traders who ship a few
cubic metres at a time get no letter of credit at all. Meanwhile they already use
stablecoins (USDT) to pay suppliers through agents, and Solana makes holding money in
escrow for 60 days cost cents. Embedded wallets (Phantom sign-in with Google) remove the
last onboarding barrier.

## Technologies

Anchor 1.2 (Rust, sBPF v3) · Token-2022 (MetadataPointer, TokenMetadata, PermanentDelegate)
· Squads v4 (`@sqds/multisig`) · Solana Actions / Blinks (`@solana/actions`) · Phantom
Connect (`@phantom/react-sdk`) · LiteSVM · Next.js 16 / React 19 / Tailwind 4 · TypeScript
SDK (`@anchor-lang/core`, `@solana/web3.js`) · Pinata (IPFS) · Vercel (+ cron) ·
Playwright + axe.

## How does it use Solana? (chain usage)

All money and state live in one Anchor program: escrow vaults and forwarder guarantees are
token accounts owned by program PDAs, so only the program's instructions can move them
(26 instructions, 95 LiteSVM integration tests). The warehouse evidence is a SHA-256 hash
written onchain at receipt, and the browser re-verifies it. Approval mints a Token-2022
Cargo Ticket whose permanent delegate is a program PDA (used only to burn it at
settlement). Arbitration is a Squads vault that is the program's arbitrator and fee
treasury. Booking is also a Solana Action, so any container link is a Blink.

## Repo context

Monorepo: `programs/manifest` (Anchor program), `tests` (LiteSVM), `packages/sdk`
(TypeScript SDK; the only place instructions are built), `app` (Next.js app and route
handlers: evidence, faucet, Blinks, OG images, ticket metadata, crank), `scripts` (config,
Squads, seed, crank). Start with the README, then `docs/ARCHITECTURE.md` and
`docs/SECURITY.md`. 143 tests (95 + 12 Rust, 32 SDK, 4 browser), CI on GitHub Actions.

## Market validation

[Only real items: number of traders and forwarders interviewed (docs/INTERVIEW_QUESTIONS.md),
what they said in their words, LOIs signed (docs/LOI_TEMPLATE.md). Leave empty if none.]

## Traction

Live on Solana devnet [date]. [Any real usage: test bookings by people other than Greg,
forwarders who tried the console. Otherwise: "Pre-launch; pilot forwarders being
approached."]

## Competition

Informal payment agents (money moves upfront and blind), bank letters of credit (built for
full-container importers: minimums, collateral, weeks), Alibaba.com Trade Assurance (only
orders placed through Alibaba.com, not the shared-container leg), FX fintechs (move money,
don't verify goods), forwarders' informal promises (unenforceable). Manifest combines pay
on proof, a slashable forwarder guarantee and transferable Cargo Tickets for the
shared-container leg. More: `docs/COMPETITIVE_LANDSCAPE.md`.

## Monetization

0.75% protocol fee on escrowed goods value, already in the program (about $750 for a
container of 25 shipments averaging $4,000, an illustration). Then a verified-forwarder
subscription, and in-transit inventory financing against Cargo Tickets, underwritten by
forwarders' onchain records. More: `docs/BUSINESS.md`.

## Team commitment and location

[Greg: full-time or part-time, plans after the hackathon.] Based in Nigeria, in the Lagos
import corridor this product serves.

## External contributors

[Greg's disclosure: e.g. "Solo founder. Built with AI coding assistance (Claude Code);
design and product by Greg." Check the hackathon rules on disclosure.]

## Additional info

Devnet only, not audited (self-review and threat model in `docs/SECURITY.md`). Roadmap:
Kora gasless fees, Reflect yield on guarantees, Squads Altitude treasury, timelocked
arbitration (`docs/ROADMAP.md`).
