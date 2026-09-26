#!/usr/bin/env bash
# Boot a throwaway headless gnome-shell with QuickClip installed and assert
# that it enables cleanly, starts listening, records a copy, skips a
# password-manager copy, disables cleanly, and can be enabled again without
# leaking.
#
# The extension logs "[quickclip] enabled (v...)" on enable and
# "[quickclip] listening" once Main.sessionMode reports the session is
# unlocked, which is how this script sees the controller reach a working
# state without a real user ever logging in. A copy made with wl-copy from
# outside the Shell should then show up as "[quickclip] recorded text" or, for
# a copy that carries a password-manager MIME hint, "[quickclip] skipped
# sensitive".
#
# This needs a real gnome-shell and so runs locally only; GitHub's runners have
# no GNOME 50.

set -euo pipefail

# The system's GLib tools, not whichever are first on PATH. A Homebrew GLib
# (pulled in as a dependency of something else) ships its own gsettings built
# without the dconf module: it silently falls back to a keyfile, the value
# reads back fine from gsettings itself, and the shell under test never sees
# it — so the extension is never enabled and the check times out with no
# error. Everything here must speak to the same GLib gnome-shell was built
# against.
export PATH="/usr/bin:$PATH"

UUID="quickclip@napalm255.github.io"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMEOUT="${TIMEOUT:-60}"

# The private XDG directories must be exported BEFORE dbus-run-session starts,
# not after. D-Bus activates dconf as a child of the bus, so a service started
# by a bus that inherited the real XDG_CONFIG_HOME will read and write the
# developer's own dconf database — `gsettings set` then silently affects the
# real session and the shell under test loads the real extension list.
if [[ -z "${QUICKCLIP_HEADLESS:-}" ]]; then
    QUICKCLIP_WORK="$(mktemp -d)"
    export QUICKCLIP_HEADLESS=1
    export QUICKCLIP_WORK
    export XDG_CONFIG_HOME="$QUICKCLIP_WORK/config"
    export XDG_DATA_HOME="$QUICKCLIP_WORK/data"
    export XDG_CACHE_HOME="$QUICKCLIP_WORK/cache"
    export XDG_RUNTIME_DIR="$QUICKCLIP_WORK/run"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
    chmod 700 "$XDG_RUNTIME_DIR"

    exec dbus-run-session -- "${BASH_SOURCE[0]}" "$@"
fi

WORK="$QUICKCLIP_WORK"
LOG="$WORK/shell.log"

EXT_DIR="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
mkdir -p "$EXT_DIR"
cp -r "$REPO_ROOT"/metadata.json "$REPO_ROOT"/extension.js "$REPO_ROOT"/prefs.js \
      "$REPO_ROOT"/stylesheet.css "$REPO_ROOT"/modules "$REPO_ROOT"/schemas \
      "$REPO_ROOT"/icons "$EXT_DIR/"
glib-compile-schemas "$EXT_DIR/schemas"

gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['$UUID']"

# Guard against the isolation failing: if dconf were leaking into the real
# session, this would come back holding the developer's extensions.
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != "['$UUID']" ]]; then
    echo "FAIL: dconf is not isolated; enabled-extensions = $enabled" >&2
    rm -rf "$WORK"
    exit 1
fi

# And read it back through dconf itself, not gsettings: a gsettings built
# without the dconf module writes to a keyfile, reads its own write back and
# passes the guard above, while the Shell reads dconf and sees nothing.
if [[ "$(dconf read /org/gnome/shell/enabled-extensions)" != "['$UUID']" ]]; then
    echo "FAIL: gsettings is not writing to dconf; check which gsettings is on PATH" >&2
    rm -rf "$WORK"
    exit 1
fi

# The enable marker is logged at debug level, which GLib drops unless asked
# for. Without this the shell starts perfectly and the check still fails.
export G_MESSAGES_DEBUG=all

