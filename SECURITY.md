# Security policy

## Supported versions

The most recent release. QuickClip targets a single GNOME Shell major version
at a time; older releases are not patched.

## Reporting a vulnerability

Report privately through
[GitHub's advisory form](https://github.com/Ghost-Assembly/quickclip/security/advisories/new)
rather than opening an issue.

Please include the GNOME Shell version, the QuickClip version, and the app
you copied from, and the steps to reproduce. You can expect an acknowledgment
within a week.

## Scope

QuickClip reads the clipboard whenever it changes. It keeps what it reads in
memory only, never reads a copy marked with `x-kde-passwordManagerHint`,
never logs or notifies clipboard content, and stores only text you pin, in
GSettings. Reports of content reaching disk, logs, notifications or the lock
screen are in scope.

The parts worth scrutinizing are `modules/privacy.js` (`shouldRecord`),
`modules/recorder.js`, and `modules/model.js`.
