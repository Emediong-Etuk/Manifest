//! Checked arithmetic for fees, coverage and freight.
//!
//! Intermediate products are computed in `u128` so `u64 * u64` can't overflow, then
//! converted back with `u64::try_from`, never with an `as` cast that could truncate.

use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, MILLI_PER_UNIT};
use crate::errors::ManifestError;

fn to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| error!(ManifestError::MathOverflow))
}

fn div_ceil(numerator: u128, denominator: u128) -> Result<u128> {
    numerator
        .checked_add(denominator - 1)
        .map(|n| n / denominator)
        .ok_or_else(|| error!(ManifestError::MathOverflow))
}

/// `amount * bps / 10_000`, rounded down (used for the protocol fee, in the user's favor).
pub fn bps_floor(amount: u64, bps: u16) -> Result<u64> {
    to_u64(u128::from(amount) * u128::from(bps) / u128::from(BPS_DENOMINATOR))
}

/// `amount * bps / 10_000`, rounded up (used for bond coverage, in the trader's favor).
pub fn bps_ceil(amount: u64, bps: u16) -> Result<u64> {
    to_u64(div_ceil(
        u128::from(amount) * u128::from(bps),
        u128::from(BPS_DENOMINATOR),
    )?)
}

/// Freight for a volume: `ceil(cbm_milli * rate_per_cbm / 1_000)`.
pub fn freight_for(cbm_milli: u32, rate_per_cbm: u64) -> Result<u64> {
    to_u64(div_ceil(
        u128::from(cbm_milli) * u128::from(rate_per_cbm),
        u128::from(MILLI_PER_UNIT),
    )?)
}

/// Freight escrowed at booking: `ceil(freight * (10_000 + buffer_bps) / 10_000)`.
pub fn buffered_freight(freight: u64, buffer_bps: u16) -> Result<u64> {
    let factor = u128::from(BPS_DENOMINATOR) + u128::from(buffer_bps);
    to_u64(div_ceil(
        u128::from(freight) * factor,
        u128::from(BPS_DENOMINATOR),
    )?)
}

pub fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b)
        .ok_or_else(|| error!(ManifestError::MathOverflow))
}

pub fn sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b)
        .ok_or_else(|| error!(ManifestError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_rounds_down() {
        // 0.75% of $2,400.00 = $18.00 exactly; 0.75% of 133 base units = 0.9975 -> 0.
        assert_eq!(bps_floor(2_400_000_000, 75).unwrap(), 18_000_000);
        assert_eq!(bps_floor(133, 75).unwrap(), 0);
    }

    #[test]
    fn coverage_rounds_up() {
        assert_eq!(bps_ceil(1_000_000, 2_000).unwrap(), 200_000);
        assert_eq!(bps_ceil(1, 2_000).unwrap(), 1);
    }

    #[test]
    fn freight_rounds_up_per_milli_cbm() {
        // 1.250 CBM at $380.00 / CBM = $475.00.
        assert_eq!(freight_for(1_250, 380_000_000).unwrap(), 475_000_000);
        // 0.001 CBM at 1 base unit / CBM = 0.001 -> 1.
        assert_eq!(freight_for(1, 1).unwrap(), 1);
    }

    #[test]
    fn buffer_adds_ten_percent_rounded_up() {
        assert_eq!(buffered_freight(475_000_000, 1_000).unwrap(), 522_500_000);
        assert_eq!(buffered_freight(1, 1_000).unwrap(), 2);
        assert_eq!(buffered_freight(0, 1_000).unwrap(), 0);
    }

    #[test]
    fn boundaries_do_not_panic() {
        assert_eq!(bps_floor(u64::MAX, 10_000).unwrap(), u64::MAX);
        assert!(bps_ceil(u64::MAX, 10_000).is_ok());
        assert!(freight_for(u32::MAX, u64::MAX).is_err());
        assert!(buffered_freight(u64::MAX, 1).is_err());
        assert!(add(u64::MAX, 1).is_err());
        assert!(sub(0, 1).is_err());
    }
}
