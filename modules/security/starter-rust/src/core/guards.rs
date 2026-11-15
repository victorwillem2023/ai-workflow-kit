//! Small input guards: the pattern for anything read from a request, an uploaded file or a third-party page.
//! Every one has a size or count cap, and every refusal has a test whose name says what is refused. Pure.
//! To use it: add `pub mod guards;` to `src/core/mod.rs`.
#![allow(dead_code)]

use std::net::IpAddr;

/// Whether an address given as text (IPv4 or IPv6, brackets allowed) is not on the public internet: this computer, the
/// local network, link-local, shared address space, multicast. Text that is not an address gives false.
pub fn is_private_address(text: &str) -> bool {
    let trimmed = text.trim().trim_start_matches('[').trim_end_matches(']');
    match trimmed.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => private_v4(ip.octets()),
        Ok(IpAddr::V6(ip)) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return private_v4(v4.octets());
            }
            let first = ip.segments()[0];
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (first & 0xfe00) == 0xfc00 // unique local
                || (first & 0xffc0) == 0xfe80 // link-local
        }
        Err(_) => false,
    }
}

fn private_v4(o: [u8; 4]) -> bool {
    let [a, b, _, _] = o;
    a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
}

/// The first `max` items, without walking the rest: bound a loop whose length comes from outside.
pub fn at_most<T>(items: impl IntoIterator<Item = T>, max: usize) -> Vec<T> {
    items.into_iter().take(max).collect()
}

/// Text from outside, with the control characters taken out and cut to `max` characters (for names, titles, log lines).
pub fn clean_text(value: &str, max: usize) -> String {
    let cleaned: String = value.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    cleaned.trim().chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn this_computer_and_the_local_network_are_private() {
        for ip in ["127.0.0.1", "10.1.2.3", "192.168.1.20", "169.254.0.1", "100.64.0.1", "[::1]", "fe80::1", "fd00::1", "::ffff:10.0.0.1"] {
            assert!(is_private_address(ip), "{ip} should be private");
        }
    }

    #[test]
    fn a_public_address_and_text_that_is_no_address_are_not_private() {
        for ip in ["8.8.8.8", "2606:4700:4700::1111", "example.com", ""] {
            assert!(!is_private_address(ip), "{ip} should not be private");
        }
    }

    #[test]
    fn a_list_from_outside_is_cut_to_the_cap_without_walking_the_rest() {
        assert_eq!(at_most(1..1_000_000_000, 3), vec![1, 2, 3]);
    }

    #[test]
    fn text_from_outside_loses_its_control_characters_and_is_cut() {
        assert_eq!(clean_text("  a\u{0}b\ncdef  ", 5), "a b c");
    }
}
