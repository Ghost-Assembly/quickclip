# QuickClip

<!-- quick-template:badges:start -->

[![CI](https://github.com/Ghost-Assembly/quickclip/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quickclip/actions/workflows/ci.yml)
[![Security](https://github.com/Ghost-Assembly/quickclip/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quickclip/actions/workflows/security.yml)
[![Docs](https://img.shields.io/website?url=https%3A%2F%2Fghost-assembly.com%2Fquickclip%2F&label=docs)](https://ghost-assembly.com/quickclip/)
[![Release](https://img.shields.io/github/v/release/Ghost-Assembly/quickclip)](https://github.com/Ghost-Assembly/quickclip/releases/latest)
[![License](https://img.shields.io/github/license/Ghost-Assembly/quickclip)](https://github.com/Ghost-Assembly/quickclip/blob/main/LICENSE)
[![GNOME](https://img.shields.io/badge/GNOME-50-blue)](https://ghost-assembly.com/quickclip/#install)
[![Security issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickclip%26metricKeys%3Dsoftware_quality_security_issues&query=%24.component.measures%5B0%5D.value&label=Security+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
[![Reliability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickclip%26metricKeys%3Dsoftware_quality_reliability_issues&query=%24.component.measures%5B0%5D.value&label=Reliability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
[![Maintainability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickclip%26metricKeys%3Dsoftware_quality_maintainability_issues&query=%24.component.measures%5B0%5D.value&label=Maintainability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
[![Duplication](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickclip%26metricKeys%3Dduplicated_lines_density&query=%24.component.measures%5B0%5D.value&label=Duplication)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
[![Coverage](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickclip%26metricKeys%3Dcoverage&query=%24.component.measures%5B0%5D.value&label=Coverage)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
[![Sonar policy](https://github.com/Ghost-Assembly/quickclip/actions/workflows/sonar.yml/badge.svg?branch=main)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickclip)
<!-- quick-template:badges:end -->

A private clipboard history in Quick Settings, with developer transforms.

Keeps your last copies — text and images — in memory only, skips copies that
KeePassXC and other password managers mark as secret, and turns JSON, base64,
URLs and timestamps into what you need. Super+Shift+V opens it from the
keyboard.

**[Documentation →](https://ghost-assembly.com/quickclip/)** —
architecture, testing, packaging and releasing.

## What it does

- **Quick Settings tile.** Click to pause or resume recording; the subtitle
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

## Preferences

| Setting                | Default                                                                         | Note                                                               |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| History size           | 20                                                                              | 5–100; oldest copies are dropped first                             |
| Image memory (MB)      | 32                                                                              | 0–256; 0 keeps no images                                           |
| Expire after (minutes) | 30                                                                              | 0–1440; 0 keeps a copy until it is pushed out by History size      |
| Clear on lock          | on                                                                              | Empty the history when the screen locks                            |
| Paste on select        | on                                                                              | Paste the chosen item into the window that had focus               |
| Open the popup         | Super+Shift+V                                                                   | A conflicting shortcut is refused, never overwritten               |
| Pause or resume        | not set                                                                         | Same conflict check as the popup shortcut                          |
| Ignored apps           | none                                                                            | Copies made while one of these is focused are skipped              |
| Terminal apps          | Ptyxis, GNOME Console, GNOME Terminal, kitty, Alacritty, foot, WezTerm, Ghostty | Paste with Ctrl+Shift+V instead of Ctrl+V                          |
| Pinned snippets        | none                                                                            | The only clipboard content stored on disk; kept until you unpin it |

Recording is paused and resumed from the tile or the pause shortcut, not from
this window; the state is remembered between sessions.

## Install

<!-- quick-template:install:start -->

Requires GNOME Shell 50. For automatic sensitive-copy filtering, use a password manager that sets x-kde-passwordManagerHint. Configure ignored apps when that hint is unavailable.

### From a release

Download the latest release ZIP and install it for your user. xh is a download tool; you can also download the ZIP from GitHub in a browser. Installing compiles the settings schema.

```sh
xh --download GET https://github.com/Ghost-Assembly/quickclip/releases/latest/download/quickclip@napalm255.github.io.shell-extension.zip
gnome-extensions install --force quickclip@napalm255.github.io.shell-extension.zip
```

Log out and back in so GNOME discovers the extension, then enable it:

```sh
gnome-extensions enable quickclip@napalm255.github.io
```

### From a clone

Install mise and activate it in your shell. Clone the repository, install its pinned tools, and build and install the same ZIP used for releases:

```sh
git clone https://github.com/Ghost-Assembly/quickclip.git
cd quickclip
mise install
mise exec -- just setup
mise exec -- just install
```

Log out and back in, then run just enable. Run just prefs to open preferences. After updating a loaded extension, start a new session to load its new code; opening preferences does not reload GNOME Shell.
<!-- quick-template:install:end -->

## Uninstall

<!-- quick-template:uninstall:start -->

Disable and uninstall the extension for your user. These commands preserve saved settings and other user data.

```sh
gnome-extensions disable quickclip@napalm255.github.io
gnome-extensions uninstall quickclip@napalm255.github.io
```

From a clone, just uninstall performs the same steps. Disabling with just disable leaves the extension installed.
<!-- quick-template:uninstall:end -->

## Testing

<!-- quick-template:testing:start -->

just test runs the JavaScript suite with Vitest, the shared tooling tests, and any project-specific offline suites. just coverage reports the JavaScript coverage universe, including untested runtime files. Test stubs and generated reports are not runtime source.

just test-docs runs Playwright and axe in Chromium and Firefox: dark and light accessibility checks, keyboard navigation, mobile layout, reduced motion, links, metadata, local assets, and no page JavaScript. Automated accessibility checks still require human review of reading and focus order.

just test-live checks the package and runs isolated GNOME lifecycle checks. It is a separate local check, not proof of compatibility from a hosted runner. Verify each declared GNOME version and complete the project's manual checks before releasing.
<!-- quick-template:testing:end -->

### Project checks

The isolated Shell check verifies lifecycle and clipboard behavior when its virtual seat supports selection ownership. Validate password-manager filtering, real clipboard selection, paste targets, lock behavior, and keyboard shortcuts in a real desktop session.

## Packaging

<!-- quick-template:packaging:start -->

```sh
just build
just pack-check
```

The output is quickclip@napalm255.github.io.shell-extension.zip at the repository root, with metadata.json at the archive root. Python's standard library packages the explicit runtimeFiles allowlist in quick-project.json, using stable file order and timestamps.

just pack-check compares both filenames and file contents with GNOME's official packer and validates shipped icons. Docs, tests, dependencies, credentials, downloaded binaries, and development artifacts stay outside the ZIP. Update the runtime allowlist when adding a runtime file.
<!-- quick-template:packaging:end -->

## Releasing

<!-- quick-template:releasing:start -->

Run just ci, just test-live, and the project manual checklist. Set metadata.json version-name and package.json version to the same new version. The GNOME Extensions website assigns the numeric metadata.json version during submission. Update the npm lockfile, regenerate the docs, and commit the reviewed changes to main through a passing pull request.

Create and push a v-prefixed tag for that version. The release workflow verifies the version, main ancestry, and successful required checks for the tagged commit, then attaches its tested ZIP to a GitHub release. It does not upload to extensions.gnome.org; that submission and its review remain manual.
<!-- quick-template:releasing:end -->

## Development

<!-- quick-template:development:start -->

mise.toml pins runtime and CLI versions; justfile owns commands; npm owns development dependencies and the lockfile. GNOME libraries come from the host. On image-based Fedora, use the host's available tools or a toolbox/distrobox for missing system packages; do not layer packages onto the OS.

```sh
just setup        # install pinned tools, dependencies, and browsers
just fmt          # format source and configuration
just lint         # verify template, generated docs, source, and schemas
just test         # JavaScript, Python, and project offline tests
just coverage     # report JavaScript coverage without source exclusions
just test-docs    # Chromium and Firefox documentation checks
just security     # dependencies, secrets, and workflow checks
just build        # build the runtime-only extension ZIP
just pack-check   # compare files and contents with GNOME's packer
just ci           # complete local verification and packaging
just test-live    # isolated GNOME lifecycle and project integration checks
just docs         # serve the static site at localhost:8000
just template-check  # verify the pinned canonical template
just template-status # report a newer approved template revision
```

GitHub requires local verification, security analysis, and completed Sonar analysis. The shared Sonar policy requires zero security, reliability, and maintainability issues and zero duplicated lines. PR checks cover changed code; main checks cover the entire project. Missing configuration fails instead of silently skipping analysis. Pages publishes the tested docs only after the required checks pass on main.

Common tooling and these instructions are generated from a pinned canonical template. Change that source and synchronize its approved revision; do not edit generated sections or locally bless drift. Extension-specific behavior belongs in project configuration and project.just.
<!-- quick-template:development:end -->

## License

GPL-3.0-or-later.
