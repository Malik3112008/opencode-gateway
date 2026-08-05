#!/bin/bash
# Tor NEWNYM script - rotates the exit IP without restarting the Tor service.
# Uses Tor's ControlSocket (unix socket) + cookie authentication, which is how
# the system Tor (Fedora default torrc) exposes the control port.
# Requires: bash + the `socat` or `nc` utility and read access to the control
# socket + auth cookie. Run as the gateway user (root in the service) so the
# cookie is readable.

CONTROL_SOCKET="${TOR_CONTROL_SOCKET:-/run/tor/control}"
COOKIE_FILE="${TOR_CONTROL_COOKIE:-/run/tor/control.authcookie}"

# Cookie auth over the unix control socket.
# Tor's protocol: AUTHENTICATE <hex-encoded-cookie>\r\n then SIGNAL NEWNYM\r\n
if [ ! -S "$CONTROL_SOCKET" ]; then
    echo "Tor control socket not found: $CONTROL_SOCKET" >&2
    exit 1
fi

# Build the authenticate line from the cookie (hex of the raw cookie bytes).
AUTH_LINE=$(python3 - <<EOF
import binascii
try:
    cookie = open("$COOKIE_FILE","rb").read()
except OSError as e:
    print("cookie unreadable:", e, file=__import__("sys").stderr)
    raise SystemExit(1)
print("AUTHENTICATE " + binascii.hexlify(cookie).decode())
EOF
)
[ -z "$AUTH_LINE" ] && exit 1

# Send AUTHENTICATE + SIGNAL NEWNYM + QUIT to the control socket.
# socat handles unix sockets cleanly; fall back to nc -U.
if command -v socat >/dev/null 2>&1; then
    printf '%s\r\nSIGNAL NEWNYM\r\nQUIT\r\n' "$AUTH_LINE" | socat - "$CONTROL_SOCKET" >/dev/null 2>&1
    rc=$?
elif command -v nc >/dev/null 2>&1; then
    printf '%s\r\nSIGNAL NEWNYM\r\nQUIT\r\n' "$AUTH_LINE" | nc -U -w 10 "$CONTROL_SOCKET" >/dev/null 2>&1
    rc=$?
else
    echo "Neither socat nor nc is available" >&2
    exit 1
fi

# Give Tor a moment to build a fresh circuit.
sleep 5

if [ $rc -eq 0 ]; then
    echo "NEWNYM signal sent successfully"
    exit 0
else
    echo "NEWNYM signal failed" >&2
    exit 1
fi
