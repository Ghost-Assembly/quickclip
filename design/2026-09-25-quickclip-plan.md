# QuickClip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build QuickClip, a GNOME Shell 50 extension that keeps a short, memory-only clipboard history (text and images) in a Quick Settings tile and a keyboard popup, with privacy guards, pinned snippets, developer transforms and auto-paste — plus its full docs site and org listings.

**Architecture:** A copy of QuickMusic's shape. Pure modules (`model`, `transforms`, `privacy`, `listing`, `accel`, `settings`) hold every decision and are tested on Node with Vitest. Thin Shell adapters (`clipboard`, `paste`) touch GNOME APIs. UI modules (`panel`, `popup`) are dumb views fed by a `controller` that owns lifecycle, lock handling and keybindings. `extension.js` only wires dependencies.

**Tech Stack:** GJS ES modules on GNOME Shell 50 (St 18, Clutter 18, Meta 18), GSettings, libadwaita prefs; Vitest 5 with in-repo stubs; ESLint 10 + eslint-plugin-security; Prettier; Playwright + axe for the docs site; `just` + `mise`.

**Spec:** `design/2026-09-25-quickclip-design.md` (same repo). Read it before starting.

## Global Constraints

- Repo root: `/var/home/napalm/git/ghost-assembly/quickclip` (git already initialized, identity `napalm255 <napalm255@gmail.com>` set locally, one commit holding the spec).
- Reference project: `/var/home/napalm/git/ghost-assembly/quickmusic` — copy its tooling and conventions; never edit it.
- UUID `quickclip@napalm255.github.io`; schema id `org.gnome.shell.extensions.quickclip`; gettext domain `quickclip`; version `0.1.0`; `shell-version` `["50"]`; `session-modes` `["user", "unlock-dialog"]`; license GPL-3.0-or-later.
- **Never override a default shortcut.** Popup default `<Super><Shift>v`; pause default unbound (`[]`). `<Super>v` is GNOME's `toggle-message-tray` and must stay untouched.
- **Nothing from the clipboard is ever written to disk, logged, or put in a notification.** Only pinned snippets (explicit user action) persist, in GSettings. Log lines use the prefix `[quickclip]` and carry only kinds and reasons. A log line containing `: ` counts as a warning (the headless check fails on it).
- While the screen is locked QuickClip shows no UI, records nothing and has no keybindings.
- Password-manager copies (`x-kde-passwordManagerHint` in the MIME list, compared case-insensitively) are never read, never stored.
- Integer settings use GSettings type `i` with a `<range>` (as QuickMusic's `panel-max-chars` does). This refines the spec's "u"; Task 1 updates the spec line.
- No `rpm-ostree install`; `mutter-devkit` is not installed on this machine, so `just run` will not work — manual checks happen in the real session (install, log out, log in).
- Code style: match QuickMusic — 4-space indent, single quotes, header comment on every file saying what it is and what it must not do, JSDoc on exports, no class fields in GObject subclasses (use `_init`), `connectObject`/`disconnectObject` for Shell signals, American English everywhere.
- Commits: Conventional Commits, imperative subject, no AI attribution, commit after each task's tests pass. Never push; never create the GitHub repo (the user is asked first, at the end).
- Dependencies: only the devDependencies QuickMusic already has, at the same versions. No new packages.

## Review Focus

1. **The lock screen.** With `unlock-dialog` the extension stays alive while locked; the Quick Settings menu exists on the lock screen too. Expected: on lock the tile is destroyed, keybindings removed, the listener stopped, the popup closed, and copies made during the lock are not recorded. Pinned by controller tests "hides everything while locked" and "records nothing while locked" (Task 9).
2. **A huge copy** (a multi-megabyte log or file). Expected: the Shell does not stall — previews only scan the head of the text, transforms refuse text over 100 000 characters, and text over 1 000 000 characters is not stored (a "Too large to keep" row appears). Pinned by listing test "previews a 2 MB copy from its head only" (Task 4), transforms test "refuses oversized input" (Task 2), recorder test "refuses text over the limit" (Task 5).
3. **Two copies in quick succession** (the second arrives before the first async read finishes), and disable during a pending read. Expected: only the latest copy is recorded; nothing is recorded after `deafen()`/`destroy()`. Pinned by recorder tests "drops a read that a newer copy superseded" and "records nothing after deafen" (Task 5).
4. **QuickClip's own writes.** Choosing a history item or running a transform writes the clipboard, which fires `owner-changed` again. Expected: re-copying an existing item moves it to the top without a duplicate; a transform result appears exactly once. Pinned by recorder test "moves a re-copied item to the top" (Task 5).
5. **Hostile or odd text** — markup like `<b>`, embedded newlines, RTL, emoji, and JSON-parse errors that quote their input. Expected: shown literally on one line, never parsed as markup; error notifications never contain clipboard text. Pinned by panel test "shows markup literally on one line" (Task 7) and controller test "reports a failed transform without its input" (Task 9).

---

## File map

| Path                                                                          | Responsibility                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `metadata.json`                                                               | Extension manifest                                             |
| `schemas/org.gnome.shell.extensions.quickclip.gschema.xml`                    | Settings schema                                                |
| `extension.js`                                                                | Wires ClipboardSource, Paster and QuickClip; nothing else      |
| `prefs.js`                                                                    | Adw preferences window (excluded from coverage)                |
| `modules/settings.js`                                                         | Keys, wording, defaults, `historyOptions`, `SettingsWatcher`   |
| `modules/model.js`                                                            | `History`: items, caps, dedupe, expiry, blocked notice         |
| `modules/transforms.js`                                                       | Transform list, `applicable`, `runTransform`, `TransformError` |
| `modules/privacy.js`                                                          | `shouldRecord`, MIME constants, reasons, limits                |
| `modules/listing.js`                                                          | Row text, previews, filtering, selection stepping, `fill`      |
| `modules/accel.js`                                                            | Accelerator normalization and conflict detection               |
| `modules/clipboard.js`                                                        | Shell clipboard adapter (excluded from coverage)               |
| `modules/recorder.js`                                                         | owner-changed → privacy → read → History; expiry timer         |
| `modules/paste.js`                                                            | `pasteKeys`, `Paster` (virtual keyboard)                       |
| `modules/panel.js`                                                            | Quick Settings tile and its menu                               |
| `modules/popup.js`                                                            | Keyboard popup (ModalDialog)                                   |
| `modules/controller.js`                                                       | `QuickClip`: lifecycle, lock, keybindings, actions             |
| `stylesheet.css`                                                              | Presentation only, no colors                                   |
| `icons/quickclip-symbolic.svg`                                                | Tile icon                                                      |
| `tests/stubs/*`, `tests/support/*`                                            | Shell stand-ins and fakes                                      |
| `tests/*.test.js`                                                             | Vitest suites; `tests/docs.spec.js` Playwright                 |
| `scripts/headless-check.sh`, `scripts/pack-check.sh`, `scripts/icon-check.js` | Live checks                                                    |
| `docs/`                                                                       | Public docs site (GitHub Pages)                                |
| `design/`                                                                     | Spec and this plan (not published)                             |

---

### Task 1: Scaffold the repository, schema, settings module and test harness

**Files:**

- Create (copied verbatim from quickmusic): `LICENSE`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `eslint.config.js`, `mise.toml`, `.gitleaks.toml`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/security.yml`, `.github/workflows/sonar.yml`, `tests/support/actors.js`, `tests/stubs/gi-gobject.js`, `tests/stubs/gi-pango.js`, `tests/stubs/shell-quicksettings.js`
- Create (new content below): `package.json`, `metadata.json`, `schemas/org.gnome.shell.extensions.quickclip.gschema.xml`, `modules/settings.js`, `icons/quickclip-symbolic.svg`, `vitest.config.js`, `sonar-project.properties`, `justfile`, `tests/stubs/gi-clutter.js`, `tests/stubs/gi-gio.js`, `tests/stubs/gi-glib.js`, `tests/stubs/gi-meta.js`, `tests/stubs/gi-shell.js`, `tests/stubs/gi-st.js`, `tests/stubs/shell-extension.js`, `tests/stubs/shell-main.js`, `tests/stubs/shell-popupmenu.js`, `tests/stubs/shell-modaldialog.js`, `tests/stubs/misc-animationutils.js`, `tests/support/world.js`, `tests/settings.test.js`
- Modify: `design/2026-09-25-quickclip-design.md` (one line)

**Interfaces:**

- Produces: `KEYS`, `SETTINGS`, `ALL_KEYS`, `DEFAULT_TERMINALS`, `historyOptions(settings) → {size, imageBudget, expireMs}`, `SettingsWatcher` (from `modules/settings.js`); `createSettings(values)`, `createClipboard()`, `createTimers()`, `MB` (from `tests/support/world.js`); stubs listed above.

- [ ] **Step 1: Copy the unchanged tooling**

```bash
cd /var/home/napalm/git/ghost-assembly/quickclip
Q=../quickmusic
mkdir -p .github/workflows modules schemas icons scripts tests/stubs tests/support docs
cp $Q/LICENSE $Q/.prettierrc.json $Q/.prettierignore $Q/.gitignore $Q/eslint.config.js \
   $Q/mise.toml $Q/.gitleaks.toml .
cp $Q/.github/dependabot.yml .github/
cp $Q/.github/workflows/{ci,release,security,sonar}.yml .github/workflows/
cp $Q/tests/support/actors.js tests/support/
cp $Q/tests/stubs/{gi-gobject,gi-pango,shell-quicksettings}.js tests/stubs/
rg -n -i 'quickmusic|mpris' .github eslint.config.js mise.toml .gitleaks.toml || echo "no project names left"
```

Expected: `no project names left`. If `rg` prints matches, replace `quickmusic` → `quickclip` and `QuickMusic` → `QuickClip` in those lines.

- [ ] **Step 2: Write `package.json`**

```json
{
    "name": "quickclip",
    "version": "0.1.0",
    "description": "A private clipboard history with developer transforms in GNOME quick settings",
    "license": "GPL-3.0-or-later",
    "private": true,
    "type": "module",
    "devDependencies": {
        "@axe-core/playwright": "^4.13.0",
        "@eslint/js": "^10.0.1",
        "@playwright/test": "^1.63.0",
        "@vitest/coverage-v8": "^5.0.1",
        "eslint": "^10.11.0",
        "eslint-plugin-security": "^4.0.1",
        "globals": "^17.11.0",
        "prettier": "^3.9.9",
        "vitest": "^5.0.1"
    },
    "engines": {
        "node": ">=24"
    }
}
```

- [ ] **Step 3: Write `metadata.json`**

```json
{
    "uuid": "quickclip@napalm255.github.io",
    "name": "QuickClip",
    "description": "A private clipboard history in the quick settings menu, with developer transforms. Keeps your recent copies in memory only, never records what a password manager copies, and can pretty-print JSON, decode base64 and more. Super+Shift+V opens it from the keyboard.\n\nUses the unlock-dialog session mode only so the history can be kept, in memory, across a screen lock when you turn off \"Clear on lock\". While the screen is locked QuickClip shows nothing, records nothing and removes its shortcuts.",
    "shell-version": ["50"],
    "session-modes": ["user", "unlock-dialog"],
    "url": "https://github.com/Ghost-Assembly/quickclip",
    "settings-schema": "org.gnome.shell.extensions.quickclip",
    "gettext-domain": "quickclip",
    "version-name": "0.1.0"
}
```

- [ ] **Step 4: Write the gschema**

`schemas/org.gnome.shell.extensions.quickclip.gschema.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist gettext-domain="quickclip">
  <schema id="org.gnome.shell.extensions.quickclip"
          path="/org/gnome/shell/extensions/quickclip/">

    <key type="i" name="history-size">
      <range min="5" max="100"/>
      <default>20</default>
      <summary>History size</summary>
      <description>
        How many copies to keep. Older ones are dropped first. The history is
        held in memory only and is never written to disk.
      </description>
    </key>

    <key type="i" name="image-budget-mb">
      <range min="0" max="256"/>
      <default>32</default>
      <summary>Image memory budget</summary>
      <description>
        The most memory, in megabytes, that copied images may use together.
        The oldest images are dropped first. 0 stops images being kept at all.
      </description>
    </key>

    <key type="i" name="expire-minutes">
      <range min="0" max="1440"/>
      <default>30</default>
      <summary>Expire copies after</summary>
      <description>
        Minutes after which a copy is dropped from the history. Pinned
        snippets never expire. 0 keeps copies until they are pushed out.
      </description>
    </key>

    <key type="b" name="clear-on-lock">
      <default>true</default>
      <summary>Clear on lock</summary>
      <description>
        Empty the history when the screen locks. When off, the history is kept
        in memory across the lock; nothing is recorded while locked either way.
      </description>
    </key>

    <key type="b" name="auto-paste">
      <default>true</default>
      <summary>Paste on select</summary>
      <description>
        After choosing an item in the popup, paste it into the window that had
        focus. Terminals listed in terminal-apps get Ctrl+Shift+V.
      </description>
    </key>

    <key type="b" name="paused">
      <default>false</default>
      <summary>Recording paused</summary>
      <description>
        While true, copies are not recorded. Toggled from the tile.
      </description>
    </key>

    <key type="as" name="popup-shortcut">
      <default><![CDATA[['<Super><Shift>v']]]></default>
      <summary>Open the popup</summary>
      <description>
        Shortcut that opens the clipboard popup. Chosen so it does not take
        over any GNOME default.
      </description>
    </key>

    <key type="as" name="pause-shortcut">
      <default>[]</default>
      <summary>Pause or resume recording</summary>
      <description>
        Shortcut that pauses or resumes recording. Unset by default.
      </description>
    </key>

    <key type="as" name="ignored-apps">
      <default>[]</default>
      <summary>Ignored apps</summary>
      <description>
        Desktop app ids whose copies are not recorded. Wayland does not say
        which app made a copy, so this uses the app focused at the time.
      </description>
    </key>

    <key type="as" name="terminal-apps">
      <default>['org.gnome.Ptyxis.desktop', 'org.gnome.Console.desktop', 'org.gnome.Terminal.desktop', 'kitty.desktop', 'Alacritty.desktop', 'foot.desktop', 'org.wezfurlong.wezterm.desktop', 'com.mitchellh.ghostty.desktop']</default>
      <summary>Terminal apps</summary>
      <description>
        Desktop app ids that paste with Ctrl+Shift+V instead of Ctrl+V.
      </description>
    </key>

    <key type="as" name="pinned">
      <default>[]</default>
      <summary>Pinned snippets</summary>
      <description>
        Text you pinned. The only clipboard content QuickClip stores on disk,
        and only because you asked it to.
      </description>
    </key>
  </schema>
</schemalist>
```

- [ ] **Step 5: Write the failing settings test**

`tests/settings.test.js`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    ALL_KEYS,
    DEFAULT_TERMINALS,
    KEYS,
    SETTINGS,
    SettingsWatcher,
    historyOptions,
} from '../modules/settings.js';
import { createSettings, MB } from './support/world.js';

const read = relative =>
    // Module-relative constants resolved from import.meta.url, not input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const xml = read('../schemas/org.gnome.shell.extensions.quickclip.gschema.xml');
const metadata = JSON.parse(read('../metadata.json'));

/** Key name -> declared type, straight out of the gschema. */
const declared = new Map(
    [...xml.matchAll(/<key\s+type="([^"]+)"\s+name="([^"]+)">/g)].map(match => [
        match[2],
        match[1],
    ]),
);

/** The <default> of one key, as written. */
function defaultOf(key) {
    const block = new RegExp(`name="${key}">[\\s\\S]*?<default>([\\s\\S]*?)</default>`);
    return block.exec(xml)[1];
}

describe('the settings list and the gschema', () => {
    it('agree on which keys exist', () => {
        expect([...declared.keys()].sort()).toEqual([...ALL_KEYS].sort());
    });

    it('agree on every type', () => {
        for (const setting of SETTINGS)
            expect(declared.get(setting.key)).toBe(setting.type);
    });

    it('describes every key it names', () => {
        for (const setting of SETTINGS) {
            expect(setting.label).toMatch(/\S/);
            expect(setting.detail).toMatch(/\S/);
        }
    });

    it('gives every key a summary and a description', () => {
        const keys = [...xml.matchAll(/<key\b[\s\S]*?<\/key>/g)].map(match => match[0]);
        expect(keys).toHaveLength(declared.size);
        for (const key of keys) {
            expect(key).toMatch(/<summary>[^<]*\S[^<]*<\/summary>/);
            expect(key).toMatch(/<description>[\s\S]*\S[\s\S]*<\/description>/);
        }
    });
});

describe('defaults', () => {
    it('never takes over GNOME’s Super+V', () => {
        expect(defaultOf(KEYS.POPUP_SHORTCUT)).toContain("'<Super><Shift>v'");
        expect(defaultOf(KEYS.POPUP_SHORTCUT)).not.toMatch(/'<Super>v'/);
        expect(defaultOf(KEYS.PAUSE_SHORTCUT)).toBe('[]');
    });

    it('lists the same terminals as the code', () => {
        const ids = [...defaultOf(KEYS.TERMINAL_APPS).matchAll(/'([^']+)'/g)].map(
            match => match[1],
        );
        expect(ids).toEqual([...DEFAULT_TERMINALS]);
        expect(ids).toContain('com.mitchellh.ghostty.desktop');
    });

    it('clears on lock and pastes on select out of the box', () => {
        expect(defaultOf(KEYS.CLEAR_ON_LOCK)).toBe('true');
        expect(defaultOf(KEYS.AUTO_PASTE)).toBe('true');
    });
});

describe('metadata.json', () => {
    it('names the schema that exists', () => {
        expect(xml).toContain(`id="${metadata['settings-schema']}"`);
    });

    it('declares the lock-screen mode the spec relies on', () => {
        expect(metadata['session-modes']).toEqual(['user', 'unlock-dialog']);
        expect(metadata.description).toMatch(/unlock-dialog/);
    });
});

describe('historyOptions', () => {
    it('converts the settings into History units', () => {
        const settings = createSettings({
            [KEYS.HISTORY_SIZE]: 7,
            [KEYS.IMAGE_BUDGET_MB]: 2,
            [KEYS.EXPIRE_MINUTES]: 3,
        });
        expect(historyOptions(settings)).toEqual({
            size: 7,
            imageBudget: 2 * MB,
            expireMs: 3 * 60 * 1000,
        });
    });
});

describe('SettingsWatcher', () => {
    it('releases every handler it connected, twice over', () => {
        const settings = createSettings();
        const watcher = new SettingsWatcher(settings);
        let fired = 0;

        watcher.watch(KEYS.PAUSED, () => (fired += 1));
        settings.set_boolean(KEYS.PAUSED, true);
        expect(fired).toBe(1);

        watcher.release();
        watcher.release();
        expect(settings.connected.size).toBe(0);
    });
});
```

- [ ] **Step 6: Write `tests/support/world.js`**

```js
// Fakes for what the modules are handed: settings, the clipboard and a clock.

import { DEFAULT_TERMINALS, KEYS } from '../../modules/settings.js';

export const MB = 1024 * 1024;

/**
 * An in-memory Gio.Settings covering the calls QuickClip makes.
 *
 * @param {object} [values] Initial values by key.
 */
export function createSettings(values = {}) {
    const state = new Map([
        [KEYS.HISTORY_SIZE, 20],
        [KEYS.IMAGE_BUDGET_MB, 32],
        [KEYS.EXPIRE_MINUTES, 30],
        [KEYS.CLEAR_ON_LOCK, true],
        [KEYS.AUTO_PASTE, true],
        [KEYS.PAUSED, false],
        [KEYS.POPUP_SHORTCUT, ['<Super><Shift>v']],
        [KEYS.PAUSE_SHORTCUT, []],
        [KEYS.IGNORED_APPS, []],
        [KEYS.TERMINAL_APPS, [...DEFAULT_TERMINALS]],
        [KEYS.PINNED, []],
        ...Object.entries(values),
    ]);

    const handlers = new Map();
    let nextId = 1;

    return {
        /** Live handler ids, so a test can prove they were disconnected. */
        connected: handlers,

        get_boolean: key => Boolean(state.get(key)),
        get_int: key => Number(state.get(key) ?? 0),
        get_strv: key => [...(state.get(key) ?? [])],

        set_boolean(key, value) {
            state.set(key, Boolean(value));
            this.emitChange(key);
        },

        set_int(key, value) {
            state.set(key, Number(value));
            this.emitChange(key);
        },

        set_strv(key, value) {
            state.set(key, [...value]);
            this.emitChange(key);
        },

        connect(signal, callback) {
            const id = nextId++;
            handlers.set(id, { signal, callback });
            return id;
        },

        disconnect(id) {
            handlers.delete(id);
        },

        /** Fire `changed::<key>` as GSettings would. */
        emitChange(key) {
            for (const { signal, callback } of [...handlers.values()])
                if (signal === `changed::${key}`) callback(this, key);
        },
    };
}

/**
 * A stand-in for modules/clipboard.js's ClipboardSource: same surface, no Shell.
 *
 * copyText/copyImage put content on the fake clipboard and fire owner-changed,
 * as another application copying would. With `deferred` set, reads wait until
 * release() so a test can overlap two copies.
 */
export function createClipboard() {
    let listener = null;
    const pending = [];

    const clip = {
        mimes: [],
        text: null,
        image: null,
        appId: '',
        deferred: false,
        listening: false,
        /** Every write QuickClip made, as [kind, value]. */
        writes: [],
        /** How many times QuickClip read the content. */
        reads: 0,

        start(onChange) {
            listener = onChange;
            clip.listening = true;
        },

        stop() {
            listener = null;
            clip.listening = false;
        },

        mimetypes: () => [...clip.mimes],
        focusedAppId: () => clip.appId,

        readText() {
            clip.reads += 1;
            return clip._answer(clip.text);
        },

        readImage() {
            clip.reads += 1;
            return clip._answer(clip.image);
        },

        _answer(value) {
            if (!clip.deferred) return Promise.resolve(value);
            return new Promise(resolve => pending.push(() => resolve(value)));
        },

        /** Let every held-back read finish, oldest first. */
        release() {
            while (pending.length) pending.shift()();
        },

        writeText(text) {
            clip.writes.push(['text', text]);
        },

        writeImage(data) {
            clip.writes.push(['image', data]);
        },

        destroy() {
            clip.stop();
        },

        copyText(text, { mimes = ['text/plain;charset=utf-8'], appId = '' } = {}) {
            clip.mimes = mimes;
            clip.text = text;
            clip.image = null;
            clip.appId = appId;
            listener?.();
        },

        copyImage(image, { appId = '' } = {}) {
            clip.mimes = ['image/png'];
            clip.image = image;
            clip.text = null;
            clip.appId = appId;
            listener?.();
        },
    };

    return clip;
}

/**
 * A manual clock and timer queue with the setTimeout/clearTimeout surface.
 * advance() runs due callbacks in time order, including ones they schedule.
 */
export function createTimers() {
    let now = 1_000_000;
    let nextId = 1;
    const pending = new Map();

    return {
        now: () => now,

        setTimeout(callback, ms) {
            const id = nextId++;
            pending.set(id, { at: now + ms, callback });
            return id;
        },

        clearTimeout(id) {
            pending.delete(id);
        },

        get pending() {
            return pending.size;
        },

        advance(ms) {
            now += ms;
            for (;;) {
                const due = [...pending]
                    .filter(([, timer]) => timer.at <= now)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                pending.delete(due[0]);
                due[1].callback();
            }
        },
    };
}

/** Let pending promise callbacks run. */
export const flush = () => new Promise(resolve => setImmediate(resolve));
```

- [ ] **Step 7: Run the test to see it fail**

Run: `npm ci && npx vitest run tests/settings.test.js`
Expected: FAIL — `Failed to resolve import "../modules/settings.js"` (also `vitest.config.js` is missing; Vitest runs with defaults, that is fine for now).

- [ ] **Step 8: Write `modules/settings.js`**

```js
// The extension's settings, written down once.
//
// This file imports nothing. prefs.js runs in a process with no access to
// gnome-shell's resource:// modules and must be able to load it, and Vitest has
// to reach it on plain Node so tests/settings.test.js can check it against the
// gschema.

/**
 * Schema keys.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const KEYS = Object.freeze({
    HISTORY_SIZE: 'history-size',
    IMAGE_BUDGET_MB: 'image-budget-mb',
    EXPIRE_MINUTES: 'expire-minutes',
    CLEAR_ON_LOCK: 'clear-on-lock',
    AUTO_PASTE: 'auto-paste',
    PAUSED: 'paused',
    POPUP_SHORTCUT: 'popup-shortcut',
    PAUSE_SHORTCUT: 'pause-shortcut',
    IGNORED_APPS: 'ignored-apps',
    TERMINAL_APPS: 'terminal-apps',
    PINNED: 'pinned',
});

/**
 * Terminals that paste with Ctrl+Shift+V, as desktop app ids. Kept identical
 * to the gschema default; tests/settings.test.js compares them.
 *
 * @type {ReadonlyArray<string>}
 */
export const DEFAULT_TERMINALS = Object.freeze([
    'org.gnome.Ptyxis.desktop',
    'org.gnome.Console.desktop',
    'org.gnome.Terminal.desktop',
    'kitty.desktop',
    'Alacritty.desktop',
    'foot.desktop',
    'org.wezfurlong.wezterm.desktop',
    'com.mitchellh.ghostty.desktop',
]);

/**
 * Each setting with the type the gschema declares and the wording prefs.js
 * shows for it.
 *
 * @type {ReadonlyArray<{key: string, type: string, label: string, detail: string}>}
 */
export const SETTINGS = Object.freeze(
    [
        {
            key: KEYS.HISTORY_SIZE,
            type: 'i',
            label: 'History size',
            detail: 'How many copies to keep',
        },
        {
            key: KEYS.IMAGE_BUDGET_MB,
            type: 'i',
            label: 'Image memory (MB)',
            detail: 'Memory copied images may use together; 0 keeps no images',
        },
        {
            key: KEYS.EXPIRE_MINUTES,
            type: 'i',
            label: 'Expire after (minutes)',
            detail: 'Drop copies older than this; 0 never expires them',
        },
        {
            key: KEYS.CLEAR_ON_LOCK,
            type: 'b',
            label: 'Clear on lock',
            detail: 'Empty the history when the screen locks',
        },
        {
            key: KEYS.AUTO_PASTE,
            type: 'b',
            label: 'Paste on select',
            detail: 'Paste the item chosen in the popup into the focused window',
        },
        {
            key: KEYS.PAUSED,
            type: 'b',
            label: 'Recording paused',
            detail: 'Toggled from the quick settings tile',
        },
        {
            key: KEYS.POPUP_SHORTCUT,
            type: 'as',
            label: 'Open the popup',
            detail: 'Shows the history under the keyboard',
        },
        {
            key: KEYS.PAUSE_SHORTCUT,
            type: 'as',
            label: 'Pause or resume',
            detail: 'Stops or restarts recording',
        },
        {
            key: KEYS.IGNORED_APPS,
            type: 'as',
            label: 'Ignored apps',
            detail: 'Copies made while one of these is focused are not recorded',
        },
        {
            key: KEYS.TERMINAL_APPS,
            type: 'as',
            label: 'Terminal apps',
            detail: 'These paste with Ctrl+Shift+V',
        },
        {
            key: KEYS.PINNED,
            type: 'as',
            label: 'Pinned snippets',
            detail: 'Kept until you unpin them',
        },
    ].map(setting => Object.freeze(setting)),
);

/**
 * Just the keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ALL_KEYS = Object.freeze(SETTINGS.map(setting => setting.key));

/**
 * The settings History is built from, in the units it takes.
 *
 * @param {Gio.Settings} settings The extension's settings.
 * @returns {{size: number, imageBudget: number, expireMs: number}} Options.
 */
export function historyOptions(settings) {
    return {
        size: settings.get_int(KEYS.HISTORY_SIZE),
        imageBudget: settings.get_int(KEYS.IMAGE_BUDGET_MB) * 1024 * 1024,
        expireMs: settings.get_int(KEYS.EXPIRE_MINUTES) * 60 * 1000,
    };
}

/**
 * A group of settings handlers that are released together.
 *
 * Gio.Settings has no connectObject, so a `changed::` handler has to be
 * disconnected by the id its connect returned. Same shape as QuickMusic's.
 */
export class SettingsWatcher {
    /**
     * @param {Gio.Settings} settings Settings to watch.
     */
    constructor(settings) {
        this._settings = settings;
        this._ids = [];
    }

    /**
     * Watch one key.
     *
     * @param {string} key Settings key to watch.
     * @param {Function} callback Called when it changes.
     */
    watch(key, callback) {
        this._ids.push(this._settings.connect(`changed::${key}`, callback));
    }

    /** Disconnect everything watched so far. Idempotent. */
    release() {
        for (const id of this._ids) this._settings.disconnect(id);
        this._ids = [];
    }
}
```

- [ ] **Step 9: Write the test stubs**

`tests/stubs/gi-clutter.js`:

```js
// Clutter 18, as far as QuickClip uses it: key symbols, the virtual keyboard
// modules/paste.js drives, and the alignment enums the views set.
//
// The keysym values are the real ones from clutter-keysyms.h, so a test that
// compares against them compares against what the Shell would send.

/**
 * The seat Clutter.get_default_backend() returns. Each virtual device records
 * the keyvals it was sent; set `fail` to make creation throw.
 */
export const virtualSeat = {
    devices: [],
    fail: false,

    create_virtual_device(type) {
        if (virtualSeat.fail) throw new Error('no virtual devices on this seat');
        const device = {
            type,
            events: [],
            notify_keyval(_time, keyval, state) {
                device.events.push([keyval, state]);
            },
        };
        virtualSeat.devices.push(device);
        return device;
    },

    reset() {
        virtualSeat.devices = [];
        virtualSeat.fail = false;
    },
};

export default {
    get_default_backend: () => ({ get_default_seat: () => virtualSeat }),

    KEY_Return: 0xff0d,
    KEY_KP_Enter: 0xff8d,
    KEY_Escape: 0xff1b,
    KEY_Tab: 0xff09,
    KEY_ISO_Left_Tab: 0xfe20,
    KEY_Up: 0xff52,
    KEY_Down: 0xff54,
    KEY_Control_L: 0xffe3,
    KEY_Shift_L: 0xffe1,
    KEY_v: 0x076,
    KEY_a: 0x061,

    KeyState: { RELEASED: 0, PRESSED: 1 },
    InputDeviceType: { POINTER_DEVICE: 0, KEYBOARD_DEVICE: 1 },
    ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
    Orientation: { HORIZONTAL: 0, VERTICAL: 1 },
    EVENT_PROPAGATE: false,
    EVENT_STOP: true,
};
```

`tests/stubs/gi-gio.js`:

```js
// Gio, as far as the views use it: icons. Nothing here resembles I/O.

export default {
    icon_new_for_string: name => ({ name, isGicon: true }),

    ThemedIcon: class {
        constructor({ name }) {
            this.name = name;
        }
    },

    BytesIcon: class {
        constructor({ bytes }) {
            this.bytes = bytes;
        }
    },
};
```

`tests/stubs/gi-glib.js`:

```js
// GLib, as far as extension.js and modules/paste.js use it.

export default {
    get_monotonic_time: () => 42_000_000,
    uuid_string_random: () => '00000000-0000-4000-8000-000000000000',
};
```

`tests/stubs/gi-meta.js`:

```js
// Meta, as far as modules/controller.js uses it.

export default {
    KeyBindingFlags: { NONE: 0 },
};
```

`tests/stubs/gi-shell.js`:

```js
// Shell, as far as modules/controller.js uses it.

export default {
    ActionMode: { NONE: 0, NORMAL: 1, OVERVIEW: 2 },
};
```

`tests/stubs/gi-st.js`:

```js
// St, as far as the views use it.

import { FakeActor } from '../support/actors.js';

class Widget extends FakeActor {}
class BoxLayout extends Widget {}
class Icon extends Widget {}

/** A label with the clutter_text the real St.Label exposes. */
class Label extends Widget {
    _init(props = {}) {
        super._init({ text: '', ...props });
        this.clutter_text = { ellipsize: null, use_markup: false };
    }
}

class Button extends Widget {
    _init(props = {}) {
        super._init(props);
        if (props.child) this.add_child(props.child);
    }

    /** Fire the button as a click would, unless it is insensitive. */
    click() {
        if (this.reactive) this.emit('clicked', 0);
    }
}

/** An entry whose clutter_text is an actor, so key and text signals work. */
class Entry extends Widget {
    _init(props = {}) {
        super._init(props);
        this.clutter_text = new FakeActor({ text: '' });
    }

    get_text() {
        return this.clutter_text.text;
    }

    /** Type into the entry, as a person would. */
    set_text(text) {
        this.clutter_text.text = text;
        this.clutter_text.emit('text-changed');
    }

    /** Press one key, as Clutter would deliver it to the entry's text. */
    press(symbol) {
        this.clutter_text.emit('key-press-event', { get_key_symbol: () => symbol });
    }
}

class ScrollView extends Widget {
    _init(props = {}) {
        super._init(props);
        if (props.child) this.add_child(props.child);
    }
}

export default {
    Widget,
    BoxLayout,
    Icon,
    Label,
    Button,
    Entry,
    ScrollView,

    PolicyType: { ALWAYS: 0, AUTOMATIC: 1, NEVER: 2, EXTERNAL: 3 },
    Side: { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 },
};
```

`tests/stubs/shell-extension.js`:

```js
// resource:///org/gnome/shell/extensions/extension.js, as far as extension.js uses it.

export class Extension {
    constructor(metadata = { 'version-name': '0.0.0' }) {
        this.metadata = metadata;
        this.path = '/nonexistent/quickclip';
        this.settings = null;
        this.prefsOpened = 0;
    }

    getSettings() {
        return this.settings;
    }

    openPreferences() {
        this.prefsOpened += 1;
    }
}

// The Shell binds these to the extension's own gettext domain. The stub keeps
// them identity-like so a test reads the untranslated string it wrote.
export const gettext = message => message;
export const ngettext = (singular, plural, count) => (count === 1 ? singular : plural);
export const pgettext = (_context, message) => message;
```

`tests/stubs/shell-main.js`:

```js
// resource:///org/gnome/shell/ui/main.js, as far as QuickClip uses it.
//
// A module singleton, mirroring the real Main. reset() must be called from
// beforeEach or state leaks between tests.

import { FakeActor } from '../support/actors.js';

/** Indicators handed to addExternalIndicator. */
export const externalIndicators = [];

/** Notifications shown, as {title, body}. */
export const notifications = [];

const quickSettings = new FakeActor();
quickSettings.addExternalIndicator = (indicator, colSpan = 1) => {
    externalIndicators.push({ indicator, colSpan });
};

export const panel = { statusArea: { quickSettings } };

/** As the real WindowManager: one handler per name, NORMAL-mode flags kept. */
export const wm = {
    bindings: new Map(),

    addKeybinding(name, settings, flags, mode, handler) {
        if (wm.bindings.has(name)) throw new Error(`${name} is already bound`);
        wm.bindings.set(name, { settings, flags, mode, handler });
        return 1;
    },

    removeKeybinding(name) {
        wm.bindings.delete(name);
    },
};

/** The session mode. lock() flips it and emits 'updated' as the Shell does. */
export const sessionMode = new FakeActor();
sessionMode.isLocked = false;

export function lock(locked) {
    sessionMode.isLocked = locked;
    sessionMode.emit('updated');
}

export function notify(title, body) {
    notifications.push({ title, body });
}

/** Clear all recorded state. Call from beforeEach. */
export function reset() {
    externalIndicators.length = 0;
    notifications.length = 0;
    wm.bindings.clear();
    sessionMode.isLocked = false;
    for (const id of [...sessionMode.handlers.keys()]) sessionMode.disconnect(id);
}
```

`tests/stubs/shell-popupmenu.js`: copy quickmusic's file, then change only the separator class so it takes the real constructor's optional label:

```bash
cp ../quickmusic/tests/stubs/shell-popupmenu.js tests/stubs/
```

Replace the line `class PopupSeparatorMenuItem extends PopupBaseMenuItem {}` with:

```js
/** As the real one: an optional label, shown as a section heading. */
class PopupSeparatorMenuItem extends PopupBaseMenuItem {
    _init(text = '') {
        super._init();
        this.text = text;
    }
}
```

Also change its header comment's "modules/panel.js" wording to "QuickClip's views" and "QuickMusic" to "QuickClip".

Add to `tests/support/actors.js` (inside `FakeActor`, after `add_child`), because the real `PopupMenuItem` keeps its ornament at index 0 and QuickClip inserts a thumbnail at index 1:

```js
    insert_child_at_index(child, index) {
        this.children.splice(index, 0, child);
        child._parentActor = this;
    }
```

`tests/stubs/shell-modaldialog.js`:

```js
// resource:///org/gnome/shell/ui/modalDialog.js, as far as modules/popup.js uses it.
//
// open() fails when canOpen is false, as the real one does when pushModal is
// refused. close() destroys the dialog when destroyOnClose is set.

import { FakeActor } from '../support/actors.js';

export const dialogState = { canOpen: true };

export class ModalDialog extends FakeActor {
    _init({ styleClass = '', destroyOnClose = true } = {}) {
        super._init();
        this.styleClass = styleClass;
        this.destroyOnClose = destroyOnClose;
        this.contentLayout = new FakeActor();
        this.add_child(this.contentLayout);
        this.isOpen = false;
        this.initialKeyFocus = null;
    }

    setInitialKeyFocus(actor) {
        this.initialKeyFocus = actor;
    }

    open() {
        if (!dialogState.canOpen) return false;
        this.isOpen = true;
        this.emit('opened');
        return true;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.emit('closed');
        if (this.destroyOnClose) this.destroy();
    }
}
```

`tests/stubs/misc-animationutils.js`:

```js
// resource:///org/gnome/shell/misc/animationUtils.js, as far as modules/popup.js uses it.

export function ensureActorVisibleInScrollView(scrollView, actor) {
    scrollView.visibleActor = actor;
}
```

- [ ] **Step 10: Write `vitest.config.js`**

```js
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = name =>
    fileURLToPath(new URL(`./tests/stubs/${name}.js`, import.meta.url));

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['modules/**/*.js', 'extension.js', 'prefs.js'],
            // Two exceptions, both toolkit plumbing a unit test could only
            // assert against a stub of the toolkit:
            //
            //   prefs.js             Adw and Gtk widget building. The key list,
            //                        wording and shortcut conflict rules live in
            //                        modules/settings.js and modules/accel.js.
            //   modules/clipboard.js St.Clipboard and Meta.Selection calls. Every
            //                        decision about a copy lives in
            //                        modules/privacy.js, modules/recorder.js and
            //                        modules/model.js and is tested there;
            //                        clipboard.js is covered by
            //                        scripts/headless-check.sh instead.
            //
            // Kept identical to sonar.coverage.exclusions so the two agree.
            exclude: ['prefs.js', 'modules/clipboard.js', 'tests/**'],
        },
    },

    // gnome-shell resolves these at runtime; Node cannot. The stubs live in
    // tests/, so they never ship and are never counted as covered code.
    resolve: {
        alias: [
            { find: 'gi://Clutter', replacement: stub('gi-clutter') },
            { find: 'gi://Gio', replacement: stub('gi-gio') },
            { find: 'gi://GLib', replacement: stub('gi-glib') },
            { find: 'gi://GObject', replacement: stub('gi-gobject') },
            { find: 'gi://Meta', replacement: stub('gi-meta') },
            { find: 'gi://Pango', replacement: stub('gi-pango') },
            { find: 'gi://Shell', replacement: stub('gi-shell') },
            { find: 'gi://St', replacement: stub('gi-st') },
            {
                find: 'resource:///org/gnome/shell/ui/main.js',
                replacement: stub('shell-main'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/modalDialog.js',
                replacement: stub('shell-modaldialog'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/popupMenu.js',
                replacement: stub('shell-popupmenu'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/quickSettings.js',
                replacement: stub('shell-quicksettings'),
            },
            {
                find: 'resource:///org/gnome/shell/misc/animationUtils.js',
                replacement: stub('misc-animationutils'),
            },
            {
                find: 'resource:///org/gnome/shell/extensions/extension.js',
                replacement: stub('shell-extension'),
            },
        ],
    },
});
```

- [ ] **Step 11: Write `sonar-project.properties`, the icon and the justfile**

`sonar-project.properties`:

```properties
sonar.projectKey=Ghost-Assembly_quickclip
sonar.organization=ghost-assembly

sonar.sources=modules,extension.js,prefs.js
sonar.tests=tests
sonar.exclusions=node_modules/**,coverage/**

sonar.javascript.lcov.reportPaths=coverage/lcov.info

# Kept identical to coverage.exclude in vitest.config.js, which carries the
# reasoning for both.
sonar.coverage.exclusions=prefs.js,modules/clipboard.js
```

`icons/quickclip-symbolic.svg` (no comment before `<svg>`: gdk-pixbuf sniffing fails on it — see quickmusic's `scripts/icon-check.js`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#2e3436" d="M6 1a1 1 0 0 0-1 1H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-1a1 1 0 0 0-1-1Zm0 1h4v1H6Zm-2 1h1v1h6V3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 3v1h6V6Zm0 2v1h6V8Zm0 2v1h4v-1Z"/></svg>
```

`justfile`:

```just
set shell := ["bash", "-euo", "pipefail", "-c"]

# Derived, so metadata.json is the only place the uuid is written down.
uuid := shell("jq -r .uuid metadata.json")
install_dir := env_var('HOME') / ".local/share/gnome-shell/extensions" / uuid
src := "metadata.json extension.js prefs.js modules schemas icons stylesheet.css"

# List available recipes
default:
    @just --list

# Install dependencies and dev tooling
setup:
    mise install
    npm ci
    npx playwright install chromium firefox
    @for tool in gjs glib-compile-schemas gnome-shell; do \
        command -v "$tool" >/dev/null \
            || { echo "missing $tool — dnf install gjs glib2 gnome-shell"; exit 1; }; \
    done
    @echo "ready"

# Format code in place
fmt:
    npx prettier --write .
    npx eslint --fix .

# Static analysis; changes nothing
lint:
    npx eslint .
    npx prettier --check .
    glib-compile-schemas --strict --dry-run schemas
    shellcheck scripts/*.sh

# Run the unit suite
test *args:
    npx vitest run {{ args }}

# The docs site in Chromium and Firefox: accessibility, layout, no JavaScript
test-docs *args:
    npx playwright test {{ args }}

# Unit suite with a coverage report
coverage:
    npx vitest run --coverage

# Both need something CI has not got: a real Shell.
# Smoke-test in a headless gnome-shell, then check the bundle
test-live: build
    ./scripts/headless-check.sh
    ./scripts/pack-check.sh

# Compare the built zip against what gnome-extensions pack produces
pack-check: build
    ./scripts/pack-check.sh

# Serve the documentation site locally (docs/, as GitHub Pages serves it)
docs:
    @echo "http://localhost:8000"
    python3 -m http.server 8000 --directory docs

# Full local security scan
security:
    osv-scanner scan source --lockfile=package-lock.json
    gitleaks detect --no-banner --redact
    trivy fs --scanners vuln,secret,misconfig --exit-code 1 .
    actionlint
    zizmor .github/workflows/

# `ci` runs lint before this; a standalone `just build` deliberately does not,
# so it stays quick to iterate with.
# Produce the installable zip
build:
    rm -f {{ uuid }}.shell-extension.zip
    zip -qr {{ uuid }}.shell-extension.zip {{ src }} -x 'schemas/gschemas.compiled'
    @echo "built {{ uuid }}.shell-extension.zip"

# GNOME 49 and later have no nested mode: --devkit opens the Shell in a
# window through mutter-devkit (not installed on every machine).
# Run a gnome-shell in a window to try the extension by hand
run:
    dbus-run-session -- gnome-shell --devkit --wayland

# Copy the extension into the user extensions directory
install:
    mkdir -p {{ install_dir }}
    rsync -a --delete --exclude '.git' {{ src }} {{ install_dir }}/
    glib-compile-schemas {{ install_dir }}/schemas

# Enable the extension
enable:
    gnome-extensions enable {{ uuid }}

# Disable the extension
disable:
    gnome-extensions disable {{ uuid }}

# Open the preferences window
prefs:
    gnome-extensions prefs {{ uuid }}

# Follow the extension's log output
logs:
    journalctl -f -o cat /usr/bin/gnome-shell | grep -i --line-buffered "quickclip"

# Remove build output
[confirm("remove node_modules, coverage, test output, the zip and compiled schemas?")]
clean:
    rm -rf node_modules coverage test-results playwright-report
    rm -f {{ uuid }}.shell-extension.zip schemas/gschemas.compiled

# Everything CI runs, in order
ci: lint test test-docs security build
```

`stylesheet.css`, `extension.js`, `prefs.js` and `scripts/*.sh` do not exist yet: `just build`, `just lint` (shellcheck glob) and `just ci` are not expected to pass until Task 11. Until then use the narrower commands in each task.

- [ ] **Step 12: Update the spec line**

In `design/2026-09-25-quickclip-design.md`, replace

```
GSettings (`org.gnome.shell.extensions.quickclip`): `history-size` u 20, `image-budget-mb` u 32,
`expire-minutes` u 30,
```

with

```
GSettings (`org.gnome.shell.extensions.quickclip`): `history-size` i 20 (5–100), `image-budget-mb`
i 32 (0–256, 0 = no images), `expire-minutes` i 30 (0–1440),
```

- [ ] **Step 13: Run the tests and lint what exists**

Run: `npx vitest run tests/settings.test.js && npx eslint modules tests && npx prettier --check modules tests package.json metadata.json && glib-compile-schemas --strict --dry-run schemas`
Expected: all settings tests PASS; eslint and prettier clean (run `npx prettier --write` on the new files first if prettier complains); schema compiles.

- [ ] **Step 14: Commit**

```bash
git add -A
git status --short   # confirm no node_modules, zip or gschemas.compiled
git commit -m "build: scaffold QuickClip from the QuickMusic template"
```

---

### Task 2: Transforms

**Files:**

- Create: `modules/transforms.js`, `modules/model.js` (only the `KIND` export for now — Task 3 fills in `History`)
- Test: `tests/transforms.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces: `KIND = {TEXT: 'text', IMAGE: 'image'}` in `modules/model.js`; in `modules/transforms.js`: `TransformError`, `MAX_TRANSFORM_CHARS = 100_000`, `base64Encode(text) → string`, `base64Decode(text) → string`, `createTransforms({uuid: () => string, now: () => number}) → ReadonlyArray<Transform>` where `Transform = {id, label, generator: boolean, applies(text) → boolean, run(text) → string}`, `applicable(transforms, item|null) → Transform[]`, `runTransform(transform, text) → string` (throws `TransformError`).

- [ ] **Step 1: Seed `modules/model.js` with the kind enum**

```js
// The clipboard history: what is kept, for how long, and in what order.
//
// This file imports nothing. modules/recorder.js hands it plain entries and it
// keeps plain objects, so every decision about the history is reachable from
// Vitest on Node.

/** What a history item holds. */
export const KIND = Object.freeze({ TEXT: 'text', IMAGE: 'image' });
```

- [ ] **Step 2: Write the failing test**

`tests/transforms.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { KIND } from '../modules/model.js';
import {
    MAX_TRANSFORM_CHARS,
    TransformError,
    applicable,
    base64Decode,
    base64Encode,
    createTransforms,
    runTransform,
} from '../modules/transforms.js';

const transforms = createTransforms({
    uuid: () => '11111111-2222-4333-8444-555555555555',
    now: () => Date.UTC(2026, 8, 25, 12, 0, 0),
});
const byId = id => transforms.find(transform => transform.id === id);
const text = value => ({ kind: KIND.TEXT, text: value });
const ids = item => applicable(transforms, item).map(transform => transform.id);
const run = (id, value) => runTransform(byId(id), value);

describe('JSON', () => {
    it('pretty-prints and minifies', () => {
        expect(run('json-pretty', '{"a":1,"b":[2]}')).toBe(
            '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}',
        );
        expect(run('json-minify', '{\n  "a": 1\n}')).toBe('{"a":1}');
    });

    it('is offered only for objects and arrays that parse', () => {
        expect(ids(text(' {"a":1} '))).toContain('json-pretty');
        expect(ids(text('[1,2]'))).toContain('json-minify');
        expect(ids(text('{not json'))).not.toContain('json-pretty');
        expect(ids(text('42'))).not.toContain('json-pretty');
    });

    it('fails with a message that does not quote the input', () => {
        const secret = '{"token": hunter2}';
        expect(() => run('json-pretty', secret)).toThrow(TransformError);
        try {
            run('json-pretty', secret);
        } catch (error) {
            expect(error.message).toBe('Not valid JSON');
            expect(error.message).not.toContain('hunter2');
        }
    });
});

describe('base64', () => {
    it('round-trips UTF-8 text', () => {
        for (const value of ['Hello', 'héllo wörld', '🙂 ok', '', 'ab', 'abc'])
            expect(base64Decode(base64Encode(value))).toBe(value);
        expect(base64Encode('Hello')).toBe('SGVsbG8=');
        expect(base64Encode('🙂')).toBe('8J+Zgg==');
    });

    it('accepts URL-safe and unpadded input', () => {
        expect(base64Decode('SGVsbG8')).toBe('Hello');
        expect(base64Decode('8J-Zgg')).toBe('🙂');
    });

    it('rejects what is not base64 text', () => {
        expect(() => base64Decode('SGVsbG8$')).toThrow('Not base64 text');
        expect(() => base64Decode('A')).toThrow('Not base64 text');
        // Valid base64 whose bytes are not UTF-8.
        expect(() => base64Decode('/w==')).toThrow('Decoded bytes are not text');
    });

    it('offers decoding only for plausible base64', () => {
        expect(ids(text('SGVsbG8gd29ybGQ='))).toContain('base64-decode');
        expect(ids(text('password'))).not.toContain('base64-decode');
        expect(ids(text('test'))).not.toContain('base64-decode');
    });
});

describe('URL encoding', () => {
    it('encodes and decodes', () => {
        expect(run('url-encode', 'a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9');
        expect(run('url-decode', 'a%20b%26c')).toBe('a b&c');
    });

    it('is offered only when it would change something', () => {
        expect(ids(text('plain'))).not.toContain('url-encode');
        expect(ids(text('no escapes here'))).not.toContain('url-decode');
        expect(ids(text('100%25'))).toContain('url-decode');
    });

    it('fails cleanly on broken escapes', () => {
        expect(() => run('url-decode', '%E0%A4%A')).toThrow('Not valid URL encoding');
    });
});

describe('cleanup and case', () => {
    it('trims and collapses whitespace', () => {
        expect(run('trim', '  a b \n')).toBe('a b');
        expect(run('collapse', ' a \t b\n\nc ')).toBe('a b c');
        expect(ids(text('clean'))).not.toContain('trim');
        expect(ids(text('one space'))).not.toContain('collapse');
    });

    it('changes case', () => {
        expect(run('upper', 'Straße')).toBe('STRASSE');
        expect(run('lower', 'ABC')).toBe('abc');
        expect(run('snake', 'fooBar baz-qux')).toBe('foo_bar_baz_qux');
        expect(run('kebab', 'Foo Bar_baz')).toBe('foo-bar-baz');
    });

    it('offers snake and kebab only for short single lines', () => {
        expect(ids(text('fooBar'))).toContain('snake');
        expect(ids(text('foo\nbar'))).not.toContain('snake');
        expect(ids(text('foo_bar'))).not.toContain('snake');
        expect(ids(text('x'.repeat(201) + ' y'))).not.toContain('kebab');
    });
});

describe('time', () => {
    it('converts Unix seconds and milliseconds to ISO', () => {
        expect(run('epoch-to-iso', '1758801600')).toBe('2025-09-25T12:00:00.000Z');
        expect(run('epoch-to-iso', ' 1758801600123 ')).toBe('2025-09-25T12:00:00.123Z');
        expect(ids(text('12345'))).not.toContain('epoch-to-iso');
    });

    it('converts an ISO date to Unix seconds', () => {
        expect(run('iso-to-epoch', '2025-09-25T12:00:00Z')).toBe('1758801600');
        expect(run('iso-to-epoch', '2025-09-25')).toBe('1758758400');
        expect(ids(text('September 25'))).not.toContain('iso-to-epoch');
        expect(() => run('iso-to-epoch', 'nope')).toThrow('Not an ISO date');
    });
});

describe('generators', () => {
    it('are always offered, even for an image or nothing', () => {
        expect(ids(null)).toEqual(['uuid', 'timestamp']);
        expect(ids({ kind: KIND.IMAGE, size: 10 })).toEqual(['uuid', 'timestamp']);
    });

    it('use the injected sources', () => {
        expect(run('uuid', '')).toBe('11111111-2222-4333-8444-555555555555');
        expect(run('timestamp', '')).toBe('2026-09-25T12:00:00.000Z');
    });
});

describe('limits', () => {
    it('refuses oversized input', () => {
        const huge = `{"a":"${'x'.repeat(MAX_TRANSFORM_CHARS)}"}`;
        expect(ids(text(huge))).toEqual(['uuid', 'timestamp']);
        expect(() => run('json-minify', huge)).toThrow('Too long to transform');
    });

    it('never lets an engine error through with its message', () => {
        const broken = {
            id: 'broken',
            label: 'Broken',
            generator: false,
            applies: () => true,
            run: () => {
                throw new Error('secret input quoted here');
            },
        };
        expect(() => runTransform(broken, 'x')).toThrow(
            'Could not transform this text',
        );
    });

    it('has unique ids and a label for each', () => {
        const all = transforms.map(transform => transform.id);
        expect(new Set(all).size).toBe(all.length);
        for (const transform of transforms) expect(transform.label).toMatch(/\S/);
    });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/transforms.test.js`
Expected: FAIL — cannot resolve `../modules/transforms.js`.

- [ ] **Step 4: Write `modules/transforms.js`**

```js
// Developer transforms on the clipboard's text.
//
// Imports only modules/model.js's KIND. The random and clock sources are passed
// in, so every transform is deterministic under Vitest.
//
// Every transform is text in, text out. One that cannot handle its input
// throws TransformError, and the caller leaves the clipboard untouched. Error
// messages are fixed strings: they reach a notification, and notifications can
// show on the lock screen, so they must never quote the clipboard.

import { KIND } from './model.js';

export class TransformError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'TransformError';
    }
}

/**
 * Longest text a transform will look at. Parsing a multi-megabyte copy every
 * time the menu opens would stall the Shell.
 */
export const MAX_TRANSFORM_CHARS = 100_000;

/** Longest text offered snake_case or kebab-case: identifiers, not prose. */
const MAX_CASE_CHARS = 200;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 of the text's UTF-8 bytes. GJS has no btoa, so it is written out.
 *
 * @param {string} text Any text.
 * @returns {string} Padded standard base64.
 */
export function base64Encode(text) {
    const bytes = new TextEncoder().encode(text);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n =
            (bytes.at(i) << 16) |
            ((bytes.at(i + 1) ?? 0) << 8) |
            (bytes.at(i + 2) ?? 0);
        out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63);
        out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '=';
        out += i + 2 < bytes.length ? B64.charAt(n & 63) : '=';
    }
    return out;
}

/**
 * Text from base64, standard or URL-safe, padded or not.
 *
 * @param {string} text Base64, whitespace allowed.
 * @returns {string} The decoded UTF-8 text.
 * @throws {TransformError} When it is not base64, or its bytes are not UTF-8.
 */
export function base64Decode(text) {
    const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1)
        throw new TransformError('Not base64 text');

    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean.replace(/=+$/, '')) {
        buffer = ((buffer << 6) | B64.indexOf(char)) & 0xffffff;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }

    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (error) {
        throw new TransformError('Decoded bytes are not text', { cause: error });
    }
}

