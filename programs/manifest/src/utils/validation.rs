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
    fn locodes() {
        assert!(validate_locode(b"CNCAN").is_ok());
        assert!(validate_locode(b"NGAPP").is_ok());
        assert!(validate_locode(b"US2NY").is_ok());
        assert!(validate_locode(b"cncan").is_err());
        assert!(validate_locode(b"CN1AN").is_err());
        assert!(validate_locode(b"1NCAN").is_err());
    }
}
