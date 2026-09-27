import { describe, expect, it } from 'vitest';

import { KIND } from '../modules/model.js';
import {
    MATCH_CHARS,
    PREVIEW_CHARS,
    blockedText,
    entries,
    fill,
    formatSize,
    pinnable,
    preview,
    rowText,
    step,
} from '../modules/listing.js';
import { REASON } from '../modules/privacy.js';
import { MAX_TRANSFORM_CHARS } from '../modules/transforms.js';

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

    it('never ends in half of a surrogate pair at the scan boundary', () => {
        const result = preview(' '.repeat(239) + '\u{1F600}' + 'rest of the text');
        expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
        expect(result.endsWith('…')).toBe(true);
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

    it('matches only the head of a long copy, pinned or not', () => {
        const pad = 'x'.repeat(MATCH_CHARS);
        const rows = entries({
            pinned: [`${pad}needle`, `needle${pad}`],
            items: [text(`${pad}needle`), text(`needle${pad}`)],
            query: 'needle',
        });
        expect(
            rows.map(row => [row.pinned, row.item.text.startsWith('needle')]),
        ).toEqual([
            [true, true],
            [false, true],
        ]);
    });
});

describe('pinnable', () => {
    it('takes text up to the transform limit, and nothing blank or longer', () => {
        expect(pinnable('snippet')).toBe(true);
        expect(pinnable('x'.repeat(MAX_TRANSFORM_CHARS))).toBe(true);
        expect(pinnable('x'.repeat(MAX_TRANSFORM_CHARS + 1))).toBe(false);
        expect(pinnable('')).toBe(false);
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

    it('fills every placeholder in order, %s and %d alike', () => {
        expect(fill('%s of %d, again %s', 'a', 2, 'c')).toBe('a of 2, again c');
    });

    it('leaves a placeholder past the last value untouched', () => {
        expect(fill('%s and %s', 'only')).toBe('only and %s');
    });

    it('does not let a later $ pattern read an earlier value', () => {
        expect(fill('%s then %s', '$&', '$1')).toBe('$& then $1');
    });
});
