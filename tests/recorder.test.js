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

    it('records nothing and logs when reading the clipboard fails', async () => {
        const { clip, history } = build();
        vi.spyOn(clip, 'readText').mockRejectedValue(new Error('boom'));
        clip.copyText('will fail to read');
        await flush();

        expect(history.items).toEqual([]);
        expect(console.debug).toHaveBeenCalledWith(
            '[quickclip] could not read the clipboard',
        );
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
