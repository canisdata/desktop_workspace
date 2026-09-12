/* App-owned bridge: read native Files metadata, never patch its components/stores. */
((global) => {
    'use strict';
    const ROW = '[data-cy-files-list-row-fileid]'; // List and FileEntryGrid share this attribute.
    const AREA = '#app-content-vue, .files-list';
    const installed = new WeakMap();
    const frames = new Set();
    const reloading = new WeakSet();
    const rules = () => global.DesktopWorkspaceDragRules;
    const translate = (text) => typeof global.t === 'function' ? global.t('desktop_workspace', text) : text;

    function davRoot() {
        const uid = global.OC?.getCurrentUser?.()?.uid || global.OC?.currentUser;
        if (typeof uid !== 'string' || !uid) return null;
        const root = global.OC?.webroot || '';
        return new URL(`${root}/remote.php/dav/files/${encodeURIComponent(uid)}/`, global.location.origin);
    }

    function nodeItem(node, allowRoot = false) {
        try {
            if (!node || !['file', 'folder'].includes(node.type) || !Number.isInteger(node.permissions)
                || !rules().validPath(node.path, allowRoot)) return null;
            const base = davRoot();
            if (!base || typeof node.source !== 'string') return null;
            const url = new URL(node.encodedSource || node.source, global.location.origin);
            if (url.origin !== base.origin || url.search || url.hash || !url.pathname.startsWith(base.pathname)) return null;
            const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
            if (rules().cleanPath(path) !== rules().cleanPath(node.path)) return null;
            const name = rules().cleanPath(node.path).split('/').pop();
            if (name && node.basename !== name) return null;
            return { path: `/${rules().cleanPath(node.path)}`, name, isFolder: node.type === 'folder', canMove: (node.permissions & 2) !== 0, canCopy: (node.permissions & 1) !== 0 };
        } catch (error) { return null; }
    }

    function sourceItems(vm) {
        try {
            if (vm?.canDrag !== true || vm.isLoading || vm.isFailedSource || vm.isRenaming) return null;
            const nodes = Array.isArray(vm.selectedFiles) && vm.selectedFiles.includes(vm.source?.source)
                ? vm.selectedFiles.map((source) => vm.filesStore.getNode(source)) : [vm.source];
            // Shared transfers can change modifiers in any receiving frame. Require
            // readable metadata up front; per-operation permissions are checked by the rules.
            // Unknown/read-only capabilities remain native, not cross-window drags.
            if (!nodes.length || nodes.some((node) => !Number.isInteger(node?.permissions) || (node.permissions & 1) !== 1)) return null;
            const items = nodes.map((node) => nodeItem(node));
            if (items.some((item) => !item)) return null;
            return rules().parseFilesystemPayload(rules().createFilesystemPayload(items))?.items || null;
        } catch (error) { return null; }
    }

    function folderContext(doc, target) {
        if (!target?.closest?.(AREA) || target.closest('.modal-mask, .viewer, #viewer')) return null;
        const row = target.closest(ROW);
        let vm = row?.__vue__;
        let folder;
        if (row) {
            // Dropping on a file is not dropping on the background.
            if (!vm || vm.isLoading || vm.isFailedSource || vm.source?.type !== 'folder') return null;
            folder = vm.source;
        } else {
            for (let el = target; el; el = el.parentElement) {
                if (el.__vue__?.activeFolder || el.__vue__?.activeStore?.activeFolder) { vm = el.__vue__; break; }
            }
            if (!vm) vm = doc.querySelector(ROW)?.__vue__;
            if (!vm) {
                for (const el of doc.querySelectorAll(`${AREA.split(', ')[0]}, #app-content-vue *`)) {
                    if (el.__vue__?.activeFolder || el.__vue__?.activeStore?.activeFolder) { vm = el.__vue__; break; }
                }
            }
            folder = vm?.activeFolder || vm?.activeStore?.activeFolder;
        }
        const item = nodeItem(folder, true);
        if (!item?.isFolder || (folder.permissions & 4) !== 4) return null;
        return { path: item.path, element: row || target.closest(AREA) };
    }

    function refresh(onlyFrame = null) {
        for (const frame of onlyFrame ? [onlyFrame] : frames) {
            try {
                if (!frame.isConnected) { frames.delete(frame); continue; }
                const doc = frame.contentDocument;
                if (!doc || !installed.has(doc) || reloading.has(doc)) continue;
                // One reload per document; load/installation never sends refresh messages.
                reloading.add(doc);
                frame.contentWindow.location.reload();
            } catch (error) { frames.delete(frame); }
        }
    }

    function progress(method) {
        const box = global.document.createElement('div');
        box.className = 'desktop-upload-overlay desktop-operation-overlay';
        box.setAttribute('role', 'status');
        box.setAttribute('aria-label', translate(method === 'COPY' ? 'Copy' : 'Move'));
        box.innerHTML = '<div class="desktop-upload-card"><div class="desktop-upload-bar desktop-upload-bar-indeterminate"><div class="desktop-upload-fill"></div></div></div>';
        (global.document.querySelector('#desktop-stage') || global.document.body).appendChild(box);
        return box;
    }

    async function execute(operation, onComplete) {
        const checked = operation && ['MOVE', 'COPY'].includes(operation.method)
            && rules().filesystemOperation(operation.sources, operation.targetPath, operation.method === 'COPY');
        const base = davRoot();
        if (!checked || !base) return null;
        const ui = progress(checked.method);
        const result = { method: checked.method, succeeded: [], failed: [] };
        const urlFor = (path) => new URL(rules().cleanPath(path).split('/').map(encodeURIComponent).join('/'), base).href;
        try {
            for (const source of checked.sources) {
                try {
                    const completed = await rules().transferWithConflicts(source, checked.targetPath, (destination, overwrite) => global.fetch(urlFor(source.path), {
                        method: checked.method,
                        credentials: 'same-origin',
                        headers: {
                            Destination: urlFor(destination), Overwrite: overwrite ? 'T' : 'F', Depth: 'infinity',
                            'X-Requested-With': 'XMLHttpRequest',
                            ...(global.OC?.requestToken ? { requesttoken: global.OC.requestToken } : {}),
                        },
                    }));
                    if (!completed) { result.aborted = true; break; }
                    result.succeeded.push({ ...source, destination: completed.destination });
                } catch (error) { result.failed.push({ ...source, error: String(error.message || error) }); }
            }
        } finally {
            ui.remove();
            if (result.failed.length) global.alert(translate('Could not complete file operation.') + '\n' + result.failed.map((item) => `${item.name}: ${item.error}`).join('\n'));
            if (typeof onComplete !== 'function') refresh();
            try {
                if (typeof onComplete === 'function') await onComplete(result);
                global.dispatchEvent(new global.CustomEvent('desktop-workspace:native-files-complete', { detail: result }));
            } catch (error) { global.console?.warn('Desktop Files refresh callback failed', error); }
        }
        return result;
    }

    function install(iframe, options = {}) {
        let doc, win;
        try {
            doc = iframe.contentDocument; win = iframe.contentWindow;
            if (!doc?.documentElement || !win || win.location.origin !== global.location.origin
                || !/\/apps\/files(?:\/|$)/.test(win.location.pathname) || !rules()) return false;
        } catch (error) { return false; }
        if (installed.has(doc)) { installed.get(doc).options = options; return true; }
        const state = { options, marked: null, outline: '', busy: false };
        installed.set(doc, state); frames.add(iframe);
        const clear = () => {
            if (state.marked) {
                state.marked.style.outline = state.outline;
                delete state.marked.dataset.desktopDropTarget; state.marked = null;
            }
            rules().showDragFeedback({}, null, iframe);
        };
        global.addEventListener('desktop-workspace:drag-end', clear);
        const operationAt = (event, payload) => {
            try {
                if (state.busy || event.button > 0) return null;
                const context = folderContext(doc, event.target);
                const operation = context && rules().filesystemOperation(payload.items, context.path, event.ctrlKey);
                return operation ? { context, operation } : null;
            } catch (error) { return null; }
        };
        doc.addEventListener('dragstart', (event) => {
            const row = event.target?.closest?.(ROW);
            const items = sourceItems(row?.__vue__);
            if (!items || !event.dataTransfer || state.busy) return;
            const payload = rules().createFilesystemPayload(items, iframe.closest?.('[data-window-id]')?.dataset.windowId || 'native-files');
            // Native onDragStart clears DataTransfer: own only validated filesystem drags.
            if (!rules().beginDrag(payload, event.dataTransfer, win)) return;
            event.stopImmediatePropagation();
            try { event.dataTransfer.setDragImage(row, 12, 12); } catch (error) { /* browser default image */ }
        }, true);
        const hover = (event) => {
            rules().trackHover(event, hover);
            const payload = rules().readDrag(event.dataTransfer);
            if (!payload) return;
            event.preventDefault(); event.stopImmediatePropagation(); clear();
            const match = operationAt(event, payload);
            event.dataTransfer.dropEffect = match ? (match.operation.method === 'COPY' ? 'copy' : 'move') : 'none';
            if (match) {
                state.marked = match.context.element; state.outline = state.marked.style.outline;
                state.marked.style.outline = '2px solid var(--color-primary-element, #0082c9)';
                state.marked.dataset.desktopDropTarget = match.operation.method;
            }
            rules().showDragFeedback(event, match?.operation || null, iframe);
        };
        doc.addEventListener('dragover', hover, true);
        doc.addEventListener('drop', async (event) => {
            const payload = rules().readDrag(event.dataTransfer);
            if (!payload) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const match = operationAt(event, payload);
            clear(); rules().endDrag();
            if (!match) return;
            state.busy = true;
            try { await execute(match.operation, state.options.onComplete); }
            catch (error) { global.console?.warn('Desktop native Files transfer failed', error); }
            finally { state.busy = false; }
        }, true);
        doc.addEventListener('dragleave', (event) => { if (!event.relatedTarget || !doc.documentElement.contains(event.relatedTarget)) { clear(); rules().trackHover(event, null); } }, true);
        doc.addEventListener('dragend', () => { clear(); rules().endDrag(); }, true);
        win.addEventListener('pagehide', () => { global.removeEventListener('desktop-workspace:drag-end', clear); clear(); rules().endDrag(); frames.delete(iframe); }, { once: true });
        win.addEventListener('message', (event) => {
            if (event.source === global && event.origin === global.location.origin && event.data?.type === 'nextcloud-desktop:files-reload') refresh(iframe);
        });
        return true;
    }

    // Desktop icons use pointer capture, not HTML drag events. Hit-test the
    // receiving document in its own CSS pixels and reuse the exact native guards.
    function pointerMatch(iframe, point, items, copy) {
        try {
            const doc = iframe.contentDocument, state = installed.get(doc);
            if (!iframe.isConnected || !state || state.busy) return null;
            const rect = iframe.getBoundingClientRect();
            const x = (point.clientX - rect.left) * iframe.offsetWidth / rect.width - iframe.clientLeft;
            const y = (point.clientY - rect.top) * iframe.offsetHeight / rect.height - iframe.clientTop;
            const context = folderContext(doc, doc.elementFromPoint(x, y));
            const operation = context && rules().filesystemOperation(items, context.path, copy);
            return operation ? { iframe, context, operation, state } : null;
        } catch (error) { return null; }
    }

    async function executePointer(match) {
        if (!match || match.state.busy || !match.iframe.isConnected) return;
        match.state.busy = true;
        try { return await execute(match.operation, match.state.options.onComplete); }
        finally { match.state.busy = false; }
    }

    global.DesktopWorkspaceNativeFilesDrag = { install, refresh, execute, pointerMatch, executePointer, nodeItem, sourceItems, folderContext };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.DesktopWorkspaceNativeFilesDrag;
})(typeof window !== 'undefined' ? window : globalThis);
