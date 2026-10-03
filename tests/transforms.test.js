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

    it('offers neither for text with no words in it', () => {
        expect(ids(text('-- __ !!'))).not.toContain('snake');
        expect(ids(text('-- __ !!'))).not.toContain('kebab');
    });
});

describe('time', () => {
    it('accepts supported clock precision and rejects malformed suffixes', () => {
        for (const value of [
            '2025-09-25T12:00Z',
            '2025-09-25 12:00:00.123+00:00',
            ' 2025-09-25T14:00:00+0200 ',
        ]) {
            expect(run('iso-to-epoch', value)).toBe('1758801600');
        }
        for (const value of [
            '2025-09-25T12:00:00Zjunk',
            '2025-09-25T12:00:00.' + '1'.repeat(10000) + 'junk',
            '2025-09-25T12:00 extra',
        ]) {
            expect(() => run('iso-to-epoch', value)).toThrow('Not an ISO date');
        }
    });

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
