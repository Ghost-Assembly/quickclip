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
