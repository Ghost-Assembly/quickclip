import { describe, expect, it } from 'vitest';

import { KIND } from '../modules/model.js';
import {
    IMAGE_MIME,
    REASON,
    SENSITIVE_MIME,
    VISIBLE_REASONS,
    contentKind,
    shouldRecord,
} from '../modules/privacy.js';

const TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING'];
const base = {
    appId: 'org.gnome.TextEditor.desktop',
    paused: false,
    ignoredApps: [],
    imagesAllowed: true,
};

describe('contentKind', () => {
    it('prefers text when both are offered', () => {
        // LibreOffice offers a picture of copied cells next to their text.
        expect(contentKind([IMAGE_MIME, 'text/plain'])).toBe(KIND.TEXT);
    });

    it('knows an image, and nothing else', () => {
        expect(contentKind([IMAGE_MIME])).toBe(KIND.IMAGE);
        expect(contentKind(['application/x-thing'])).toBeNull();
        expect(contentKind([])).toBeNull();
    });
});

describe('shouldRecord', () => {
    it('records ordinary text', () => {
        expect(shouldRecord({ ...base, mimetypes: TEXT })).toEqual({
            record: true,
            kind: KIND.TEXT,
        });
    });

    it('never records a password manager copy, whatever the case', () => {
        for (const hint of [SENSITIVE_MIME, SENSITIVE_MIME.toLowerCase()])
            expect(shouldRecord({ ...base, mimetypes: [...TEXT, hint] })).toEqual({
                record: false,
                reason: REASON.SENSITIVE,
            });
    });

    it('checks pause first, so a paused copy leaves no trace', () => {
        expect(
            shouldRecord({
                ...base,
                paused: true,
                mimetypes: [...TEXT, SENSITIVE_MIME],
            }),
        ).toEqual({ record: false, reason: REASON.PAUSED });
    });

    it('skips copies made while an ignored app is focused', () => {
        expect(
            shouldRecord({ ...base, ignoredApps: [base.appId], mimetypes: TEXT }),
        ).toEqual({ record: false, reason: REASON.IGNORED_APP });
    });

    it('does not treat an unknown focus as ignored', () => {
        expect(
            shouldRecord({ ...base, appId: '', ignoredApps: [''], mimetypes: TEXT })
                .record,
        ).toBe(true);
    });

    it('skips images when images are off, and unknown types always', () => {
        expect(
            shouldRecord({ ...base, imagesAllowed: false, mimetypes: [IMAGE_MIME] }),
        ).toEqual({ record: false, reason: REASON.UNSUPPORTED });
        expect(shouldRecord({ ...base, mimetypes: ['x/unknown'] }).reason).toBe(
            REASON.UNSUPPORTED,
        );
    });

    it('shows only the reasons a person should see', () => {
        expect([...VISIBLE_REASONS].sort()).toEqual(
            [REASON.IGNORED_APP, REASON.SENSITIVE, REASON.TOO_LARGE].sort(),
        );
    });
});
