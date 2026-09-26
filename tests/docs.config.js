// What tests/docs.spec.js holds QuickClip's docs site to. The spec is shared
// across the extensions; this file is QuickClip's own.

export default {
    title: 'QuickClip',
    site: 'https://ghost-assembly.github.io/quickclip/',
    repo: 'https://github.com/Ghost-Assembly/quickclip',

    // [id, heading], in page order. The contents list must match.
    sections: [
        ['overview', 'Overview'],
        ['install', 'Install'],
        ['privacy', 'Privacy'],
        ['transforms', 'Transforms'],
        ['preferences', 'Preferences'],
        ['keyboard', 'Keyboard & mouse'],
        ['architecture', 'Architecture'],
        ['development', 'Development'],
        ['releasing', 'Releasing'],
    ],
};
