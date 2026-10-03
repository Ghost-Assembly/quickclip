// What tests/docs.spec.js holds QuickClip's docs site to. The spec is shared
// across the extensions; this file is QuickClip's own.

export default {
    title: 'QuickClip',
    site: 'https://ghost-assembly.com/quickclip/',
    repo: 'https://github.com/Ghost-Assembly/quickclip',

    // [id, heading], in page order. The contents list must match.
    sections: [
        ['overview', 'Overview'],
        ['install', 'Install'],
        ['uninstall', 'Uninstall'],
        ['privacy', 'Privacy'],
        ['transforms', 'Transforms'],
        ['preferences', 'Preferences'],
        ['keyboard', 'Keyboard'],
        ['architecture', 'Architecture'],
        ['testing', 'Testing'],
        ['packaging', 'Packaging'],
        ['releasing', 'Releasing'],
        ['development', 'Development'],
    ],
};
