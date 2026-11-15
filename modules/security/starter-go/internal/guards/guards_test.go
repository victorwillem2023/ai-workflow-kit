// The input guards: what is refused, by name.
package guards

import "testing"

func TestThisComputerAndTheLocalNetworkArePrivate(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.20", "169.254.0.1", "100.64.0.1", "[::1]", "fe80::1", "fd00::1", "::ffff:10.0.0.1"} {
		if !IsPrivateAddress(ip) {
			t.Errorf("%s should be private", ip)
		}
	}
}

func TestAPublicAddressAndTextThatIsNoAddressAreNotPrivate(t *testing.T) {
	for _, ip := range []string{"8.8.8.8", "2606:4700:4700::1111", "example.com", ""} {
		if IsPrivateAddress(ip) {
			t.Errorf("%s should not be private", ip)
		}
	}
}

func TestAListFromOutsideIsCutToTheCap(t *testing.T) {
	if got := AtMost([]int{1, 2, 3, 4, 5}, 3); len(got) != 3 {
		t.Errorf("got %d items, want 3", len(got))
	}
}

func TestTextFromOutsideLosesItsControlCharactersAndIsCut(t *testing.T) {
	if got := CleanText("  a\x00b\ncdef  ", 5); got != "a b c" {
		t.Errorf("got %q", got)
	}
}
