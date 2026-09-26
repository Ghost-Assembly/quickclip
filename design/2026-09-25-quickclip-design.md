# QuickClip — design

## Context

Ghost Assembly ships small, single-job GNOME Shell extensions (QuickRem, QuickTiler, QuickTS,
QuickMusic) that surface something the user already runs in Quick Settings, with no polling.
The user wants a clipboard manager to join them. The space is crowded (Clipboard Indicator,
~2.5M downloads, supports Shell 46–50; Gnome Clipboard History in maintenance; Pano; WinV), so
QuickClip is justified by a combination none of them lead with: **private by design** (memory
only, password-manager copies never recorded), **developer transforms**, and **suite fit**
(Quick Settings tile, no background work).

Verified on this machine (GNOME Shell 50.3): `St.Clipboard` exposes `get_mimetypes`,
`get_text`, `get_content`, `set_text`, `set_content`, so the sensitive-MIME check is feasible;
`<Super>v` is a GNOME default (`toggle-message-tray`) and `<Super><Shift>v` is unbound in GNOME
keybinding schemas, custom keybindings and installed extensions.

## Agreed requirements

- **Name / target:** QuickClip, `quickclip@napalm255.github.io`, GNOME Shell 50,
  `session-modes: ["user", "unlock-dialog"]` (needed for optional keep-across-lock; the
  metadata description must justify it for EGO review).
- **History:** last N items (default 20), **memory only**, text + `image/png` images. Images
  share a memory budget (default 32 MB); oldest images evicted first; an image bigger than the
  whole budget is skipped. Re-copying an existing item moves it to the top (text: exact match;
  image: SHA-256 via `GLib.compute_checksum_for_bytes`).
- **Pinned snippets:** text only, persisted in GSettings (`pinned` strv) — the only thing ever
  written to disk, and only by explicit user action. Images can't be pinned.
