# Business plan

Manifest is a programmable letter of credit for importers too small for a bank LC. It
starts with China → Lagos shared containers, where the money moves first and the goods are
checked last.

## Customers

| Who                     | Pain today                                                                                     | What Manifest gives them                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Traders** (importers) | Pay suppliers and agents upfront and blind; no recourse when goods are wrong, short or missing | Supplier paid only after warehouse photos and their approval; a guarantee behind the forwarder; a sellable Cargo Ticket |
| **Forwarders**          | Traders can't tell good forwarders from bad ones; slow, informal payment for freight           | A public track record and a visible guarantee that win bookings; freight held in escrow and paid at pickup              |
| **Suppliers**           | Buyers hesitate to pay upfront to new suppliers                                                | Proof that the buyer's money is locked before goods ship                                                                |

## Revenue

1. **Protocol fee: 0.75% of escrowed goods value**, charged at booking, paid into the
   treasury at approval (already in the program: `config.fee_bps = 75`).
   _Illustration (assumption, not data):_ a container with 25 shipments averaging $4,000 =
   $100,000 of goods = **$750 per container**. A forwarder that fills two containers a
   month brings about $18,000 a year in fees.
2. **Verified-forwarder subscription:** KYB, a verified badge and priority placement in
   container search.
3. **In-transit inventory financing (the large business).** Liquidity providers fund the
   supplier payment against the Cargo Ticket, and the trader repays on arrival. The ticket
   is the collateral (transferable, with onchain status), and underwriting uses the
   forwarder's onchain track record and guarantee. This turns 45–60 days of locked working
   capital into credit for traders who have never had access to it.

## Go-to-market

- **Forwarders first.** One forwarder brings 20–40 traders per container. Signing a
  forwarder fills the platform, and their traders onboard through a shared link or Blink.
  Pitch: `docs/FORWARDER_ONEPAGER.md`. Pilot letter: `docs/LOI_TEMPLATE.md`.
- **Distribution:** Greg's West African crypto community and content reach.
- **Trust anchors:** market associations (Computer Village, Alaba International Market) as
  early partners and, later, members of the arbitration multisig.
- **WhatsApp-native sharing:** container links render a preview card (route, space left,
  rate, guarantee) where traders already talk.

## Expansion corridors

China → Accra (Tema), China → Nairobi (Mombasa), Dubai (Jebel Ali) → Lagos, Istanbul →
Lagos. The program is corridor-agnostic: ports are UN/LOCODEs and mints are configurable.

## Mainnet plan

- **Money:** USDC and USDT (traders already hold USDT); 6-decimal stablecoins only.
- **Gasless:** Kora fee payer, so traders never need SOL.
- **Treasury and payouts:** Squads **Altitude** (stablecoin operating account).
- **Forwarders:** KYB before listing; guarantee minimums per corridor.
- **Arbitration:** Squads multisig with a timelock, adding market-association members.
- **Privacy:** confidential order values (Token-2022 confidential transfers or Arcium).
- **Program:** audit, upgrade authority to a multisig (or immutable), verifiable build.

## Company

Incorporation through the **Stablecorp** Colosseum perk (Delaware C-Corp or Wyoming LLC
with USDC banking), keeping a Nigerian operating entity for local partnerships.

## Risks and mitigations

| Risk                               | Mitigation                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Regulation**                     | Manifest escrows stablecoins and never deals in naira FX; on/off-ramps stay with licensed partners. Legal review of escrow and stablecoin rules before mainnet. |
| **Adoption**                       | Start where the pain is sharpest (first-time and mid-size traders), sell through forwarders, keep the trader flow to a few taps on a phone.                     |
| **Physical-world verification**    | Photos and measurements are hashed onchain, the trader reviews before payment, the forwarder's guarantee is slashable, and arbitrators decide disputes.         |
| **Stablecoin access**              | Traders already use USDT through P2P and agents; Manifest accepts what they hold.                                                                               |
| **Stablecoin issuer freeze/depeg** | Out of our control; documented in `docs/SECURITY.md`. Multiple allowed mints reduce single-issuer exposure.                                                     |

## Market context

China's exports to Nigeria were a record $24.9B in 2025 and China's exports to Africa
$225B; Africa's trade finance gap is about $100B a year. Sources in the
[README](../README.md#the-problem).
