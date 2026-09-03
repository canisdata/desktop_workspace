(() => {
    'use strict';
    const t = (text, vars = {}) => window.OC?.L10N?.translate ? OC.L10N.translate('desktop_workspace', text, vars) : text.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? '');

    const root = document.querySelector('[data-desktop-files-root]');
    if (!root || root.dataset.desktopLaunch !== 'true') return;

    const rows = document.getElementById('desktop-files-rows');
    const pathLabel = document.getElementById('desktop-files-path');
    const tree = document.getElementById('desktop-files-tree');
    const detailSidebar = document.getElementById('desktop-files-detail-sidebar');
    const contextMenu = document.getElementById('desktop-files-context-menu');

    // Thumbnail fallback to the mimetype icon (inline onerror is blocked by Nextcloud's CSP).
    // Image error events don't bubble, so listen in the capture phase on the rows container.
    rows.addEventListener('error', (event) => {
        const img = event.target;
        if (img && img.tagName === 'IMG' && img.dataset && img.dataset.fallback) {
            const fb = img.dataset.fallback;
            img.dataset.fallback = '';
            img.src = fb;
        }
    }, true);
    const copyBtn = document.querySelector('[data-action="copy"]');
    const cutBtn = document.querySelector('[data-action="cut"]');
    const pasteBtn = document.querySelector('[data-action="paste"]');
    const FILES_ICON = (window.OC && OC.imagePath && OC.imagePath('desktop_workspace', 'files.svg')) || '/apps/desktop_workspace/img/files.svg';
    const uid = root.dataset.userId || OC?.getCurrentUser?.()?.uid || 'admin';
    let currentPath = '/';
    let currentItems = [];
    let selectedItem = null;
    let selection = new Set();
    let anchorIndex = null;
    let clipboard = null;
    let detailsOpen = false;
    let dragged = null;

    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const iconHtml = (kind) => `<span class="desktop-files-symbol desktop-files-symbol-${kind}" aria-hidden="true"></span>`;
    const mimeIconUrl = (item) => (window.OC && OC.MimeType && OC.MimeType.getIconUrl)
        ? OC.MimeType.getIconUrl(item.isFolder ? 'dir' : (item.mime || 'application/octet-stream'))
        : '';
    // Same visuals as Nextcloud Files: a preview where available, otherwise the mimetype icon.
    function fileVisual(item) {
        const fb = mimeIconUrl(item);
        if (!item.isFolder && item.fileId && window.OC && OC.generateUrl) {
            const url = OC.generateUrl('/core/preview?fileId={id}&x=64&y=64&a=1&mimeFallback=true', { id: String(item.fileId) });
            return `<img class="desktop-files-thumb" src="${url}" alt="" loading="lazy"${fb ? ` data-fallback="${escapeHtml(fb)}"` : ''}>`;
        }
        return `<img class="desktop-files-thumb" src="${fb}" alt="">`;
    }
    const folderVisual = () => `<img class="desktop-files-thumb" src="${(window.OC && OC.MimeType && OC.MimeType.getIconUrl) ? OC.MimeType.getIconUrl('dir') : ''}" alt="">`;

    function postToDesktop(message) { window.parent?.postMessage(message, window.location.origin); }
    const myWindowId = (() => { try { return new URLSearchParams(window.location.search).get('windowId') || 'desktop-files'; } catch (e) { return 'desktop-files'; } })();
    function notifyPath() { postToDesktop({ type: 'nextcloud-desktop:window-meta', appId: myWindowId, title: t('Desktop Files'), subtitle: currentPath }); }

    // Cross-window clipboard, shared with the desktop shell via localStorage so cut/copy in
    // either one can be pasted in the other. Shape: { mode:'cut'|'copy', items:[{path,name,isFolder}] }.
    const SHARED_CLIP_KEY = 'desktop-files:clipboard';
    function writeSharedClipboard(mode, items) {
        try { localStorage.setItem(SHARED_CLIP_KEY, JSON.stringify({ mode, items, ts: Date.now() })); } catch (e) { /* ignore */ }
    }
    function readSharedClipboard() {
        try { const v = JSON.parse(localStorage.getItem(SHARED_CLIP_KEY) || 'null'); return (v && Array.isArray(v.items) && v.items.length) ? v : null; } catch (e) { return null; }
    }
    function clearSharedClipboard() { try { localStorage.removeItem(SHARED_CLIP_KEY); } catch (e) { /* ignore */ } }
    // Tell the desktop shell that the filesystem changed so it can refresh the desktop folder.
    function notifyDesktopChanged() { postToDesktop({ type: 'nextcloud-desktop:desktop-reload' }); }
    function cleanPath(path) { const parts = String(path || '/').split('/').filter(Boolean); return `/${parts.join('/')}` || '/'; }
    function joinPath(base, name) { return cleanPath(`${cleanPath(base).replace(/\/$/, '')}/${name}`); }
    function davUrl(path) { const clean = cleanPath(path); return `/remote.php/dav/files/${encodeURIComponent(uid)}${clean.split('/').map(encodeURIComponent).join('/')}`; }
    function versionDavUrl(fileId, version = '') { return `/remote.php/dav/versions/${encodeURIComponent(uid)}/versions/${encodeURIComponent(fileId)}${version ? `/${encodeURIComponent(version)}` : ''}`; }
    function ocsUrl(path, params = {}) { const query = new URLSearchParams({ format: 'json', ...params }); return `/ocs/v2.php/${path.replace(/^\//, '')}?${query}`; }
    function requestHeaders(extra = {}) { return { 'X-Requested-With': 'XMLHttpRequest', ...(window.OC?.requestToken ? { requesttoken: OC.requestToken } : {}), ...extra }; }
    function filesUrl(path = currentPath) { return `/index.php/apps/files/files?dir=${encodeURIComponent(path || '/')}`; }
    function parentPath(path) { const parts = cleanPath(path).split('/').filter(Boolean); parts.pop(); return `/${parts.join('/')}` || '/'; }
    function itemFromRow(row) { return currentItems.find((item) => item.path === row?.dataset.path) || null; }
    function humanSize(bytes) { const n = Number(bytes || 0); if (!n) return '—'; const units = ['B', 'KB', 'MB', 'GB']; let value = n; let i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${value.toFixed(i ? 1 : 0)} ${units[i]}`; }

    async function propfind(path = '/', depth = '1') {
        const response = await fetch(davUrl(path), {
            method: 'PROPFIND', credentials: 'same-origin',
            headers: requestHeaders({ Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' }),
            body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:resourcetype/><oc:fileid/></d:prop></d:propfind>',
        });
        if (!response.ok) throw new Error(`WebDAV HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        return Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).slice(depth === '0' ? 0 : 1).map((node) => {
            const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
            const name = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || '') || cleanPath(path).split('/').pop() || t('Files');
            const isFolder = Boolean(node.getElementsByTagNameNS('DAV:', 'collection')[0]);
            const size = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '';
            const modified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';
            const fileId = node.getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')[0]?.textContent || '';
            const mime = node.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
            return { name, isFolder, size, modified, fileId, mime, path: depth === '0' ? cleanPath(path) : joinPath(path, name) };
        }).filter((item) => item.name).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
    }

    async function load(path = '/') {
        currentPath = cleanPath(path); selectedItem = null; selection.clear(); anchorIndex = null; hideContextMenu();
        if (pathLabel) pathLabel.textContent = currentPath; notifyPath(); updateClipboardBar();
        rows.innerHTML = `<tr><td colspan="4">${escapeHtml(t('Loading…'))}</td></tr>`;
        currentItems = await propfind(currentPath, '1');
        renderRows(currentItems); renderDetails(null); ensureTreePath(currentPath).catch(() => {});
    }

    function renderRows(items) {
        rows.innerHTML = items.map((item) => `
            <tr draggable="true" data-name="${escapeHtml(item.name)}" data-path="${escapeHtml(item.path)}" data-file-id="${escapeHtml(item.fileId)}" data-mime="${escapeHtml(item.mime)}" data-folder="${item.isFolder ? 'true' : 'false'}">
                <td><button type="button" class="desktop-files-name" data-action="open-item">${fileVisual(item)} <span>${escapeHtml(item.name)}</span></button></td>
                <td>${item.isFolder ? t('Folder') : t('File')}</td><td>${item.isFolder ? '—' : escapeHtml(humanSize(item.size))}</td><td class="desktop-files-modified-cell">${escapeHtml(item.modified)} <button type="button" class="desktop-files-info" data-action="info" title="${escapeHtml(t('Details'))}" aria-label="${escapeHtml(t('Details'))}">&#x24D8;</button></td>
            `).join('') || `<tr><td colspan="4">${escapeHtml(t('No files'))}</td></tr>`;
    }

    function indexOfPath(path) { return currentItems.findIndex((i) => i.path === path); }

    function paintSelection() {
        rows.querySelectorAll('tr.is-selected').forEach((row) => row.classList.remove('is-selected'));
        selection.forEach((p) => rows.querySelector(`tr[data-path="${CSS.escape(p)}"]`)?.classList.add('is-selected'));
        const primaryPath = [...selection].pop();
        selectedItem = currentItems.find((i) => i.path === primaryPath) || null;
        renderDetails(selection.size === 1 ? selectedItem : null);
        updateClipboardBar();
    }

    // Programmatic single-select (used after operations and from the context menu).
    function selectItem(item) {
        if (!item) { selection.clear(); anchorIndex = null; paintSelection(); return; }
        anchorIndex = indexOfPath(item.path);
        selection = new Set([item.path]);
        paintSelection();
    }

    // Pointer-driven selection: plain = replace, ctrl/cmd = toggle (disparate), shift = range (contiguous).
    function handleRowSelect(item, event) {
        const idx = indexOfPath(item.path);
        if (event.shiftKey && anchorIndex !== null && anchorIndex < currentItems.length) {
            const [a, b] = [anchorIndex, idx].sort((x, y) => x - y);
            selection = new Set(currentItems.slice(a, b + 1).map((i) => i.path));
            // keep the clicked row as "primary" (last in iteration order) for the details panel
            selection.delete(item.path); selection.add(item.path);
        } else if (event.ctrlKey || event.metaKey) {
            if (selection.has(item.path)) selection.delete(item.path); else selection.add(item.path);
            anchorIndex = idx;
        } else {
            selection = new Set([item.path]);
            anchorIndex = idx;
        }
        paintSelection();
    }

    function propertyWindowId(item) {
        return `details-${item.fileId || btoa(item.path).replace(/=+$/g, '')}`;
    }

    function isPropertyWindowOpen(item) {
        try {
            const hrefPart = `/index.php/apps/desktop_workspace/files/details?`;
            return [...window.parent.document.querySelectorAll('iframe.desktop-window-iframe')]
                .some((frame) => frame.src.includes(hrefPart) && frame.src.includes(`filePath=${encodeURIComponent(item.path)}`));
        } catch (error) {
            return false;
        }
    }

    function renderDetails(item) {
        if (!detailSidebar) return;
        if (!detailsOpen || !item || isPropertyWindowOpen(item)) {
            root.classList.remove('has-details-sidebar');
            detailSidebar.hidden = true;
            detailSidebar.innerHTML = '';
            return;
        }
        root.classList.add('has-details-sidebar');
        detailSidebar.hidden = false;
        detailSidebar.innerHTML = detailsHtml(item, false);
    }

    // Sidebar opens only via the ⓘ trigger (or context menu), never merely on selection.
    function openDetailsSidebar(item) {
        if (!item) return;
        detailsOpen = true;
        selectedItem = item;
        selection = new Set([item.path]);
        anchorIndex = indexOfPath(item.path);
        rows.querySelectorAll('tr.is-selected').forEach((row) => row.classList.remove('is-selected'));
        rows.querySelector(`tr[data-path="${CSS.escape(item.path)}"]`)?.classList.add('is-selected');
        renderDetails(item);
        updateClipboardBar();
    }
    function closeDetailsSidebar() { detailsOpen = false; renderDetails(null); }

    function detailsHtml(item, standalone = false) {
        const type = item.isFolder ? t('Folder') : (item.mime || t('File'));
        return `
            <header class="desktop-files-detail-header">
                <div class="desktop-files-detail-icon">${fileVisual(item)}</div>
                <div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(type)}</p></div>
                ${standalone ? '' : `<button type="button" class="desktop-files-detail-close" data-action="close-details" title="${escapeHtml(t('Close'))}" aria-label="${escapeHtml(t('Close'))}">&#x2715;</button>`}
            </header>
            <nav class="desktop-files-detail-tabs" aria-label="${escapeHtml(t('Details sections'))}">
                <button type="button" data-tab="details" class="is-active">${escapeHtml(t('Details'))}</button>
                <button type="button" data-tab="sharing">${escapeHtml(t('Sharing'))}</button>
                <button type="button" data-tab="activity">${escapeHtml(t('Activity'))}</button>
                ${item.isFolder ? '' : `<button type="button" data-tab="versions">${escapeHtml(t('Versions'))}</button>`}
            </nav>
            <section class="desktop-files-tab-panel" data-current-tab="details">${detailsPanelHtml(item, type)}</section>`;
    }

    function detailsPanelHtml(item, type = item.isFolder ? t('Folder') : (item.mime || t('File'))) {
        return `
            <dl class="desktop-files-detail-list">
                <dt>${escapeHtml(t('Location'))}</dt><dd>${escapeHtml(item.path)}</dd>
                <dt>${escapeHtml(t('Type'))}</dt><dd>${escapeHtml(type)}</dd>
                <dt>${escapeHtml(t('Size'))}</dt><dd>${item.isFolder ? '—' : escapeHtml(humanSize(item.size))}</dd>
                <dt>${escapeHtml(t('Modified'))}</dt><dd>${escapeHtml(item.modified || '—')}</dd>
                <dt>${escapeHtml(t('File ID'))}</dt><dd>${escapeHtml(item.fileId || '—')}</dd>
            </dl>`;
    }

    async function activateDetailTab(tab) {
        if (!selectedItem || !detailSidebar || detailSidebar.hidden) return;
        detailSidebar.querySelectorAll('.desktop-files-detail-tabs button').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
        const panel = detailSidebar.querySelector('.desktop-files-tab-panel');
        if (!panel) return;
        panel.dataset.currentTab = tab;
        panel.innerHTML = `<p class="desktop-files-detail-note">${escapeHtml(t('Loading…'))}</p>`;
        try {
            if (tab === 'details') panel.innerHTML = detailsPanelHtml(selectedItem);
            else if (tab === 'sharing') panel.innerHTML = await sharingPanelHtml(selectedItem);
            else if (tab === 'activity') panel.innerHTML = await activityPanelHtml(selectedItem);
            else if (tab === 'versions') panel.innerHTML = await versionsPanelHtml(selectedItem);
        } catch (error) {
            panel.innerHTML = `<p class="desktop-files-detail-note">${escapeHtml(t('Could not load {tab}: {message}', { tab, message: error.message }))}</p>`;
        }
    }

    async function sharingPanelHtml(item) {
        const response = await fetch(ocsUrl('/apps/files_sharing/api/v1/shares', { path: item.path, reshares: 'true', subfiles: 'false' }), { credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const shares = data.ocs?.data || [];
        const list = shares.length ? `<ul class="desktop-files-api-list">${shares.map((share) => `
            <li data-share-id="${escapeHtml(share.id)}">
                <strong>${escapeHtml(share.share_with_displayname || share.share_with || share.token || t('Public link'))}</strong>
                <span>${escapeHtml(shareTypeLabel(share.share_type))}</span>
                ${share.url ? `<a href="${escapeHtml(share.url)}" target="_blank" rel="noreferrer">${escapeHtml(t('Open link'))}</a>` : ''}
                <button type="button" data-share-delete="${escapeHtml(share.id)}">${escapeHtml(t('Remove'))}</button>
            </li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('Not shared yet.'))}</p>`;
        const internalLink = item.fileId ? `${window.location.origin}/index.php/f/${encodeURIComponent(item.fileId)}` : '';
        const internalHtml = internalLink ? `
            <div class="desktop-files-share-section">
                <label class="desktop-files-share-label">${escapeHtml(t('Internal link'))}</label>
                <div class="desktop-files-share-internal">
                    <input type="text" readonly data-internal-link value="${escapeHtml(internalLink)}">
                    <button type="button" data-copy-internal>${escapeHtml(t('Copy'))}</button>
                </div>
                <p class="desktop-files-detail-note">${escapeHtml(t('Only works for people who already have access.'))}</p>
            </div>` : '';
        const shareWithHtml = `
            <div class="desktop-files-share-section">
                <label class="desktop-files-share-label" for="desktop-files-sharee">${escapeHtml(t('Share with a user or team'))}</label>
                <input type="search" id="desktop-files-sharee" data-sharee-input autocomplete="off" placeholder="${escapeHtml(t('Name, or team name'))}">
                <div class="desktop-files-sharee-suggestions" data-sharee-suggestions hidden></div>
            </div>`;
        return `${internalHtml}${shareWithHtml}<div class="desktop-files-share-section"><label class="desktop-files-share-label">${escapeHtml(t('Shared with'))}</label>${list}</div><div class="desktop-files-api-actions"><button type="button" data-share-create-link>${escapeHtml(t('Create public link'))}</button><button type="button" data-open-files-native>${escapeHtml(t('Open in Files for advanced sharing'))}</button></div>`;
    }

    function shareTypeLabel(type) {
        const n = Number(type);
        if (n === 0) return t('User');
        if (n === 1) return t('Group');
        if (n === 3) return t('Public link');
        if (n === 7) return t('Team');
        return t('Share');
    }

    // Native-style sharee autocomplete: users (0), groups (1), teams/circles (7).
    async function searchSharees(query) {
        const url = ocsUrl('/apps/files_sharing/api/v1/sharees', { search: query, itemType: 'file', perPage: '8', lookup: 'false' }) + '&shareType[]=0&shareType[]=1&shareType[]=7';
        const response = await fetch(url, { credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const d = (await response.json()).ocs?.data || {};
        const out = [];
        const push = (arr) => (arr || []).forEach((e) => out.push({ label: e.label, shareWith: e.value?.shareWith, shareType: e.value?.shareType }));
        push(d.exact?.users); push(d.exact?.groups); push(d.exact?.circles);
        push(d.users); push(d.groups); push(d.circles);
        return out.filter((e) => e.shareWith !== undefined && e.shareWith !== null);
    }

    async function createShare(item, shareWith, shareType) {
        const body = new URLSearchParams({ path: item.path, shareType: String(shareType), shareWith, permissions: item.isFolder ? '31' : '19' });
        const response = await fetch('/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', { method: 'POST', credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }), body });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await activateDetailTab('sharing');
    }

    async function createPublicLink(item) {
        const body = new URLSearchParams({ path: item.path, shareType: '3', permissions: item.isFolder ? '31' : '1' });
        const response = await fetch('/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', { method: 'POST', credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }), body });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await activateDetailTab('sharing');
    }

    async function deleteShare(id) {
        const response = await fetch(`/ocs/v2.php/apps/files_sharing/api/v1/shares/${encodeURIComponent(id)}?format=json`, { method: 'DELETE', credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await activateDetailTab('sharing');
    }

    async function activityPanelHtml(item) {
        if (!item.fileId) return `<p class="desktop-files-detail-note">${escapeHtml(t('No file id available.'))}</p>`;
        const response = await fetch(ocsUrl('/apps/activity/api/v2/activity/filter', { object_type: 'files', object_id: item.fileId }), { credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const activities = data.ocs?.data || [];
        return activities.length ? `<ul class="desktop-files-api-list">${activities.map((a) => `
            <li><strong>${escapeHtml(a.subject || a.type || t('Activity'))}</strong><span>${escapeHtml(a.message || '')}</span><time>${escapeHtml(a.datetime || '')}</time></li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('No activity yet.'))}</p>`;
    }

    async function versionsPanelHtml(item) {
        if (!item.fileId || item.isFolder) return `<p class="desktop-files-detail-note">${escapeHtml(t('Versions are available for files only.'))}</p>`;
        const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:getetag/><nc:version-label/><nc:version-author/><nc:has-preview/></d:prop></d:propfind>';
        const response = await fetch(versionDavUrl(item.fileId), { method: 'PROPFIND', credentials: 'same-origin', headers: requestHeaders({ Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }), body });
        if (response.status === 404) return `<p class="desktop-files-detail-note">${escapeHtml(t('No versions available.'))}</p>`;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        const versions = Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).slice(1).map((node) => {
            const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
            const version = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || '');
            const size = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '0';
            const modified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';
            const label = node.getElementsByTagNameNS('http://nextcloud.org/ns', 'version-label')[0]?.textContent || '';
            return { version, size, modified, label, href };
        }).filter((v) => v.version).sort((a, b) => Number(b.version) - Number(a.version));
        return versions.length ? `<ul class="desktop-files-api-list">${versions.map((v) => `
            <li data-version="${escapeHtml(v.version)}"><strong>${escapeHtml(v.label || new Date(Number(v.version) * 1000).toLocaleString())}</strong><span>${escapeHtml(humanSize(v.size))} · ${escapeHtml(v.modified)}</span><a href="${escapeHtml(versionDavUrl(item.fileId, v.version))}" download>${escapeHtml(t('Download'))}</a><button type="button" data-version-restore="${escapeHtml(v.version)}">${escapeHtml(t('Restore'))}</button></li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('No versions available.'))}</p>`;
    }

    async function restoreVersion(item, version) {
        const response = await fetch(versionDavUrl(item.fileId, version), { method: 'MOVE', credentials: 'same-origin', headers: requestHeaders({ Destination: new URL(`/remote.php/dav/versions/${encodeURIComponent(uid)}/restore/target`, window.location.origin).toString(), Overwrite: 'T' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await load(currentPath);
    }

    function openItem(row) {
        const item = itemFromRow(row); if (!item) return;
        if (item.isFolder) { load(item.path).catch(showError); return; }
        // Media opens in our fullscreen viewer page; everything Nextcloud opens in an editor
        // (text/markdown/html/code via the Text editor, office docs, …) goes through the Files app
        // deep link, where the native viewer/editor and its own header work correctly.
        const directSupported = item.mime.startsWith('image/') || item.mime.startsWith('video/') || item.mime.startsWith('audio/') || item.mime === 'application/pdf';
        const query = new URLSearchParams({ fileId: item.fileId, name: item.name, mime: item.mime, filePath: item.path });
        const href = directSupported && item.fileId ? `/index.php/apps/desktop_workspace/files/viewer?${query.toString()}` : (item.fileId ? `/index.php/f/${encodeURIComponent(item.fileId)}` : davUrl(item.path));
        postToDesktop({ type: 'nextcloud-desktop:open-file', appId: `file-${item.fileId || btoa(item.path).replace(/=+$/g, '')}`, title: item.name, subtitle: item.path, href, icon: mimeIconUrl(item) || FILES_ICON });
    }

    function openDetailsWindow(item) {
        renderDetails(null);
        selectedItem = null;
        rows.querySelectorAll('tr.is-selected').forEach((row) => row.classList.remove('is-selected'));
        const query = new URLSearchParams({ filePath: item.path, name: item.name, fileId: item.fileId || '', folder: item.isFolder ? '1' : '0', size: item.size || '', mime: item.mime || '', modified: item.modified || '' });
        postToDesktop({ type: 'nextcloud-desktop:open-app', appId: propertyWindowId(item), title: t('{name} Properties', { name: item.name }), subtitle: item.path, href: `/index.php/apps/desktop_workspace/files/details?${query.toString()}`, icon: FILES_ICON });
    }

    async function deleteItem(item) {
        if (!window.confirm(t('Delete {name}?', { name: item.name }))) return;
        const response = await fetch(davUrl(item.path), { method: 'DELETE', credentials: 'same-origin', headers: requestHeaders() });
        if (!response.ok) throw new Error(`Delete failed: HTTP ${response.status}`);
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }

    async function renameItem(item) {
        const next = window.prompt(t('Rename'), item.name); if (!next || next === item.name) return;
        await moveItem(item.path, parentPath(item.path), next); await load(currentPath); await refreshTree();
    }

    async function moveItem(sourcePath, targetFolder, forcedName = null) {
        const source = cleanPath(sourcePath), targetDir = cleanPath(targetFolder);
        const name = forcedName || source.split('/').filter(Boolean).pop();
        const destination = joinPath(targetDir, name);
        if (!name || source === destination || targetDir.startsWith(`${source}/`)) return;
        const response = await fetch(davUrl(source), { method: 'MOVE', credentials: 'same-origin', headers: requestHeaders({ Destination: new URL(davUrl(destination), window.location.origin).toString(), Overwrite: 'F' }) });
        if (!response.ok) throw new Error(`Move failed: HTTP ${response.status}`);
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }

    // ---- "New" menu: create folder / text file / upload --------------------------------
    function uniqueName(name, isFolder = false) {
        const existing = new Set(currentItems.map((i) => i.name));
        return nextAvailableName(name, isFolder, existing);
    }
    async function createFolder() {
        const raw = (window.prompt(t('New folder name'), t('New folder')) || '').trim();
        if (!raw || /[\\/]/.test(raw)) return;
        const name = uniqueName(raw, true);
        const r = await fetch(davUrl(joinPath(currentPath, name)), { method: 'MKCOL', credentials: 'same-origin', headers: requestHeaders() });
        if (!r.ok) throw new Error(`Create folder failed: HTTP ${r.status}`);
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }
    async function createTextFile() {
        const raw = (window.prompt(t('New file name'), t('New text file.txt')) || '').trim();
        if (!raw || /[\\/]/.test(raw)) return;
        const name = uniqueName(raw, false);
        const r = await fetch(davUrl(joinPath(currentPath, name)), { method: 'PUT', credentials: 'same-origin', headers: requestHeaders({ 'Content-Type': 'text/plain' }), body: '' });
        if (!r.ok) throw new Error(`Create file failed: HTTP ${r.status}`);
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }
    async function uploadFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        for (const file of files) {
            const name = uniqueName(file.name, false);
            try {
                const r = await fetch(davUrl(joinPath(currentPath, name)), { method: 'PUT', credentials: 'same-origin', headers: requestHeaders(), body: file }); // eslint-disable-line no-await-in-loop
                if (!r.ok) throw new Error(`Upload failed: HTTP ${r.status}`);
            } catch (error) { showError(error); }
        }
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }
    const newWrap = root.querySelector('[data-new-wrap]');
    const newBtn = root.querySelector('[data-action="new-menu"]');
    const newMenu = root.querySelector('[data-new-menu]');
    const uploadInput = root.querySelector('[data-upload-input]');
    function closeNewMenu() { if (newMenu) { newMenu.hidden = true; newBtn?.setAttribute('aria-expanded', 'false'); } }
    newBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!newMenu) return;
        const open = newMenu.hidden;
        newMenu.hidden = !open;
        newBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    newMenu?.addEventListener('click', (event) => {
        const choice = event.target.closest('button[data-new]')?.dataset.new;
        if (!choice) return;
        closeNewMenu();
        if (choice === 'folder') createFolder().catch(showError);
        else if (choice === 'textfile') createTextFile().catch(showError);
        else if (choice === 'upload') uploadInput?.click();
    });
    uploadInput?.addEventListener('change', () => { uploadFiles(uploadInput.files).catch(showError).finally(() => { uploadInput.value = ''; }); });
    document.addEventListener('click', (event) => { if (newWrap && !newWrap.contains(event.target)) closeNewMenu(); });

    function showContextMenu(item, x, y) {
        selectedItem = item;
        rows.querySelectorAll('tr.is-context-target').forEach((row) => row.classList.remove('is-context-target'));
        rows.querySelector(`tr[data-path="${CSS.escape(item.path)}"]`)?.classList.add('is-context-target');
        const actions = [
            ['open', item.isFolder ? t('Open folder') : t('Open')],
            ['details', t('Details')],
            ['open-files', t('Open in Files')],
            ['copy', t('Copy')],
            ['cut', t('Cut')],
            ['paste', t('Paste')],
            ['download', t('Download')],
            ['rename', t('Rename')],
            ['delete', t('Delete')],
        ];
        contextMenu.innerHTML = actions.map(([action, label]) => `<button type="button" data-action="${action}">${escapeHtml(label)}</button>`).join('');
        contextMenu.hidden = false;
        contextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
        contextMenu.style.top = `${Math.min(y, window.innerHeight - 240)}px`;
    }
    function hideContextMenu() { if (contextMenu) contextMenu.hidden = true; rows.querySelectorAll('tr.is-context-target').forEach((row) => row.classList.remove('is-context-target')); }

    detailSidebar?.addEventListener('click', (event) => {
        if (event.target.closest('button[data-action="close-details"]')) { closeDetailsSidebar(); return; }
        const tab = event.target.closest('button[data-tab]')?.dataset.tab;
        if (tab) { activateDetailTab(tab); return; }
        const shareDelete = event.target.closest('button[data-share-delete]')?.dataset.shareDelete;
        if (shareDelete) { deleteShare(shareDelete).catch((error) => alert(error.message)); return; }
        if (event.target.closest('button[data-share-create-link]')) { createPublicLink(selectedItem).catch((error) => alert(error.message)); return; }
        if (event.target.closest('button[data-copy-internal]')) {
            const input = detailSidebar.querySelector('[data-internal-link]');
            if (input) { input.select(); (navigator.clipboard?.writeText(input.value) || Promise.reject()).catch(() => { try { document.execCommand('copy'); } catch (e) {} }); }
            return;
        }
        const sharee = event.target.closest('[data-share-with]');
        if (sharee && selectedItem) { createShare(selectedItem, sharee.dataset.shareWith, Number(sharee.dataset.shareType)).catch((error) => alert(error.message)); return; }
        if (event.target.closest('button[data-open-files-native]') && selectedItem) { postToDesktop({ type: 'nextcloud-desktop:open-app', appId: 'files-full', title: t('Files'), subtitle: selectedItem.path, href: filesUrl(parentPath(selectedItem.path)), icon: FILES_ICON }); return; }
        const restore = event.target.closest('button[data-version-restore]')?.dataset.versionRestore;
        if (restore && selectedItem && window.confirm(t('Restore this version?'))) { restoreVersion(selectedItem, restore).catch((error) => alert(error.message)); }
    });

    let shareeTimer = null;
    detailSidebar?.addEventListener('input', (event) => {
        const input = event.target.closest('[data-sharee-input]');
        if (!input) return;
        const box = detailSidebar.querySelector('[data-sharee-suggestions]');
        const q = input.value.trim();
        clearTimeout(shareeTimer);
        if (q.length < 2) { if (box) { box.hidden = true; box.innerHTML = ''; } return; }
        shareeTimer = setTimeout(async () => {
            if (!box) return;
            try {
                const results = await searchSharees(q);
                box.innerHTML = results.length
                    ? results.map((r) => `<button type="button" class="desktop-files-sharee" data-share-with="${escapeHtml(r.shareWith)}" data-share-type="${escapeHtml(r.shareType)}">${escapeHtml(r.label)} <span>${escapeHtml(shareTypeLabel(r.shareType))}</span></button>`).join('')
                    : `<p class="desktop-files-detail-note">${escapeHtml(t('No matches'))}</p>`;
                box.hidden = false;
            } catch (error) { box.innerHTML = `<p class="desktop-files-detail-note">${escapeHtml(error.message)}</p>`; box.hidden = false; }
        }, 300);
    });

    rows.addEventListener('click', (event) => {
        const row = event.target.closest('tr[data-path]');
        if (!row) return;
        const item = itemFromRow(row); if (!item) return;
        if (event.target.closest('button[data-action="info"]')) { openDetailsSidebar(item); return; }
        if (event.target.closest('button[data-action="open-item"]')) openItem(row);
        else handleRowSelect(item, event);
    });
    rows.addEventListener('contextmenu', (event) => { const row = event.target.closest('tr[data-path]'); if (!row) return; event.preventDefault(); const item = itemFromRow(row); if (item) showContextMenu(item, event.clientX, event.clientY); });
    contextMenu?.addEventListener('click', (event) => {
        const action = event.target.closest('button[data-action]')?.dataset.action; if (!action || !selectedItem) return;
        const item = selectedItem; hideContextMenu();
        if (action === 'open') { const row = rows.querySelector(`tr[data-path="${CSS.escape(item.path)}"]`); if (row) openItem(row); }
        else if (action === 'details') openDetailsWindow(item);
        else if (action === 'open-files') postToDesktop({ type: 'nextcloud-desktop:open-app', appId: 'files-full', title: t('Files'), subtitle: item.path, href: filesUrl(parentPath(item.path)), icon: FILES_ICON });
        else if (action === 'copy') { if (!selection.has(item.path)) selectItem(item); setClipboard('copy'); }
        else if (action === 'cut') { if (!selection.has(item.path)) selectItem(item); setClipboard('cut'); }
        else if (action === 'paste') paste().catch(showError);
        else if (action === 'download') window.location.href = `${davUrl(item.path)}?downloadStartSecret=desktop`;
        else if (action === 'rename') renameItem(item).catch(showError);
        else if (action === 'delete') deleteItem(item).catch(showError);
    });
    document.addEventListener('click', (event) => { if (!contextMenu?.contains(event.target)) hideContextMenu(); });

    rows.addEventListener('dragstart', (event) => { const row = event.target.closest('tr[data-path]'); if (!row) return; dragged = { path: row.dataset.path, fromTree: false }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragged.path); });
    rows.addEventListener('dragover', (event) => { if (!dragged || dragged.fromTree) return; event.preventDefault(); const target = event.target.closest('tr[data-folder="true"]'); rows.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target')); target?.classList.add('is-drop-target'); event.dataTransfer.dropEffect = 'move'; });
    rows.addEventListener('dragleave', (event) => event.target.closest('tr')?.classList.remove('is-drop-target'));
    rows.addEventListener('drop', (event) => { if (!dragged || dragged.fromTree) return; event.preventDefault(); rows.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target')); const target = event.target.closest('tr[data-folder="true"]')?.dataset.path || currentPath; moveItem(dragged.path, target).catch(showError); dragged = null; });
    rows.addEventListener('dragend', () => { dragged = null; rows.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target')); });

    function treeNode(path, label = path === '/' ? t('Files') : path.split('/').pop()) { return `<li class="desktop-files-tree-node" data-path="${escapeHtml(path)}" data-loaded="false" data-expanded="false"><div class="desktop-files-tree-row" data-tree-row data-path="${escapeHtml(path)}"><button type="button" class="desktop-files-tree-toggle" data-action="toggle-tree" aria-label="${escapeHtml(t('Expand {name}', { name: label }))}">▸</button><button type="button" class="desktop-files-tree-folder" data-action="open-tree-folder">${folderVisual()} <span>${escapeHtml(label)}</span></button></div><ul class="desktop-files-tree-children" hidden></ul></li>`; }
    async function loadTreeChildren(node) { const path = node.dataset.path; const children = node.querySelector(':scope > .desktop-files-tree-children'); children.innerHTML = `<li class="desktop-files-tree-loading">${escapeHtml(t('Loading…'))}</li>`; const folders = (await propfind(path, '1')).filter((item) => item.isFolder); children.innerHTML = folders.map((folder) => treeNode(folder.path, folder.name)).join('') || `<li class="desktop-files-tree-empty">${escapeHtml(t('No folders'))}</li>`; node.dataset.loaded = 'true'; }
    async function expandTreeNode(node) { if (!node || node.dataset.expanded === 'true') return; if (node.dataset.loaded !== 'true') await loadTreeChildren(node); node.dataset.expanded = 'true'; node.querySelector(':scope > .desktop-files-tree-children').hidden = false; node.querySelector(':scope > .desktop-files-tree-row .desktop-files-tree-toggle').textContent = '▾'; }
    function collapseTreeNode(node) { node.dataset.expanded = 'false'; node.querySelector(':scope > .desktop-files-tree-children').hidden = true; node.querySelector(':scope > .desktop-files-tree-row .desktop-files-tree-toggle').textContent = '▸'; }
    async function ensureTreePath(path) { const parts = cleanPath(path).split('/').filter(Boolean); let node = tree.querySelector('li[data-path="/"]'); if (!node) return; await expandTreeNode(node); let cursor = ''; for (const part of parts) { cursor = `${cursor}/${part}`; node = tree.querySelector(`li[data-path="${CSS.escape(cursor)}"]`); if (!node) return; await expandTreeNode(node); } tree.querySelectorAll('.is-current').forEach((element) => element.classList.remove('is-current')); tree.querySelector(`[data-tree-row][data-path="${CSS.escape(cleanPath(path))}"]`)?.classList.add('is-current'); }
    async function refreshTree() { tree.innerHTML = treeNode('/', t('Files')); await ensureTreePath(currentPath); }
    tree.addEventListener('click', (event) => { const node = event.target.closest('li[data-path]'); if (!node) return; if (event.target.closest('[data-action="toggle-tree"]')) { (node.dataset.expanded === 'true' ? Promise.resolve(collapseTreeNode(node)) : expandTreeNode(node)).catch(showError); return; } if (event.target.closest('[data-action="open-tree-folder"]')) load(node.dataset.path).catch(showError); });
    tree.addEventListener('dragover', (event) => { if (!dragged || dragged.fromTree) return; const row = event.target.closest('[data-tree-row]'); if (!row) return; event.preventDefault(); tree.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target')); row.classList.add('is-drop-target'); event.dataTransfer.dropEffect = 'move'; });
    tree.addEventListener('dragleave', (event) => event.target.closest('[data-tree-row]')?.classList.remove('is-drop-target'));
    tree.addEventListener('drop', (event) => { if (!dragged || dragged.fromTree) return; const row = event.target.closest('[data-tree-row]'); if (!row) return; event.preventDefault(); tree.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target')); moveItem(dragged.path, row.dataset.path).catch(showError); dragged = null; });

    function showError(error) { rows.innerHTML = `<tr><td colspan="4"><strong>${escapeHtml(t('Could not complete file operation.'))}</strong> ${escapeHtml(error.message)}</td></tr>`; }
    document.querySelector('[data-action="refresh"]')?.addEventListener('click', () => load(currentPath).catch(showError));
    document.querySelector('[data-action="up"]')?.addEventListener('click', () => load(parentPath(currentPath)).catch(showError));
    document.querySelector('[data-action="open-full"]')?.addEventListener('click', () => postToDesktop({ type: 'nextcloud-desktop:open-app', appId: 'files-full', title: t('Files'), subtitle: currentPath, href: filesUrl(currentPath), icon: FILES_ICON }));
    // ---- Clipboard: copy / cut / paste ---------------------------------------------
    function updateClipboardBar() {
        const hasSel = selection.size > 0;
        if (copyBtn) copyBtn.disabled = !hasSel;
        if (cutBtn) cutBtn.disabled = !hasSel;
        const cb = readSharedClipboard() || clipboard;
        if (pasteBtn) pasteBtn.disabled = !(cb && cb.items && cb.items.length);
    }

    function setClipboard(mode) {
        const items = [...selection]
            .map((p) => currentItems.find((i) => i.path === p))
            .filter(Boolean)
            .map((i) => ({ path: i.path, name: i.name, isFolder: i.isFolder }));
        if (!items.length) return;
        clipboard = { mode, items };
        writeSharedClipboard(mode, items);
        updateClipboardBar();
    }

    // Rename-on-collision: insert _N before the extension, next available integer.
    // Compound archive extensions are kept whole (archive.tar.gz -> archive_1.tar.gz);
    // anything before such a suffix is treated as the base (archive.test.tar.gz -> archive.test_1.tar.gz).
    const COMPOUND_EXT = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst', '.tar.lz', '.tar.lzma'];
    function splitNameExt(name, isFolder) {
        if (isFolder) return { base: name, ext: '' };
        const lower = name.toLowerCase();
        for (const c of COMPOUND_EXT) {
            if (lower.endsWith(c) && name.length > c.length) return { base: name.slice(0, name.length - c.length), ext: name.slice(name.length - c.length) };
        }
        const dot = name.lastIndexOf('.');
        if (dot > 0) return { base: name.slice(0, dot), ext: name.slice(dot) };  // dot>0 keeps dotfiles (.bashrc) whole
        return { base: name, ext: '' };
    }
    function nextAvailableName(name, isFolder, existing) {
        if (!existing.has(name)) return name;
        const { base, ext } = splitNameExt(name, isFolder);
        let i = 1, candidate;
        do { candidate = `${base}_${i}${ext}`; i += 1; } while (existing.has(candidate));
        return candidate;
    }

    async function copyOne(source, dest, overwrite) {
        const r = await fetch(davUrl(source), { method: 'COPY', credentials: 'same-origin', headers: requestHeaders({ Destination: new URL(davUrl(dest), window.location.origin).toString(), Overwrite: overwrite ? 'T' : 'F', Depth: 'infinity' }) });
        if (!r.ok) throw new Error(`Copy failed: HTTP ${r.status}`);
    }
    async function moveOne(source, dest, overwrite) {
        const r = await fetch(davUrl(source), { method: 'MOVE', credentials: 'same-origin', headers: requestHeaders({ Destination: new URL(davUrl(dest), window.location.origin).toString(), Overwrite: overwrite ? 'T' : 'F' }) });
        if (!r.ok) throw new Error(`Move failed: HTTP ${r.status}`);
    }

    function showCollisionDialog(name) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'desktop-files-dialog-overlay';
            overlay.innerHTML = `
                <div class="desktop-files-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-files-collision-title">
                    <h2 id="desktop-files-collision-title">${escapeHtml(t('Item already exists'))}</h2>
                    <p>${escapeHtml(t('“{name}” already exists in this folder.', { name }))}</p>
                    <label class="desktop-files-dialog-applyall"><input type="checkbox" data-apply-all> ${escapeHtml(t('Apply to all remaining items in this operation'))}</label>
                    <div class="desktop-files-dialog-actions">
                        <button type="button" class="primary" data-choice="rename">${escapeHtml(t('Keep both (rename)'))}</button>
                        <button type="button" data-choice="overwrite">${escapeHtml(t('Overwrite'))}</button>
                        <button type="button" data-choice="skip">${escapeHtml(t('Skip'))}</button>
                        <button type="button" data-choice="cancel">${escapeHtml(t('Cancel'))}</button>
                    </div>
                </div>`;
            root.appendChild(overlay);
            const applyAll = overlay.querySelector('[data-apply-all]');
            overlay.addEventListener('click', (event) => {
                const choice = event.target.closest('button[data-choice]')?.dataset.choice;
                if (!choice) return;
                const applyToAll = !!(applyAll && applyAll.checked);
                overlay.remove();
                resolve({ action: choice, applyToAll });
            });
        });
    }

    async function paste() {
        const cb = readSharedClipboard() || clipboard;
        if (!cb || !cb.items.length) return;
        const targetDir = currentPath;
        if (cb.mode === 'cut') {
            const ok = window.confirm(t('Move {count} item(s) here? They will be permanently moved from their original location.', { count: cb.items.length }));
            if (!ok) return;
        }
        const existing = new Set(currentItems.map((i) => i.name));
        let batchDecision = null; // 'overwrite' | 'rename' | 'skip' once "apply to all" is ticked
        for (const it of cb.items) {
            if (cb.mode === 'cut' && parentPath(it.path) === targetDir) continue; // cut into same folder = no-op
            let targetName = it.name;
            let overwrite = false;
            if (existing.has(targetName)) {
                let decision = batchDecision;
                if (!decision) {
                    const res = await showCollisionDialog(it.name);
                    if (res.action === 'cancel') break;
                    decision = res.action;
                    if (res.applyToAll) batchDecision = decision;
                }
                if (decision === 'skip') continue;
                if (decision === 'overwrite') overwrite = true;
                else if (decision === 'rename') targetName = nextAvailableName(it.name, it.isFolder, existing);
            }
            const dest = joinPath(targetDir, targetName);
            try {
                if (cb.mode === 'copy') await copyOne(it.path, dest, overwrite);
                else await moveOne(it.path, dest, overwrite);
                existing.add(targetName);
            } catch (error) { showError(error); }
        }
        if (cb.mode === 'cut') { clipboard = null; clearSharedClipboard(); } // a cut clipboard is consumed once pasted
        await load(currentPath); await refreshTree(); notifyDesktopChanged();
    }

    copyBtn?.addEventListener('click', () => setClipboard('copy'));
    cutBtn?.addEventListener('click', () => setClipboard('cut'));
    pasteBtn?.addEventListener('click', () => paste().catch(showError));

    // Files dragged from the desktop onto this window: move them into the current folder.
    async function acceptDroppedPaths(paths) {
        if (!Array.isArray(paths) || !paths.length) return;
        const existing = new Set(currentItems.map((i) => i.name));
        for (const p of paths) {
            const name = String(p).split('/').filter(Boolean).pop();
            if (!name || parentPath(p) === currentPath) continue;
            let targetName = name;
            if (existing.has(targetName)) targetName = nextAvailableName(name, false, existing);
            try { await moveOne(p, joinPath(currentPath, targetName), false); existing.add(targetName); }
            catch (error) { showError(error); }
        }
        await load(currentPath); await refreshTree();
        postToDesktop({ type: 'nextcloud-desktop:desktop-reload' });
    }
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (data.type === 'nextcloud-desktop:files-drop') acceptDroppedPaths(data.paths).catch(showError);
        else if (data.type === 'nextcloud-desktop:files-reload') load(currentPath).then(() => refreshTree()).catch(() => {});
    });
    // Keep the paste button in sync when the desktop changes the shared clipboard.
    window.addEventListener('storage', (event) => { if (event.key === SHARED_CLIP_KEY) updateClipboardBar(); });

    // Resizable tree column — the current width is the minimum; drag the divider to widen.
    const resizer = root.querySelector('[data-resizer]');
    const TREE_MIN = 220;
    if (resizer) {
        let resizing = false;
        const onMove = (event) => {
            if (!resizing) return;
            const mainRect = resizer.parentElement.getBoundingClientRect();
            const max = Math.max(TREE_MIN, mainRect.width - 280);
            const width = Math.min(Math.max(event.clientX - mainRect.left, TREE_MIN), max);
            root.style.setProperty('--desktop-files-tree-width', `${width}px`);
        };
        const stop = () => { if (!resizing) return; resizing = false; resizer.classList.remove('is-dragging'); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', stop); };
        resizer.addEventListener('pointerdown', (event) => { resizing = true; resizer.classList.add('is-dragging'); event.preventDefault(); document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', stop); });
    }

    const initialDir = (() => {
        try { const d = new URLSearchParams(window.location.search).get('dir'); return d ? cleanPath(d) : '/'; }
        catch (e) { return '/'; }
    })();
    refreshTree().then(() => load(initialDir)).catch(showError);
})();