- **Privacy:**
    - Always skip copies whose MIME list includes `x-kde-passwordManagerHint` (KeePassXC etc.).
    - Pause toggle (tile click, optional pause shortcut — unbound by default).
    - Ignore apps: skip while a listed app's window is focused at copy time (approximate;
      Wayland exposes no copy owner). Documented as approximate.
    - Expire unpinned items after N minutes (default 30, 0 = off), via **one** GLib timeout for
      `model.nextExpiry()` — nothing scheduled while history is empty.
    - Screen lock: on lock, disconnect the clipboard listener and close any open UI; keybindings
      registered for `Shell.ActionMode.NORMAL` only. If `clear-on-lock` (default **true**) clear
      history; otherwise keep it in memory and resume on unlock. No encrypted-file persistence
      (considered and rejected: key would be as reachable as memory; moves data to disk).
    - Blocked copies show as a disabled row ("sensitive copy skipped" / "ignored app" / "image
      too large") so protection is visible.
- **Access:** Quick Settings tile + popup on a shortcut. **Never override a default shortcut**:
  default popup shortcut `<Super><Shift>v`; the prefs shortcut editor warns when a chosen
  accelerator is already bound elsewhere.
- **On select:** popup — copy then auto-paste (default on) through a Clutter virtual keyboard:
  Ctrl+V, or Ctrl+Shift+V when the focused app is in the terminal list. Tile menu — copy only.
- **Transforms** (result becomes the newest item; failure → Shell notification, clipboard
  untouched; only applicable ones shown, generators always shown): JSON pretty/minify; base64
  encode/decode (UTF-8 safe); URL encode/decode; trim; collapse whitespace; UPPER / lower /
  snake_case / kebab-case; epoch ⇄ ISO; new UUID; current ISO timestamp.

## Architecture (mirrors `quickmusic/`)

| Module                            | Job                                                                                                                     | Deps           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- |
| `modules/model.js`                | history: add/dedupe, count + image-budget caps, pin/unpin, `expire(now)`, `nextExpiry()`, clear, change callbacks       | none (pure)    |
| `modules/transforms.js`           | `{id, label, applies(text), run(text)}` list; uuid/clock injected                                                       | none (pure)    |
| `modules/privacy.js`              | `shouldRecord({mimetypes, appId, paused, ignored})` → `{record, reason}`                                                | none (pure)    |
| `modules/clipboard.js`            | `Meta.Selection` `owner-changed` (CLIPBOARD) → read via `St.Clipboard`; write text/image                                | Meta, St       |
| `modules/paste.js`                | virtual keyboard device; Ctrl+V / Ctrl+Shift+V by focused app id                                                        | Clutter, Shell |
| `modules/panel.js`                | `QuickMenuToggle`: subtitle Recording/Paused; menu Current (+transform row), Pinned, Recent, Clear history, Preferences | Shell UI       |
| `modules/popup.js`                | modal list: Pinned then Recent; type-to-filter text; ↑/↓, Enter = copy+paste, Tab = transform row, Esc                  | Shell UI       |
| `modules/settings.js`, `prefs.js` | GSettings wrapper; Adw prefs window                                                                                     | Gio, Adw       |

Data flow: `owner-changed` → `privacy.shouldRecord` → read content → `model.add` → tile and
popup re-render. `disable()` disconnects every signal, removes the timeout, destroys the virtual
device, empties history (pins stay in GSettings).

GSettings (`org.gnome.shell.extensions.quickclip`): `history-size` i 20 (5–100), `image-budget-mb`
i 32 (0–256, 0 = no images), `expire-minutes` i 30 (0–1440), `clear-on-lock` b true, `auto-paste` b true, `paused` b false,
`popup-shortcut` as `['<Super><Shift>v']`, `pause-shortcut` as `[]`, `ignored-apps` as `[]`,
`terminal-apps` as (Ptyxis, Console, GNOME Terminal, kitty, Alacritty, foot, WezTerm,
**Ghostty** `com.mitchellh.ghostty` — exact desktop ids verified during implementation),
`pinned` as `[]`.

Failure handling: unreadable/unsupported content → skip + debug log; oversize image → disabled
row; virtual device creation fails → copy-only + one notification.

## Deliverables

- New repo `/var/home/napalm/git/ghost-assembly/quickclip/`, scaffolded from `quickmusic/`
  conventions: `metadata.json`, `extension.js`, `prefs.js`, `modules/`, `schemas/`, `icons/`
  (`quickclip-symbolic.svg`), `stylesheet.css`, `justfile` (same recipe set: setup, fmt, lint,
  test, test-docs, coverage, test-live, security, build, run, install, enable, disable, prefs,
  logs, clean, ci), `mise.toml`, `package.json`, eslint/prettier/vitest/playwright configs,
  `.gitleaks.toml`, `sonar-project.properties`, `.github/` (dependabot + ci/release/security/sonar
  workflows, actions pinned by SHA as in quickmusic), `scripts/` (headless-check.sh,
  pack-check.sh, icon-check.js), `tests/` (+ `stubs/`, `support/`).
- **Full documentation**, like the others: README.md, SECURITY.md, LICENSE, and the docs site
  `docs/` (index.html, style.css, assets incl. fonts/emblem/favicon/og-image, `.nojekyll`) with
  sections Overview, Install, Privacy, Transforms, Preferences, Keyboard & mouse, Architecture,
  Development (incl. manual checklist), Releasing — served at
  `ghost-assembly.github.io/quickclip/`.
- Spec saved in the repo at `design/2026-09-25-quickclip-design.md` (not under `docs/`, which
  GitHub Pages publishes; `design/` matches the hub repo's convention).
- Org listings: QuickClip card + meta description in
  `ghost-assembly.github.io/docs/index.html`; a row in `.github/profile/README.md`.
  (QuickMusic's missing profile row is pre-existing — out of scope unless the user asks.)

## Build order

1. Scaffold repo from quickmusic; `git init` locally; write + commit the spec.
2. Pure modules with vitest tests (model, transforms, privacy, settings).
3. Adapters: clipboard.js, paste.js.
4. panel.js and popup.js (stub-rendered tests), extension.js wiring, lock handling.
5. prefs.js + schema, shortcut-conflict warning.
6. README, SECURITY.md, docs site + docs.spec.js.
7. Hub card + profile README row.
8. Ask before creating the GitHub repo, pushing, or releasing.

## Verification

- `just ci` green (lint, vitest, Playwright docs in Chromium + Firefox, security, build).
- `just test-live` (headless gnome-shell smoke test, pack-check, icon-check).
- Manual in `just run` / a real session: KeePassXC copy is skipped; auto-paste in Ptyxis,
  Ghostty and a GTK app; lock with clear-on-lock on (history empty) and off (history kept,
  nothing recorded while locked); expiry fires; pause blocks recording; ignored app blocked;
  large image rejected; Super+V still opens the message tray.
- Hub site: its own `just ci` passes with the new card.
