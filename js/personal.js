(() => {
    'use strict';

    const root = document.getElementById('desktop-personal-settings');
    if (!root) return;

    const tr = (s, p) => (window.OC && OC.L10N ? OC.L10N.translate('desktop_workspace', s, p) : s);
    const saveUrl = root.dataset.saveUrl;
    const el = (id) => document.getElementById(id);
    const status = el('desktop-save-status');

    // Apply changes live in the running desktop when this page is embedded as a desktop window.
    function notifyDesktop(fields) {
        try {
            if (window.parent === window) return;
            const map = { show_favorites: 'showFavorites', show_trash: 'showTrash', show_home: 'showHome', favorites_no_confirm: 'favoritesNoConfirm', trash_no_confirm: 'trashNoConfirm', try_experimental_files: 'desktopfilesEnabled' };
            const s = {};
            Object.entries(fields).forEach(([k, v]) => { if (map[k]) s[map[k]] = (v === 'yes'); });
            if ('desktop_folder' in fields) s.desktopFolder = fields.desktop_folder;
            if ('decoration' in fields) s.decoration = ['redmond', 'retro'].includes(fields.decoration) ? fields.decoration : 'standard';
            if (Object.keys(s).length) window.parent.postMessage({ type: 'nextcloud-desktop:settings-changed', settings: s }, window.location.origin);
        } catch (e) { /* ignore */ }
    }

    // Apply a single setting immediately. Returns the parsed response (or throws).
    async function applyField(field, value) {
        if (status) status.textContent = tr('Saving…');
        const body = new URLSearchParams();
        body.set(field, value);
        body.set('requesttoken', OC.requestToken);
        const res = await fetch(saveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken },
            body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status === 'error') {
            const err = new Error(data.message || `HTTP ${res.status}`);
            err.code = data.message;
            throw err;
        }
        notifyDesktop({ [field]: field === 'decoration' ? (data.decoration || 'standard') : value });
        return data;
    }

    // Wire each checkbox to apply on change.
    function wireToggle(id, field) {
        const cb = el(id);
        if (!cb) return;
        cb.addEventListener('change', async () => {
            cb.disabled = true;
            try { await applyField(field, cb.checked ? 'yes' : 'no'); if (status) status.textContent = tr('Saved.'); }
            catch (error) { if (status) status.textContent = tr('Save failed: {msg}', { msg: error.message }); cb.checked = !cb.checked; }
            finally { cb.disabled = false; }
        });
    }
    wireToggle('desktop-show-favorites', 'show_favorites');
    wireToggle('desktop-show-trash', 'show_trash');
    wireToggle('desktop-show-home', 'show_home');
    wireToggle('desktop-favorites-no-confirm', 'favorites_no_confirm');
    wireToggle('desktop-trash-no-confirm', 'trash_no_confirm');
    wireToggle('desktop-try-experimental', 'try_experimental_files');

    const decorationSelect = el('desktop-decoration');
    if (decorationSelect) {
        decorationSelect.addEventListener('change', async () => {
            decorationSelect.disabled = true;
            const previous = decorationSelect.dataset.savedValue || 'standard';
            try {
                const data = await applyField('decoration', decorationSelect.value);
                decorationSelect.value = data.decoration || 'standard';
                decorationSelect.dataset.savedValue = decorationSelect.value;
                if (status) status.textContent = tr('Saved.');
            } catch (error) {
                decorationSelect.value = previous;
                if (status) status.textContent = tr('Save failed: {msg}', { msg: error.message });
            } finally {
                decorationSelect.disabled = false;
            }
        });
        decorationSelect.dataset.savedValue = decorationSelect.value;
    }

    // Desktop folder picker — applies immediately, with validation feedback.
    const folderInput = el('desktop-folder-path');
    const folderPick = el('desktop-folder-pick');
    const folderClear = el('desktop-folder-clear');
    async function applyFolder(path) {
        try {
            const data = await applyField('desktop_folder', path || '');
            if (folderInput) folderInput.value = data.desktopFolder || '';
            if (status) status.textContent = tr('Saved.');
        } catch (error) {
            const map = {
                shared_not_allowed: tr('That folder is shared with you. Please pick a folder you own.'),
                not_personal: tr('Group folders and external storage can’t be used. Please pick a personal folder you own.'),
                not_owned: tr('That folder is not owned by you.'),
                not_a_folder: tr('That is not a folder.'),
                not_found: tr('Folder not found.'),
            };
            if (status) status.textContent = map[error.code] || tr('Save failed: {msg}', { msg: error.message });
        }
    }
    if (folderPick) {
        folderPick.addEventListener('click', () => {
            if (!(window.OC && OC.dialogs && OC.dialogs.filepicker)) { if (status) status.textContent = tr('File picker is not available.'); return; }
            const type = (OC.dialogs.FILEPICKER_TYPE_CHOOSE !== undefined) ? OC.dialogs.FILEPICKER_TYPE_CHOOSE : 1;
            OC.dialogs.filepicker(tr('Choose a folder you own'), (path) => applyFolder(path), false, 'httpd/unix-directory', true, type);
        });
    }
    if (folderClear) folderClear.addEventListener('click', () => applyFolder(''));

    // Reset buttons (icons / windows / full).
    async function postReset(url) {
        const body = new URLSearchParams();
        body.set('requesttoken', OC.requestToken);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
    }
    function wireReset(btnId, statusId, okMsg, confirmMsg) {
        const btn = el(btnId);
        const st = el(statusId);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (confirmMsg && !window.confirm(confirmMsg)) return;
            st.textContent = tr('Saving…');
            btn.disabled = true;
            try { await postReset(btn.dataset.resetUrl); st.textContent = okMsg; }
            catch (error) { st.textContent = tr('Save failed: {msg}', { msg: error.message }); }
            finally { btn.disabled = false; }
        });
    }
    wireReset('desktop-reset-icons', 'desktop-reset-status', tr('Desktop icon positions reset. Reload the desktop to apply.'));
    wireReset('desktop-reset-windows', 'desktop-reset-status', tr('Open windows reset. Reload the desktop to apply.'));
    const resetAll = el('desktop-reset-all');
    if (resetAll) {
        resetAll.dataset.resetUrl = root.dataset.resetAllUrl;
        wireReset('desktop-reset-all', 'desktop-reset-all-status',
            tr('All desktop settings were reset. Reload the desktop to apply.'),
            tr('Reset all desktop settings? This cannot be undone.'));
    }
})();
