# Working on QuickClip

Guidance for anyone, human or agent, changing this repository: the rules that
keep the code the shape it is meant to be, each with the reason for it.
README.md says what QuickClip does and how to install it.

## What gets published

- Artifact: `quickclip@napalm255.github.io.shell-extension.zip`, built by
  `just build` and attached to a GitHub release by `release.yml` when a `v*`
  tag lands on `main`. The tag must agree with both `metadata.json`'s
  `version-name` and `package.json`'s `version`, or the workflow refuses it.
- Docs: `https://ghost-assembly.com/quickclip/`, published from this
  repository's own GitHub Pages (`main:/docs`).
- The uuid, `quickclip@napalm255.github.io`, is written down once in
  `metadata.json`; the justfile and `scripts/*.sh` all derive it from there.
  Never spell it out a second place.

## Commands

Tool versions live in `mise.toml`; commands live in the shared `justfile`
(see "Template files" below — this project has no `project.just`).

| Command                                                  | Does                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just setup`                                             | mise install, npm ci, Playwright's Chromium and Firefox; checks for gjs, glib-compile-schemas, gnome-shell, gnome-extensions, rsync, zip, unzip, jq |
| `just fmt`                                               | prettier --write, eslint --fix                                                                                                                      |
| `just lint`                                              | template-check, eslint, prettier --check, gschema strict dry-run, shellcheck                                                                        |
| `just template-check [--write]`                          | Checks the shared files against `template.sha256`; `--write` regenerates it                                                                         |
| `just test`                                              | Unit suite on plain Node (Vitest)                                                                                                                   |
| `just test-docs`                                         | The docs site in Chromium and Firefox: accessibility, layout, no JavaScript                                                                         |
| `just coverage`                                          | Unit suite with a coverage report                                                                                                                   |
| `just test-live`                                         | Needs a real Shell: `scripts/headless-check.sh`, then `scripts/pack-check.sh`                                                                       |
| `just pack-check`                                        | Diffs the built zip against `gnome-extensions pack`'s own listing                                                                                   |
| `just build`                                             | Produces the installable zip                                                                                                                        |
| `just run`                                               | A Shell in a window, via mutter-devkit                                                                                                              |
| `just install` / `enable` / `disable` / `prefs` / `logs` | The local dev loop against a real session                                                                                                           |
| `just security`                                          | osv-scanner, gitleaks, trivy, actionlint, zizmor                                                                                                    |
| `just ci`                                                | Everything CI runs: lint, test, test-docs, security, build                                                                                          |

Run `just ci` before claiming a change works. `just test-live` and the manual
checklist in the docs' Testing section need a real GNOME Shell and cannot run
in CI or from this agent's sandbox.

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
  assertions, then `scripts/pack-check.sh` diffs the built zip against
  `gnome-extensions pack`), `just test-docs` (Playwright + axe over
  `docs/index.html`).
- `just coverage` excludes `prefs.js` and `modules/clipboard.js` — both
  toolkit plumbing a unit test could only assert against a stub of the
  toolkit — kept identical to `sonar.coverage.exclusions` in
  `sonar-project.properties`.
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

- `template.list` names every shared path; `template.sha256` is its checksum
  manifest. `just template-check` (part of `just lint`) fails if a listed
  file has drifted; `just template-check --write` regenerates the manifest
  after a deliberate change.
- **A file in `template.list` must be changed in all five `quick*`
  repositories at once, then `just template-check --write` run in each.** Do
  not edit one in isolation.
- Project-specific styling goes in `docs/project.css` (loaded after the
  shared `docs/style.css`), never in `docs/style.css` itself.
  Project-specific `just` recipes would go in `project.just`
  (`import? 'project.just'` at the bottom of the shared `justfile`); this
  project does not currently need one.
- `scripts/headless-check.sh` is not in `template.list`. It is a recommended
  shared frame — the comment at its own top says so — that every extension
  is expected to keep in step by hand, with a marked per-repo block holding
  this project's own assertions (the wl-copy checks, the
  "no virtual keyboard" check).

## Settings keys

`modules/settings.js` is the single source of truth: `KEYS`,
`DEFAULT_TERMINALS` and the `SETTINGS` array (key, gschema type, prefs label
and detail). `schemas/org.gnome.shell.extensions.quickclip.gschema.xml` and
`prefs.js` both follow it — change a setting there first, then bring the
gschema's range/default and the prefs wording into line, and update the
Preferences tables in `README.md` and `docs/index.html` to match.
