# QuickClip

A private clipboard history in GNOME quick settings, with developer transforms.

Keeps your last copies — text and images — in memory only, skips what your
password manager copies, and turns JSON, base64, URLs and timestamps into what
you need. Super+Shift+V opens it from the keyboard.

**[Documentation →](https://ghost-assembly.github.io/quickclip/)** —
architecture, testing, packaging and releasing.

## What it does

- **Quick settings tile.** Click to pause or resume recording; the subtitle
  reads "Recording" or "Paused". Its menu holds Current (with a Transform
  submenu), Pinned, Recent, Clear history and Preferences.
- **Keyboard popup.** Super+Shift+V opens the same history under the
  keyboard. Type to filter, ↑/↓ to move, Enter to copy and paste, Tab for
  transforms, Esc to back out.
- **Privacy.** The history is kept in memory only. A copy carrying a password
  manager's `x-kde-passwordManagerHint` is never read; only text you
  explicitly pin is stored, in GSettings.
- **Transforms.** Pretty-print or minify JSON, encode or decode base64 or a
  URL, change case, convert between a Unix timestamp and an ISO date, and
  more — each offered only when it would apply.
- **Pinned snippets.** Pin a snippet from Recent to keep it past a restart;
  unpin from the menu or Preferences.

## Requires

- GNOME Shell 50
- A password manager that sets `x-kde-passwordManagerHint` on what it copies,
  for automatic skipping. KeePassXC and other apps that follow the KDE
  convention do; without one, use Ignored apps in Preferences instead.

## Install

```bash
curl -LO https://github.com/Ghost-Assembly/quickclip/releases/latest/download/quickclip@napalm255.github.io.shell-extension.zip
gnome-extensions install --force quickclip@napalm255.github.io.shell-extension.zip
gnome-extensions enable quickclip@napalm255.github.io
```

From a clone:

```bash
just setup
just install
just enable
```

A newly installed extension is picked up when the Shell next starts; on
Wayland, log out and back in.

## Preferences

| Setting                | Default                                                                         |                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| History size           | 20                                                                              | 5–100; oldest copies are dropped first                             |
| Image memory (MB)      | 32                                                                              | 0–256; 0 keeps no images                                           |
| Expire after (minutes) | 30                                                                              | 0–1440; 0 keeps a copy until it is pushed out by History size      |
| Clear on lock          | on                                                                              | Empty the history when the screen locks                            |
| Paste on select        | on                                                                              | Paste the chosen item into the window that had focus               |
| Recording paused       | off                                                                             | Toggled from the tile; not usually set here                        |
| Open the popup         | Super+Shift+V                                                                   | A conflicting shortcut is refused, never overwritten               |
| Pause or resume        | not set                                                                         | Same conflict check as the popup shortcut                          |
| Ignored apps           | none                                                                            | Copies made while one of these is focused are skipped              |
| Terminal apps          | Ptyxis, GNOME Console, GNOME Terminal, kitty, Alacritty, foot, WezTerm, Ghostty | Paste with Ctrl+Shift+V instead of Ctrl+V                          |
| Pinned snippets        | none                                                                            | The only clipboard content stored on disk; kept until you unpin it |

## Development

```bash
just              # list every recipe
just test         # unit suite
just test-docs    # the docs site in Chromium and Firefox
just ci           # what CI runs: lint, tests, test-docs, security, build
just test-live    # headless gnome-shell smoke test, then the packed zip
just docs         # serve the documentation site
```

Every decision lives in a module that imports nothing else in the project;
see the
[architecture notes](https://ghost-assembly.github.io/quickclip/#architecture).

## Releasing

Set the version in `metadata.json` (`version-name`) and `package.json`,
commit, then tag and push. The release workflow refuses a tag that disagrees
with either file.

## License

GPL-3.0-or-later.
