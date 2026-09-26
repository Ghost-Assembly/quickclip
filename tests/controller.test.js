import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Clutter, { virtualSeat } from './stubs/gi-clutter.js';
import Shell from './stubs/gi-shell.js';
import * as Main from './stubs/shell-main.js';
import { descendants, liveHandlers, resetActors } from './support/actors.js';
import { PASTE_DELAY_MS, QuickClip } from '../modules/controller.js';
import { Paster } from '../modules/paste.js';
import { KEYS } from '../modules/settings.js';
import { MAX_TRANSFORM_CHARS } from '../modules/transforms.js';
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
    // Wall-clock time that passed without the timers running, as in a
    // suspend: GLib timeouts are monotonic, History's addedAt is not.
    let slept = 0;
    const app = new QuickClip({
        settings,
        source: clip,
        paster,
        iconPath: '/icon.svg',
        gettext: message => message,
        ngettext: (one, many, count) => (count === 1 ? one : many),
        openPrefs: () => (prefs += 1),
        uuid: () => 'uuid-1',
        now: () => timers.now() + slept,
        timers,
    });
    app.enable();
    return {
        app,
        settings,
        clip,
        timers,
        prefsOpened: () => prefs,
        sleep: ms => (slept += ms),
    };
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

    it('shows nothing when enabled on a locked screen, then comes up on unlock', () => {
        Main.sessionMode.isLocked = true;
        const { clip } = build();

        expect(liveTile()).toHaveLength(0);
        expect(Main.wm.bindings.size).toBe(0);
        expect(clip.listening).toBe(false);

        Main.lock(false);

        expect(liveTile()).toHaveLength(1);
        expect(Main.wm.bindings.size).toBe(2);
        expect(clip.listening).toBe(true);
    });

    it('cancels a pending paste when the screen locks', async () => {
        const { app, clip, timers } = build();
        clip.copyText('pick me');
        await flush();
        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);

        Main.lock(true);
        timers.advance(PASTE_DELAY_MS);

        expect(keysSent()).toEqual([]);
        expect(timers.pending).toBe(0);
    });

    it('never pastes while locked, even if the paste timer survives', async () => {
        const { app, clip, timers } = build();
        clip.copyText('pick me');
        await flush();
        app.openPopup();
        app._popup.initialKeyFocus.press(Clutter.KEY_Return);

        // Stand in for a regression in _hideUi that leaves the timer running.
        vi.spyOn(app, '_hideUi').mockImplementation(() => {});
        Main.lock(true);
        timers.advance(PASTE_DELAY_MS);

        expect(keysSent()).toEqual([]);
    });

    describe('after a suspend, with the expiry timer not yet run', () => {
        const EXPIRED = 31 * 60 * 1000;

        it('drops expired copies before the popup opens', async () => {
            const { app, clip, sleep } = build();
            clip.copyText('stale');
            await flush();
            sleep(EXPIRED);
            expect(app._history.items).toHaveLength(1);

            app.openPopup();

            expect(app._history.items).toEqual([]);
            const rows = descendants(app._popup).filter(actor =>
                actor.style_class?.includes('quickclip-item'),
            );
            expect(rows).toEqual([]);
        });

        it('drops expired copies on unlock', async () => {
            const { app, clip, sleep } = build({ [KEYS.CLEAR_ON_LOCK]: false });
            clip.copyText('stale');
            await flush();
            Main.lock(true);
            sleep(EXPIRED);

            Main.lock(false);

            expect(app._history.items).toEqual([]);
        });

        it('drops expired copies when the tile menu opens', async () => {
            const { app, clip, sleep } = build();
            clip.copyText('stale');
            await flush();
            sleep(EXPIRED);

            tile().menu.open();

            expect(app._history.items).toEqual([]);
            expect(
                descendants(tile().menu).filter(item => item.label?.text === 'stale'),
            ).toEqual([]);
        });
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
        expect(Main.notifications[0].body).toBe(
            'Auto-paste is unavailable. The item was copied; paste it yourself.',
        );
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

    it('refuses to pin text longer than a transform would take', () => {
        const { app, settings } = build();
        app._actions.pin('x'.repeat(MAX_TRANSFORM_CHARS + 1));
        expect(settings.get_strv(KEYS.PINNED)).toEqual([]);
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