function looksLikeBase64(text) {
    const clean = text.replace(/\s+/g, '');
    if (clean.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) return false;
    try {
        // Printable once decoded: control characters mean it was binary.
        return /^[^\p{Cc}]*$/u.test(base64Decode(clean).replace(/[\t\r\n]/g, ''));
    } catch {
        return false;
    }
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new TransformError('Not valid JSON', { cause: error });
    }
}

function looksLikeJson(text) {
    const trimmed = text.trim();
    if (!/^[[{]/.test(trimmed)) return false;
    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
}

function urlDecode(text) {
    try {
        return decodeURIComponent(text);
    } catch (error) {
        throw new TransformError('Not valid URL encoding', { cause: error });
    }
}

/** Words of an identifier or phrase: splits camelCase and any separator. */
function words(text) {
    return text
        .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
}

const toSnake = text =>
    words(text)
        .map(word => word.toLowerCase())
        .join('_');
const toKebab = text =>
    words(text)
        .map(word => word.toLowerCase())
        .join('-');

function caseApplies(convert) {
    return text =>
        !/[\r\n]/.test(text) &&
        text.length <= MAX_CASE_CHARS &&
        convert(text) !== '' &&
        convert(text) !== text;
}

const EPOCH = /^\s*(\d{10}|\d{13})\s*$/;
const ISO =
    /^\s*\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\s*$/;

function epochToIso(text) {
    const match = EPOCH.exec(text);
    if (!match) throw new TransformError('Not a Unix timestamp');
    const digits = match[1];
    const ms = digits.length === 13 ? Number(digits) : Number(digits) * 1000;
    return new Date(ms).toISOString();
}

function isoToEpoch(text) {
    const ms = ISO.test(text) ? Date.parse(text.trim()) : Number.NaN;
    if (!Number.isFinite(ms)) throw new TransformError('Not an ISO date');
    return String(Math.floor(ms / 1000));
}

/**
 * Every transform, in menu order.
 *
 * @param {{uuid: function(): string, now: function(): number}} sources Where
 *   new UUIDs and the current time come from.
 * @returns {ReadonlyArray<object>} The transforms.
 */
export function createTransforms({ uuid, now }) {
    const define = (id, label, applies, run) =>
        Object.freeze({ id, label, generator: false, applies, run });
    const generate = (id, label, run) =>
        Object.freeze({ id, label, generator: true, applies: () => true, run });

    return Object.freeze([
        define('json-pretty', 'Pretty-print JSON', looksLikeJson, text =>
            JSON.stringify(parseJson(text), null, 2),
        ),
        define('json-minify', 'Minify JSON', looksLikeJson, text =>
            JSON.stringify(parseJson(text)),
        ),
        define('base64-encode', 'Base64 encode', text => text.length > 0, base64Encode),
        define('base64-decode', 'Base64 decode', looksLikeBase64, base64Decode),
        define(
            'url-encode',
            'URL encode',
            text => encodeURIComponent(text) !== text,
            text => encodeURIComponent(text),
        ),
        define(
            'url-decode',
            'URL decode',
            text => /%[0-9A-Fa-f]{2}/.test(text),
            urlDecode,
        ),
        define(
            'trim',
            'Trim whitespace',
            text => text !== text.trim(),
            text => text.trim(),
        ),
        define(
            'collapse',
            'Collapse whitespace',
            text => /\s{2,}|[\t\r\n]/.test(text.trim()),
            text => text.trim().replace(/\s+/g, ' '),
        ),
        define(
            'upper',
            'UPPER CASE',
            text => text.toUpperCase() !== text,
            text => text.toUpperCase(),
        ),
        define(
            'lower',
            'lower case',
            text => text.toLowerCase() !== text,
            text => text.toLowerCase(),
        ),
        define('snake', 'snake_case', caseApplies(toSnake), toSnake),
        define('kebab', 'kebab-case', caseApplies(toKebab), toKebab),
        define(
            'epoch-to-iso',
            'Unix time → ISO date',
            text => EPOCH.test(text),
            epochToIso,
        ),
        define(
            'iso-to-epoch',
            'ISO date → Unix time',
            text => ISO.test(text) && Number.isFinite(Date.parse(text.trim())),
            isoToEpoch,
        ),
        generate('uuid', 'New UUID', () => uuid()),
        generate('timestamp', 'Current time (ISO)', () =>
            new Date(now()).toISOString(),
        ),
    ]);
}

/**
 * The transforms worth offering for an item: those that would change its text,
 * plus the generators, which need no input.
 *
 * @param {ReadonlyArray<object>} transforms From createTransforms.
 * @param {object|null} item A history item, or null.
 * @returns {object[]} The transforms to show.
 */
export function applicable(transforms, item) {
    const text = item?.kind === KIND.TEXT ? item.text : null;
    const fits = text !== null && text.length <= MAX_TRANSFORM_CHARS;
    return transforms.filter(
        transform => transform.generator || (fits && transform.applies(text)),
    );
}

/**
 * Run one transform.
 *
 * @param {object} transform From createTransforms.
 * @param {string} text Input; ignored by generators.
 * @returns {string} The result.
 * @throws {TransformError} On any failure, with a message safe to show.
 */
export function runTransform(transform, text) {
    if (!transform.generator && text.length > MAX_TRANSFORM_CHARS)
        throw new TransformError('Too long to transform');
    try {
        return transform.run(text);
    } catch (error) {
        if (error instanceof TransformError) throw error;
        // An engine error can quote its input, as JSON.parse's does. Never
        // pass its message on.
        throw new TransformError('Could not transform this text', { cause: error });
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/transforms.test.js`
Expected: PASS. (The date literals were checked: 1758801600 is 2025-09-25T12:00:00Z and 1758758400 is that day's midnight UTC.)

- [ ] **Step 6: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/model.js modules/transforms.js tests/transforms.test.js
git commit -m "feat: add clipboard text transforms"
```

---

### Task 3: History model

**Files:**

- Modify: `modules/model.js`
- Test: `tests/model.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces: `History` with `constructor({size, imageBudget, expireMs, now})`, `now() → number`, getters `items` (newest first, copy), `current` (item|null), `blocked` (`{reason, at}`|null), `imageBytes`; methods `configure({size, imageBudget, expireMs})`, `add(entry) → item|null`, `block(reason)`, `clear()`, `expire() → number`, `nextExpiry() → number|null`, `onChange(callback) → unsubscribe()`. Entries: `{kind: 'text', text}` or `{kind: 'image', data, size, hash}`; stored items add `id` and `addedAt`.

- [ ] **Step 1: Write the failing test**

`tests/model.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { History, KIND } from '../modules/model.js';
import { createTimers, MB } from './support/world.js';

const text = value => ({ kind: KIND.TEXT, text: value });
const image = (hash, size) => ({ kind: KIND.IMAGE, data: { hash }, size, hash });

function build(options = {}) {
    const timers = createTimers();
    const history = new History({
        size: 3,
        imageBudget: 10 * MB,
        expireMs: 60_000,
        now: timers.now,
        ...options,
    });
    return { history, timers };
}

describe('History', () => {
    it('keeps copies newest first', () => {
        const { history } = build();
        history.add(text('a'));
        history.add(text('b'));
        expect(history.items.map(item => item.text)).toEqual(['b', 'a']);
        expect(history.current.text).toBe('b');
    });

    it('moves a repeated copy to the top instead of duplicating it', () => {
        const { history, timers } = build();
        const first = history.add(text('a'));
        history.add(text('b'));
        timers.advance(5);
        const again = history.add(text('a'));
        expect(again.id).toBe(first.id);
        expect(again.addedAt).toBe(timers.now());
        expect(history.items.map(item => item.text)).toEqual(['a', 'b']);
    });

    it('matches images by hash', () => {
        const { history } = build();
        history.add(image('h1', MB));
        history.add(text('x'));
        history.add(image('h1', MB));
        expect(history.items).toHaveLength(2);
        expect(history.current.kind).toBe(KIND.IMAGE);
    });

    it('drops the oldest past the size cap', () => {
        const { history } = build();
        for (const value of ['a', 'b', 'c', 'd']) history.add(text(value));
        expect(history.items.map(item => item.text)).toEqual(['d', 'c', 'b']);
    });

    it('evicts the oldest images past the memory budget, keeping text', () => {
        const { history } = build({ size: 10, imageBudget: 5 * MB });
        history.add(image('old', 3 * MB));
        history.add(text('t'));
        history.add(image('new', 3 * MB));
        expect(history.items.map(item => item.hash ?? item.text)).toEqual(['new', 't']);
        expect(history.imageBytes).toBe(3 * MB);
    });

    it('rejects an image bigger than the whole budget', () => {
        const { history } = build({ imageBudget: 2 * MB });
        expect(history.add(image('big', 3 * MB))).toBeNull();
        expect(history.items).toEqual([]);
    });

    it('rejects every image when the budget is zero', () => {
        const { history } = build({ imageBudget: 0 });
        expect(history.add(image('any', 1))).toBeNull();
    });

    it('expires copies older than expireMs, and says when the next one goes', () => {
        const { history, timers } = build();
        history.add(text('old'));
        timers.advance(30_000);
        history.add(text('new'));
        expect(history.nextExpiry()).toBe(timers.now() - 30_000 + 60_000);

        timers.advance(30_000);
        expect(history.expire()).toBe(1);
        expect(history.items.map(item => item.text)).toEqual(['new']);
        expect(history.nextExpiry()).toBe(timers.now() + 30_000);
    });

    it('never expires when expireMs is zero, and has nothing to schedule', () => {
        const { history, timers } = build({ expireMs: 0 });
        history.add(text('a'));
        timers.advance(10 ** 9);
        expect(history.expire()).toBe(0);
        expect(history.nextExpiry()).toBeNull();
    });

    it('has nothing to schedule when empty', () => {
        expect(build().history.nextExpiry()).toBeNull();
    });

    it('records the latest block until the next copy or a clear', () => {
        const { history, timers } = build();
        history.block('sensitive');
        expect(history.blocked).toEqual({ reason: 'sensitive', at: timers.now() });
        history.add(text('a'));
        expect(history.blocked).toBeNull();
        history.block('ignored-app');
        history.clear();
        expect(history.blocked).toBeNull();
        expect(history.items).toEqual([]);
    });

    it('re-applies caps when reconfigured', () => {
        const { history } = build({ size: 5 });
        for (const value of ['a', 'b', 'c', 'd']) history.add(text(value));
        history.configure({ size: 2, imageBudget: 10 * MB, expireMs: 60_000 });
        expect(history.items.map(item => item.text)).toEqual(['d', 'c']);
    });

    it('notifies listeners of changes, and stops when unsubscribed', () => {
        const { history } = build();
        let calls = 0;
        const unsubscribe = history.onChange(() => (calls += 1));
        history.add(text('a'));
        history.block('sensitive');
        history.clear();
        expect(calls).toBe(3);

        unsubscribe();
        history.add(text('b'));
        expect(calls).toBe(3);
    });

    it('does not notify for a clear of nothing', () => {
        const { history } = build();
        let calls = 0;
        history.onChange(() => (calls += 1));
        history.clear();
        expect(calls).toBe(0);
    });

    it('hands out copies of its list', () => {
        const { history } = build();
        history.add(text('a'));
        history.items.pop();
        expect(history.items).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/model.test.js`
Expected: FAIL — `History is not a constructor` (not exported yet).

- [ ] **Step 3: Implement `History` in `modules/model.js`** (append below `KIND`)

```js
/**
 * Whether two entries hold the same content: text by value, images by hash.
 */
function sameContent(a, b) {
    if (a.kind !== b.kind) return false;
    return a.kind === KIND.TEXT ? a.text === b.text : a.hash === b.hash;
}

/**
 * The history itself. Memory only; nothing here can reach a disk.
 */
export class History {
    /**
     * @param {{size: number, imageBudget: number, expireMs: number,
     *   now?: function(): number}} options Caps in items, bytes and
     *   milliseconds (0 = never expire), and the clock.
     */
    constructor({ size, imageBudget, expireMs, now = () => Date.now() }) {
        this._size = size;
        this._imageBudget = imageBudget;
        this._expireMs = expireMs;
        this._now = now;
        this._items = [];
        this._nextId = 1;
        this._blocked = null;
        this._listeners = new Set();
    }

    /** @returns {number} The clock's time, in milliseconds. */
    now() {
        return this._now();
    }

    /** @returns {object[]} Items, newest first. A copy. */
    get items() {
        return [...this._items];
    }

    /** @returns {object|null} The newest item. */
    get current() {
        return this._items[0] ?? null;
    }

    /** @returns {{reason: string, at: number}|null} The last copy refused. */
    get blocked() {
        return this._blocked;
    }

    /** @returns {number} Bytes held by images. */
    get imageBytes() {
        return this._items.reduce(
            (sum, item) => sum + (item.kind === KIND.IMAGE ? item.size : 0),
            0,
        );
    }

    /**
     * Change the caps and apply them now.
     *
     * @param {{size: number, imageBudget: number, expireMs: number}} options New caps.
     */
    configure({ size, imageBudget, expireMs }) {
        this._size = size;
        this._imageBudget = imageBudget;
        this._expireMs = expireMs;
        this._trim();
        this._emit();
    }

    /**
     * Record a copy. A repeat of an existing item moves it to the top.
     *
     * @param {object} entry {kind: 'text', text} or {kind: 'image', data, size, hash}.
     * @returns {object|null} The stored item, or null for an image too big to keep.
     */
    add(entry) {
        if (entry.kind === KIND.IMAGE && entry.size > this._imageBudget) return null;

        const index = this._items.findIndex(item => sameContent(item, entry));
        let item;
        if (index === -1) {
            item = { ...entry, id: this._nextId++, addedAt: this._now() };
        } else {
            [item] = this._items.splice(index, 1);
            item.addedAt = this._now();
        }
        this._items.unshift(item);
        this._blocked = null;
        this._trim();
        this._emit();
        return item;
    }

    /**
     * Note that a copy was refused, so the menu can say so.
     *
     * @param {string} reason A REASON value from modules/privacy.js.
     */
    block(reason) {
        this._blocked = { reason, at: this._now() };
        this._emit();
    }

    /** Forget everything, including the blocked notice. */
    clear() {
        if (!this._items.length && !this._blocked) return;
        this._items = [];
        this._blocked = null;
        this._emit();
    }

    /**
     * Drop items whose time is up.
     *
     * @returns {number} How many were dropped.
     */
    expire() {
        if (!this._expireMs) return 0;
        const now = this._now();
        const before = this._items.length;
        this._items = this._items.filter(item => item.addedAt + this._expireMs > now);
        const removed = before - this._items.length;
        if (removed) this._emit();
        return removed;
    }

    /**
     * When the next item expires, so a single timer can be set for it.
     *
     * @returns {number|null} A clock time, or null when nothing will expire.
     */
    nextExpiry() {
        if (!this._expireMs || !this._items.length) return null;
        return Math.min(...this._items.map(item => item.addedAt)) + this._expireMs;
    }

    /**
     * @param {Function} callback Called after every change.
     * @returns {Function} Call to stop listening.
     */
    onChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _trim() {
        if (this._items.length > this._size) this._items.length = this._size;

        let bytes = this.imageBytes;
        for (let i = this._items.length - 1; i >= 0 && bytes > this._imageBudget; i--) {
            const item = this._items.at(i);
            if (item.kind !== KIND.IMAGE) continue;
            bytes -= item.size;
            this._items.splice(i, 1);
        }
    }

    _emit() {
        for (const listener of [...this._listeners]) listener();
    }
}
```

Update the file header's first comment block to add: "Pinned snippets are not here: they live in GSettings (modules/settings.js KEYS.PINNED) and never expire."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/model.test.js tests/transforms.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/model.js tests/model.test.js
git commit -m "feat: add the in-memory clipboard history model"
```

---

### Task 4: Privacy rules and listing helpers

**Files:**

- Create: `modules/privacy.js`, `modules/listing.js`
- Test: `tests/privacy.test.js`, `tests/listing.test.js`

**Interfaces:**

- Consumes: `KIND` (model.js).
- Produces (privacy.js): `SENSITIVE_MIME`, `IMAGE_MIME = 'image/png'`, `MAX_TEXT_CHARS = 1_000_000`, `REASON = {PAUSED, SENSITIVE, IGNORED_APP, TOO_LARGE, UNSUPPORTED}` (values `'paused'`, `'sensitive'`, `'ignored-app'`, `'too-large'`, `'unsupported'`), `VISIBLE_REASONS` (Set of SENSITIVE, IGNORED_APP, TOO_LARGE), `contentKind(mimetypes) → 'text'|'image'|null`, `shouldRecord({mimetypes, appId, paused, ignoredApps, imagesAllowed}) → {record: true, kind} | {record: false, reason}`.
- Produces (listing.js): `PREVIEW_CHARS = 60`, `fill(template, value) → string`, `preview(text, max?) → string`, `formatSize(bytes) → string`, `rowText(item, _) → string`, `blockedText(reason, _) → string`, `entries({pinned, items, query}) → Array<{pinned: boolean, index?: number, item}>`, `step(index, delta, length) → number`.

- [ ] **Step 1: Write the failing tests**

`tests/privacy.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { KIND } from '../modules/model.js';
import {
    IMAGE_MIME,
    REASON,
    SENSITIVE_MIME,
    VISIBLE_REASONS,
    contentKind,
    shouldRecord,
} from '../modules/privacy.js';

const TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING'];
const base = {
    appId: 'org.gnome.TextEditor.desktop',
    paused: false,
    ignoredApps: [],
    imagesAllowed: true,
};

describe('contentKind', () => {
    it('prefers text when both are offered', () => {
        // LibreOffice offers a picture of copied cells next to their text.
        expect(contentKind([IMAGE_MIME, 'text/plain'])).toBe(KIND.TEXT);
    });

    it('knows an image, and nothing else', () => {
        expect(contentKind([IMAGE_MIME])).toBe(KIND.IMAGE);
        expect(contentKind(['application/x-thing'])).toBeNull();
        expect(contentKind([])).toBeNull();
    });
});

describe('shouldRecord', () => {
    it('records ordinary text', () => {
        expect(shouldRecord({ ...base, mimetypes: TEXT })).toEqual({
            record: true,
            kind: KIND.TEXT,
        });
    });

    it('never records a password manager copy, whatever the case', () => {
        for (const hint of [SENSITIVE_MIME, SENSITIVE_MIME.toLowerCase()])
            expect(shouldRecord({ ...base, mimetypes: [...TEXT, hint] })).toEqual({
                record: false,
                reason: REASON.SENSITIVE,
            });
    });

    it('checks pause first, so a paused copy leaves no trace', () => {
        expect(
            shouldRecord({
                ...base,
                paused: true,
                mimetypes: [...TEXT, SENSITIVE_MIME],
            }),
        ).toEqual({ record: false, reason: REASON.PAUSED });
    });

    it('skips copies made while an ignored app is focused', () => {
        expect(
            shouldRecord({ ...base, ignoredApps: [base.appId], mimetypes: TEXT }),
        ).toEqual({ record: false, reason: REASON.IGNORED_APP });
    });

    it('does not treat an unknown focus as ignored', () => {
        expect(
            shouldRecord({ ...base, appId: '', ignoredApps: [''], mimetypes: TEXT })
                .record,
        ).toBe(true);
    });

    it('skips images when images are off, and unknown types always', () => {
        expect(
            shouldRecord({ ...base, imagesAllowed: false, mimetypes: [IMAGE_MIME] }),
        ).toEqual({ record: false, reason: REASON.UNSUPPORTED });
        expect(shouldRecord({ ...base, mimetypes: ['x/unknown'] }).reason).toBe(
            REASON.UNSUPPORTED,
        );
    });

    it('shows only the reasons a person should see', () => {
        expect([...VISIBLE_REASONS].sort()).toEqual(
            [REASON.IGNORED_APP, REASON.SENSITIVE, REASON.TOO_LARGE].sort(),
        );
    });
});
```

`tests/listing.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { KIND } from '../modules/model.js';
import {
    PREVIEW_CHARS,
    blockedText,
    entries,
    fill,
    formatSize,
    preview,
    rowText,
    step,
} from '../modules/listing.js';
import { REASON } from '../modules/privacy.js';

const _ = message => message;
const text = value => ({ kind: KIND.TEXT, text: value, id: value });

describe('preview', () => {
    it('puts everything on one line', () => {
        expect(preview('  a\n\tb   c \n')).toBe('a b c');
    });

    it('cuts long text with an ellipsis, counting code points', () => {
        const result = preview('🙂'.repeat(100), 10);
        expect(Array.from(result)).toHaveLength(10);
        expect(result.endsWith('…')).toBe(true);
        expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    });

    it('previews a 2 MB copy from its head only', () => {
        const huge = `start ${'x'.repeat(2 * 1024 * 1024)}`;
        const started = performance.now();
        const result = preview(huge);
        expect(performance.now() - started).toBeLessThan(50);
        expect(Array.from(result).length).toBeLessThanOrEqual(PREVIEW_CHARS);
        expect(result.startsWith('start x')).toBe(true);
    });

    it('marks text that was longer than it looks', () => {
        const spaced = `a${' '.repeat(1000)}b`;
        expect(preview(spaced)).toBe('a…');
    });
});

describe('rowText and formatSize', () => {
    it('describes images by size and blank text by name', () => {
        expect(rowText({ kind: KIND.IMAGE, size: 1536 }, _)).toBe('Image · 1.5 KB');
        expect(rowText(text('   '), _)).toBe('Blank text');
        expect(rowText(text('<b>hi</b>'), _)).toBe('<b>hi</b>');
    });

    it('formats sizes', () => {
        expect(formatSize(512)).toBe('512 B');
        expect(formatSize(2048)).toBe('2.0 KB');
        expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
    });
});

describe('blockedText', () => {
    it('words each visible reason', () => {
        expect(blockedText(REASON.SENSITIVE, _)).toBe('Sensitive copy skipped');
        expect(blockedText(REASON.IGNORED_APP, _)).toBe(
            'Copy in an ignored app skipped',
        );
        expect(blockedText(REASON.TOO_LARGE, _)).toBe('Too large to keep');
        expect(blockedText(REASON.PAUSED, _)).toBe('');
    });
});

describe('entries', () => {
    const items = [
        text('alpha'),
        { kind: KIND.IMAGE, size: 10, id: 'img' },
        text('beta'),
    ];

    it('lists pins first, then the history', () => {
        const rows = entries({ pinned: ['pin'], items, query: '' });
        expect(
            rows.map(row => (row.pinned ? `*${row.item.text}` : row.item.id)),
        ).toEqual(['*pin', 'alpha', 'img', 'beta']);
        expect(rows[0].index).toBe(0);
    });

    it('filters text case-insensitively and hides images while filtering', () => {
        const rows = entries({ pinned: ['Alphabet'], items, query: ' ALP ' });
        expect(rows.map(row => row.item.text)).toEqual(['Alphabet', 'alpha']);
    });
});

describe('step', () => {
    it('wraps around, and has nowhere to go in an empty list', () => {
        expect(step(-1, 1, 3)).toBe(0);
        expect(step(2, 1, 3)).toBe(0);
        expect(step(0, -1, 3)).toBe(2);
        expect(step(0, 1, 0)).toBe(-1);
    });
});

describe('fill', () => {
    it('does not read $ patterns in the value', () => {
        expect(fill('Open %s', '$&')).toBe('Open $&');
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/privacy.test.js tests/listing.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `modules/privacy.js`**

```js
// Whether a copy may be recorded at all.
//
// Imports only modules/model.js's KIND. The decision is made from the MIME
// types on offer, before anything is read, so a password manager's copy is
// never transferred into the Shell's memory in the first place.

import { KIND } from './model.js';

/**
 * The type KeePassXC and other KDE-convention password managers add to a
 * secret they copy. Its presence, not its value, is the signal.
 */
export const SENSITIVE_MIME = 'x-kde-passwordManagerHint';

/** The one image type recorded. */
export const IMAGE_MIME = 'image/png';

/** Longest text recorded. Beyond this the copy is refused, not truncated. */
export const MAX_TEXT_CHARS = 1_000_000;

const TEXT_MIMES = new Set([
    'text/plain;charset=utf-8',
    'text/plain',
    'UTF8_STRING',
    'STRING',
    'TEXT',
]);

/** Why a copy was not recorded. */
export const REASON = Object.freeze({
    PAUSED: 'paused',
    SENSITIVE: 'sensitive',
    IGNORED_APP: 'ignored-app',
    TOO_LARGE: 'too-large',
    UNSUPPORTED: 'unsupported',
});

/** Reasons the menu shows as a row, so protection is visible. */
export const VISIBLE_REASONS = new Set([
    REASON.SENSITIVE,
    REASON.IGNORED_APP,
    REASON.TOO_LARGE,
]);

/**
 * What a copy holds, from its MIME types. Text wins when both are offered.
 *
 * @param {string[]} mimetypes Types on offer.
 * @returns {string|null} A KIND value, or null for anything else.
 */
export function contentKind(mimetypes) {
    if (mimetypes.some(mime => TEXT_MIMES.has(mime))) return KIND.TEXT;
    if (mimetypes.includes(IMAGE_MIME)) return KIND.IMAGE;
    return null;
}

/**
 * @param {{mimetypes: string[], appId: string, paused: boolean,
 *   ignoredApps: string[], imagesAllowed: boolean}} copy The copy and the
 *   state it was made in.
 * @returns {{record: true, kind: string}|{record: false, reason: string}} The decision.
 */
export function shouldRecord({ mimetypes, appId, paused, ignoredApps, imagesAllowed }) {
    if (paused) return { record: false, reason: REASON.PAUSED };

    const hint = SENSITIVE_MIME.toLowerCase();
    if (mimetypes.some(mime => mime.toLowerCase() === hint))
        return { record: false, reason: REASON.SENSITIVE };

    if (appId && ignoredApps.includes(appId))
        return { record: false, reason: REASON.IGNORED_APP };

    const kind = contentKind(mimetypes);
    if (!kind || (kind === KIND.IMAGE && !imagesAllowed))
        return { record: false, reason: REASON.UNSUPPORTED };

    return { record: true, kind };
}
```

- [ ] **Step 4: Write `modules/listing.js`**

```js
// How history items read in a menu or the popup, and which ones show.
//
// Imports only pure modules. Every string built here is set as a label's
// `text`, never as markup, so a copy of "<b>" shows as exactly that.

import { KIND } from './model.js';
import { REASON } from './privacy.js';

/** Characters shown for a text item. */
export const PREVIEW_CHARS = 60;

/**
 * How far into a copy a preview looks. Collapsing whitespace across a
 * multi-megabyte copy on every menu build would stall the Shell.
 */
const SCAN_CHARS = PREVIEW_CHARS * 4;

/**
 * Put a value into a translated "%s" template. A function replacer keeps a
 * "$&" in the value from being read as a replacement pattern.
 */
export function fill(template, value) {
    return template.replace('%s', () => value);
}

/**
 * One line of text: whitespace collapsed, cut to max code points with an
 * ellipsis when anything was left out. Only the head of a long copy is
 * scanned.
 *
 * @param {string} text Any text.
 * @param {number} [max] Most characters to show.
 * @returns {string} The preview; '' for blank text.
 */
export function preview(text, max = PREVIEW_CHARS) {
    const head = text.slice(0, SCAN_CHARS);
    const flat = head.replace(/\s+/g, ' ').trim();
    const chars = Array.from(flat);
    // trim() on the tail only looks at its ends, so this stays cheap on a
    // multi-megabyte copy.
    const cut = head.length < text.length && text.slice(head.length).trim() !== '';
    if (chars.length <= max && !cut) return flat;
    return `${chars.slice(0, max - 1).join('')}…`;
}

/** A byte count for people. */
export function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The label for one item.
 *
 * @param {object} item A history item or pinned-text item.
 * @param {Function} _ gettext.
 * @returns {string} Its row text.
 */
export function rowText(item, _) {
    if (item.kind === KIND.IMAGE) return fill(_('Image · %s'), formatSize(item.size));
    return preview(item.text) || _('Blank text');
}

/**
 * The row shown for a refused copy.
 *
 * @param {string} reason A REASON value.
 * @param {Function} _ gettext.
 * @returns {string} Row text, or '' for reasons that get no row.
 */
export function blockedText(reason, _) {
    switch (reason) {
        case REASON.SENSITIVE:
            return _('Sensitive copy skipped');
        case REASON.IGNORED_APP:
            return _('Copy in an ignored app skipped');
        case REASON.TOO_LARGE:
            return _('Too large to keep');
        default:
            return '';
    }
}

/**
 * Pinned snippets then history, filtered by a query. Images have no text to
 * match, so they are hidden while a query is typed.
 *
 * @param {{pinned: string[], items: object[], query?: string}} source What to list.
 * @returns {Array<{pinned: boolean, index?: number, item: object}>} Rows.
 */
export function entries({ pinned, items, query = '' }) {
    const needle = query.trim().toLowerCase();
    const match = text => !needle || text.toLowerCase().includes(needle);

    const rows = [];
    pinned.forEach((text, index) => {
        if (match(text))
            rows.push({ pinned: true, index, item: { kind: KIND.TEXT, text } });
    });
    for (const item of items) {
        const shown = item.kind === KIND.IMAGE ? !needle : match(item.text);
        if (shown) rows.push({ pinned: false, item });
    }
    return rows;
}

/**
 * Move a selection, wrapping at both ends.
 *
 * @returns {number} The new index, or -1 for an empty list.
 */
export function step(index, delta, length) {
    if (length === 0) return -1;
    return (((index + delta) % length) + length) % length;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/privacy.test.js tests/listing.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/privacy.js modules/listing.js tests/privacy.test.js tests/listing.test.js
git commit -m "feat: add privacy rules and history row helpers"
```

---

### Task 5: Clipboard adapter and recorder

**Files:**

- Create: `modules/clipboard.js`, `modules/recorder.js`
- Test: `tests/recorder.test.js`

**Interfaces:**

- Consumes: `History`, `KIND` (model.js); `shouldRecord`, `REASON`, `VISIBLE_REASONS`, `MAX_TEXT_CHARS` (privacy.js); `KEYS`, `SettingsWatcher`, `historyOptions` (settings.js).
- Produces: `ClipboardSource` with `start(onChange)`, `stop()`, `mimetypes() → string[]`, `focusedAppId() → string`, `readText() → Promise<string|null>`, `readImage() → Promise<{data, size, hash}|null>`, `writeText(text)`, `writeImage(data)`, `destroy()`. `Recorder` with `constructor({source, history, settings, timers})`, `start()`, `listen()`, `deafen()`, `get listening`, `copy(item)`, `copyText(text)`, `destroy()`.

- [ ] **Step 1: Write the failing test**

`tests/recorder.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { History, KIND } from '../modules/model.js';
import { MAX_TEXT_CHARS, REASON, SENSITIVE_MIME } from '../modules/privacy.js';
import { Recorder } from '../modules/recorder.js';
import { KEYS, historyOptions } from '../modules/settings.js';
import {
    MB,
    createClipboard,
    createSettings,
    createTimers,
    flush,
} from './support/world.js';

function build(values = {}) {
    const timers = createTimers();
    const settings = createSettings(values);
    const history = new History({ ...historyOptions(settings), now: timers.now });
    const clip = createClipboard();
    const recorder = new Recorder({ source: clip, history, settings, timers });
    recorder.start();
    return { timers, settings, history, clip, recorder };
}

const texts = history => history.items.map(item => item.text ?? item.hash);

beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Recorder', () => {
    it('records text and logs the kind, never the content', async () => {
        const { clip, history } = build();
        clip.copyText('hunter2 is my password');
        await flush();

        expect(texts(history)).toEqual(['hunter2 is my password']);
        expect(console.debug).toHaveBeenCalledWith('[quickclip] recorded text');
        for (const [line] of console.debug.mock.calls)
            expect(line).not.toContain('hunter2');
    });

    it('never reads a password manager copy', async () => {
        const { clip, history } = build();
        clip.copyText('s3cret', { mimes: ['text/plain', SENSITIVE_MIME] });
        await flush();

        expect(clip.reads).toBe(0);
        expect(history.items).toEqual([]);
        expect(history.blocked.reason).toBe(REASON.SENSITIVE);
    });

    it('skips ignored apps and says so', async () => {
        const { clip, history } = build({
            [KEYS.IGNORED_APPS]: ['org.keepassxc.KeePassXC.desktop'],
        });
        clip.copyText('x', { appId: 'org.keepassxc.KeePassXC.desktop' });
        await flush();

        expect(clip.reads).toBe(0);
        expect(history.blocked.reason).toBe(REASON.IGNORED_APP);
    });

    it('records nothing while paused, and shows no row for it', async () => {
        const { clip, history } = build({ [KEYS.PAUSED]: true });
        clip.copyText('x');
        await flush();

        expect(history.items).toEqual([]);
        expect(history.blocked).toBeNull();
    });

    it('refuses text over the limit', async () => {
        const { clip, history } = build();
        clip.copyText('x'.repeat(MAX_TEXT_CHARS + 1));
        await flush();

        expect(history.items).toEqual([]);
        expect(history.blocked.reason).toBe(REASON.TOO_LARGE);
    });

    it('ignores an empty copy', async () => {
        const { clip, history } = build();
        clip.copyText('');
        await flush();
        expect(history.items).toEqual([]);
    });

    it('records images, and refuses one bigger than the budget', async () => {
        const { clip, history } = build({ [KEYS.IMAGE_BUDGET_MB]: 1 });
        clip.copyImage({ data: 'png', size: 1000, hash: 'h1' });
        await flush();
        expect(history.current.kind).toBe(KIND.IMAGE);

        clip.copyImage({ data: 'big', size: 2 * MB, hash: 'h2' });
        await flush();
        expect(texts(history)).toEqual(['h1']);
        expect(history.blocked.reason).toBe(REASON.TOO_LARGE);
    });

    it('does not read images at all when the budget is zero', async () => {
        const { clip, history } = build({ [KEYS.IMAGE_BUDGET_MB]: 0 });
        clip.copyImage({ data: 'png', size: 10, hash: 'h' });
        await flush();
        expect(clip.reads).toBe(0);
        expect(history.blocked).toBeNull();
    });

    it('drops a read that a newer copy superseded', async () => {
        const { clip, history } = build();
        clip.deferred = true;
        clip.copyText('first');
        clip.copyText('second');
        clip.release();
        await flush();

        expect(texts(history)).toEqual(['second']);
    });

    it('records nothing after deafen, even for a read already in flight', async () => {
        const { clip, history, recorder } = build();
        clip.deferred = true;
        clip.copyText('late');
        recorder.deafen();
        clip.release();
        await flush();

        expect(history.items).toEqual([]);
        expect(clip.listening).toBe(false);
        expect(recorder.listening).toBe(false);
    });

    it('moves a re-copied item to the top without a duplicate', async () => {
        const { clip, history, recorder } = build();
        clip.copyText('a');
        await flush();
        clip.copyText('b');
        await flush();

        recorder.copy(history.items[1]);
        expect(clip.writes).toEqual([['text', 'a']]);
        // The Shell then reports QuickClip's own write as a new owner.
        clip.copyText('a');
        await flush();

        expect(texts(history)).toEqual(['a', 'b']);
    });

    it('writes images back as images', () => {
        const { clip, recorder } = build();
        recorder.copy({ kind: KIND.IMAGE, data: 'bytes', size: 5, hash: 'h' });
        recorder.copyText('t');
        expect(clip.writes).toEqual([
            ['image', 'bytes'],
            ['text', 't'],
        ]);
    });

    it('sets one timer for the next expiry, and none when empty', async () => {
        const { clip, history, timers } = build({ [KEYS.EXPIRE_MINUTES]: 1 });
        expect(timers.pending).toBe(0);

        clip.copyText('a');
        await flush();
        expect(timers.pending).toBe(1);

        timers.advance(60_000);
        expect(history.items).toEqual([]);
        expect(timers.pending).toBe(0);
    });

    it('sets no timer when expiry is off', async () => {
        const { clip, timers } = build({ [KEYS.EXPIRE_MINUTES]: 0 });
        clip.copyText('a');
        await flush();
        expect(timers.pending).toBe(0);
    });

    it('applies a new history size at once', async () => {
        const { clip, history, settings } = build();
        for (const value of ['a', 'b', 'c']) {
            clip.copyText(value);
            await flush();
        }
        settings.set_int(KEYS.HISTORY_SIZE, 5);
        settings.set_int(KEYS.HISTORY_SIZE, 1);
        expect(texts(history)).toEqual(['c']);
    });

    it('lets go of everything on destroy', async () => {
        const { clip, settings, recorder, timers } = build();
        clip.copyText('a');
        await flush();

        recorder.destroy();
        recorder.destroy();

        expect(clip.listening).toBe(false);
        expect(timers.pending).toBe(0);
        expect(settings.connected.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/recorder.test.js`
Expected: FAIL — `../modules/recorder.js` not found.

- [ ] **Step 3: Write `modules/clipboard.js`**

```js
// The Shell's clipboard, as modules/recorder.js needs it.
//
// Plumbing only, and excluded from coverage (see vitest.config.js): every
// decision about a copy — whether to record it, what it is, how long to keep
// it — lives in modules/privacy.js, modules/recorder.js and modules/model.js.
//
// Nothing here runs at import time.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { IMAGE_MIME } from './privacy.js';

const CLIPBOARD = St.ClipboardType.CLIPBOARD;

export class ClipboardSource {
    constructor() {
        this._selection = null;
        this._ownerId = 0;
    }

    /**
     * Call onChange whenever something new owns the clipboard (not the
     * primary selection).
     *
     * @param {Function} onChange Called with no arguments.
     */
    start(onChange) {
        this.stop();
        this._selection = global.display.get_selection();
        this._ownerId = this._selection.connect('owner-changed', (_selection, type) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD) onChange();
        });
    }

    stop() {
        if (this._ownerId) this._selection.disconnect(this._ownerId);
        this._ownerId = 0;
        this._selection = null;
    }

    /** @returns {string[]} MIME types on offer. Reads no content. */
    mimetypes() {
        return St.Clipboard.get_default().get_mimetypes(CLIPBOARD) ?? [];
    }

    /** @returns {string} The focused app's desktop id, or ''. */
    focusedAppId() {
        return Shell.WindowTracker.get_default().focus_app?.get_id() ?? '';
    }

    /** @returns {Promise<string|null>} The clipboard's text. */
    readText() {
        return new Promise(resolve => {
            St.Clipboard.get_default().get_text(CLIPBOARD, (_clipboard, text) =>
                resolve(text ?? null),
            );
        });
    }

    /** @returns {Promise<{data: GLib.Bytes, size: number, hash: string}|null>} The PNG. */
    readImage() {
        return new Promise(resolve => {
            St.Clipboard.get_default().get_content(
                CLIPBOARD,
                IMAGE_MIME,
                (_clipboard, bytes) => {
                    const size = bytes?.get_size() ?? 0;
                    if (!size) {
                        resolve(null);
                        return;
                    }
                    resolve({
                        data: bytes,
                        size,
                        hash: GLib.compute_checksum_for_bytes(
                            GLib.ChecksumType.SHA256,
                            bytes,
                        ),
                    });
                },
            );
        });
    }

    writeText(text) {
        St.Clipboard.get_default().set_text(CLIPBOARD, text);
    }

    writeImage(data) {
        St.Clipboard.get_default().set_content(CLIPBOARD, IMAGE_MIME, data);
    }

    destroy() {
        this.stop();
    }
}
```

- [ ] **Step 4: Write `modules/recorder.js`**

```js
// Turns clipboard changes into history, and history into one expiry timer.
//
// The source is modules/clipboard.js's ClipboardSource in the Shell and a fake
// under Vitest. Reads are asynchronous, so every change bumps a generation
// counter and a read that finishes after a newer change, or after deafen(),
// is dropped rather than recorded out of order.
//
// Logs carry the kind of copy or the reason it was skipped, never its content.

import { KIND } from './model.js';
import { MAX_TEXT_CHARS, REASON, VISIBLE_REASONS, shouldRecord } from './privacy.js';
import { KEYS, SettingsWatcher, historyOptions } from './settings.js';

export class Recorder {
    /**
     * @param {{source: object, history: History, settings: Gio.Settings,
     *   timers?: {setTimeout: Function, clearTimeout: Function}}} options
     *   The clipboard, the history to fill, the settings, and the timer API
     *   (GJS's globals by default).
     */
    constructor({ source, history, settings, timers = globalThis }) {
        this._source = source;
        this._history = history;
        this._settings = settings;
        this._timers = timers;
        this._generation = 0;
        this._listening = false;
        this._timer = null;
        this._watcher = null;
        this._unsubscribe = null;
    }

    start() {
        this._watcher = new SettingsWatcher(this._settings);
        for (const key of [
            KEYS.HISTORY_SIZE,
            KEYS.IMAGE_BUDGET_MB,
            KEYS.EXPIRE_MINUTES,
        ])
            this._watcher.watch(key, () =>
                this._history.configure(historyOptions(this._settings)),
            );
        this._unsubscribe = this._history.onChange(() => this._schedule());
        this.listen();
    }

    /** @returns {boolean} Whether copies are being watched. */
    get listening() {
        return this._listening;
    }

    /** Start watching the clipboard. Idempotent. */
    listen() {
        if (this._listening) return;
        // The handler's promise is deliberately not awaited: owner-changed is
        // a signal, and _onOwnerChanged catches its own failures.
        this._source.start(() => void this._onOwnerChanged());
        this._listening = true;
    }

    /** Stop watching, and drop any read in flight. Idempotent. */
    deafen() {
        if (!this._listening) return;
        this._source.stop();
        this._listening = false;
        this._generation += 1;
    }

    /** Put a history or pinned item back on the clipboard. */
    copy(item) {
        if (item.kind === KIND.IMAGE) this._source.writeImage(item.data);
        else this._source.writeText(item.text);
    }

    /** Put text on the clipboard. */
    copyText(text) {
        this._source.writeText(text);
    }

    async _onOwnerChanged() {
        const generation = ++this._generation;
        const decision = shouldRecord({
            mimetypes: this._source.mimetypes(),
            appId: this._source.focusedAppId(),
            paused: this._settings.get_boolean(KEYS.PAUSED),
            ignoredApps: this._settings.get_strv(KEYS.IGNORED_APPS),
            imagesAllowed: this._settings.get_int(KEYS.IMAGE_BUDGET_MB) > 0,
        });

        if (!decision.record) {
            this._skip(decision.reason);
            return;
        }

        let entry;
        try {
            entry =
                decision.kind === KIND.TEXT
                    ? await this._readText()
                    : await this._readImage();
        } catch (error) {
            console.debug(`[quickclip] could not read the clipboard: ${error.message}`);
            return;
        }

        if (generation !== this._generation || !this._listening || !entry) return;
        if (entry.tooLarge || !this._history.add(entry)) {
            this._skip(REASON.TOO_LARGE);
            return;
        }
        console.debug(`[quickclip] recorded ${entry.kind}`);
    }

    _skip(reason) {
        if (VISIBLE_REASONS.has(reason)) this._history.block(reason);
        console.debug(`[quickclip] skipped ${reason}`);
    }

    async _readText() {
        const text = await this._source.readText();
        if (!text) return null;
        if (text.length > MAX_TEXT_CHARS) return { tooLarge: true };
        return { kind: KIND.TEXT, text };
    }

    async _readImage() {
        const image = await this._source.readImage();
        return image && { kind: KIND.IMAGE, ...image };
    }

    /** One timer, for the next item to expire; none when nothing will. */
    _schedule() {
        if (this._timer !== null) this._timers.clearTimeout(this._timer);
        this._timer = null;

        const at = this._history.nextExpiry();
        if (at === null) return;
        this._timer = this._timers.setTimeout(
            () => {
                this._timer = null;
                this._history.expire();
                this._schedule();
            },
            Math.max(0, at - this._history.now()),
        );
    }

    destroy() {
        this.deafen();
        if (this._timer !== null) this._timers.clearTimeout(this._timer);
        this._timer = null;
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._watcher?.release();
        this._watcher = null;
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/recorder.test.js`
Expected: PASS. Note `flush()` uses `setImmediate`, which `createTimers` does not fake, so async reads settle.

- [ ] **Step 6: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/clipboard.js modules/recorder.js tests/recorder.test.js
git commit -m "feat: record clipboard changes into the history"
```

---

### Task 6: Auto-paste

**Files:**

- Create: `modules/paste.js`
- Test: `tests/paste.test.js`

**Interfaces:**

- Consumes: Clutter keysyms and virtual devices.
- Produces: `pasteKeys(appId, terminalApps) → number[]` (keyvals); `Paster` with `constructor({seat?, clock?})`, `paste(keys) → boolean`, `destroy()`.

- [ ] **Step 1: Write the failing test**

`tests/paste.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Clutter, { virtualSeat } from './stubs/gi-clutter.js';
import { Paster, pasteKeys } from '../modules/paste.js';
import { DEFAULT_TERMINALS } from '../modules/settings.js';

const { KEY_Control_L: CTRL, KEY_Shift_L: SHIFT, KEY_v: V } = Clutter;
const { PRESSED, RELEASED } = Clutter.KeyState;

beforeEach(() => {
    virtualSeat.reset();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('pasteKeys', () => {
    it('uses Ctrl+V in ordinary apps and Ctrl+Shift+V in terminals', () => {
        expect(pasteKeys('org.gnome.TextEditor.desktop', DEFAULT_TERMINALS)).toEqual([
            CTRL,
            V,
        ]);
        expect(pasteKeys('com.mitchellh.ghostty.desktop', DEFAULT_TERMINALS)).toEqual([
            CTRL,
            SHIFT,
            V,
        ]);
        expect(pasteKeys('', DEFAULT_TERMINALS)).toEqual([CTRL, V]);
    });
});

describe('Paster', () => {
    it('presses in order and releases in reverse, on one device', () => {
        const paster = new Paster();
        expect(paster.paste([CTRL, SHIFT, V])).toBe(true);
        expect(paster.paste([CTRL, V])).toBe(true);

        expect(virtualSeat.devices).toHaveLength(1);
        expect(virtualSeat.devices[0].type).toBe(
            Clutter.InputDeviceType.KEYBOARD_DEVICE,
        );
        expect(virtualSeat.devices[0].events.slice(0, 6)).toEqual([
            [CTRL, PRESSED],
            [SHIFT, PRESSED],
            [V, PRESSED],
            [V, RELEASED],
            [SHIFT, RELEASED],
            [CTRL, RELEASED],
        ]);
    });

    it('reports failure when no virtual keyboard can be made', () => {
        virtualSeat.fail = true;
        const paster = new Paster();
        expect(paster.paste([CTRL, V])).toBe(false);
        expect(console.debug).toHaveBeenCalledWith(
            '[quickclip] no virtual keyboard: no virtual devices on this seat',
        );
    });

    it('makes a new device after destroy', () => {
        const paster = new Paster();
        paster.paste([CTRL, V]);
        paster.destroy();
        paster.paste([CTRL, V]);
        expect(virtualSeat.devices).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/paste.test.js`
Expected: FAIL — `../modules/paste.js` not found.

- [ ] **Step 3: Write `modules/paste.js`**

```js
// Paste into the focused window by typing the paste shortcut on a virtual
// keyboard, as Clipboard Indicator does. Wayland offers an extension no other
// way to paste into another client.
//
// Terminals take Ctrl+Shift+V, because Ctrl+V is a control character there.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

/**
 * The keys that paste in an app.
 *
 * @param {string} appId Focused app's desktop id, or ''.
 * @param {string[]} terminalApps Desktop ids that paste with Ctrl+Shift+V.
 * @returns {number[]} Keyvals, in press order.
 */
export function pasteKeys(appId, terminalApps) {
    return appId && terminalApps.includes(appId)
        ? [Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v]
        : [Clutter.KEY_Control_L, Clutter.KEY_v];
}

export class Paster {
    /**
     * @param {{seat?: function(): Clutter.Seat, clock?: function(): number}}
     *   [options] Where the seat and the event time (microseconds) come from.
     */
    constructor({
        seat = () => Clutter.get_default_backend().get_default_seat(),
        clock = () => GLib.get_monotonic_time(),
    } = {}) {
        this._seat = seat;
        this._clock = clock;
        this._device = null;
    }

    /**
     * Type a key chord: every key down in order, then up in reverse.
     *
     * @param {number[]} keys Keyvals from pasteKeys.
     * @returns {boolean} False when no virtual keyboard is available.
     */
    paste(keys) {
        if (!this._device) {
            try {
                this._device = this._seat().create_virtual_device(
                    Clutter.InputDeviceType.KEYBOARD_DEVICE,
                );
            } catch (error) {
                console.debug(`[quickclip] no virtual keyboard: ${error.message}`);
                return false;
            }
            if (!this._device) return false;
        }

        const time = this._clock();
        for (const key of keys)
            this._device.notify_keyval(time, key, Clutter.KeyState.PRESSED);
        for (const key of [...keys].reverse())
            this._device.notify_keyval(time, key, Clutter.KeyState.RELEASED);
        return true;
    }

    destroy() {
        this._device = null;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/paste.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/paste.js tests/paste.test.js
git commit -m "feat: paste through a virtual keyboard"
```

---

### Task 7: Quick Settings tile

**Files:**

- Create: `modules/panel.js`, `stylesheet.css`
- Test: `tests/panel.test.js`

**Interfaces:**

- Consumes: `History`, `KIND`; `applicable` (transforms.js); `blockedText`, `fill`, `rowText` (listing.js); `KEYS`, `SettingsWatcher` (settings.js).
- Produces: `Panel` with `constructor({settings, history, transforms, actions, iconPath, gettext, ngettext})`, `enable()`, `sync()`, `disable()`. `actions` shape (implemented by Task 9's controller): `{copy(item), copyText(text), pin(text), unpin(index), clear(), setPaused(paused), transform(transform), openPrefs()}`.

- [ ] **Step 1: Write the failing test**

`tests/panel.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';

import * as Main from './stubs/shell-main.js';
import { descendants, liveHandlers, resetActors } from './support/actors.js';
import { History, KIND } from '../modules/model.js';
import { Panel } from '../modules/panel.js';
import { REASON } from '../modules/privacy.js';
import { KEYS } from '../modules/settings.js';
import { createTransforms } from '../modules/transforms.js';
import { MB, createSettings, createTimers } from './support/world.js';

const _ = message => message;
const ngettext = (one, many, count) => (count === 1 ? one : many);

function build(values = {}) {
    const timers = createTimers();
    const settings = createSettings(values);
    const history = new History({
        size: 20,
        imageBudget: 32 * MB,
        expireMs: 0,
        now: timers.now,
    });
    const calls = [];
    const record =
        name =>
        (...args) =>
            calls.push([name, ...args]);
    const actions = {
        copy: record('copy'),
        copyText: record('copyText'),
        pin: record('pin'),
        unpin: record('unpin'),
        clear: record('clear'),
        setPaused: record('setPaused'),
        transform: record('transform'),
        openPrefs: record('openPrefs'),
    };
    const panel = new Panel({
        settings,
        history,
        transforms: createTransforms({ uuid: () => 'u', now: timers.now }),
        actions,
        iconPath: '/icons/quickclip-symbolic.svg',
        gettext: _,
        ngettext,
    });
    panel.enable();
    const toggle = Main.externalIndicators.at(-1).indicator.quickSettingsItems[0];
    return { settings, history, panel, toggle, calls };
}

const all = toggle => descendants(toggle.menu);
const rowWith = (toggle, text) =>
    all(toggle).find(actor => actor.label?.text === text || actor.text === text);
const buttonNamed = (row, name) =>
    descendants(row).find(actor => actor.accessible_name === name);

beforeEach(() => {
    Main.reset();
    resetActors();
});

describe('Panel', () => {
    it('adds one tile that reads Recording', () => {
        const { toggle } = build();
        expect(Main.externalIndicators).toHaveLength(1);
        expect(toggle.title).toBe('QuickClip');
        expect(toggle.subtitle).toBe('Recording');
        expect(toggle.checked).toBe(true);
    });

    it('pauses from a click and shows it', () => {
        const { toggle, calls, settings } = build();
        toggle.click();
        expect(calls).toContainEqual(['setPaused', true]);

        settings.set_boolean(KEYS.PAUSED, true);
        expect(toggle.subtitle).toBe('Paused');
        expect(toggle.checked).toBe(false);
    });

    it('lists recent copies newest first and copies one when activated', () => {
        const { toggle, history, calls } = build();
        history.add({ kind: KIND.TEXT, text: 'older' });
        const newer = history.add({ kind: KIND.TEXT, text: 'newer' });

        const labels = all(toggle)
            .filter(actor => ['older', 'newer'].includes(actor.label?.text))
            .map(actor => actor.label.text);
        expect(labels).toEqual(['newer', 'newer', 'older']); // current row + recent rows

        const rows = all(toggle).filter(
            actor => actor.label?.text === 'newer' && actor.activate,
        );
        rows.at(-1).activate();
        expect(calls).toContainEqual(['copy', newer]);
    });

    it('pins text but offers no pin for images', () => {
        const { toggle, history, calls } = build();
        history.add({ kind: KIND.IMAGE, data: 'png', size: 2048, hash: 'h' });
        history.add({ kind: KIND.TEXT, text: 'keep me' });

        const textRow = all(toggle)
            .filter(actor => actor.label?.text === 'keep me')
            .at(-1);
        buttonNamed(textRow, 'Pin').click();
        expect(calls).toContainEqual(['pin', 'keep me']);

        const imageRow = all(toggle).find(
            actor => actor.label?.text === 'Image · 2.0 KB',
        );
        expect(buttonNamed(imageRow, 'Pin')).toBeUndefined();
    });

    it('shows pinned snippets that copy and unpin', () => {
        const { toggle, calls } = build({ [KEYS.PINNED]: ['alpha', 'beta'] });
        const beta = rowWith(toggle, 'beta');
        beta.activate();
        buttonNamed(beta, 'Unpin').click();
        expect(calls).toContainEqual(['copyText', 'beta']);
        expect(calls).toContainEqual(['unpin', 1]);
    });

    it('shows a blocked copy as a row that cannot be clicked', () => {
        const { toggle, history } = build();
        history.block(REASON.SENSITIVE);
        const row = rowWith(toggle, 'Sensitive copy skipped');
        expect(row).toBeDefined();
        expect(row.sensitive ?? row.reactive).toBe(false);
    });

    it('offers only the transforms that apply to the current item', () => {
        const { toggle, history, calls } = build();
        history.add({ kind: KIND.TEXT, text: '{"a":1}' });

        const pretty = rowWith(toggle, 'Pretty-print JSON');
        expect(pretty).toBeDefined();
        expect(rowWith(toggle, 'URL decode')).toBeUndefined();
        pretty.activate();
        expect(calls.find(call => call[0] === 'transform')[1].id).toBe('json-pretty');
    });

    it('shows markup literally on one line', () => {
        const { toggle, history } = build();
        history.add({ kind: KIND.TEXT, text: '<b>bold</b>\nnext' });
        const row = rowWith(toggle, '<b>bold</b> next');
        expect(row).toBeDefined();
        for (const actor of all(toggle))
            if (actor.clutter_text) expect(actor.clutter_text.use_markup).toBe(false);
    });

    it('reuses one thumbnail per image across rebuilds', () => {
        const { toggle, history } = build();
        history.add({ kind: KIND.IMAGE, data: 'png', size: 10, hash: 'h' });
        const first = all(toggle).find(actor => actor.gicon?.bytes === 'png').gicon;
        history.add({ kind: KIND.TEXT, text: 'x' });
        const second = all(toggle).find(actor => actor.gicon?.bytes === 'png').gicon;
        expect(second).toBe(first);
    });

    it('clears and opens preferences from the menu', () => {
        const { toggle, calls } = build();
        rowWith(toggle, 'Clear history').activate();
        rowWith(toggle, 'Preferences').activate();
        expect(calls).toContainEqual(['clear']);
        expect(calls).toContainEqual(['openPrefs']);
    });

    it('releases every handler on disable', () => {
        const before = liveHandlers.size;
        const { panel, settings, history } = build();
        panel.disable();
        panel.disable();

        expect(liveHandlers.size).toBe(before);
        expect(settings.connected.size).toBe(0);
        let calls = 0;
        history.onChange(() => (calls += 1));
        history.add({ kind: KIND.TEXT, text: 'after' });
        expect(calls).toBe(1); // only this test's listener is left
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/panel.test.js`
Expected: FAIL — `../modules/panel.js` not found.

- [ ] **Step 3: Write `modules/panel.js`**

```js
// The Quick Settings tile and its menu.
//
// Nothing here decides anything. What is listed comes from History and the
// pinned setting; what a click does is one of the `actions` the controller
// handed in. Every string from the clipboard is set as `text`, never markup.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { blockedText, fill, rowText } from './listing.js';
import { KIND } from './model.js';
import { KEYS, SettingsWatcher } from './settings.js';
import { applicable } from './transforms.js';

const ICONS = Object.freeze({
    PIN: 'non-starred-symbolic',
    UNPIN: 'starred-symbolic',
});

/** A small icon button placed at the end of a menu row. */
function rowButton(iconName, accessibleName, onClick) {
    const button = new St.Button({
        style_class: 'icon-button quickclip-row-button',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({ icon_name: iconName }),
    });
    button.connect('clicked', onClick);
    return button;
}

/** A menu row whose label ellipsizes rather than widening the menu. */
function textRow(text, props = {}) {
    const row = new PopupMenu.PopupMenuItem(text, props);
    row.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    row.label.x_expand = true;
    return row;
}

/** A row that says something and cannot be clicked. */
function noteRow(text, styleClass = '') {
    const row = textRow(text, {
        reactive: false,
        can_focus: false,
        style_class: styleClass,
    });
    row.setSensitive(false);
    return row;
}

const QuickClipToggle = GObject.registerClass(
    class QuickClipToggle extends QuickSettings.QuickMenuToggle {
        /**
         * @param {{gicon: Gio.Icon, gettext: Function, ngettext: Function,
         *   actions: object, transforms: ReadonlyArray<object>}} options
         */
        _init({ gicon, gettext: _, ngettext, actions, transforms }) {
            // toggleMode: a click flips checked, and checked means recording.
            super._init({ title: 'QuickClip', gicon, toggleMode: true });

            this._gicon = gicon;
            this._gettext = _;
            this._ngettext = ngettext;
            this._actions = actions;
            this._transforms = transforms;
            // Item id -> icon, so St does not decode a PNG on every rebuild.
            this._thumbs = new Map();

            this._current = new PopupMenu.PopupMenuSection();
            this._pinned = new PopupMenu.PopupMenuSection();
            this._recent = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this._current);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Pinned')));
            this.menu.addMenuItem(this._pinned);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Recent')));
            this.menu.addMenuItem(this._recent);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const clear = new PopupMenu.PopupMenuItem(_('Clear history'));
            clear.connect('activate', () => this._actions?.clear());
            this.menu.addMenuItem(clear);
            const prefs = new PopupMenu.PopupMenuItem(_('Preferences'));
            prefs.connect('activate', () => this._actions?.openPrefs());
            this.menu.addMenuItem(prefs);

            this.connectObject(
                'clicked',
                () => this._actions?.setPaused(!this.checked),
                this,
            );
            // A plain connect, as ButtonBox does: connectObject with this as its
            // own owner could be released by the destroy it is meant to handle.
            this.connect('destroy', () => this._onDestroy());
        }

        /**
         * @param {{items: object[], current: object|null, blocked: object|null,
         *   pinned: string[], paused: boolean}} state What to show.
         */
        sync({ items, current, blocked, pinned, paused }) {
            const _ = this._gettext;
            this.checked = !paused;
            this.subtitle = paused ? _('Paused') : _('Recording');
            this.menu.setHeader(
                this._gicon,
                _('Clipboard'),
                fill(
                    this._ngettext('%s item', '%s items', items.length),
                    String(items.length),
                ),
            );

            this._syncCurrent(current);
            this._syncPinned(pinned);
            this._syncRecent(items, blocked);

            const live = new Set(items.map(item => item.id));
            for (const id of [...this._thumbs.keys()])
                if (!live.has(id)) this._thumbs.delete(id);
        }

        _thumb(item) {
            if (!this._thumbs.has(item.id))
                this._thumbs.set(item.id, new Gio.BytesIcon({ bytes: item.data }));
            return this._thumbs.get(item.id);
        }

        _withThumb(row, item) {
            if (item.kind === KIND.IMAGE)
                row.insert_child_at_index(
                    new St.Icon({
                        gicon: this._thumb(item),
                        style_class: 'quickclip-thumb',
                    }),
                    1,
                );
            return row;
        }

        _syncCurrent(current) {
            const _ = this._gettext;
            this._current.removeAll();

            const text = current ? rowText(current, _) : _('Clipboard is empty');
            const row = this._withThumb(
                noteRow(text, 'quickclip-current'),
                current ?? {},
            );
            this._current.addMenuItem(row);

            const choices = applicable(this._transforms, current);
            const submenu = new PopupMenu.PopupSubMenuMenuItem(_('Transform'), false);
            for (const transform of choices) {
                const item = new PopupMenu.PopupMenuItem(_(transform.label));
                item.connect('activate', () => this._actions?.transform(transform));
                submenu.menu.addMenuItem(item);
            }
            this._current.addMenuItem(submenu);
        }

        _syncPinned(pinned) {
            const _ = this._gettext;
            this._pinned.removeAll();
            if (!pinned.length) {
                this._pinned.addMenuItem(
                    noteRow(_('Pin text from Recent to keep it here')),
                );
                return;
            }
            pinned.forEach((text, index) => {
                const row = textRow(rowText({ kind: KIND.TEXT, text }, _));
                row.connect('activate', () => this._actions?.copyText(text));
                row.add_child(
                    rowButton(ICONS.UNPIN, _('Unpin'), () =>
                        this._actions?.unpin(index),
                    ),
                );
                this._pinned.addMenuItem(row);
            });
        }

        _syncRecent(items, blocked) {
            const _ = this._gettext;
            this._recent.removeAll();

            const notice = blocked ? blockedText(blocked.reason, _) : '';
            if (notice) this._recent.addMenuItem(noteRow(notice, 'quickclip-blocked'));
            if (!items.length && !notice)
                this._recent.addMenuItem(noteRow(_('Nothing copied yet')));

            for (const item of items) {
                const row = this._withThumb(textRow(rowText(item, _)), item);
                row.connect('activate', () => this._actions?.copy(item));
                if (item.kind === KIND.TEXT)
                    row.add_child(
                        rowButton(ICONS.PIN, _('Pin'), () =>
                            this._actions?.pin(item.text),
                        ),
                    );
                this._recent.addMenuItem(row);
            }
        }

        // From the destroy signal rather than a destroy() override, which an
        // actor destroyed from C never calls.
        _onDestroy() {
            this._actions = null;
            this._thumbs.clear();
            // The Shell parents this menu into the quick settings overlay and
            // never destroys it (Shell 50.3), so without this every disable —
            // and every lock — would leave a menu behind.
            this.menu.destroy();
        }
    },
);

/** Builds the tile and keeps it in step with the history and settings. */
export class Panel {
    /**
     * @param {{settings: Gio.Settings, history: History,
     *   transforms: ReadonlyArray<object>, actions: object, iconPath: string,
     *   gettext: Function, ngettext: Function}} options Dependencies.
     */
    constructor({
        settings,
        history,
        transforms,
        actions,
        iconPath,
        gettext,
        ngettext,
    }) {
        this._settings = settings;
        this._history = history;
        this._transforms = transforms;
        this._actions = actions;
        this._iconPath = iconPath;
        this._gettext = gettext;
        this._ngettext = ngettext;

        this._indicator = null;
        this._toggle = null;
        this._watcher = null;
        this._unsubscribe = null;
    }

    enable() {
        this._toggle = new QuickClipToggle({
            gicon: Gio.icon_new_for_string(this._iconPath),
            gettext: this._gettext,
            ngettext: this._ngettext,
            actions: this._actions,
            transforms: this._transforms,
        });
        this._toggle.connectObject('destroy', () => (this._toggle = null), this);
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(this._toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._watcher = new SettingsWatcher(this._settings);
        this._watcher.watch(KEYS.PAUSED, () => this.sync());
        this._watcher.watch(KEYS.PINNED, () => this.sync());
        this._unsubscribe = this._history.onChange(() => this.sync());
        this.sync();
    }

    sync() {
        if (!this._toggle) return;
        this._toggle.sync({
            items: this._history.items,
            current: this._history.current,
            blocked: this._history.blocked,
            pinned: this._settings.get_strv(KEYS.PINNED),
            paused: this._settings.get_boolean(KEYS.PAUSED),
        });
    }

    disable() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._watcher?.release();
        this._watcher = null;

        // The Shell reparents the toggle into the quick settings grid, so it
        // goes first, then its indicator.
        this._toggle?.disconnectObject(this);
        this._toggle?.destroy();
        this._toggle = null;
        this._indicator?.destroy();
        this._indicator = null;
    }
}
```

- [ ] **Step 4: Write `stylesheet.css`**

```css
/* QuickClip.
 *
 * gnome-shell loads this automatically. Presentation only, and no colors:
 * the Shell has a light and a dark style, and selection uses the theme's own
 * popup-menu-item states.
 */

.quickclip-current {
    spacing: 12px;
}

.quickclip-thumb {
    icon-size: 48px;
}

.quickclip-blocked {
    font-style: italic;
}

.quickclip-row-button {
    padding: 4px;
}

.quickclip-popup-box {
    spacing: 12px;
    min-width: 480px;
}

.quickclip-scroll {
    max-height: 420px;
}

.quickclip-row-box {
    spacing: 12px;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/panel.test.js`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx prettier --write modules tests stylesheet.css && npx eslint modules tests
git add modules/panel.js stylesheet.css tests/panel.test.js
git commit -m "feat: add the quick settings tile"
```

---

### Task 8: Keyboard popup

**Files:**

- Create: `modules/popup.js`
- Test: `tests/popup.test.js`

**Interfaces:**

- Consumes: `entries`, `rowText`, `step` (listing.js); `applicable` (transforms.js); `KIND`.
- Produces: `ClipPopup` (GObject subclass of `ModalDialog.ModalDialog`) constructed with `{history, pinned, transforms, gettext, onChoose(item), onTransform(transform, item|null)}`; standard `open() → boolean`, `close()`, destroys itself on close.

- [ ] **Step 1: Write the failing test**

`tests/popup.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';

import Clutter from './stubs/gi-clutter.js';
import { dialogState } from './stubs/shell-modaldialog.js';
import { descendants, resetActors } from './support/actors.js';
import { History, KIND } from '../modules/model.js';
import { ClipPopup } from '../modules/popup.js';
import { createTransforms } from '../modules/transforms.js';
import { MB, createTimers } from './support/world.js';

const _ = message => message;

function build({ pinned = [], texts = [], images = [] } = {}) {
    const timers = createTimers();
    const history = new History({
        size: 20,
        imageBudget: 32 * MB,
        expireMs: 0,
        now: timers.now,
    });
    for (const hash of images)
        history.add({ kind: KIND.IMAGE, data: hash, size: 10, hash });
    for (const text of texts) history.add({ kind: KIND.TEXT, text });
    const chosen = [];
    const popup = new ClipPopup({
        history,
        pinned,
        transforms: createTransforms({ uuid: () => 'u', now: timers.now }),
        gettext: _,
        onChoose: item => chosen.push(['choose', item]),
        onTransform: (transform, item) =>
            chosen.push(['transform', transform.id, item]),
    });
    popup.open();
    const entry = popup.initialKeyFocus;
    return { popup, entry, chosen };
}

const rows = popup =>
    descendants(popup).filter(actor => actor.style_class?.includes('quickclip-item'));
const labels = popup => rows(popup).map(row => row.accessible_name);
const selected = popup => rows(popup).find(row => row.pseudoClasses.has('selected'));

beforeEach(() => {
    resetActors();
    dialogState.canOpen = true;
});

describe('ClipPopup', () => {
    it('lists pins, then recent copies, and selects the first', () => {
        const { popup } = build({ pinned: ['pin'], texts: ['old', 'new'] });
        expect(labels(popup)).toEqual(['pin', 'new', 'old']);
        expect(selected(popup).accessible_name).toBe('pin');
        expect(popup.initialKeyFocus).toBeDefined();
    });

    it('filters as you type and hides images meanwhile', () => {
        const { popup, entry } = build({ texts: ['alpha', 'beta'], images: ['img'] });
        expect(labels(popup)).toContain('Image · 10 B');
        entry.set_text('ALP');
        expect(labels(popup)).toEqual(['alpha']);
    });

    it('moves with the arrows, wrapping, and chooses with Enter', () => {
        const { popup, entry, chosen } = build({ texts: ['a', 'b', 'c'] });
        entry.press(Clutter.KEY_Down);
        expect(selected(popup).accessible_name).toBe('b');
        entry.press(Clutter.KEY_Up);
        entry.press(Clutter.KEY_Up);
        expect(selected(popup).accessible_name).toBe('a');

        entry.press(Clutter.KEY_Return);
        expect(chosen).toEqual([['choose', expect.objectContaining({ text: 'a' })]]);
        expect(popup.isOpen).toBe(false);
    });

    it('offers transforms for the selected item on Tab', () => {
        const { popup, entry, chosen } = build({ texts: ['{"a":1}'] });
        entry.press(Clutter.KEY_Tab);
        expect(labels(popup)).toContain('Pretty-print JSON');

        entry.press(Clutter.KEY_Return);
        expect(chosen[0].slice(0, 2)).toEqual(['transform', 'json-pretty']);
        expect(chosen[0][2].text).toBe('{"a":1}');
    });

    it('goes back from transforms with Esc, and closes with a second Esc', () => {
        const { popup, entry } = build({ texts: ['x'] });
        entry.press(Clutter.KEY_Tab);
        entry.press(Clutter.KEY_Escape);
        expect(labels(popup)).toEqual(['x']);
        expect(popup.isOpen).toBe(true);
        entry.press(Clutter.KEY_Escape);
        expect(popup.isOpen).toBe(false);
    });

    it('says so when there is nothing to show', () => {
        const { popup } = build();
        expect(rows(popup)).toHaveLength(0);
        expect(
            descendants(popup).some(actor => actor.text === 'Nothing copied yet'),
        ).toBe(true);
    });

    it('chooses a row that is clicked', () => {
        const { popup, chosen } = build({ texts: ['a', 'b'] });
        rows(popup)[1].click();
        expect(chosen[0][1].text).toBe('a');
    });

    it('ignores Enter when nothing matches', () => {
        const { entry, chosen } = build({ texts: ['a'] });
        entry.set_text('zzz');
        entry.press(Clutter.KEY_Return);
        expect(chosen).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/popup.test.js`
Expected: FAIL — `../modules/popup.js` not found.

- [ ] **Step 3: Write `modules/popup.js`**

```js
// The keyboard popup: filter, pick, paste. Also the transforms, on Tab.
//
// A ModalDialog, so it takes the keyboard while open and hands focus back to
// the previous window when it closes — which is what lets the controller paste
// into that window afterwards. It destroys itself on close.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { entries, rowText, step } from './listing.js';
import { KIND } from './model.js';
import { applicable } from './transforms.js';

const MODE = Object.freeze({ HISTORY: 'history', TRANSFORMS: 'transforms' });

export const ClipPopup = GObject.registerClass(
    class ClipPopup extends ModalDialog.ModalDialog {
        /**
         * @param {{history: History, pinned: string[],
         *   transforms: ReadonlyArray<object>, gettext: Function,
         *   onChoose: Function, onTransform: Function}} options
         */
        _init({ history, pinned, transforms, gettext: _, onChoose, onTransform }) {
            super._init({ styleClass: 'quickclip-popup', destroyOnClose: true });

            this._history = history;
            this._pinned = pinned;
            this._transforms = transforms;
            this._gettext = _;
            this._onChoose = onChoose;
            this._onTransform = onTransform;
            this._mode = MODE.HISTORY;
            this._target = null;
            this._rows = [];
            this._buttons = [];
            this._selected = -1;

            const box = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'quickclip-popup-box',
            });
            this._entry = new St.Entry({
                hint_text: _('Type to filter · Tab for transforms'),
                can_focus: true,
                x_expand: true,
            });
            this._list = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
            });
            this._scroll = new St.ScrollView({
                hscrollbar_policy: St.PolicyType.NEVER,
                style_class: 'quickclip-scroll',
                child: this._list,
            });
            box.add_child(this._entry);
            box.add_child(this._scroll);
            this.contentLayout.add_child(box);

            this._entry.clutter_text.connectObject(
                'text-changed',
                () => {
                    this._selected = 0;
                    this._rebuild();
                },
                'key-press-event',
                (_actor, event) => this._onKey(event.get_key_symbol()),
                this,
            );
            this.setInitialKeyFocus(this._entry);
            this._rebuild();
        }

        _rebuild() {
            const _ = this._gettext;
            for (const child of this._list.get_children()) child.destroy();
            this._list.remove_all_children();

            if (this._mode === MODE.HISTORY) {
                this._rows = entries({
                    pinned: this._pinned,
                    items: this._history.items,
                    query: this._entry.get_text(),
                }).map(row => ({ row, label: rowText(row.item, _) }));
            } else {
                this._rows = applicable(this._transforms, this._target).map(
                    transform => ({
                        transform,
                        label: _(transform.label),
                    }),
                );
            }

            this._buttons = this._rows.map((entry, index) =>
                this._button(entry, () => this._activate(index)),
            );
            for (const button of this._buttons) this._list.add_child(button);
            if (!this._rows.length) {
                const empty =
                    this._mode === MODE.HISTORY && !this._entry.get_text()
                        ? _('Nothing copied yet')
                        : _('Nothing matches');
                this._list.add_child(
                    new St.Label({ text: empty, style_class: 'quickclip-empty' }),
                );
            }

            this._selected = this._rows.length
                ? Math.min(Math.max(this._selected, 0), this._rows.length - 1)
                : -1;
            this._highlight();
        }

        _button(entry, onClick) {
            const box = new St.BoxLayout({
                style_class: 'quickclip-row-box',
                x_expand: true,
            });
            const item = entry.row?.item;
            if (item?.kind === KIND.IMAGE)
                box.add_child(
                    new St.Icon({
                        gicon: new Gio.BytesIcon({ bytes: item.data }),
                        style_class: 'quickclip-thumb',
                    }),
                );
            if (entry.row?.pinned)
                box.add_child(
                    new St.Icon({ icon_name: 'starred-symbolic', icon_size: 16 }),
                );
            const label = new St.Label({
                text: entry.label,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            box.add_child(label);

            // popup-menu-item gives the theme's own hover and :selected look.
            const button = new St.Button({
                style_class: 'popup-menu-item quickclip-item',
                accessible_name: entry.label,
                can_focus: false,
                x_expand: true,
                child: box,
            });
            button.connectObject('clicked', onClick, this);
            return button;
        }

        _highlight() {
            this._buttons.forEach((button, index) => {
                if (index === this._selected) {
                    button.add_style_pseudo_class('selected');
                    ensureActorVisibleInScrollView(this._scroll, button);
                } else {
                    button.remove_style_pseudo_class('selected');
                }
            });
        }

        _onKey(symbol) {
            switch (symbol) {
                case Clutter.KEY_Up:
                    this._move(-1);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Down:
                    this._move(1);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    this._activate(this._selected);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Tab:
                case Clutter.KEY_ISO_Left_Tab:
                    this._toggleMode();
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Escape:
                    if (this._mode === MODE.TRANSFORMS) this._toggleMode();
                    else this.close();
                    return Clutter.EVENT_STOP;
                default:
                    return Clutter.EVENT_PROPAGATE;
            }
        }

        _move(delta) {
            this._selected = step(this._selected, delta, this._rows.length);
            this._highlight();
        }

        _toggleMode() {
            if (this._mode === MODE.HISTORY) {
                this._target =
                    this._selected < 0 ? null : this._rows.at(this._selected).row.item;
                this._mode = MODE.TRANSFORMS;
            } else {
                this._mode = MODE.HISTORY;
                this._target = null;
            }
            this._selected = 0;
            this._rebuild();
        }

        _activate(index) {
            if (index < 0 || index >= this._rows.length) return;
            const entry = this._rows.at(index);
            const target = this._target;
            this.close();
            if (entry.transform) this._onTransform(entry.transform, target);
            else this._onChoose(entry.row.item);
        }
    },
);
```

Note the order in `_activate`: close first, so focus is handed back before the controller's paste timer starts.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/popup.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx prettier --write modules tests && npx eslint modules tests
git add modules/popup.js tests/popup.test.js
git commit -m "feat: add the keyboard popup"
```

---

### Task 9: Controller and extension entry point

**Files:**

- Create: `modules/controller.js`, `extension.js`
- Test: `tests/controller.test.js`, `tests/extension.test.js`

**Interfaces:**

- Consumes: everything above. `Main.wm.addKeybinding(name, settings, flags, mode, handler)`, `Main.wm.removeKeybinding(name)`, `Main.sessionMode` (`isLocked`, signal `updated`), `Main.notify(title, body)`.
- Produces: `PASTE_DELAY_MS = 150`; `QuickClip` with `constructor({settings, source, paster, iconPath, gettext, ngettext, openPrefs, uuid, now?, timers?})`, `enable()`, `disable()`, `openPopup()`; default export `QuickClipExtension` in `extension.js`.

- [ ] **Step 1: Write the failing controller test**

`tests/controller.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Clutter, { virtualSeat } from './stubs/gi-clutter.js';
import Shell from './stubs/gi-shell.js';
import * as Main from './stubs/shell-main.js';
import { descendants, liveHandlers, resetActors } from './support/actors.js';
import { PASTE_DELAY_MS, QuickClip } from '../modules/controller.js';
import { KIND } from '../modules/model.js';
import { Paster } from '../modules/paste.js';
import { KEYS } from '../modules/settings.js';
import {
    createClipboard,
    createSettings,
    createTimers,
    flush,
} from './support/world.js';

function build(values = {}) {
    const timers = createTimers();
    const settings = createSettings(values);
    const clip = createClipboard();
    const paster = new Paster({ clock: () => 1 });
    let prefs = 0;
    const app = new QuickClip({
        settings,
        source: clip,
        paster,
        iconPath: '/icon.svg',
        gettext: message => message,
        ngettext: (one, many, count) => (count === 1 ? one : many),
        openPrefs: () => (prefs += 1),
        uuid: () => 'uuid-1',
        now: timers.now,
        timers,
    });
    app.enable();
    return { app, settings, clip, timers, prefsOpened: () => prefs };
}

const tile = () => Main.externalIndicators.at(-1).indicator.quickSettingsItems[0];
const liveTile = () =>
    Main.externalIndicators.filter(({ indicator }) => !indicator._wasDestroyed);
const keysSent = () => virtualSeat.devices.flatMap(device => device.events);

beforeEach(() => {
    Main.reset();
    resetActors();
    virtualSeat.reset();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('QuickClip', () => {
    it('adds the tile, starts listening and binds its shortcuts in normal mode only', () => {
        const { clip } = build();
        expect(liveTile()).toHaveLength(1);
        expect(clip.listening).toBe(true);
        expect([...Main.wm.bindings.keys()].sort()).toEqual([
            KEYS.PAUSE_SHORTCUT,
            KEYS.POPUP_SHORTCUT,
        ]);
        for (const binding of Main.wm.bindings.values())
            expect(binding.mode).toBe(Shell.ActionMode.NORMAL);
    });

    it('hides everything while locked, and clears by default', async () => {
        const { app, clip } = build();
        clip.copyText('before');
        await flush();

        Main.lock(true);

        expect(liveTile()).toHaveLength(0);
        expect(Main.wm.bindings.size).toBe(0);
        expect(clip.listening).toBe(false);
        expect(app._history.items).toEqual([]);
    });

    it('records nothing while locked', async () => {
        const { app, clip } = build({ [KEYS.CLEAR_ON_LOCK]: false });
        Main.lock(true);
        clip.copyText('during');
        await flush();
        expect(app._history.items).toEqual([]);
    });

    it('keeps the history across a lock when asked, and comes back on unlock', async () => {
        const { app, clip } = build({ [KEYS.CLEAR_ON_LOCK]: false });
        clip.copyText('kept');
        await flush();

        Main.lock(true);
        Main.lock(false);

        expect(app._history.items.map(item => item.text)).toEqual(['kept']);
        expect(liveTile()).toHaveLength(1);
        expect(clip.listening).toBe(true);
        expect(Main.wm.bindings.size).toBe(2);
    });

    it('opens one popup from the shortcut, and none while locked', () => {
        const { app } = build();
        Main.wm.bindings.get(KEYS.POPUP_SHORTCUT).handler();
        const first = app._popup;
        expect(first.isOpen).toBe(true);
        app.openPopup();
        expect(app._popup).toBe(first);

        first.close();
        expect(app._popup).toBeNull();
        Main.lock(true);
        app.openPopup();
        expect(app._popup).toBeNull();
    });

    it('closes the popup when the screen locks', () => {
        const { app } = build();
        app.openPopup();
        const popup = app._popup;
        Main.lock(true);
        expect(popup.isOpen).toBe(false);
    });

    it('copies the chosen item and pastes it after the delay', async () => {
        const { app, clip, timers } = build();
        clip.copyText('pick me');
        await flush();

        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);
        expect(clip.writes).toEqual([['text', 'pick me']]);
        expect(keysSent()).toEqual([]);

        timers.advance(PASTE_DELAY_MS);
        expect(keysSent().map(([key]) => key)).toEqual([
            Clutter.KEY_Control_L,
            Clutter.KEY_v,
            Clutter.KEY_v,
            Clutter.KEY_Control_L,
        ]);
    });

    it('pastes with Ctrl+Shift+V into a terminal', async () => {
        const { app, clip, timers } = build();
        clip.copyText('ls');
        await flush();
        clip.appId = 'org.gnome.Ptyxis.desktop';

        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);
        timers.advance(PASTE_DELAY_MS);
        expect(keysSent()[1][0]).toBe(Clutter.KEY_Shift_L);
    });

    it('only copies when auto-paste is off', async () => {
        const { app, clip, timers } = build({ [KEYS.AUTO_PASTE]: false });
        clip.copyText('x');
        await flush();
        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);
        timers.advance(PASTE_DELAY_MS);
        expect(keysSent()).toEqual([]);
        expect(clip.writes).toHaveLength(1);
    });

    it('warns once when auto-paste cannot work', async () => {
        virtualSeat.fail = true;
        const { app, clip, timers } = build();
        clip.copyText('x');
        await flush();
        for (let i = 0; i < 2; i++) {
            app.openPopup();
            app._popup.initialKeyFocus.press(Clutter.KEY_Return);
            timers.advance(PASTE_DELAY_MS);
        }
        expect(Main.notifications).toHaveLength(1);
        expect(Main.notifications[0].body).not.toContain('x');
    });

    it('writes a transform result and pastes it from the popup', async () => {
        const { app, clip, timers } = build();
        clip.copyText('{"a":1}');
        await flush();

        app.openPopup();
        const entry = app._popup.initialKeyFocus;
        entry.press(Clutter.KEY_Tab);
        entry.press(Clutter.KEY_Return);
        timers.advance(PASTE_DELAY_MS);

        expect(clip.writes).toEqual([['text', '{\n  "a": 1\n}']]);
        expect(keysSent().length).toBeGreaterThan(0);
    });

    it('reports a failed transform without its input, leaving the clipboard alone', async () => {
        const { app, clip } = build();
        const failing = {
            id: 'f',
            label: 'Explode',
            generator: false,
            applies: () => true,
            run: () => {
                throw new Error('boom: hunter2');
            },
        };
        clip.copyText('hunter2');
        await flush();

        app._actions.transform(failing);

        expect(clip.writes).toEqual([]);
        expect(Main.notifications).toHaveLength(1);
        expect(Main.notifications[0].title).toBe('QuickClip');
        expect(Main.notifications[0].body).not.toContain('hunter2');
    });

    it('pins without duplicates, unpins by position, pauses and opens prefs', () => {
        const { app, settings, prefsOpened } = build();
        app._actions.pin('a');
        app._actions.pin('b');
        app._actions.pin('a');
        expect(settings.get_strv(KEYS.PINNED)).toEqual(['a', 'b']);
        app._actions.unpin(0);
        expect(settings.get_strv(KEYS.PINNED)).toEqual(['b']);

        Main.wm.bindings.get(KEYS.PAUSE_SHORTCUT).handler();
        expect(settings.get_boolean(KEYS.PAUSED)).toBe(true);
        app._actions.setPaused(false);
        expect(settings.get_boolean(KEYS.PAUSED)).toBe(false);

        app._actions.openPrefs();
        expect(prefsOpened()).toBe(1);
    });

    it('copies from the tile without pasting', async () => {
        const { clip, timers } = build();
        clip.copyText('tile');
        await flush();
        // The last match is the Recent row; the first is the Current row,
        // which is not clickable.
        const row = descendants(tile().menu)
            .filter(item => item.label?.text === 'tile' && item.activate)
            .at(-1);
        row.activate();
        timers.advance(PASTE_DELAY_MS);
        expect(clip.writes).toEqual([['text', 'tile']]);
        expect(keysSent()).toEqual([]);
    });

    it('leaves nothing behind on disable, and survives a second disable', async () => {
        const before = liveHandlers.size;
        const { app, clip, settings, timers } = build();
        clip.copyText('x');
        await flush();
        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);

        app.disable();
        app.disable();

        expect(timers.pending).toBe(0);
        expect(clip.listening).toBe(false);
        expect(Main.wm.bindings.size).toBe(0);
        expect(liveTile()).toHaveLength(0);
        expect(settings.connected.size).toBe(0);
        expect(liveHandlers.size).toBe(before);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/controller.test.js`
Expected: FAIL — `../modules/controller.js` not found.

- [ ] **Step 3: Write `modules/controller.js`**

```js
// QuickClip itself: builds the pieces, handles the lock screen, the shortcuts
// and every action a click or key press asks for.
//
// The clipboard source and the paster are handed in (extension.js makes the
// real ones), so this file is tested whole under Vitest.
//
// While the screen is locked there is no tile, no popup, no keybinding and no
// clipboard listener. That is what makes the unlock-dialog session mode safe.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { fill } from './listing.js';
import { History, KIND } from './model.js';
import { Panel } from './panel.js';
import { pasteKeys } from './paste.js';
import { ClipPopup } from './popup.js';
import { Recorder } from './recorder.js';
import { KEYS, historyOptions } from './settings.js';
import { TransformError, createTransforms, runTransform } from './transforms.js';

/**
 * How long to wait after the popup closes before pasting, so focus is back on
 * the window the paste is meant for.
 */
export const PASTE_DELAY_MS = 150;

export class QuickClip {
    /**
     * @param {{settings: Gio.Settings, source: object, paster: object,
     *   iconPath: string, gettext: Function, ngettext: Function,
     *   openPrefs: Function, uuid: function(): string,
     *   now?: function(): number,
     *   timers?: {setTimeout: Function, clearTimeout: Function}}} options
     */
    constructor({
        settings,
        source,
        paster,
        iconPath,
        gettext,
        ngettext,
        openPrefs,
        uuid,
        now = () => Date.now(),
        timers = globalThis,
    }) {
        this._settings = settings;
        this._source = source;
        this._paster = paster;
        this._iconPath = iconPath;
        this._gettext = gettext;
        this._ngettext = ngettext;
        this._openPrefs = openPrefs;
        this._uuid = uuid;
        this._now = now;
        this._timers = timers;

        this._history = null;
        this._recorder = null;
        this._transforms = null;
        this._panel = null;
        this._popup = null;
        this._pasteTimer = null;
        this._pasteWarned = false;
        this._keybound = false;
        this._locked = null;
        this._actions = this._createActions();
    }

    enable() {
        this._history = new History({
            ...historyOptions(this._settings),
            now: this._now,
        });
        this._transforms = createTransforms({ uuid: this._uuid, now: this._now });
        this._recorder = new Recorder({
            source: this._source,
            history: this._history,
            settings: this._settings,
            timers: this._timers,
        });
        this._recorder.start();

        Main.sessionMode.connectObject('updated', () => this._syncLock(), this);
        this._locked = null;
        this._syncLock();
    }

    disable() {
        Main.sessionMode.disconnectObject(this);
        this._hideUi();
        this._recorder?.destroy();
        this._recorder = null;
        this._history?.clear();
        this._history = null;
        this._locked = null;
    }

    /** Open the popup, unless locked or already open. */
    openPopup() {
        if (this._locked || this._popup || !this._history) return;
        this._popup = new ClipPopup({
            history: this._history,
            pinned: this._settings.get_strv(KEYS.PINNED),
            transforms: this._transforms,
            gettext: this._gettext,
            onChoose: item => this._choose(item),
            onTransform: (transform, item) => {
                if (this._transform(transform, item)) this._schedulePaste();
            },
        });
        this._popup.connectObject('destroy', () => (this._popup = null), this);
        if (!this._popup.open()) this._popup.destroy();
    }

    _syncLock() {
        const locked = Main.sessionMode.isLocked;
        if (locked === this._locked) return;
        this._locked = locked;

        if (locked) {
            this._hideUi();
            this._recorder.deafen();
            if (this._settings.get_boolean(KEYS.CLEAR_ON_LOCK)) this._history.clear();
            console.debug('[quickclip] locked');
        } else {
            this._recorder.listen();
            this._showUi();
            console.debug('[quickclip] listening');
        }
    }

    _showUi() {
        this._panel = new Panel({
            settings: this._settings,
            history: this._history,
            transforms: this._transforms,
            actions: this._actions,
            iconPath: this._iconPath,
            gettext: this._gettext,
            ngettext: this._ngettext,
        });
        this._panel.enable();

        const bind = (key, handler) =>
            Main.wm.addKeybinding(
                key,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                handler,
            );
        bind(KEYS.POPUP_SHORTCUT, () => this.openPopup());
        bind(KEYS.PAUSE_SHORTCUT, () =>
            this._actions.setPaused(!this._settings.get_boolean(KEYS.PAUSED)),
        );
        this._keybound = true;
    }

    _hideUi() {
        if (this._pasteTimer !== null) this._timers.clearTimeout(this._pasteTimer);
        this._pasteTimer = null;

        this._popup?.disconnectObject(this);
        this._popup?.close();
        this._popup?.destroy();
        this._popup = null;

        if (this._keybound) {
            Main.wm.removeKeybinding(KEYS.POPUP_SHORTCUT);
            Main.wm.removeKeybinding(KEYS.PAUSE_SHORTCUT);
            this._keybound = false;
        }

        this._panel?.disable();
        this._panel = null;
    }

    _createActions() {
        const settings = this._settings;
        return Object.freeze({
            copy: item => this._recorder.copy(item),
            copyText: text => this._recorder.copyText(text),
            pin: text => {
                const pinned = settings.get_strv(KEYS.PINNED);
                if (!pinned.includes(text))
                    settings.set_strv(KEYS.PINNED, [...pinned, text]);
            },
            unpin: index =>
                settings.set_strv(
                    KEYS.PINNED,
                    settings.get_strv(KEYS.PINNED).filter((_text, at) => at !== index),
                ),
            clear: () => this._history.clear(),
            setPaused: paused => settings.set_boolean(KEYS.PAUSED, paused),
            transform: transform => this._transform(transform, this._history.current),
            openPrefs: () => this._openPrefs(),
        });
    }

    _choose(item) {
        this._recorder.copy(item);
        this._schedulePaste();
    }

    /**
     * Run a transform on an item and put the result on the clipboard.
     *
     * @returns {boolean} Whether it worked.
     */
    _transform(transform, item) {
        const _ = this._gettext;
        const text = item?.kind === KIND.TEXT ? item.text : '';
        try {
            this._recorder.copyText(runTransform(transform, text));
            return true;
        } catch (error) {
            if (!(error instanceof TransformError)) throw error;
            // Fixed wording only: a notification can outlive the copy and show
            // on the lock screen.
            Main.notify(
                'QuickClip',
                fill(_('%s did not apply'), _(transform.label)) +
                    ` — ${_(error.message)}`,
            );
            return false;
        }
    }

    _schedulePaste() {
        if (!this._settings.get_boolean(KEYS.AUTO_PASTE)) return;
        if (this._pasteTimer !== null) this._timers.clearTimeout(this._pasteTimer);
        this._pasteTimer = this._timers.setTimeout(() => {
            this._pasteTimer = null;
            this._paste();
        }, PASTE_DELAY_MS);
    }

    _paste() {
        const keys = pasteKeys(
            this._source.focusedAppId(),
            this._settings.get_strv(KEYS.TERMINAL_APPS),
        );
        if (this._paster.paste(keys) || this._pasteWarned) return;
        this._pasteWarned = true;
        Main.notify(
            'QuickClip',
            this._gettext(
                'Auto-paste is unavailable. The item was copied; paste it yourself.',
            ),
        );
    }
}
```

Note the failing-transform test expects the body not to contain `hunter2`: `runTransform` replaces the engine error with "Could not transform this text", so the body is "Explode did not apply — Could not transform this text".

- [ ] **Step 4: Run the controller test**

Run: `npx vitest run tests/controller.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing extension test**

`tests/extension.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClipboard, createSettings } from './support/world.js';

/*
 * The one place in this suite that mocks a module rather than injecting a
 * fake: extension.js imports modules/clipboard.js, which needs a running
 * Shell and is excluded from coverage. The fake has the same surface.
 */
const sources = [];

async function load() {
    vi.resetModules();
    sources.length = 0;

    vi.doMock('../modules/clipboard.js', () => ({
        ClipboardSource: class {
            constructor() {
                const source = createClipboard();
                sources.push(source);
                return source;
            }
        },
    }));

    const Main = await import('./stubs/shell-main.js');
    const { resetActors } = await import('./support/actors.js');
    Main.reset();
    resetActors();

    const { default: QuickClipExtension } = await import('../extension.js');
    const extension = new QuickClipExtension({ 'version-name': '9.9.9' });
    extension.settings = createSettings();
    return { extension, Main };
}

beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../modules/clipboard.js');
    vi.resetModules();
});

describe('QuickClipExtension', () => {
    it('puts a tile in quick settings and starts listening', async () => {
        const { extension, Main } = await load();
        extension.enable();
        expect(Main.externalIndicators).toHaveLength(1);
        expect(sources[0].listening).toBe(true);
        extension.disable();
    });

    // scripts/headless-check.sh greps for this line.
    it('logs the marker the headless check greps for', async () => {
        const { extension } = await load();
        extension.enable();
        expect(console.debug).toHaveBeenCalledWith('[quickclip] enabled (v9.9.9)');
        extension.disable();
    });

    it('opens preferences from the tile', async () => {
        const { extension } = await load();
        extension.enable();
        extension._app._actions.openPrefs();
        expect(extension.prefsOpened).toBe(1);
        extension.disable();
    });

    it('can be enabled, disabled and enabled again', async () => {
        const { extension, Main } = await load();
        extension.enable();
        extension.disable();
        extension.enable();
        expect(sources).toHaveLength(2);
        expect(Main.externalIndicators).toHaveLength(2);
        extension.disable();
    });

    it('tolerates disable without enable, and twice', async () => {
        const { extension } = await load();
        expect(() => extension.disable()).not.toThrow();
        extension.enable();
        extension.disable();
        expect(() => extension.disable()).not.toThrow();
    });

    it('drops every reference on disable', async () => {
        const { extension } = await load();
        extension.enable();
        extension.disable();
        expect(extension._app).toBeNull();
        expect(extension._source).toBeNull();
        expect(extension._paster).toBeNull();
        expect(sources[0].listening).toBe(false);
    });
});
```

- [ ] **Step 6: Write `extension.js`**

```js
// QuickClip — a private clipboard history in GNOME quick settings.
//
// This file is deliberately thin. It builds the clipboard source, the paster
// and the controller, and tears them down; every decision lives in a module
// under modules/.
//
// Nothing here runs at import time. Creating an object, connecting a signal or
// touching the Shell during module evaluation is forbidden by the review
// guidelines.

import GLib from 'gi://GLib';

import {
    Extension,
    gettext as _,
    ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { ClipboardSource } from './modules/clipboard.js';
import { QuickClip } from './modules/controller.js';
import { Paster } from './modules/paste.js';

export default class QuickClipExtension extends Extension {
    enable() {
        this._source = new ClipboardSource();
        this._paster = new Paster();
        this._app = new QuickClip({
            settings: this.getSettings(),
            source: this._source,
            paster: this._paster,
            iconPath: `${this.path}/icons/quickclip-symbolic.svg`,
            gettext: _,
            ngettext,
            openPrefs: () => this.openPreferences(),
            uuid: () => GLib.uuid_string_random(),
        });
        this._app.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(`[quickclip] enabled (v${this.metadata['version-name'] ?? '?'})`);
    }

    disable() {
        // Ordered: the controller first, so nothing it owns can reach a
        // source or paster that is already gone.
        this._app?.disable();
        this._source?.destroy();
        this._paster?.destroy();

        this._app = null;
        this._source = null;
        this._paster = null;
    }
}
```

- [ ] **Step 7: Run the whole suite with coverage**

Run: `npx vitest run --coverage`
Expected: all suites PASS. Coverage for `modules/*.js` other than `clipboard.js` should be high; note any file below 90% lines in the commit message body and add tests for uncovered branches that carry behavior (skip pure defensive `?.` branches).

- [ ] **Step 8: Lint and commit**

```bash
npx prettier --write . && npx eslint .
git add modules/controller.js extension.js tests/controller.test.js tests/extension.test.js
git commit -m "feat: wire the controller, lock handling and shortcuts"
```

---

### Task 10: Preferences and shortcut conflict checks

**Files:**

- Create: `modules/accel.js`, `prefs.js`
- Test: `tests/accel.test.js`

**Interfaces:**

- Consumes: `KEYS`, `SETTINGS` (settings.js).
- Produces: `normalizeAccel(accel) → string` ('' when empty or invalid), `findConflicts(accel, bindings) → Array<{source, values}>`.

- [ ] **Step 1: Write the failing test**

`tests/accel.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { findConflicts, normalizeAccel } from '../modules/accel.js';

const gnome = [
    {
        source: 'org.gnome.shell.keybindings toggle-message-tray',
        values: ['<Super>v', '<Super>m'],
    },
    { source: 'org.gnome.desktop.wm.keybindings close', values: ['<Alt>F4'] },
];

describe('normalizeAccel', () => {
    it('ignores modifier order, aliases and letter case', () => {
        expect(normalizeAccel('<Shift><Super>V')).toBe(
            normalizeAccel('<Super><Shift>v'),
        );
        expect(normalizeAccel('<Primary>c')).toBe(normalizeAccel('<Control>c'));
        expect(normalizeAccel('<Ctrl>c')).toBe(normalizeAccel('<Control>c'));
        expect(normalizeAccel('<Mod4>a')).toBe(normalizeAccel('<Super>a'));
    });

    it('rejects empty and unknown input', () => {
        expect(normalizeAccel('')).toBe('');
        expect(normalizeAccel(null)).toBe('');
        expect(normalizeAccel('<Bogus>x')).toBe('');
        expect(normalizeAccel('<Super>')).toBe('');
    });
});

describe('findConflicts', () => {
    it('finds GNOME’s own Super+V', () => {
        expect(findConflicts('<Super>v', gnome).map(b => b.source)).toEqual([
            'org.gnome.shell.keybindings toggle-message-tray',
        ]);
    });

    it('allows the QuickClip default', () => {
        expect(findConflicts('<Super><Shift>v', gnome)).toEqual([]);
    });

    it('treats Alt and Mod1 alike', () => {
        expect(findConflicts('<Mod1>F4', gnome)).toHaveLength(1);
    });

    it('has nothing to say about an empty shortcut', () => {
        expect(findConflicts('', gnome)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/accel.test.js`
Expected: FAIL — `../modules/accel.js` not found.

- [ ] **Step 3: Write `modules/accel.js`**

```js
// Keyboard accelerators, compared the way GNOME matches them.
//
// This file imports nothing, so prefs.js can load it and Vitest can test it.
// It exists for one rule: QuickClip never takes a shortcut GNOME or the user
// already uses.

const MODIFIERS = new Map([
    ['control', 'control'],
    ['ctrl', 'control'],
    ['primary', 'control'],
    ['shift', 'shift'],
    ['alt', 'alt'],
    ['mod1', 'alt'],
    ['super', 'super'],
    ['mod4', 'super'],
    ['meta', 'meta'],
    ['hyper', 'hyper'],
]);

/**
 * A canonical form: modifiers de-aliased and sorted, key lowercased.
 *
 * @param {string|null} accel A GTK accelerator such as '<Super><Shift>v'.
 * @returns {string} The canonical form, or '' when empty or not understood.
 */
export function normalizeAccel(accel) {
    if (!accel) return '';
    const modifiers = new Set();
    let rest = accel.trim();
    for (;;) {
        const match = /^<([A-Za-z0-9]+)>/.exec(rest);
        if (!match) break;
        const modifier = MODIFIERS.get(match[1].toLowerCase());
        if (!modifier) return '';
        modifiers.add(modifier);
        rest = rest.slice(match[0].length);
    }
    if (!rest) return '';
    return [
        ...[...modifiers].sort().map(modifier => `<${modifier}>`),
        rest.toLowerCase(),
    ].join('');
}

/**
 * Bindings that already use an accelerator.
 *
 * @param {string} accel The accelerator wanted.
 * @param {Array<{source: string, values: string[]}>} bindings Existing ones.
 * @returns {Array<{source: string, values: string[]}>} Those it would collide with.
 */
export function findConflicts(accel, bindings) {
    const wanted = normalizeAccel(accel);
    if (!wanted) return [];
    return bindings.filter(binding =>
        binding.values.some(value => normalizeAccel(value) === wanted),
    );
}
```

- [ ] **Step 4: Run the accel test**

Run: `npx vitest run tests/accel.test.js`
Expected: PASS.

- [ ] **Step 5: Write `prefs.js`**

```js
// Preferences. Runs in its own process, with no access to gnome-shell's
// resource:// modules — so nothing here may import the Shell-side modules.
//
// It holds only widget construction; the key list and wording live in
// modules/settings.js and the shortcut rules in modules/accel.js, both tested
// on plain Node. This file is excluded from coverage for that reason.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { findConflicts } from './modules/accel.js';
import { KEYS, SETTINGS } from './modules/settings.js';

/** Schemas whose `as` keys are keyboard shortcuts GNOME itself owns. */
const KEYBINDING_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.shell.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.settings-daemon.plugins.media-keys',
];
const MEDIA_KEYS = 'org.gnome.settings-daemon.plugins.media-keys';
const CUSTOM_KEYBINDING =
    'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';

function describe(key) {
    return SETTINGS.find(setting => setting.key === key);
}

/** Fill "%s" placeholders in order, without reading "$" patterns. */
function format(template, ...values) {
    return values.reduce((text, value) => text.replace('%s', () => value), template);
}

/**
 * Every shortcut GNOME and the user's custom shortcuts hold right now.
 * Other extensions' shortcuts are not visible from here; the docs say so.
 */
function systemBindings() {
    const source = Gio.SettingsSchemaSource.get_default();
    const bindings = [];

    for (const id of KEYBINDING_SCHEMAS) {
        const schema = source.lookup(id, true);
        if (!schema) continue;
        const settings = new Gio.Settings({ settings_schema: schema });
        for (const key of schema.list_keys()) {
            if (schema.get_key(key).get_value_type().dup_string() !== 'as') continue;
            bindings.push({ source: `${id} ${key}`, values: settings.get_strv(key) });
        }
    }

    const media = source.lookup(MEDIA_KEYS, true);
    const custom = source.lookup(CUSTOM_KEYBINDING, true);
    if (media && custom) {
        const paths = new Gio.Settings({ settings_schema: media }).get_strv(
            'custom-keybindings',
        );
        for (const path of paths) {
            const entry = new Gio.Settings({ settings_schema: custom, path });
            bindings.push({
                source: entry.get_string('name') || path,
                values: [entry.get_string('binding')],
            });
        }
    }
    return bindings;
}

/**
 * Ask for a key combination. Esc cancels; Backspace disables the shortcut.
 *
 * @param {Adw.PreferencesWindow} window Parent.
 * @param {function(string|null)} onAccel Called with the accelerator, or null.
 */
function captureShortcut(window, onAccel) {
    const dialog = new Adw.AlertDialog({
        heading: _('Press a shortcut'),
        body: _('Use at least one modifier. Esc cancels; Backspace turns it off.'),
    });
    dialog.add_response('cancel', _('Cancel'));

    const keys = new Gtk.EventControllerKey({
        propagation_phase: Gtk.PropagationPhase.CAPTURE,
    });
    keys.connect('key-pressed', (_controller, keyval, keycode, state) => {
        const mods = state & Gtk.accelerator_get_default_mod_mask();
        const key = Gdk.keyval_to_lower(keyval);
        if (!mods && key === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (!mods && key === Gdk.KEY_BackSpace) {
            onAccel(null);
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        // A bare key would swallow typing everywhere; a lone modifier is not
        // a shortcut yet.
        if (!mods || !Gtk.accelerator_valid(key, mods)) return Gdk.EVENT_STOP;
        onAccel(Gtk.accelerator_name_with_keycode(null, key, keycode, mods));
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(keys);
    dialog.present(window);
}

/** A row showing one shortcut, with Set and Turn off buttons. */
function shortcutRow(window, settings, key) {
    const info = describe(key);
    const row = new Adw.ActionRow({ title: _(info.label), subtitle: _(info.detail) });
    const label = new Gtk.ShortcutLabel({
        disabled_text: _('Off'),
        valign: Gtk.Align.CENTER,
    });
    const sync = () => {
        label.accelerator = settings.get_strv(key)[0] ?? '';
    };
    const id = settings.connect(`changed::${key}`, sync);
    sync();

    const set = new Gtk.Button({ label: _('Set…'), valign: Gtk.Align.CENTER });
    set.connect('clicked', () =>
        captureShortcut(window, accel => {
            if (!accel) {
                settings.set_strv(key, []);
                return;
            }
            const others = [KEYS.POPUP_SHORTCUT, KEYS.PAUSE_SHORTCUT]
                .filter(other => other !== key)
                .map(other => ({
                    source: 'QuickClip',
                    values: settings.get_strv(other),
                }));
            const [conflict] = findConflicts(accel, [...systemBindings(), ...others]);
            if (conflict) {
                window.add_toast(
                    new Adw.Toast({
                        title: format(
                            _('%s is already used by %s'),
                            accel,
                            conflict.source,
                        ),
                    }),
                );
                return;
            }
            settings.set_strv(key, [accel]);
        }),
    );
    const off = new Gtk.Button({
        icon_name: 'edit-clear-symbolic',
        tooltip_text: _('Turn off'),
        valign: Gtk.Align.CENTER,
    });
    off.connect('clicked', () => settings.set_strv(key, []));

    row.add_suffix(label);
    row.add_suffix(set);
    row.add_suffix(off);
    return { row, release: () => settings.disconnect(id) };
}

/** A group listing desktop app ids from a strv key, with add and remove. */
function appListGroup(settings, key, title) {
    const info = describe(key);
    const group = new Adw.PreferencesGroup({ title, description: _(info.detail) });
    const apps = Gio.AppInfo.get_all()
        .filter(app => app.should_show() && app.get_id())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

    const picker = new Adw.ComboRow({
        title: _('Add an app'),
        model: Gtk.StringList.new(apps.map(app => app.get_display_name())),
        enable_search: true,
        expression: Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'),
    });
    const add = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        tooltip_text: _('Add'),
        valign: Gtk.Align.CENTER,
    });
    add.connect('clicked', () => {
        const app = apps.at(picker.selected);
        if (!app) return;
        const ids = settings.get_strv(key);
        if (!ids.includes(app.get_id())) settings.set_strv(key, [...ids, app.get_id()]);
    });
    picker.add_suffix(add);
    group.add(picker);

    const rows = [];
    const sync = () => {
        for (const row of rows) group.remove(row);
        rows.length = 0;
        for (const id of settings.get_strv(key)) {
            const name =
                apps.find(app => app.get_id() === id)?.get_display_name() ?? id;
            // Adw rows parse titles as markup by default; an app name with "&"
            // would break it.
            const row = new Adw.ActionRow({
                title: name,
                subtitle: id,
                use_markup: false,
            });
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: _('Remove'),
                valign: Gtk.Align.CENTER,
            });
            remove.connect('clicked', () =>
                settings.set_strv(
                    key,
                    settings.get_strv(key).filter(existing => existing !== id),
                ),
            );
            row.add_suffix(remove);
            group.add(row);
            rows.push(row);
        }
    };
    const id = settings.connect(`changed::${key}`, sync);
    sync();
    return { group, release: () => settings.disconnect(id) };
}

/** Pinned snippets: remove any, add one line at a time. */
function pinnedGroup(settings) {
    const info = describe(KEYS.PINNED);
    const group = new Adw.PreferencesGroup({
        title: _(info.label),
        description: _('Stored in your settings. Pin multi-line text from the menu.'),
    });
    const entry = new Adw.EntryRow({
        title: _('Add a snippet'),
        show_apply_button: true,
    });
    entry.connect('apply', () => {
        const text = entry.text;
        const pinned = settings.get_strv(KEYS.PINNED);
        if (text && !pinned.includes(text))
            settings.set_strv(KEYS.PINNED, [...pinned, text]);
        entry.text = '';
    });
    group.add(entry);

    const rows = [];
    const sync = () => {
        for (const row of rows) group.remove(row);
        rows.length = 0;
        settings.get_strv(KEYS.PINNED).forEach((text, index) => {
            // Never markup: a snippet of "<b>" must show as exactly that.
            const row = new Adw.ActionRow({
                title: text.replace(/\s+/g, ' ').slice(0, 80),
                use_markup: false,
            });
            row.title_lines = 1;
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: _('Unpin'),
                valign: Gtk.Align.CENTER,
            });
            remove.connect('clicked', () =>
                settings.set_strv(
                    KEYS.PINNED,
                    settings.get_strv(KEYS.PINNED).filter((_text, at) => at !== index),
                ),
            );
            row.add_suffix(remove);
            group.add(row);
            rows.push(row);
        });
    };
    const id = settings.connect(`changed::${KEYS.PINNED}`, sync);
    sync();
    return { group, release: () => settings.disconnect(id) };
}

function spinRow(settings, key, lower, upper) {
    const info = describe(key);
    const row = new Adw.SpinRow({
        title: _(info.label),
        subtitle: _(info.detail),
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: 1,
            page_increment: 10,
        }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key) {
    const info = describe(key);
    const row = new Adw.SwitchRow({ title: _(info.label), subtitle: _(info.detail) });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class QuickClipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const releases = [];

        const general = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'edit-paste-symbolic',
        });
        const history = new Adw.PreferencesGroup({
            title: _('History'),
            description: _('Kept in memory only. Nothing you copy is written to disk.'),
        });
        history.add(spinRow(settings, KEYS.HISTORY_SIZE, 5, 100));
        history.add(spinRow(settings, KEYS.IMAGE_BUDGET_MB, 0, 256));
        history.add(spinRow(settings, KEYS.EXPIRE_MINUTES, 0, 1440));
        history.add(switchRow(settings, KEYS.CLEAR_ON_LOCK));
        history.add(switchRow(settings, KEYS.AUTO_PASTE));
        general.add(history);

        const shortcuts = new Adw.PreferencesGroup({
            title: _('Shortcuts'),
            description: _('A shortcut GNOME or you already use is refused.'),
        });
        for (const key of [KEYS.POPUP_SHORTCUT, KEYS.PAUSE_SHORTCUT]) {
            const { row, release } = shortcutRow(window, settings, key);
            shortcuts.add(row);
            releases.push(release);
        }
        general.add(shortcuts);

        const pinned = pinnedGroup(settings);
        general.add(pinned.group);
        releases.push(pinned.release);
        window.add(general);

        const apps = new Adw.PreferencesPage({
            title: _('Apps'),
            icon_name: 'application-x-executable-symbolic',
        });
        const ignored = appListGroup(settings, KEYS.IGNORED_APPS, _('Ignored apps'));
        const terminals = appListGroup(
            settings,
            KEYS.TERMINAL_APPS,
            _('Terminal apps'),
        );
        apps.add(ignored.group);
        apps.add(terminals.group);
        releases.push(ignored.release, terminals.release);
        window.add(apps);

        window.connect('close-request', () => {
            for (const release of releases) release();
            return false;
        });
    }
}
```

- [ ] **Step 6: Check prefs loads in a real GJS process**

Prefs cannot be unit-tested (see vitest.config.js). Verify it at least parses:

Run: `gjs -m -c 'import("./prefs.js").catch(e => { if (!String(e).includes("resource:///org/gnome/Shell/Extensions")) { printerr(e); imports.system.exit(1); } })'` from the repo root.
Expected: exits 0 (the only acceptable error is the missing `resource:///org/gnome/Shell/Extensions` module, which exists only inside the prefs host). The real check is Task 14's manual run of `just prefs`.

- [ ] **Step 7: Lint and commit**

```bash
npx prettier --write . && npx eslint .
npx vitest run
git add modules/accel.js prefs.js tests/accel.test.js
git commit -m "feat: add preferences with shortcut conflict checks"
```

---

### Task 11: Live checks and a green `just ci` (minus docs)

**Files:**

- Create: `scripts/headless-check.sh`, `scripts/pack-check.sh`, `scripts/icon-check.js`

**Interfaces:**

- Consumes: the log markers `[quickclip] enabled (v…)`, `[quickclip] listening`, `[quickclip] recorded text`, `[quickclip] skipped sensitive`.

- [ ] **Step 1: Copy and adapt the scripts**

```bash
cp ../quickmusic/scripts/pack-check.sh ../quickmusic/scripts/icon-check.js scripts/
cp ../quickmusic/scripts/headless-check.sh scripts/
sed -i 's/quickmusic/quickclip/g; s/QUICKMUSIC/QUICKCLIP/g; s/QuickMusic/QuickClip/g' scripts/*.sh scripts/*.js
chmod +x scripts/*.sh
```

`pack-check.sh` and `icon-check.js` need no other change.

- [ ] **Step 2: Replace the player phases of `scripts/headless-check.sh`**

In `scripts/headless-check.sh`, update the header comment to describe QuickClip (enable, listen, record a copy, skip a sensitive copy, disable, re-enable, no lifetime warnings). Delete everything from `PLAYER="org.mpris...` through `stop_player` at the end of the re-enable phase (the `start_player`/`stop_player`/`player_call` helpers and all player phases), remove `PLAYER_PID` from `cleanup()` and add `COPY_PID` handling instead:

```bash
    [[ -n "${COPY_PID:-}" ]] && kill "$COPY_PID" 2>/dev/null
```

Then insert, after the `wait_for '\[quickclip\] enabled'` line:

```bash
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
```

Keep quickmusic's final grep blocks (JS ERROR, signal/lifetime warnings, GSource, `\[quickclip\] .*: ` warning) unchanged apart from the rename.

- [ ] **Step 3: Run the live checks**

Run: `just test-live`
Expected: `PASS` from both scripts. The clipboard phase may print one of the `skip:` lines; record which one in the commit message. If `headless-check.sh` fails with a JS ERROR, read `$WORK/shell.log` output printed by `fail()` and fix the module at fault (most likely an API name in `modules/clipboard.js` or `modules/popup.js`), then re-run.

- [ ] **Step 4: Run lint, tests, security and build**

Run: `just lint && just test && just security && just build`
Expected: all succeed. (`just ci` also runs `test-docs`, which needs Task 12.)

- [ ] **Step 5: Commit**

```bash
git add scripts
git commit -m "test: add headless shell and packaging checks"
```

---

### Task 12: README, security policy and docs site

**Files:**

- Create: `README.md`, `SECURITY.md`, `playwright.config.js` (copy), `docs/index.html`, `docs/style.css` (copy), `docs/.nojekyll` (copy), `docs/assets/**` (copy), `tests/docs.spec.js`

**Interfaces:**

- Consumes: facts from `metadata.json`, the gschema, the spec.

- [ ] **Step 1: Copy the shared site assets and browser-test config**

```bash
cp ../quickmusic/playwright.config.js .
cp ../quickmusic/docs/style.css ../quickmusic/docs/.nojekyll docs/
cp -r ../quickmusic/docs/assets docs/
cp ../quickmusic/tests/docs.spec.js tests/
cp ../quickmusic/docs/index.html docs/index.html   # rewritten in Step 3
```

- [ ] **Step 2: Point `tests/docs.spec.js` at QuickClip**

Change only:

```js
const site = 'https://ghost-assembly.github.io/quickclip/';
const repo = 'https://github.com/Ghost-Assembly/quickclip';

const sections = [
    ['overview', 'Overview'],
    ['install', 'Install'],
    ['privacy', 'Privacy'],
    ['transforms', 'Transforms'],
    ['preferences', 'Preferences'],
    ['keyboard', 'Keyboard & mouse'],
    ['architecture', 'Architecture'],
    ['development', 'Development'],
    ['releasing', 'Releasing'],
];
```

and the title assertion to `'QuickClip · Ghost Assembly'`. Run `rg -n -i 'quickmusic|mpris|spotify|player' tests/docs.spec.js` — expected: no matches.

- [ ] **Step 3: Rewrite `docs/index.html` for QuickClip**

Keep the page's structure, classes, SVG icons, skip link, header, TOC (desktop `nav.toc` and phone `details.toc-m`), footer and the no-JavaScript rule exactly as QuickMusic has them. Replace:

1. Every `quickmusic` → `quickclip`, `QuickMusic` → `QuickClip` in URLs, `<title>`, meta description, `og:*`, crumbs, links and the footer.
2. Meta description / `og:description`: "A private clipboard history in GNOME quick settings, with developer transforms. Memory only; password-manager copies are never recorded."
3. Hero: eyebrow "GNOME Shell extension"; tagline "A private clipboard history in GNOME quick settings."; lede "Keeps your last copies — text and images — in memory only, skips what your password manager copies, and turns JSON, base64, URLs and timestamps into what you need. Super+Shift+V opens it from the keyboard."; chips `GNOME Shell 50`, `Memory only`, `GPL-3.0-or-later`; version chip `v0.1.0`.
4. Hero figure: rebuild the mock (`figure.shot`) as the QuickClip tile menu — top bar with clock, the open menu showing a "Clipboard · 3 items" header, a Current row `{"id":42,"name":"ghost"}` with a "Transform" row, a Pinned row `ssh-ed25519 AAAAC3Nz…` with a star, Recent rows `kubectl get pods -A`, `https://ghost-assembly.github.io/`, and an italic "Sensitive copy skipped" row. Reuse the existing mock classes; add any new ones at the end of `docs/style.css` under `/* QuickClip mock */`, using only existing color tokens. Update the figure's `aria-label` to describe exactly that content.
5. TOC and sections, numbered 01–09 in the order of the `sections` array above. Content for each (write it as prose and short lists, American English, in the voice of QuickMusic's page; claims must match the code):
    - **Overview** — one tile, one popup; what it records (text, PNG images); memory only; the tile's click pauses; menu parts (Current + Transform, Pinned, Recent, Clear history, Preferences); blocked-copy rows.
    - **Install** — the three commands from QuickMusic's README with the QuickClip uuid; from a clone `just setup && just install && just enable`; log out and in on Wayland.
    - **Privacy** — memory only; pinned snippets are the only stored content (GSettings/dconf) and only on request; `x-kde-passwordManagerHint` skipped (KeePassXC and others that follow the KDE convention; name that apps which do not set it, such as some Electron password managers, are not detected — use Ignored apps for those); ignored apps are approximate (focused app at copy time); pause; expiry (one timer, none while empty); lock screen behavior for both `clear-on-lock` settings and why `unlock-dialog` is declared; no content in logs or notifications; memory is freed by dropping references, and the JavaScript engine may keep old strings until garbage collection.
    - **Transforms** — a table of every transform label with an example input → output, which are offered when, the 100 000-character limit, generators; date-times without a zone are read as local time.
    - **Preferences** — a table of every setting with its default (from the gschema), including the terminal list with Ghostty; the conflict check and its limit (other extensions' shortcuts are not visible to it).
    - **Keyboard & mouse** — Super+Shift+V; ↑/↓, Enter, Tab, Esc (twice), typing filters; auto-paste delay and Ctrl+Shift+V in terminals; the tile menu copies without pasting; Super+V stays GNOME's.
    - **Architecture** — the module table from the spec, the data flow, what is excluded from coverage and why.
    - **Development** — `just` recipes table (from the justfile), `just test-live`, and the **manual checklist** from Task 14 Step 3.
    - **Releasing** — as QuickMusic's, with names changed (tag `vX.Y.Z` must match `metadata.json` and `package.json`).

- [ ] **Step 4: Write `README.md`**

Mirror QuickMusic's README sections: title, one-line summary, docs link (`https://ghost-assembly.github.io/quickclip/`), "What it does" (tile, popup, privacy, transforms, pinned), "Requires" (GNOME Shell 50; a password manager that sets `x-kde-passwordManagerHint` for automatic skipping), "Install" (the three `curl`/`gnome-extensions` commands with the QuickClip uuid, and the from-a-clone commands), "Preferences" (table: setting / default / note — all 11 keys, shortcuts shown as Super+Shift+V and "not set"), and "Development" pointing to the docs. Keep it under 120 lines.

- [ ] **Step 5: Write `SECURITY.md`**

Copy QuickMusic's and change: project name and advisory URL (`https://github.com/Ghost-Assembly/quickclip/security/advisories/new`); the report checklist asks for GNOME Shell version, QuickClip version and the app copied from; replace the MPRIS paragraph with: "QuickClip reads the clipboard whenever it changes. It keeps what it reads in memory only, never reads a copy marked with `x-kde-passwordManagerHint`, never logs or notifies clipboard content, and stores only text you pin, in GSettings. Reports of content reaching disk, logs, notifications or the lock screen are in scope."

- [ ] **Step 6: Run the docs suite and the full CI recipe**

Run: `just test-docs && just ci`
Expected: all Playwright tests pass in Chromium and Firefox (axe clean in both schemes, no external requests, no JavaScript, 360px no sideways scroll); `just ci` ends with `built quickclip@napalm255.github.io.shell-extension.zip`.

- [ ] **Step 7: Commit**

```bash
git add README.md SECURITY.md playwright.config.js docs tests/docs.spec.js
git commit -m "docs: add README, security policy and documentation site"
```

---

### Task 13: List QuickClip on the org hub and profile

**Files (other repositories):**

- Modify: `../ghost-assembly.github.io/docs/index.html`, `../ghost-assembly.github.io/tests/site.spec.js`
- Modify: `../.github/profile/README.md`

Both repositories are on `main` and publish on merge; work on a branch and do **not** push.

- [ ] **Step 1: Branch both repositories**

```bash
git -C ../ghost-assembly.github.io switch -c feat/add-quickclip
git -C ../.github switch -c feat/add-quickclip
```

- [ ] **Step 2: Add QuickClip to the hub test first**

In `../ghost-assembly.github.io/tests/site.spec.js`, add as the first entry of `projects` (cards are alphabetical):

```js
    { name: 'QuickClip', slug: 'quickclip', docs: true },
```

Run: `cd ../ghost-assembly.github.io && npx playwright test`
Expected: FAIL — the card count and the QuickClip card are missing.

- [ ] **Step 3: Add the card and the meta description**

In `../ghost-assembly.github.io/docs/index.html`, insert before the QuickMusic `<article class="project">`:

```html
<article class="project">
    <h4>QuickClip</h4>
    <p class="meta">GNOME 50</p>
    <p>
        A private clipboard history in Quick Settings. Memory only, skips
        password-manager copies, and transforms JSON, base64, URLs and timestamps.
    </p>
    <p class="links">
        <a href="https://ghost-assembly.github.io/quickclip/"
            >Docs<span class="vh"> for QuickClip</span></a
        >
        <a href="https://github.com/Ghost-Assembly/quickclip"
            >Source<span class="vh"> for QuickClip</span></a
        >
    </p>
</article>
```

Change the `<meta name="description">` content's project list to "QuickClip, QuickMusic, QuickRem, QuickTiler, QuickTS and awsdiag". In `AGENTS.md`, add `/quickclip/` to the list of project docs paths under "What gets published".

- [ ] **Step 4: Run the hub's CI**

Run: `cd ../ghost-assembly.github.io && just ci`
Expected: PASS.

- [ ] **Step 5: Add the profile README row**

In `../.github/profile/README.md`, insert above the QuickRem row:

```markdown
| [QuickClip](https://github.com/Ghost-Assembly/quickclip) | A private clipboard history in Quick Settings, with developer transforms. | [Docs](https://ghost-assembly.github.io/quickclip/) |
```

(Leave the missing QuickMusic row alone — out of scope unless the user asks.)

- [ ] **Step 6: Commit both, without pushing**

```bash
git -C ../ghost-assembly.github.io add docs/index.html tests/site.spec.js AGENTS.md
git -C ../ghost-assembly.github.io commit -m "feat: add QuickClip to the project list"
git -C ../.github add profile/README.md
git -C ../.github commit -m "docs: add QuickClip to the profile README"
```

---

### Task 14: Final verification

**Files:** none new.

- [ ] **Step 1: Run everything automated**

```bash
cd /var/home/napalm/git/ghost-assembly/quickclip
just ci && just test-live && just coverage
```

Expected: all pass; paste the tail of each output into the report.

- [ ] **Step 2: Install into the real session**

```bash
just install
```

Then ask the user to log out and back in (Wayland cannot reload the Shell), and run `just enable` and `just logs` in a spare terminal.

- [ ] **Step 3: Manual checklist (with the user, in the real session)**

Tick each, noting anything that fails:

- [ ] The tile shows "QuickClip / Recording"; clicking it shows "Paused"; a copy while paused is not listed; clicking again resumes.
- [ ] Copy text in a GTK app → it appears under Recent and as Current.
- [ ] Copy a password from KeePassXC (if installed) → "Sensitive copy skipped" row, and nothing new under Recent.
- [ ] Add the focused app to Ignored apps in prefs, copy from it → "Copy in an ignored app skipped".
- [ ] Take a screenshot to the clipboard → an Image row with a thumbnail and size.
- [ ] Super+Shift+V opens the popup; typing filters; ↑/↓ move; Enter pastes into the previous window (GTK app: Ctrl+V); in Ptyxis it pastes with Ctrl+Shift+V. If Ghostty is available, check it too.
- [ ] Tab shows transforms for `{"a":1}`; Enter on Pretty-print JSON pastes the pretty result.
- [ ] A failing transform (e.g. forcing URL decode on `%E0%A4%A`) is not offered; no notification ever quotes clipboard text.
- [ ] Pin from Recent; the snippet appears under Pinned and in prefs; unpin works from both.
- [ ] Set expiry to 1 minute; a copy disappears after about a minute.
- [ ] Lock the screen: the lock screen's quick settings has no QuickClip tile; Super+Shift+V does nothing; unlock → history empty (clear-on-lock on).
- [ ] Turn clear-on-lock off, copy something, lock, unlock → it is still listed; copies made while locked are not.
- [ ] Super+V still opens GNOME's notification list.
- [ ] In prefs, setting the popup shortcut to Super+V is refused with a toast naming `toggle-message-tray`.
- [ ] `just logs` shows only `[quickclip]` lines with kinds and reasons — no clipboard content.

- [ ] **Step 4: Report and ask about publishing**

Summarize results (automated output and checklist) to the user. Then ask — do not do it unprompted — whether to: create the `Ghost-Assembly/quickclip` GitHub repository, push `main`, enable Pages from `/docs`, push the two `feat/add-quickclip` branches and open their pull requests, and tag `v0.1.0`.
