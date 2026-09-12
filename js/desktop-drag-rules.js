((global) => {
    'use strict';

    const FILESYSTEM_MIME = 'application/x-nextcloud-desktop-files+json';
    const cleanPath = (path) => String(path || '').replace(/^\/+|\/+$/g, '');
    const parentPath = (path) => cleanPath(path).split('/').slice(0, -1).join('/');
    const itemName = (item) => String(item?.name || cleanPath(item?.path).split('/').pop() || '');

    function validPath(path, allowRoot = true) {
        if (typeof path !== 'string' || /[\\\\\x00-\x1f\x7f]/.test(path)) return false;
        const value = cleanPath(path);
        return (!value ? allowRoot : value.split('/').every((part) => part && part !== '.' && part !== '..'));
    }

    // Memory-only, shell-local drag capability. Protected-mode dragover cannot read
    // getData; the unpredictable MIME type binds it to this exact live drag instead.
    let activeDrag = null;
    let dragTimer = null;
    let feedback = null;
    function trackHover(event, refresh) {
        const owner = dragOwner();
        if (owner.trackHover !== trackHover) return owner.trackHover(event, refresh);
        if (activeDrag) activeDrag.hover = refresh ? { event, refresh } : null;
    }
    function modifierChanged(key) {
        if (key.key === 'Escape') { endDrag(); return; }
        const hover = activeDrag?.hover;
        if (key.key !== 'Control' || !hover) return;
        const previous = hover.event;
        hover.refresh({ target: previous.target, clientX: previous.clientX, clientY: previous.clientY,
            button: 0, dataTransfer: previous.dataTransfer, ctrlKey: key.type === 'keydown',
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    }
    function dragOwner() {
        try { return global.parent !== global && global.parent.DesktopWorkspaceDragRules || global.DesktopWorkspaceDragRules; }
        catch (error) { return global.DesktopWorkspaceDragRules; }
    }
    function endDrag() {
        const owner = dragOwner();
        if (owner.endDrag !== endDrag) return owner.endDrag();
        const wasActive = !!activeDrag;
        clearTimeout(dragTimer);
        if (activeDrag) {
            activeDrag.documents.forEach((doc) => {
                doc.removeEventListener('keydown', modifierChanged, true);
                doc.removeEventListener('keyup', modifierChanged, true);
            });
            try {
            activeDrag.sourceWindow.removeEventListener('pagehide', endDrag);
            activeDrag.sourceWindow.document.removeEventListener('dragend', endDrag, true);
            } catch (error) { /* The source may have navigated or closed. */ }
        }
        activeDrag = null;
        feedback?.remove(); feedback = null;
        if (wasActive && global.dispatchEvent) global.dispatchEvent(new global.Event('desktop-workspace:drag-end'));
    }
    function beginDrag(payload, transfer, sourceWindow = global) {
        const owner = dragOwner();
        if (owner.beginDrag !== beginDrag) return owner.beginDrag(payload, transfer, sourceWindow);
        endDrag();
        const parsed = parseFilesystemPayload(payload);
        if (!parsed || !transfer) return null;
        const token = `application/x-desktop-drag-${Array.from(global.crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('')}`;
        const documents = [...new Set([global.document, sourceWindow.document].filter(Boolean))];
        activeDrag = { payload: parsed, token, sourceWindow, documents, expires: Date.now() + 120000 };
        documents.forEach((doc) => {
            doc.addEventListener('keydown', modifierChanged, true);
            doc.addEventListener('keyup', modifierChanged, true);
        });
        transfer.effectAllowed = 'copyMove';
        transfer.setData(FILESYSTEM_MIME, JSON.stringify(parsed));
        transfer.setData(token, '1');
        dragTimer = setTimeout(endDrag, 120000);
        sourceWindow.addEventListener('pagehide', endDrag, { once: true });
        sourceWindow.document.addEventListener('dragend', endDrag, { once: true, capture: true });
        return parsed;
    }
    function readDrag(transfer) {
        const owner = dragOwner();
        if (owner.readDrag !== readDrag) return owner.readDrag(transfer);
        if (!activeDrag || Date.now() > activeDrag.expires || activeDrag.sourceWindow.closed) { endDrag(); return null; }
        if (!Array.from(transfer?.types || []).includes(activeDrag.token)) return null;
        return activeDrag.payload;
    }
    function showDragFeedback(event, operation, frame = null) {
        const owner = dragOwner();
        if (owner.showDragFeedback !== showDragFeedback) return owner.showDragFeedback(event, operation, global.frameElement);
        if (!operation) { feedback?.remove(); feedback = null; return; }
        if (!feedback) {
            feedback = global.document.createElement('span');
            feedback.className = 'desktop-drag-feedback';
            feedback.setAttribute('aria-hidden', 'true');
            feedback.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;padding:2px 7px;border-radius:10px;background:var(--color-main-background,#fff);color:var(--color-main-text,#222);box-shadow:0 1px 5px #0006;font: bold 18px sans-serif';
            global.document.body.appendChild(feedback);
        }
        const bounds = frame?.getBoundingClientRect();
        feedback.textContent = operation.method === 'COPY' ? '+' : '↳';
        feedback.dataset.operation = operation.method;
        feedback.style.left = `${event.clientX + (bounds?.left || 0) + 16}px`;
        feedback.style.top = `${event.clientY + (bounds?.top || 0) + 18}px`;
    }

    function validFilesystemItems(items) {
        if (!Array.isArray(items) || items.length > 1000) return [];
        return items.filter((item) => typeof item?.path === 'string' && validPath(item.path, false)
            && itemName(item) === cleanPath(item.path).split('/').pop())
            .map((item) => ({ path: `/${cleanPath(item.path)}`, name: itemName(item), isFolder: item.isFolder === true,
                ...(typeof item.canMove === 'boolean' ? { canMove: item.canMove } : {}),
                ...(typeof item.canCopy === 'boolean' ? { canCopy: item.canCopy } : {}) }));
    }

    function createFilesystemPayload(items, sourceWindowId = '') {
        return { version: 1, sourceWindowId: String(sourceWindowId || ''), items: validFilesystemItems(items) };
    }

    function parseFilesystemPayload(raw) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
            const items = validFilesystemItems(parsed.items);
            if (!items.length || items.length !== parsed.items.length) return null;
            return createFilesystemPayload(items, parsed.sourceWindowId);
        } catch (error) { return null; }
    }

    function filesystemOperation(sources, targetFolder, copy = false) {
        const targetPath = cleanPath(targetFolder);
        const eligible = validFilesystemItems(sources);
        if (!validPath(targetFolder) || !eligible.length || eligible.length !== sources.length
            || new Set(eligible.map((item) => item.path)).size !== eligible.length) return null;
        for (const source of eligible) {
            if (copy ? source.canCopy === false : source.canMove === false) return null;
            const sourcePath = cleanPath(source.path);
            if (eligible.some((other) => other !== source && other.isFolder && sourcePath.startsWith(`${cleanPath(other.path)}/`))) return null;
            if (sourcePath === targetPath || parentPath(sourcePath) === targetPath) return null;
            if (source.isFolder && targetPath.startsWith(`${sourcePath}/`)) return null;
        }
        return { method: copy ? 'COPY' : 'MOVE', sources: eligible, targetPath };
    }

    function isDesktopFilesystemSource(item, desktopFolder) {
        return item?.kind === 'file'
            && !!cleanPath(item.path)
            && parentPath(item.path) === cleanPath(desktopFolder);
    }

    function dropOperation(sources, target, desktopFolder, copy = false) {
        if (!target?.isFolder || target.special || !cleanPath(target.path)) return null;
        const targetPath = cleanPath(target.path);
        const eligible = (sources || []).filter((item) => isDesktopFilesystemSource(item, desktopFolder));
        if (!eligible.length) return null;
        for (const source of eligible) {
            if (copy ? source.canCopy === false : source.canMove === false) return null;
            const sourcePath = cleanPath(source.path);
            if (eligible.some((other) => other !== source && other.isFolder && sourcePath.startsWith(`${cleanPath(other.path)}/`))) return null;
            if (sourcePath === targetPath || parentPath(sourcePath) === targetPath) return null;
            if (source.isFolder && targetPath.startsWith(`${sourcePath}/`)) return null;
        }
        return { method: copy ? 'COPY' : 'MOVE', sources: eligible, targetPath };
    }

    const validBasename = (name) => typeof name === 'string' && !!name.trim()
        && name !== '.' && name !== '..' && !/[\\/\\\\\x00-\x1f\x7f]/.test(name);

    // One dialog and retry contract for every drag destination. Never infer consent
    // from a collision or carry overwrite consent to another item/name.
    let conflictSequence = 0;
    function resolveConflict(name) {
        const owner = dragOwner();
        if (owner.resolveConflict !== resolveConflict) return owner.resolveConflict(name);
        const tr = (text) => typeof global.t === 'function' ? global.t('desktop_workspace', text) : text;
        return new Promise((resolve) => {
            const previous = global.document.activeElement;
            const dialog = global.document.createElement('dialog');
            const id = `desktop-transfer-conflict-${++conflictSequence}`;
            dialog.className = 'desktop-transfer-conflict';
            dialog.setAttribute('aria-labelledby', `${id}-title`);
            dialog.setAttribute('aria-describedby', `${id}-name`);
            dialog.style.cssText = 'max-width:min(480px,90vw);padding:24px;border:1px solid var(--color-border,#888);border-radius:var(--border-radius-container,12px);background:var(--color-main-background,#fff);color:var(--color-main-text,#222);box-shadow:0 8px 40px #0005';
            const title = global.document.createElement('h2');
            title.id = `${id}-title`; title.textContent = tr('Item already exists');
            const description = global.document.createElement('p');
            description.id = `${id}-name`; description.textContent = name;
            const label = global.document.createElement('label'); label.textContent = tr('Rename');
            const input = global.document.createElement('input');
            input.type = 'text'; input.value = name; input.required = true;
            input.pattern = '(?!\\.{1,2}$)(?!\\s*$)[^/\\\\\\x00-\\x1f\\x7f]+';
            input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:8px 0 20px';
            label.append(input);
            const actions = global.document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
            let settled = false;
            const finish = (decision) => {
                if (settled) return;
                settled = true;
                global.removeEventListener('pagehide', abort);
                dialog.close(); dialog.remove(); previous?.focus?.(); resolve(decision);
            };
            const abort = () => finish({ action: 'abort' });
            global.addEventListener('pagehide', abort, { once: true });
            dialog.addEventListener('close', abort);
            for (const [action, text] of [['rename', 'Rename'], ['overwrite', 'Overwrite'], ['abort', 'Cancel']]) {
                const button = global.document.createElement('button');
                button.type = 'button'; button.dataset.choice = action; button.textContent = tr(text);
                button.addEventListener('click', () => {
                    if (action === 'rename') {
                        if (!input.reportValidity() || !validBasename(input.value)) return;
                    }
                    finish({ action, name: input.value });
                });
                actions.append(button);
            }
            input.addEventListener('input', () => input.setCustomValidity(''));
            dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish({ action: 'abort' }); });
            dialog.append(title, description, label, actions);
            global.document.body.append(dialog); dialog.showModal();
            // The safe exit is the initial keyboard action; native dialog traps focus.
            actions.querySelector('[data-choice="abort"]').focus();
        });
    }

    async function transferWithConflicts(source, targetPath, request) {
        const invalidTransfer = (code) => Object.assign(new Error(typeof global.t === 'function'
            ? global.t('desktop_workspace', 'Could not complete file operation.') : code), { code });
        let name = itemName(source), overwrite = false;
        if (!validBasename(name) || !validPath(source?.path, false) || !validPath(targetPath)) throw invalidTransfer('Invalid transfer path');
        while (true) {
            const destination = `/${cleanPath(targetPath)}/${name}`.replace(/^\/\//, '/');
            const sourcePath = cleanPath(source.path), destinationPath = cleanPath(destination);
            // Revalidate every renamed destination, not just the initial target
            // directory. Replacing an ancestor could destroy the source itself.
            if (sourcePath === destinationPath || sourcePath.startsWith(`${destinationPath}/`)
                || (source.isFolder && destinationPath.startsWith(`${sourcePath}/`))) {
                throw invalidTransfer('Invalid transfer destination');
            }
            try {
                const response = await request(destination, overwrite);
                if (response && !response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
                return { destination };
            } catch (error) {
                if (error.status !== 412) throw error;
                const decision = await resolveConflict(name);
                if (decision.action === 'abort') return null;
                overwrite = decision.action === 'overwrite';
                if (decision.action === 'rename') {
                    if (!validBasename(decision.name)) throw invalidTransfer('Invalid name');
                    name = decision.name;
                }
            }
        }
    }

    global.DesktopWorkspaceDragRules = {
        FILESYSTEM_MIME, cleanPath, parentPath, validPath, beginDrag, readDrag, endDrag, showDragFeedback, trackHover, createFilesystemPayload,
        parseFilesystemPayload, filesystemOperation, isDesktopFilesystemSource, dropOperation,
        validBasename, resolveConflict, transferWithConflicts,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.DesktopWorkspaceDragRules;
})(typeof window !== 'undefined' ? window : globalThis);
