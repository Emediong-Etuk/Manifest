//! `ManifestError`: custom error codes with human-readable messages.
//! The SDK maps each code to a friendly UI string (packages/sdk/src/errors.ts).
//! Append new variants at the end: codes are positional (6000 + index).

use anchor_lang::prelude::*;

#[error_code]
pub enum ManifestError {
    #[msg("The protocol is paused: no new containers or bookings")]
    Paused,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Basis points must be at most 10,000")]
    InvalidBps,
    #[msg("Time windows must be greater than zero")]
    InvalidWindow,
    #[msg("Mint must have 6 decimals")]
    InvalidMintDecimals,
    #[msg("Mint account missing or not owned by a token program")]
    InvalidMintAccount,
    #[msg("At least one payment mint and one bond mint are required")]
    NoMintsConfigured,
    #[msg("Mint is not allowed by the protocol config")]
    MintNotAllowed,
    #[msg("Text field is empty, not UTF-8, or not zero-padded")]
    InvalidString,
    #[msg("Port code must be a 5-character UN/LOCODE")]
    InvalidLocode,
    #[msg("Origin and destination must differ")]
    SamePorts,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Withdrawal would leave the bond below locked coverage")]
    BondBelowCoverage,
    #[msg("Cut-off must be in the future and before the ETA")]
    InvalidSchedule,
    #[msg("Capacity must be greater than zero")]
    ZeroCapacity,
    #[msg("Freight rate must be greater than zero")]
    ZeroRate,
    #[msg("Container is not in the required status")]
    InvalidContainerStatus,
    #[msg("Consignment is not in the required status")]
    InvalidConsignmentStatus,
    #[msg("Only the forwarder can do this before the cut-off")]
    CutoffNotReached,
    #[msg("Bookings for this container have closed")]
    BookingClosed,
    #[msg("Container still has active consignments")]
    ContainerHasActiveConsignments,
    #[msg("Not enough space left in the container")]
    CapacityExceeded,
    #[msg("The forwarder's bond does not cover this booking")]
    CoverageExceeded,
    #[msg("Invalid supplier payout address")]
    InvalidPayee,
    #[msg("Signer is not the trader who booked this consignment")]
    NotTrader,
    #[msg("Signer is not the forwarder for this container")]
    NotForwarder,
    #[msg("The review window has ended")]
    ReviewWindowClosed,
    #[msg("The review window is still open")]
    ReviewWindowOpen,
    #[msg("Invalid dispute reason")]
    InvalidDisputeReason,
    #[msg("Account does not belong to this container or consignment")]
    AccountMismatch,
    #[msg("Measured volume and carton count must be greater than zero")]
    InvalidReceipt,
    #[msg("Counter overflow or underflow")]
    CounterOverflow,
}
