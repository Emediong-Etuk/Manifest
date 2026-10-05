# Architecture

The whole system first, then the program in detail.

## System

```mermaid
flowchart LR
    subgraph users["People"]
        Trader([Trader, phone])
        Fwd([Forwarder, warehouse])
        Arb([Arbitrators])
    end
    subgraph app["Next.js app (Vercel)"]
        UI[Pages + Phantom Connect]
        API[Route handlers]
    end
    subgraph chain["Solana"]
        Prog[[Manifest program]]
        Vaults[(Escrow + bond vaults)]
        Ticket[(Cargo Tickets, Token-2022)]
        Squads[[Squads v4 multisig]]
    end
    Store[(Evidence: IPFS via Pinata)]
    Blink([Blink clients])
    Cron([Crank: Vercel / GitHub cron])

    Trader --> UI
    Fwd --> UI
    UI -- signed transactions --> Prog
    UI -- signed evidence upload --> API
    API -- photos + manifest --> Store
    API -- reads for OG images, ticket metadata, faucet --> Prog
    Blink -- Actions GET/POST --> API
    Cron -- auto_approve, close_booking --> Prog
    Prog --> Vaults
    Prog --> Ticket
    Arb --> Squads
    Squads -- resolve_* via vault transaction --> Prog
```

| Off-chain piece               | What it does                                                                                                                  | Trust                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/evidence`          | Verifies the forwarder's signature, strips EXIF, stores photos + canonical manifest, returns its SHA-256 for `record_receipt` | The hash is onchain; the browser re-hashes the manifest and shows VERIFIED or not. |
| `/api/tickets/*`, `/api/og/*` | Cargo Ticket metadata + artwork and link previews, read live from the chain                                                   | Display only; never includes goods value.                                          |
| `/api/actions/book/*`         | Solana Action: builds an unsigned `book_consignment` for the requesting wallet                                                | The wallet shows and signs it; only the user's signature is required.              |
| `POST /api/faucet`            | Devnet gas tank: SOL for fees + test dollars                                                                                  | Devnet only; rate-limited.                                                         |
| `GET /api/cron/crank`         | Permissionless upkeep (`auto_approve`, `close_booking`)                                                                       | The program re-checks every condition.                                             |
| `scripts/`                    | Config, demo mint, Squads setup and dispute resolution, seed data                                                             | Operator tools; keys stay local.                                                   |

## Program at a glance

One Anchor 1.2 program, `manifest`, owns four account types and three kinds of token
accounts. Escrow and bonds sit in token accounts owned by program PDAs, so only the
program's own instructions can move them.

```mermaid
flowchart LR
    subgraph state["Program-owned state"]
        Config["Config<br/>['config']"]
        Forwarder["Forwarder<br/>['forwarder', wallet]"]
        Container["Container<br/>['container', forwarder, u32]"]
        Consignment["Consignment<br/>['consignment', container, u16]"]
    end
    subgraph tokens["Token accounts (owned by PDAs)"]
        BondVault["Bond vault<br/>['bond_vault', forwarder]"]
        Vault["Escrow vault<br/>['vault', consignment]"]
    end
    Ticket["Cargo Ticket mint (Token-2022)<br/>['cargo_ticket', consignment]<br/>MetadataPointer + TokenMetadata<br/>PermanentDelegate = ['ticket_authority']"]

    Forwarder --> BondVault
    Forwarder --> Container
    Container --> Consignment
    Consignment --> Vault
    Consignment --> Ticket
```

## Accounts

| Account          | Seeds                                      | Key fields                                                                                                                                                          |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config`         | `["config"]`                               | admin, arbitrator, treasury_owner, allowed payment/bond mints, fee/coverage/buffer bps, review/pickup/dispute/overdue/on-time windows, metadata base URI, paused    |
| `Forwarder`      | `["forwarder", authority]`                 | name, bond mint + vault, bond_balance, locked_coverage, container_count, track-record stats                                                                         |
| `Container`      | `["container", forwarder, index u32 LE]`   | code, UN/LOCODE route, mode, payment mint, capacity / booked / received milli-CBM, rate, cut-off, ETA, status, ISO 6346 number, B/L hash, counters                  |
| `Consignment`    | `["consignment", container, index u16 LE]` | trader, payee, goods / fee / freight amounts, est. and measured volume, evidence hash, coverage, status (+ previous), dispute reason, Cargo Ticket mint, timestamps |
| Escrow vault     | `["vault", consignment]`                   | token account (container mint), owner = consignment PDA                                                                                                             |
| Bond vault       | `["bond_vault", forwarder]`                | token account (bond mint), owner = forwarder PDA                                                                                                                    |
| Cargo Ticket     | `["cargo_ticket", consignment]`            | Token-2022 mint, 0 decimals, supply 1, metadata in-mint                                                                                                             |
| Ticket authority | `["ticket_authority"]`                     | no data; mint/metadata authority and permanent delegate of every ticket                                                                                             |

Exact field layouts: `programs/manifest/src/state/`.

## Instructions

| Who                    | Instructions                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin                  | `initialize_config` (upgrade authority only), `update_config`, `transfer_admin`                                                                                                                              |
| Forwarder              | `register_forwarder`, `deposit_bond`, `withdraw_bond`, `open_container`, `close_booking`, `cancel_container`, `reject_booking`, `record_receipt`, `mark_loaded`, `mark_arrived`, `claim_freight_after_grace` |
| Trader / ticket holder | `book_consignment`, `refund_after_cutoff`, `approve_goods`, `reject_goods`, `top_up_freight`, `confirm_pickup`, `open_dispute`                                                                               |
| Anyone (crank)         | `auto_approve`, `close_booking` after cut-off                                                                                                                                                                |
| Arbitrator             | `resolve_refund_escrow`, `resolve_force_approve`, `resolve_dismiss`, `resolve_slash_bond`                                                                                                                    |

## Consignment state machine

```mermaid
stateDiagram-v2
    [*] --> Booked: book_consignment
    Booked --> Received: record_receipt (forwarder)
    Booked --> Rejected: reject_booking (forwarder) / full refund
    Booked --> Refunded: refund_after_cutoff (trader, now > cutoff)
    Received --> Approved: approve_goods (trader) / auto_approve (anyone after review window)
    Received --> Disputed: reject_goods (trader, within review window)
    Approved --> Delivered: confirm_pickup (ticket holder, container Arrived)
    Approved --> Settled: claim_freight_after_grace (forwarder)
    Approved --> Disputed: open_dispute (holder: after arrival within window, or overdue past ETA)
    Disputed --> Refunded: resolve_refund_escrow (pre-approval only)
    Disputed --> Approved: resolve_force_approve (pre-approval) / resolve_dismiss (post-approval)
    Disputed --> Received: resolve_dismiss (pre-approval)
    Disputed --> Compensated: resolve_slash_bond (post-approval)
    Delivered --> [*]
    Settled --> [*]
    Refunded --> [*]
    Rejected --> [*]
    Compensated --> [*]
```

## Container state machine

```mermaid
stateDiagram-v2
    [*] --> Open: open_container
    Open --> Closed: close_booking (forwarder, or anyone after cut-off)
    Open --> Cancelled: cancel_container (no active bookings)
    Closed --> Cancelled: cancel_container (no active bookings)
    Closed --> Loaded: mark_loaded (all active consignments approved)
    Loaded --> Arrived: mark_arrived
    Arrived --> Completed: last active consignment settled
    Loaded --> Completed: mark_arrived when every consignment was already compensated
```

The app derives display stages ("Sailing", "Ready for pickup") from the container status
while a consignment is `Approved`; the program never iterates consignments. Container
counters (`active_count`, `approved_count`, `settled_count`) make that possible.

## Money flow

| Moment                         | From → To                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Booking                        | trader → vault: goods + fee (0.75%) + estimated freight × 1.10                                           |
| Approval                       | vault → payee: goods · vault → treasury: fee · vault → trader: freight escrow above the measured freight |
| Top-up                         | anyone → vault: up to the freight shortfall                                                              |
| Pickup / claim                 | vault → forwarder: freight due · vault → holder: any excess                                              |
| Refund / reject / RefundEscrow | vault → trader: everything held                                                                          |
| Slash                          | bond vault → holder: min(amount, goods, bond) · vault → holder: remaining freight                        |

## Compute units (LiteSVM)

| Instruction                      | CU               |
| -------------------------------- | ---------------- |
| `book_consignment`               | ~28,500          |
| `approve_goods` / `auto_approve` | ~130,000–140,000 |
| `confirm_pickup`                 | ~38,000          |
| `claim_freight_after_grace`      | ~53,000          |
| `resolve_slash_bond`             | ~43,500          |
