'use strict';

const assert = require('node:assert/strict');
const rules = require('../js/desktop-drag-rules.js');

const desktop = '/Desktop';
const file = { kind: 'file', path: '/Desktop/report.txt', isFolder: false };
const folder = { kind: 'file', path: '/Desktop/Projects', isFolder: true };
const nested = { kind: 'file', path: '/Desktop/Projects/child.txt', isFolder: false };
const favoriteFolder = { kind: 'fav', path: '/Archive', isFolder: true };

assert.equal(rules.isDesktopFilesystemSource(file, desktop), true);
assert.equal(rules.isDesktopFilesystemSource(nested, desktop), false, 'only direct Desktop children are filesystem drag sources');
assert.equal(rules.isDesktopFilesystemSource({ kind: 'fav', path: '/Elsewhere/a.txt' }, desktop), false);
assert.equal(rules.isDesktopFilesystemSource({ kind: 'app', path: '/Desktop/fake' }, desktop), false);
assert.equal(rules.isDesktopFilesystemSource({ kind: 'special', path: '/Desktop/fake' }, desktop), false);

assert.deepEqual(rules.dropOperation([file], favoriteFolder, desktop), {
    method: 'MOVE', sources: [file], targetPath: 'Archive',
});
assert.equal(rules.dropOperation([file], favoriteFolder, desktop, true)?.method, 'COPY');
assert.equal(rules.dropOperation([file], { kind: 'file', path: '/Desktop', isFolder: true }, desktop), null, 'same-parent move/copy is a no-op');
assert.equal(rules.dropOperation([folder], { kind: 'file', path: '/Desktop/Projects/Sub', isFolder: true }, desktop), null, 'folder cannot enter descendant');
assert.equal(rules.dropOperation([folder], { kind: 'file', path: '/Desktop/Projects', isFolder: true }, desktop), null, 'folder cannot enter itself');
assert.equal(rules.dropOperation([file], { kind: 'file', path: '/Archive/nope.txt', isFolder: false }, desktop), null);
assert.equal(rules.dropOperation([file], { special: 'home', path: '/', isFolder: true }, desktop), null);

const payload = rules.createFilesystemPayload([
    { path: '/Documents/report.txt', name: 'report.txt', isFolder: false },
    { path: '/Documents/Projects', name: 'Projects', isFolder: true },
], 'files-window-1');
assert.equal(payload.version, 1);
assert.equal(payload.sourceWindowId, 'files-window-1');
assert.deepEqual(rules.parseFilesystemPayload(JSON.stringify(payload)), payload);
assert.equal(rules.parseFilesystemPayload('{"version":2,"items":[]}'), null);
assert.equal(rules.parseFilesystemPayload('{broken'), null);
assert.equal(rules.parseFilesystemPayload(JSON.stringify({ version: 1, items: [{ path: '/' }] })), null);

assert.deepEqual(rules.filesystemOperation(payload.items, '/Archive', false), {
    method: 'MOVE',
    sources: payload.items,
    targetPath: 'Archive',
});
assert.equal(rules.filesystemOperation(payload.items, '/Archive', true)?.method, 'COPY');
assert.equal(rules.filesystemOperation(payload.items, '/', false)?.targetPath, '', 'account root is a valid destination');
assert.equal(rules.filesystemOperation([payload.items[0]], '/Documents', false), null, 'same parent is a no-op');
assert.equal(rules.filesystemOperation([payload.items[1]], '/Documents/Projects', false), null, 'self drop is invalid');
assert.equal(rules.filesystemOperation([payload.items[1]], '/Documents/Projects/Child', false), null, 'descendant drop is invalid');
assert.equal(rules.filesystemOperation([{ path: '/', name: '', isFolder: true }], '/Archive', false), null);

assert.equal(rules.filesystemOperation([{ path: '/src/a', name: '../escape' }], '/Target'), null);
assert.equal(rules.filesystemOperation([{ path: '/src', isFolder: true }], '/other/../src/child'), null);
assert.equal(rules.filesystemOperation([{ path: '/src/a' }, { path: '/src/a' }], '/Target'), null);
assert.equal(rules.filesystemOperation([{ path: '/src', isFolder: true }, { path: '/src/a' }], '/Target'), null);
assert.equal(rules.filesystemOperation([{ path: '/src/a', canMove: false, canCopy: true }], '/Target'), null);
assert.equal(rules.filesystemOperation([{ path: '/src/a', canMove: false, canCopy: true }], '/Target', true)?.method, 'COPY');
assert.equal(rules.filesystemOperation([{ path: '/src/a', canCopy: false }], '/Target', true), null);
console.log('desktop drag rules: all assertions passed');

require('node:test')('invalid transfer errors use the active locale and retain a diagnostic code', async () => {
    const translations = require('../l10n/de.json').translations;
    const previous = globalThis.t;
    globalThis.t = (app, key) => { assert.equal(app, 'desktop_workspace'); return translations[key] || key; };
    try {
        await assert.rejects(rules.transferWithConflicts({ path: '/Desktop/a', name: 'Desktop' }, '/', () => {
            assert.fail('An invalid destination must not trigger a request');
        }), (error) => {
            assert.equal(error.code, 'Invalid transfer destination');
            assert.equal(error.message, translations['Could not complete file operation.']);
            assert.notEqual(error.message, 'Could not complete file operation.');
            return true;
        });
    } finally {
        if (previous === undefined) delete globalThis.t; else globalThis.t = previous;
    }
});
