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
        expect(extension.preferencesOpened).toBe(1);
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
