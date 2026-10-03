# Working on QuickClip

Guidance for anyone, human or agent, changing this repository: the rules that
keep the code the shape it is meant to be, each with the reason for it.
README.md says what QuickClip does and how to install it.

## What gets published

- `just build` produces `quickclip@napalm255.github.io.shell-extension.zip`.
  A `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which verifies
  version agreement, main ancestry, and successful CI for the exact commit,
  then publishes that tested artifact without rebuilding it.
- Docs at https://ghost-assembly.com/quickclip/ are deployed by the Pages
  workflow from the tested `docs/` artifact after all required checks pass on main.
- GNOME Extension Store submission and review remain manual.
- The uuid, `quickclip@napalm255.github.io`, is written down once in
  `metadata.json`; the justfile and `scripts/*.sh` all derive it from there.
  Never spell it out a second place.

## Commands

Tool versions live in `mise.toml`; common commands live in the canonical
`justfile`; project-specific commands and hooks live in `project.just`.
Run `just ci` before claiming a change works.

| Command                                                                | Does                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `just setup`                                                           | Install pinned tools, npm development dependencies, and Chromium/Firefox; check host tools      |
| `just fmt`                                                             | Format JavaScript, Python, configuration, and generated documentation                           |
| `just lint`                                                            | Verify canonical files, generated docs, ESLint, Prettier, Ruff, schemas, and shell scripts      |
| `just template-check`                                                  | Compare managed files with the immutable GitHub revision in `quick-template.lock.json`          |
| `just template-sync SHA`                                               | Synchronize a reviewed canonical revision; then install dependencies and regenerate docs        |
| `just test`                                                            | Run Vitest, Python tooling tests, and project offline integration tests                         |
| `just coverage`                                                        | Measure all runtime JavaScript, including untested files                                        |
| `just test-docs`                                                       | Check docs in Chromium and Firefox, including axe accessibility audits                          |
| `just security`                                                        | Run OSV, source and history secret scans, Trivy, actionlint, and Zizmor                         |
| `just build`                                                           | Build a deterministic runtime-only ZIP with Python's standard library                           |
| `just pack-check`                                                      | Compare every ZIP filename and byte with GNOME's official packer; validate icons                |
| `just test-live`                                                       | Check packaging, then isolated GNOME lifecycle and project integration hooks                    |
| `just run`                                                             | Run GNOME Shell in a development window                                                         |
| `just install` / `enable` / `disable` / `uninstall` / `prefs` / `logs` | Work with the extension in your logged-in session                                               |
| `just docs`                                                            | Serve the static site at localhost:8000                                                         |
| `just ci`                                                              | Run lint, tests, coverage, docs, security, and packaging; GitHub also requires CodeQL and Sonar |
| `just clean`                                                           | Confirm before removing generated build and test output                                         |

Live checks require an installed GNOME Shell and run outside hosted CI.
Complete the manual checklist and test each declared GNOME version before releasing.

## Hard constraints

- **The uuid never changes.** `quickclip@napalm255.github.io` is the
  extension's identity to GNOME and to extensions.gnome.org; everything else
  is derived from `metadata.json`.
- **Keybinding names are prefixed.** The gschema keys are
  `quickclip-open-popup` and `quickclip-toggle-pause`, because Mutter keeps
  one table of keybinding names for the whole Shell and refuses a name
  already claimed by another extension. v0.1.0 is tagged, so renaming these
  keys now would need a settings migration, not a plain rename.
- **`addKeybinding`'s return is honored.** A binding is recorded only when
  Mutter did not answer `Meta.KeyBindingAction.NONE`; a refused binding warns
  once per enable (`console.warn('[quickclip] could not bind <key>')`)
  instead of pretending it took.
- **`Meta.KeyBindingFlags.IGNORE_AUTOREPEAT` on both shortcuts.** A held key
  must not repeat-fire an action.
- **While the screen is locked there is no tile, no popup, no keybinding and
  no clipboard listener.** `modules/controller.js` tears all four down on
  lock and rebuilds them on unlock; that is what makes declaring the
  `unlock-dialog` session mode safe — it exists only so the history can
  survive the lock in memory when _Clear on lock_ (on by default) is turned
  off, not so QuickClip can keep working while locked.
- **Decisions live in modules with no GNOME import.** `model.js`,
  `transforms.js`, `privacy.js`, `listing.js`, `accel.js` and `settings.js`
  import nothing from `gi://` or `resource:///org/gnome/shell/`, so Vitest
  exercises the real logic on plain Node; `recorder.js` imports only those.
  Only `clipboard.js`, `paste.js`, `controller.js`, `panel.js`, `popup.js` and
  `prefs.js` touch the Shell, GLib, Clutter or Adw, which is why
  `scripts/headless-check.sh` and the manual checklist exist.
- **Static gettext only.** `transforms.js` and the notification built in
  `controller.js` wrap every user-facing string in `N_(...)` (a local no-op —
  the file cannot import gettext and still load on plain Node) or `_(...)`,
  always with a single string literal, never a template or a variable: that
  is what `xgettext -kN_ -k_` can extract. `tests/controller.test.js`'s
  `extractableMsgids()` asserts every string a translator is shown is really
  one xgettext would find.
- **A notification never quotes the clipboard.** Transform failure messages
  come from `TransformError` and describe the shape of the failure, never
  the text that failed (see `SECURITY.md`).
- **No JavaScript on the docs page.** `just test-docs` fails on a script tag
  or a request to another origin, matching the shared `docs/style.css`.

## Tests

- Write the failing test first.
- Layers: `just test` (Vitest; GNOME replaced by the stubs in `tests/stubs/`
  and `tests/support/`), `just test-live` (`scripts/headless-check.sh` boots
  a real headless gnome-shell and checks enable/disable/enable with no
  leaked signal or timeout source, plus this project's own wl-copy
  assertions, then `scripts/build.py --check` diffs the built zip against
  `gnome-extensions pack`), `just test-docs` (Playwright + axe over
  `docs/index.html`).
- `just coverage` measures all runtime JavaScript, including untested files.
  Test stubs and generated reports are not runtime source.
- The docs' Testing section also has a manual checklist for what a headless
  Shell cannot exercise: a real password-manager copy, a real screen lock.

## Conventions

- Conventional Commits (feat/fix/docs/chore/test/refactor/perf), imperative
  subject, no trailing period.
- Squash-merge pull requests once the `ci` check is green.
- Third-party GitHub Actions pinned by commit SHA; container images by digest.
- American English spelling (color, behavior, license, organization,
  standardize, canceled). Keep third-party identifiers and quoted library
  messages as they are (Gio's `CANCELLED`).
- Nothing personal: no real hostnames, accounts or secrets in code, tests,
  fixtures or docs.
- Committed docs: `README.md`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`),
  `SECURITY.md`. `design/` holds this project's original design notes, kept
  as history — treat it as a record, not current documentation.

## Cross-repo duties

- This project's one-liner — "A private clipboard history in Quick Settings,
  with developer transforms." — must read identically in `README.md`'s
  summary line, `metadata.json`'s `description`, the hub's project card
  (`ghost-assembly.github.io`'s `docs/index.html`, checked by its
  `tests/site.spec.js`), the org profile
  (`Ghost-Assembly/.github`'s `profile/README.md`), and this repository's
  GitHub "About" description. Change one, change all five.
- Template sync: this repository shares about 25 files, byte for byte, with
  the other `quick*` extensions — see "Template files" below.

## Template files

`quick-template.lock.json` pins a full commit SHA from
`Ghost-Assembly/quick-template`. `just template-check` compares managed files
with that immutable GitHub archive; a local manifest cannot approve drift.
Change shared tooling in the canonical repository, then run
`just template-sync SHA`, `npm ci --ignore-scripts`, `just docs-generate`, and
`just ci` in this checkout. The weekly freshness check reports newer approved
releases without adopting them automatically.

Project hooks belong in `project.just`, runtime packaging inputs in
`quick-project.json`, documentation identity in `docs/project.json`, and local
styling in `docs/project.css`. Common README and site sections are generated;
keep extension-specific content outside their markers. Lifecycle test scripts
remain specific to the extension.

## Settings keys

`modules/settings.js` is the single source of truth: `KEYS`,
`DEFAULT_TERMINALS` and the `SETTINGS` array (key, gschema type, prefs label
and detail). `schemas/org.gnome.shell.extensions.quickclip.gschema.xml` and
`prefs.js` both follow it — change a setting there first, then bring the
gschema's range/default and the prefs wording into line, and update the
Preferences tables in `README.md` and `docs/index.html` to match.
