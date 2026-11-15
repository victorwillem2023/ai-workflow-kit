// Small input guards: the pattern for anything read from a request, an uploaded file or a third-party page.
// Every one has a size or count cap, and every refusal has a test whose name says what is refused. Pure.
package guards

import (
	"net"
	"strings"
	"unicode"
)

// IsPrivateAddress says whether an address given as text is not on the public internet: this computer, the local
// network, link-local, shared address space, multicast. Text that is not an address gives false.
func IsPrivateAddress(text string) bool {
	ip := net.ParseIP(strings.Trim(strings.TrimSpace(text), "[]"))
	if ip == nil {
		return false
	}
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true // shared address space
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalUnicast()
}

// AtMost gives the first max items: bound a loop whose length comes from outside.
func AtMost[T any](items []T, max int) []T {
	if len(items) <= max {
		return items
	}
	return items[:max]
}

// CleanText gives text from outside with the control characters taken out, cut to max characters.
func CleanText(value string, max int) string {
	cleaned := strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value))
	runes := []rune(cleaned)
	if len(runes) > max {
		runes = runes[:max]
	}
	return string(runes)
}
