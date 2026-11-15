"""Small input guards: the pattern for anything read from a request, an uploaded file or a third-party page.

Every one has a size or count cap, and every refusal has a test whose name says what is refused. Pure.
"""

import ipaddress
import itertools
from collections.abc import Iterable
from typing import TypeVar

T = TypeVar("T")


def is_private_address(text: str) -> bool:
    """Whether an address given as text is not on the public internet. Text that is not an address gives False."""
    try:
        ip = ipaddress.ip_address(text.strip().strip("[]"))
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    return not (mapped or ip).is_global


def at_most(items: Iterable[T], maximum: int) -> list[T]:
    """The first `maximum` items, without walking the rest: bound a loop whose length comes from outside."""
    return list(itertools.islice(items, maximum))


def clean_text(value: object, maximum: int = 200) -> str:
    """Text from outside, with the control characters taken out and cut to `maximum` characters."""
    if not isinstance(value, str):
        return ""
    cleaned = "".join(" " if ord(c) < 32 or ord(c) == 127 else c for c in value)
    return cleaned.strip()[:maximum]