gnome-shell --wayland --headless --virtual-monitor 3840x1600 >"$LOG" 2>&1 &
SHELL_PID=$!
# shellcheck disable=SC2317  # invoked via trap
cleanup() {
    # Captured first: this trap's own last command would otherwise become the
    # script's exit status, which is how a run that printed PASS still exited 1.
    local status=$?

    # || true: by the time cleanup runs, COPY_PID usually names a wl-copy that
    # already exited on its own (its own `timeout 5`, or a successful copy),
    # so `kill` on an already-reaped PID fails; under `set -e` that failure is
    # the last command in this `&&` list, which would abort the trap itself
    # and turn a run that printed PASS into a process that exits 1.
    [[ -n "${COPY_PID:-}" ]] && { kill "$COPY_PID" 2>/dev/null || true; }
    kill "$SHELL_PID" 2>/dev/null || true
    wait "$SHELL_PID" 2>/dev/null || true

    # D-Bus activates gvfs inside the throwaway XDG_RUNTIME_DIR, and its fuse
    # mount is not ours to unmount, so the directory may refuse to go. Leaving a
    # few files in /tmp must not turn a passing check into a failing one.
    rm -rf "$WORK" 2>/dev/null || true

    return "$status"
}
trap cleanup EXIT

fail() {
    echo "FAIL: $1" >&2
    echo "---- shell log (quickclip and errors only) ----" >&2
    grep -aiE 'quickclip|JS ERROR|Extension' "$LOG" >&2 || echo "(nothing matched)" >&2
    exit 1
}

# Counts occurrences rather than truncating between phases: gnome-shell keeps
# the log open, so truncating leaves its file offset intact and the next write
# pads the gap with NULs — grep then reports "binary file matches" and the
# failure diagnostics come out empty at exactly the wrong moment.
wait_for() {
    local pattern="$1" wanted="${2:-1}" waited=0
    while ((waited < TIMEOUT)); do
        (($(grep -ac "$pattern" "$LOG") >= wanted)) && return 0
        kill -0 "$SHELL_PID" 2>/dev/null || fail "gnome-shell exited early"
        sleep 1
        ((waited++))
    done
    return 1
}

wait_for '\[quickclip\] enabled' || fail "extension never reported enabled within ${TIMEOUT}s"
wait_for '\[quickclip\] listening' || fail "extension never started listening"
echo "ok: enabled and listening"

# Put something on the clipboard from outside the Shell. wl-copy must own the
# selection on the headless compositor, which needs keyboard focus it may not
# get without a real seat; if it cannot, this phase is left to the manual
# checklist in the docs rather than failing the whole check.
COPY_PID=""
copy() {
    local type="$1" text="$2"
    WAYLAND_DISPLAY=wayland-0 timeout 5 wl-copy --foreground --type "$type" "$text" \
        >>"$WORK/copy.log" 2>&1 &
    COPY_PID=$!
}

if command -v wl-copy >/dev/null; then
    copy text/plain "headless check"
    # A short wait: if wl-copy works at all it works within seconds.
    if TIMEOUT=10 wait_for '\[quickclip\] recorded text'; then
        echo "ok: recorded a copy"
        kill "$COPY_PID" 2>/dev/null || true
        copy x-kde-passwordManagerHint "secret"
        wait_for '\[quickclip\] skipped sensitive' \
            || fail "a password-manager copy was not skipped"
        echo "ok: skipped a sensitive copy"
        kill "$COPY_PID" 2>/dev/null || true
    else
        echo "skip: wl-copy could not own the selection in a headless shell (see copy.log)"
    fi
else
    echo "skip: wl-copy not installed"
fi

gnome-extensions disable "$UUID"
sleep 3
gnome-extensions enable "$UUID"
wait_for '\[quickclip\] enabled' 2 || fail "extension did not re-enable after disable"
wait_for '\[quickclip\] listening' 2 || fail "extension did not listen again after re-enable"
echo "ok: re-enabled after disable"

if grep -qaE 'JS ERROR|Extension .* had error' "$LOG"; then
    fail "javascript errors in the shell log"
fi

if grep -qaiE 'No signal handler|instance with invalid|Object .* has been already deallocated' "$LOG"; then
    fail "signal or object lifetime warnings after re-enable"
fi

if grep -qaiE 'Source ID .* was not found|GSource .* still active' "$LOG"; then
    fail "a GLib source outlived its disable"
fi

if grep -qaE '\[quickclip\] .*: ' "$LOG"; then
    fail "the extension logged a warning"
fi

echo "ok: no errors or lifetime warnings"
echo "PASS"
