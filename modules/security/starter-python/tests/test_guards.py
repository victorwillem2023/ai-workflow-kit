"""The input guards: what is refused, by name."""

import itertools

from guards import at_most, clean_text, is_private_address


def test_this_computer_and_the_local_network_are_private() -> None:
    for ip in ["127.0.0.1", "10.1.2.3", "192.168.1.20", "169.254.0.1", "100.64.0.1", "[::1]", "fe80::1", "fd00::1", "::ffff:10.0.0.1"]:
        assert is_private_address(ip), ip


def test_a_public_address_and_text_that_is_no_address_are_not_private() -> None:
    for ip in ["8.8.8.8", "2606:4700:4700::1111", "example.com", ""]:
        assert not is_private_address(ip), ip


def test_a_list_from_outside_is_cut_to_the_cap_without_walking_the_rest() -> None:
    assert at_most(itertools.count(1), 3) == [1, 2, 3]


def test_text_from_outside_loses_its_control_characters_and_is_cut() -> None:
    assert clean_text("  a\x00b\ncdef  ", 5) == "a b c"
    assert clean_text(12) == ""
