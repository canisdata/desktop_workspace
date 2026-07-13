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
            if ('decoration_color' in fields) s.decorationColor = ['light', 'dark'].includes(fields.decoration_color) ? fields.decoration_color : 'nextcloud';
            if ('icon_decoration_linked' in fields) s.iconDecorationLinked = fields.icon_decoration_linked === 'yes';
            if ('icon_decoration' in fields) s.iconDecoration = ['redmond', 'retro'].includes(fields.icon_decoration) ? fields.icon_decoration : 'standard';
            if ('icon_color' in fields) s.iconColor = ['light', 'dark'].includes(fields.icon_color) ? fields.icon_color : 'nextcloud';
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
        notifyDesktop({ [field]: value });
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

    function wireAppearanceSelect(id, field) {
        const select = el(id);
        if (!select) return;
        select.dataset.savedValue = select.value;
        select.addEventListener('change', async () => {
            const previous = select.dataset.savedValue;
            select.disabled = true;
            try {
                await applyField(field, select.value);
                select.dataset.savedValue = select.value;
                if (status) status.textContent = tr('Saved.');
            } catch (error) {
                select.value = previous;
                if (status) status.textContent = tr('Save failed: {msg}', { msg: error.message });
            } finally {
                select.disabled = false;
            }
        });
    }
    wireAppearanceSelect('desktop-decoration', 'decoration');
    wireAppearanceSelect('desktop-decoration-color', 'decoration_color');
    wireAppearanceSelect('desktop-icon-decoration', 'icon_decoration');
    wireAppearanceSelect('desktop-icon-color', 'icon_color');

    const iconLinked = el('desktop-icon-decoration-linked');
    const iconDecoration = el('desktop-icon-decoration');
    const iconColor = el('desktop-icon-color');
    if (iconLinked) {
        iconLinked.addEventListener('change', async () => {
            const checked = iconLinked.checked;
            iconLinked.disabled = true;
            if (iconDecoration) iconDecoration.disabled = true;
            if (iconColor) iconColor.disabled = true;
            try {
                await applyField('icon_decoration_linked', checked ? 'yes' : 'no');
                if (!checked) notifyDesktop({ icon_decoration: iconDecoration?.value || 'standard', icon_color: iconColor?.value || 'nextcloud' });
                if (status) status.textContent = tr('Saved.');
            } catch (error) {
                iconLinked.checked = !checked;
                if (status) status.textContent = tr('Save failed: {msg}', { msg: error.message });
            } finally {
                iconLinked.disabled = false;
                if (iconDecoration) iconDecoration.disabled = iconLinked.checked;
                if (iconColor) iconColor.disabled = iconLinked.checked;
            }
        });
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


    function applyResetState(settings) {
        const checked = (id, value) => { const node = el(id); if (node) node.checked = !!value; };
        const selected = (id, value) => {
            const node = el(id);
            if (!node) return;
            node.value = value;
            node.dataset.savedValue = value;
        };
        checked('desktop-show-favorites', settings.showFavorites);
        checked('desktop-show-trash', settings.showTrash);
        checked('desktop-show-home', settings.showHome);
        checked('desktop-favorites-no-confirm', settings.favoritesNoConfirm);
        checked('desktop-trash-no-confirm', settings.trashNoConfirm);
        checked('desktop-try-experimental', settings.tryExperimentalFiles);
        checked('desktop-icon-decoration-linked', settings.iconDecorationLinked);
        selected('desktop-decoration', settings.decoration);
        selected('desktop-decoration-color', settings.decorationColor);
        selected('desktop-icon-decoration', settings.iconDecoration);
        selected('desktop-icon-color', settings.iconColor);
        if (folderInput) folderInput.value = settings.desktopFolder || '';
        if (iconDecoration) iconDecoration.disabled = !!settings.iconDecorationLinked;
        if (iconColor) iconColor.disabled = !!settings.iconDecorationLinked;
        notifyDesktop({
            show_favorites: settings.showFavorites ? 'yes' : 'no',
            show_trash: settings.showTrash ? 'yes' : 'no',
            show_home: settings.showHome ? 'yes' : 'no',
            favorites_no_confirm: settings.favoritesNoConfirm ? 'yes' : 'no',
            trash_no_confirm: settings.trashNoConfirm ? 'yes' : 'no',
            try_experimental_files: settings.tryExperimentalFiles ? 'yes' : 'no',
            desktop_folder: settings.desktopFolder || '',
            decoration: settings.decoration,
            decoration_color: settings.decorationColor,
            icon_decoration_linked: settings.iconDecorationLinked ? 'yes' : 'no',
            icon_decoration: settings.iconDecoration,
            icon_color: settings.iconColor,
        });
    }

    // Reset buttons (icons / windows / full).
    async function postReset(url) {
        const body = new URLSearchParams();
        body.set('requesttoken', OC.requestToken);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }
    function wireReset(btnId, statusId, okMsg, confirmMsg) {
        const btn = el(btnId);
        const st = el(statusId);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (confirmMsg && !window.confirm(confirmMsg)) return;
            st.textContent = tr('Saving…');
            btn.disabled = true;
            try {
                const data = await postReset(btn.dataset.resetUrl);
                if (btnId === 'desktop-reset-all' && data.settings) applyResetState(data.settings);
                st.textContent = okMsg;
            }
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
            tr('All desktop settings were reset and applied.'),
            tr('Reset all desktop settings? This cannot be undone.'));
    }
})();
