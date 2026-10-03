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

import xml from '../schemas/org.gnome.shell.extensions.quickclip.gschema.xml?raw';
import metadata from '../metadata.json' with { type: 'json' };

/** Key name -> declared type, straight out of the gschema. */
const declared = new Map(
    [...xml.matchAll(/<key\s+type="([^"]+)"\s+name="([^"]+)">/g)].map(match => [
        match[2],
        match[1],
    ]),
);

/** The <default> of one key, as written. */
function defaultOf(key) {
    const block = [...xml.matchAll(/<key\b[\s\S]*?<\/key>/g)].find(match =>
        match[0].includes(`name="${key}"`),
    );
    return /<default>([\s\S]*?)<\/default>/.exec(block[0])[1];
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

describe('shortcut keys', () => {
    // The gschema key is also the Mutter keybinding name, which is global to
    // the Shell; the prefix keeps it from colliding with another extension's.
    it('carry the extension prefix', () => {
        expect(KEYS.POPUP_SHORTCUT).toBe('quickclip-open-popup');
        expect(KEYS.PAUSE_SHORTCUT).toBe('quickclip-toggle-pause');
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
