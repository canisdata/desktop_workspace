(() => {
    'use strict';
    const t = (text, vars = {}) => window.OC?.L10N?.translate ? OC.L10N.translate('desktop_workspace', text, vars) : text.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? '');
    const root = document.querySelector('[data-desktop-files-details-root]');
    if (!root) return;
    const item = {
        path: root.dataset.filePath || '/',
        name: root.dataset.name || t('Files'),
        isFolder: root.dataset.folder === '1',
        fileId: root.dataset.fileId || '',
        size: root.dataset.size || '',
        mime: root.dataset.mime || '',
        modified: root.dataset.modified || '',
    };
    const uid = root.dataset.userId || OC?.getCurrentUser?.()?.uid || 'admin';
    const panel = root.querySelector('.desktop-files-detail-panel');
    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const iconHtml = (kind) => `<span class="desktop-files-symbol desktop-files-symbol-${kind}" aria-hidden="true"></span>`;
    const cleanPath = (path) => `/${String(path || '/').split('/').filter(Boolean).join('/')}` || '/';
    const parentPath = (path) => { const parts = cleanPath(path).split('/').filter(Boolean); parts.pop(); return `/${parts.join('/')}` || '/'; };
    const humanSize = (bytes) => { const n = Number(bytes || 0); if (!n) return '—'; const units = ['B', 'KB', 'MB', 'GB']; let value = n, i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${value.toFixed(i ? 1 : 0)} ${units[i]}`; };
    const requestHeaders = (extra = {}) => ({ 'X-Requested-With': 'XMLHttpRequest', ...(window.OC?.requestToken ? { requesttoken: OC.requestToken } : {}), ...extra });
    const ocsUrl = (path, params = {}) => { const query = new URLSearchParams({ format: 'json', ...params }); return `/ocs/v2.php/${path.replace(/^\//, '')}?${query}`; };
    const versionDavUrl = (fileId, version = '') => `/remote.php/dav/versions/${encodeURIComponent(uid)}/versions/${encodeURIComponent(fileId)}${version ? `/${encodeURIComponent(version)}` : ''}`;
    const filesUrl = (path) => `/index.php/apps/files/files?dir=${encodeURIComponent(path || '/')}`;
    const davUrl = (path) => `/remote.php/dav/files/${encodeURIComponent(uid)}${cleanPath(path).split('/').map(encodeURIComponent).join('/')}`;
    const typeOf = () => item.isFolder ? t('Folder') : (item.mime || t('File'));

    // Fill in authoritative metadata the opener may not have passed (size, modified, mime, fileId, folder).
    async function hydrate() {
        try {
            const response = await fetch(davUrl(item.path), {
                method: 'PROPFIND', credentials: 'same-origin',
                headers: requestHeaders({ Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }),
                body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:resourcetype/><oc:fileid/></d:prop></d:propfind>',
            });
            if (!response.ok) return;
            const node = new DOMParser().parseFromString(await response.text(), 'application/xml').getElementsByTagNameNS('DAV:', 'response')[0];
            if (!node) return;
            item.isFolder = Boolean(node.getElementsByTagNameNS('DAV:', 'collection')[0]);
            const size = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '';
            const modified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';
            const fileId = node.getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')[0]?.textContent || '';
            const mime = node.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
            if (size) item.size = size;
            if (modified) item.modified = modified;
            if (fileId) item.fileId = fileId;
            if (mime) item.mime = mime;
        } catch (e) { /* keep whatever was passed in */ }
    }

    function detailsPanelHtml() {
        const type = typeOf();
        return `<dl class="desktop-files-detail-list"><dt>${escapeHtml(t('Location'))}</dt><dd>${escapeHtml(cleanPath(item.path))}</dd><dt>${escapeHtml(t('Type'))}</dt><dd>${escapeHtml(type)}</dd><dt>${escapeHtml(t('Size'))}</dt><dd>${item.isFolder ? '—' : escapeHtml(humanSize(item.size))}</dd><dt>${escapeHtml(t('Modified'))}</dt><dd>${escapeHtml(item.modified || '—')}</dd><dt>${escapeHtml(t('File ID'))}</dt><dd>${escapeHtml(item.fileId || '—')}</dd></dl>`;
    }
    async function sharingPanelHtml() {
        const response = await fetch(ocsUrl('/apps/files_sharing/api/v1/shares', { path: item.path, reshares: 'true', subfiles: 'false' }), { credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const shares = (await response.json()).ocs?.data || [];
        const list = shares.length ? `<ul class="desktop-files-api-list">${shares.map((share) => `<li data-share-id="${escapeHtml(share.id)}"><strong>${escapeHtml(share.share_with_displayname || share.share_with || share.token || t('Public link'))}</strong><span>${escapeHtml(share.url ? t('Public link') : `Type ${share.share_type}`)}</span>${share.url ? `<a href="${escapeHtml(share.url)}" target="_blank" rel="noreferrer">${escapeHtml(t('Open link'))}</a>` : ''}<button type="button" data-share-delete="${escapeHtml(share.id)}">${escapeHtml(t('Remove'))}</button></li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('No shares yet.'))}</p>`;
        return `${list}<div class="desktop-files-api-actions"><button type="button" data-share-create-link>${escapeHtml(t('Create public link'))}</button><button type="button" data-open-files-native>${escapeHtml(t('Open in Files for advanced sharing'))}</button></div>`;
    }
    async function activityPanelHtml() {
        if (!item.fileId) return `<p class="desktop-files-detail-note">${escapeHtml(t('No file id available.'))}</p>`;
        const response = await fetch(ocsUrl('/apps/activity/api/v2/activity/filter', { object_type: 'files', object_id: item.fileId }), { credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const activities = (await response.json()).ocs?.data || [];
        return activities.length ? `<ul class="desktop-files-api-list">${activities.map((a) => `<li><strong>${escapeHtml(a.subject || a.type || t('Activity'))}</strong><span>${escapeHtml(a.message || '')}</span><time>${escapeHtml(a.datetime || '')}</time></li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('No activity yet.'))}</p>`;
    }
    async function versionsPanelHtml() {
        if (!item.fileId || item.isFolder) return `<p class="desktop-files-detail-note">${escapeHtml(t('Versions are available for files only.'))}</p>`;
        const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:getetag/><nc:version-label/><nc:version-author/><nc:has-preview/></d:prop></d:propfind>';
        const response = await fetch(versionDavUrl(item.fileId), { method: 'PROPFIND', credentials: 'same-origin', headers: requestHeaders({ Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }), body });
        if (response.status === 404) return `<p class="desktop-files-detail-note">${escapeHtml(t('No versions available.'))}</p>`;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        const versions = Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).slice(1).map((node) => { const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || ''; const version = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || ''); const size = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '0'; const modified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || ''; const label = node.getElementsByTagNameNS('http://nextcloud.org/ns', 'version-label')[0]?.textContent || ''; return { version, size, modified, label }; }).filter((v) => v.version).sort((a, b) => Number(b.version) - Number(a.version));
        return versions.length ? `<ul class="desktop-files-api-list">${versions.map((v) => `<li><strong>${escapeHtml(v.label || new Date(Number(v.version) * 1000).toLocaleString())}</strong><span>${escapeHtml(humanSize(v.size))} · ${escapeHtml(v.modified)}</span><a href="${escapeHtml(versionDavUrl(item.fileId, v.version))}" download>${escapeHtml(t('Download'))}</a><button type="button" data-version-restore="${escapeHtml(v.version)}">${escapeHtml(t('Restore'))}</button></li>`).join('')}</ul>` : `<p class="desktop-files-detail-note">${escapeHtml(t('No versions available.'))}</p>`;
    }
    async function activate(tab) {
        panel.querySelectorAll('.desktop-files-detail-tabs button').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
        const target = panel.querySelector('.desktop-files-tab-panel');
        target.innerHTML = `<p class="desktop-files-detail-note">${escapeHtml(t('Loading…'))}</p>`;
        try { target.innerHTML = tab === 'details' ? detailsPanelHtml() : tab === 'sharing' ? await sharingPanelHtml() : tab === 'activity' ? await activityPanelHtml() : await versionsPanelHtml(); }
        catch (error) { target.innerHTML = `<p class="desktop-files-detail-note">${escapeHtml(t('Could not load {tab}: {message}', { tab, message: error.message }))}</p>`; }
    }
    async function createPublicLink() { const body = new URLSearchParams({ path: item.path, shareType: '3', permissions: item.isFolder ? '31' : '1' }); const response = await fetch('/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', { method: 'POST', credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }), body }); if (!response.ok) throw new Error(`HTTP ${response.status}`); await activate('sharing'); }
    async function deleteShare(id) { const response = await fetch(`/ocs/v2.php/apps/files_sharing/api/v1/shares/${encodeURIComponent(id)}?format=json`, { method: 'DELETE', credentials: 'same-origin', headers: requestHeaders({ 'OCS-APIRequest': 'true', Accept: 'application/json' }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); await activate('sharing'); }
    async function restoreVersion(version) { const response = await fetch(versionDavUrl(item.fileId, version), { method: 'MOVE', credentials: 'same-origin', headers: requestHeaders({ Destination: new URL(`/remote.php/dav/versions/${encodeURIComponent(uid)}/restore/target`, window.location.origin).toString(), Overwrite: 'T' }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); await activate('versions'); }

    function render() {
        const type = typeOf();
        panel.innerHTML = `<header class="desktop-files-detail-header"><div class="desktop-files-detail-icon">${iconHtml(item.isFolder ? 'folder' : 'file')}</div><div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(type)}</p></div></header><nav class="desktop-files-detail-tabs" aria-label="${escapeHtml(t('Details sections'))}"><button type="button" data-tab="details" class="is-active">${escapeHtml(t('Details'))}</button><button type="button" data-tab="sharing">${escapeHtml(t('Sharing'))}</button><button type="button" data-tab="activity">${escapeHtml(t('Activity'))}</button>${item.isFolder ? '' : `<button type="button" data-tab="versions">${escapeHtml(t('Versions'))}</button>`}</nav><section class="desktop-files-tab-panel" data-current-tab="details">${detailsPanelHtml()}</section>`;
    }
    render();
    hydrate().then(render).catch(() => {});
    panel.addEventListener('click', (event) => { const tab = event.target.closest('button[data-tab]')?.dataset.tab; if (tab) { activate(tab); return; } const shareDelete = event.target.closest('button[data-share-delete]')?.dataset.shareDelete; if (shareDelete) { deleteShare(shareDelete).catch((error) => alert(error.message)); return; } if (event.target.closest('button[data-share-create-link]')) { createPublicLink().catch((error) => alert(error.message)); return; } if (event.target.closest('button[data-open-files-native]')) { window.parent?.postMessage({ type: 'nextcloud-desktop:open-app', appId: 'files-full', title: t('Files'), subtitle: item.path, href: filesUrl(parentPath(item.path)), icon: (window.OC && OC.imagePath && OC.imagePath('desktop_workspace','files.svg')) || '/apps/desktop_workspace/img/files.svg' }, window.location.origin); return; } const restore = event.target.closest('button[data-version-restore]')?.dataset.versionRestore; if (restore && window.confirm(t('Restore this version?'))) restoreVersion(restore).catch((error) => alert(error.message)); });
    window.parent?.postMessage({ type: 'nextcloud-desktop:window-meta', appId: `details-${item.fileId || btoa(cleanPath(item.path)).replace(/=+$/g, '')}`, title: t('{name} Properties', { name: item.name }), subtitle: cleanPath(item.path) }, window.location.origin);
})();
