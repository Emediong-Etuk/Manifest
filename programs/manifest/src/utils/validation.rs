//! Input validation for fixed-size string fields and port codes.

use anchor_lang::prelude::*;

use crate::errors::ManifestError;

/// A fixed-size text field must be non-empty UTF-8 followed only by zero padding
/// (e.g. `b"LAG-1014\0\0\0\0"`), so every client decodes it the same way.
pub fn validate_padded_utf8(bytes: &[u8]) -> Result<()> {
    let len = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    require!(len > 0, ManifestError::InvalidString);
    require!(
        bytes[len..].iter().all(|b| *b == 0),
        ManifestError::InvalidString
    );
    require!(
        core::str::from_utf8(&bytes[..len]).is_ok(),
        ManifestError::InvalidString
    );
    Ok(())
}

/// The text part of a validated zero-padded field (empty if it is not valid UTF-8).
pub fn padded_str(bytes: &[u8]) -> &str {
    let len = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    core::str::from_utf8(&bytes[..len]).unwrap_or("")
}

/// UN/LOCODE: 2-letter ISO 3166 country code + 3 characters from A-Z and 2-9
/// (e.g. `CNCAN`, `NGAPP`).
pub fn validate_locode(code: &[u8; 5]) -> Result<()> {
    let country_ok = code[..2].iter().all(u8::is_ascii_uppercase);
    let location_ok = code[2..]
        .iter()
        .all(|c| c.is_ascii_uppercase() || (b'2'..=b'9').contains(c));
    require!(country_ok && location_ok, ManifestError::InvalidLocode);
    Ok(())
}

/// ISO 6346 letter values: A=10 upwards, skipping multiples of 11 (11, 22, 33).
fn iso6346_letter_value(c: u8) -> Option<u32> {
    if !c.is_ascii_uppercase() {
        return None;
    }
    let mut value = u32::from(c - b'A').saturating_add(10);
    // Each multiple of 11 at or below the running value pushes the letter up by one.
    for skipped in [11u32, 22, 33] {
        if value >= skipped {
            value = value.saturating_add(1);
        }
    }
    Some(value)
}

/// ISO 6346 container number: 3-letter owner code, category letter (U, J or Z),
/// 6-digit serial and a check digit, e.g. `CSQU3054383`.
pub fn validate_iso6346(number: &[u8; 11]) -> Result<()> {
    require!(
        matches!(number[3], b'U' | b'J' | b'Z'),
        ManifestError::InvalidContainerNumber
    );
    let mut sum: u32 = 0;
    for (i, c) in number[..10].iter().enumerate() {
        let value = if i < 4 {
            iso6346_letter_value(*c)
        } else if c.is_ascii_digit() {
            Some(u32::from(c - b'0'))
        } else {
            None
        }
        .ok_or_else(|| error!(ManifestError::InvalidContainerNumber))?;
        // Bounded: at most 38 << 9 per term, so a u32 never overflows; checked anyway.
        sum = sum
            .checked_add(value << i)
            .ok_or_else(|| error!(ManifestError::InvalidContainerNumber))?;
    }
    let check = number[10];
    require!(
        check.is_ascii_digit(),
        ManifestError::InvalidContainerNumber
    );
    require!(
        sum % 11 % 10 == u32::from(check - b'0'),
        ManifestError::InvalidContainerNumber
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn padded_utf8() {
        assert!(validate_padded_utf8(b"LAG-1014\0\0\0\0").is_ok());
        assert!(validate_padded_utf8(b"exactly-12ch").is_ok());
        assert!(validate_padded_utf8(b"\0\0\0\0").is_err());
        assert!(validate_padded_utf8(b"AB\0C").is_err());
        assert!(validate_padded_utf8(&[0xff, 0xfe, 0, 0]).is_err());
    }

    #[test]
    fn padded_str_trims_padding() {
        assert_eq!(padded_str(b"LAG-1014\0\0\0\0"), "LAG-1014");
        assert_eq!(padded_str(b"full"), "full");
    }

    #[test]
    fn iso6346_letter_values_skip_multiples_of_eleven() {
        assert_eq!(iso6346_letter_value(b'A'), Some(10));
        assert_eq!(iso6346_letter_value(b'B'), Some(12));
        assert_eq!(iso6346_letter_value(b'K'), Some(21));
        assert_eq!(iso6346_letter_value(b'L'), Some(23));
        assert_eq!(iso6346_letter_value(b'U'), Some(32));
        assert_eq!(iso6346_letter_value(b'V'), Some(34));
        assert_eq!(iso6346_letter_value(b'Z'), Some(38));
    }

    #[test]
    fn iso6346_numbers() {
        for ok in [b"CSQU3054383", b"MSCU1234566", b"MSKU9070323"] {
            assert!(validate_iso6346(ok).is_ok());
        }
        // Wrong check digit, bad category letter, letters in the serial, lowercase.
        for bad in [
            b"MSCU1234567",
            b"MSCX1234566",
            b"MSCU12A4566",
            b"mscu1234566",
        ] {
            assert!(validate_iso6346(bad).is_err());
        }
    }

    #[test]
    fn locodes() {
        assert!(validate_locode(b"CNCAN").is_ok());
        assert!(validate_locode(b"NGAPP").is_ok());
        assert!(validate_locode(b"US2NY").is_ok());
        assert!(validate_locode(b"cncan").is_err());
        assert!(validate_locode(b"CN1AN").is_err());
        assert!(validate_locode(b"1NCAN").is_err());
    }
}
