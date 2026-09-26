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
