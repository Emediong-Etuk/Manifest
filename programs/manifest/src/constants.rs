//! PDA seeds and protocol-wide constants.
//!
//! A PDA (program derived address) is an address with no private key that only this
//! program can "sign" for, by re-deriving it from its seeds plus a bump byte. Every
//! seed here is documented in MANIFEST_BUILD_PROMPT.md section 5.2.

/// `["config"]`: the singleton protocol configuration.
pub const CONFIG_SEED: &[u8] = b"config";
/// `["forwarder", authority]`: one profile per forwarder wallet.
pub const FORWARDER_SEED: &[u8] = b"forwarder";
/// `["bond_vault", forwarder]`: token account holding the forwarder's bond.
pub const BOND_VAULT_SEED: &[u8] = b"bond_vault";
/// `["container", forwarder, index_le(u32)]`.
pub const CONTAINER_SEED: &[u8] = b"container";
/// `["consignment", container, index_le(u16)]`.
pub const CONSIGNMENT_SEED: &[u8] = b"consignment";
/// `["vault", consignment]`: escrow token account for one consignment.
pub const VAULT_SEED: &[u8] = b"vault";
/// `["cargo_ticket", consignment]`: the Token-2022 Cargo Ticket mint.
pub const CARGO_TICKET_SEED: &[u8] = b"cargo_ticket";
/// `["ticket_authority"]`: mint authority, metadata authority and permanent delegate
/// of every Cargo Ticket.
pub const TICKET_AUTHORITY_SEED: &[u8] = b"ticket_authority";

/// Current layout version written as the first field of every account.
pub const ACCOUNT_VERSION: u8 = 1;

/// All payment and bond mints must be USD stablecoins with 6 decimals.
pub const REQUIRED_MINT_DECIMALS: u8 = 6;
/// Number of mint slots in `Config::payment_mints` / `Config::bond_mints`.
pub const MAX_MINTS: usize = 4;

/// 100% in basis points.
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Volumes are stored in milli-CBM: 1 CBM = 1_000.
pub const MILLI_PER_UNIT: u64 = 1_000;

/// Fixed-size string fields (UTF-8, zero-padded).
pub const NAME_LEN: usize = 32;
pub const CODE_LEN: usize = 12;
pub const LOCODE_LEN: usize = 5;
pub const DESCRIPTION_LEN: usize = 64;
pub const CONTAINER_NUMBER_LEN: usize = 11;
pub const METADATA_BASE_URI_LEN: usize = 96;

/// Cargo Ticket metadata.
pub const CARGO_TICKET_SYMBOL: &str = "MCT";
pub const CARGO_TICKET_NAME_PREFIX: &str = "Manifest Cargo Ticket ";

/// Dispute reason codes stored in `Consignment::dispute_reason`.
pub const DISPUTE_REASON_NONE: u8 = 0;
pub const DISPUTE_REASON_MAX: u8 = 6;
