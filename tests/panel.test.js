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
        expire: record('expire'),
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

    it('asks for expired copies to be dropped each time the menu opens', () => {
        const { toggle, calls } = build();
        toggle.menu.open();
        toggle.menu.close();
        toggle.menu.open();
        expect(calls.filter(([name]) => name === 'expire')).toHaveLength(2);
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
