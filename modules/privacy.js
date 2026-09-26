// Whether a copy may be recorded at all.
//
// Imports only modules/model.js's KIND. The decision is made from the MIME
// types on offer, before anything is read, so a password manager's copy is
// never transferred into the Shell's memory in the first place.

import { KIND } from './model.js';

/**
 * The type KeePassXC and other KDE-convention password managers add to a
 * secret they copy. Its presence, not its value, is the signal.
 */
export const SENSITIVE_MIME = 'x-kde-passwordManagerHint';

/** The one image type recorded. */
export const IMAGE_MIME = 'image/png';

/** Longest text recorded. Beyond this the copy is refused, not truncated. */
export const MAX_TEXT_CHARS = 1_000_000;

const TEXT_MIMES = new Set([
    'text/plain;charset=utf-8',
    'text/plain',
    'UTF8_STRING',
    'STRING',
    'TEXT',
]);

/** Why a copy was not recorded. */
export const REASON = Object.freeze({
    PAUSED: 'paused',
    SENSITIVE: 'sensitive',
    IGNORED_APP: 'ignored-app',
    TOO_LARGE: 'too-large',
    UNSUPPORTED: 'unsupported',
});

/** Reasons the menu shows as a row, so protection is visible. */
export const VISIBLE_REASONS = new Set([
    REASON.SENSITIVE,
    REASON.IGNORED_APP,
    REASON.TOO_LARGE,
]);

/**
 * What a copy holds, from its MIME types. Text wins when both are offered.
 *
 * @param {string[]} mimetypes Types on offer.
 * @returns {string|null} A KIND value, or null for anything else.
 */
export function contentKind(mimetypes) {
    if (mimetypes.some(mime => TEXT_MIMES.has(mime))) return KIND.TEXT;
    if (mimetypes.includes(IMAGE_MIME)) return KIND.IMAGE;
    return null;
}

/**
 * @param {{mimetypes: string[], appId: string, paused: boolean,
 *   ignoredApps: string[], imagesAllowed: boolean}} copy The copy and the
 *   state it was made in.
 * @returns {{record: true, kind: string}|{record: false, reason: string}} The decision.
 */
export function shouldRecord({ mimetypes, appId, paused, ignoredApps, imagesAllowed }) {
    if (paused) return { record: false, reason: REASON.PAUSED };

    const hint = SENSITIVE_MIME.toLowerCase();
    if (mimetypes.some(mime => mime.toLowerCase() === hint))
        return { record: false, reason: REASON.SENSITIVE };

    if (appId && ignoredApps.includes(appId))
        return { record: false, reason: REASON.IGNORED_APP };

    const kind = contentKind(mimetypes);
    if (!kind || (kind === KIND.IMAGE && !imagesAllowed))
        return { record: false, reason: REASON.UNSUPPORTED };

    return { record: true, kind };
}
