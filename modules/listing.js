// How history items read in a menu or the popup, which ones show, and which
// can be pinned.
//
// Imports only pure modules, so prefs.js can load it too. Every string built
// here is set as a label's `text`, never as markup, so a copy of "<b>" shows
// as exactly that.

import { KIND } from './model.js';
import { REASON } from './privacy.js';
import { MAX_TRANSFORM_CHARS } from './transforms.js';

/** Characters shown for a text item. */
export const PREVIEW_CHARS = 60;

/**
 * How far into a copy a preview looks. Collapsing whitespace across a
 * multi-megabyte copy on every menu build would stall the Shell.
 */
const SCAN_CHARS = PREVIEW_CHARS * 4;

/**
 * How far into a copy the filter looks. Lowercasing a hundred 1 MB copies on
 * every keystroke would stall the Shell; what is typed to find a copy is
 * nearly always near its start.
 */
export const MATCH_CHARS = 10_000;

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
    let head = text.slice(0, SCAN_CHARS);
    // Drop a trailing unpaired high surrogate if a surrogate pair straddles
    // the scan boundary.
    if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
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
 * Whether text may be pinned. A pin is stored in GSettings, which is not meant
 * for megabytes, so the cap is the transform limit.
 *
 * @param {string} text The text to pin.
 * @returns {boolean} True for non-empty text of at most MAX_TRANSFORM_CHARS.
 */
export function pinnable(text) {
    return text.length > 0 && text.length <= MAX_TRANSFORM_CHARS;
}

/**
 * Pinned snippets then history, filtered by a query against the first
 * MATCH_CHARS characters of each. Images have no text to match, so they are
 * hidden while a query is typed.
 *
 * @param {{pinned: string[], items: object[], query?: string}} source What to list.
 * @returns {Array<{pinned: boolean, index?: number, item: object}>} Rows.
 */
export function entries({ pinned, items, query = '' }) {
    const needle = query.trim().toLowerCase();
    const match = text =>
        !needle || text.slice(0, MATCH_CHARS).toLowerCase().includes(needle);

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
