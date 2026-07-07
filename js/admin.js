(() => {
    'use strict';

    const root = document.getElementById('desktop-admin-settings');
    if (!root) return;

    const tr = (s, p) => (window.OC && OC.L10N ? OC.L10N.translate('desktop_workspace', s, p) : s);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const debugCb = document.getElementById('desktop-debug-enabled');
    const expDisabledCb = document.getElementById('desktop-exp-disabled');
    const groupsSelect = document.getElementById('desktop-exp-groups');
    const button = document.getElementById('desktop-save-admin-settings');
    const status = document.getElementById('desktop-admin-settings-status');

    // --- Token multiselect that enhances the native <select multiple> (NC-style) ---
    function enhanceGroupSelect(select) {
        const wrapper = select.closest('[data-group-select]');
        if (!wrapper) return null;
        select.classList.add('desktop-msel-native');
        const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
        const isSel = (v) => Array.from(select.options).some((o) => o.value === v && o.selected);
        const setSel = (v, on) => { const o = Array.from(select.options).find((x) => x.value === v); if (o) o.selected = on; };

        const box = document.createElement('div');
        box.className = 'desktop-msel';
        box.innerHTML = `
            <div class="desktop-msel-control" tabindex="0">
                <span class="desktop-msel-chips"></span>
                <input class="desktop-msel-input" type="text" placeholder="${esc(tr('Search groups…'))}" />
            </div>
            <div class="desktop-msel-dropdown" hidden></div>`;
        wrapper.appendChild(box);
        const chips = box.querySelector('.desktop-msel-chips');
        const input = box.querySelector('.desktop-msel-input');
        const dropdown = box.querySelector('.desktop-msel-dropdown');
        const control = box.querySelector('.desktop-msel-control');

        const renderChips = () => {
            chips.innerHTML = options.filter((o) => isSel(o.value)).map((o) =>
                `<span class="desktop-msel-chip">${esc(o.label)} <button type="button" class="desktop-msel-remove" data-v="${esc(o.value)}" aria-label="${esc(tr('Remove'))}">×</button></span>`).join('');
        };
        const renderDropdown = () => {
            const q = input.value.trim().toLowerCase();
            const items = options.filter((o) => !q || o.label.toLowerCase().includes(q));
            dropdown.innerHTML = items.length
                ? items.map((o) => `<button type="button" class="desktop-msel-option${isSel(o.value) ? ' is-selected' : ''}" data-v="${esc(o.value)}">${esc(o.label)}${isSel(o.value) ? ' ✓' : ''}</button>`).join('')
                : `<div class="desktop-msel-empty">${esc(tr('No groups'))}</div>`;
        };
        const open = () => { if (select.disabled) return; renderDropdown(); dropdown.hidden = false; };
        const close = () => { dropdown.hidden = true; };

        control.addEventListener('click', () => { if (!select.disabled) { input.focus(); open(); } });
        input.addEventListener('input', open);
        input.addEventListener('focus', open);
        dropdown.addEventListener('click', (e) => {
            const opt = e.target.closest('.desktop-msel-option'); if (!opt) return;
            setSel(opt.dataset.v, !isSel(opt.dataset.v)); renderChips(); renderDropdown(); input.value = ''; input.focus();
        });
        chips.addEventListener('click', (e) => {
            const rm = e.target.closest('.desktop-msel-remove'); if (!rm || select.disabled) return;
            setSel(rm.dataset.v, false); renderChips(); renderDropdown();
        });
        document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });

        renderChips();
        return { syncDisabled() { box.classList.toggle('is-disabled', select.disabled); if (select.disabled) close(); } };
    }

    const groupWidget = groupsSelect ? enhanceGroupSelect(groupsSelect) : null;

    // The group allow-list is the TESTING EXCEPTION: editable only while disabled-for-everyone is on.
    const syncGroupsState = () => {
        if (groupsSelect) groupsSelect.disabled = !expDisabledCb.checked;
        if (groupWidget) groupWidget.syncDisabled();
    };
    expDisabledCb.addEventListener('change', syncGroupsState);
    syncGroupsState();
    button.addEventListener('click', async () => {
        status.textContent = tr('Saving…');
        button.disabled = true;
        try {
            const groups = groupsSelect ? Array.from(groupsSelect.selectedOptions).map((o) => o.value) : [];
            const multiWindow = Array.from(document.querySelectorAll('.desktop-multiwin-app:checked')).map((c) => c.value);
            const body = new URLSearchParams();
            body.set('debug_enabled', debugCb.checked ? 'yes' : 'no');
            body.set('experimental_disabled', expDisabledCb.checked ? 'yes' : 'no');
            body.set('experimental_groups', JSON.stringify(groups));
            body.set('multi_window_apps', JSON.stringify(multiWindow));
            body.set('requesttoken', OC.requestToken);

            const response = await fetch(root.dataset.saveUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken },
                body,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await response.json();
            status.textContent = tr('Saved.');
        } catch (error) {
            status.textContent = tr('Save failed: {msg}', { msg: error.message });
        } finally {
            button.disabled = false;
        }
    });

    // Reset the shared desktop debug log without changing the debug-enabled flag.
    const resetLogBtn = document.getElementById('desktop-reset-debug-log');
    const resetLogStatus = document.getElementById('desktop-reset-debug-log-status');
    if (resetLogBtn) {
        resetLogBtn.addEventListener('click', async () => {
            if (!window.confirm(tr('Clear the desktop debug log? This cannot be undone.'))) return;
            resetLogStatus.textContent = tr('Saving…');
            resetLogBtn.disabled = true;
            try {
                const body = new URLSearchParams();
                body.set('requesttoken', OC.requestToken);
                const response = await fetch(resetLogBtn.dataset.resetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken },
                    body,
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || data.status === 'error') {
                    resetLogStatus.textContent = tr('Save failed: {msg}', { msg: data.message || ('HTTP ' + response.status) });
                    return;
                }
                resetLogStatus.textContent = tr('Debug log cleared.');
            } catch (error) {
                resetLogStatus.textContent = tr('Save failed: {msg}', { msg: error.message });
            } finally {
                resetLogBtn.disabled = false;
            }
        });
    }

    // Reset a single user's desktop settings.
    const resetUserBtn = document.getElementById('desktop-reset-user');
    const resetUserInput = document.getElementById('desktop-reset-user-id');
    const resetUserStatus = document.getElementById('desktop-reset-user-status');
    if (resetUserBtn && resetUserInput) {
        resetUserBtn.addEventListener('click', async () => {
            const userId = (resetUserInput.value || '').trim();
            if (!userId) { resetUserStatus.textContent = tr('Please enter a user ID.'); return; }
            if (!window.confirm(tr('Reset all desktop settings for “{user}”? This cannot be undone.', { user: userId }))) return;
            resetUserStatus.textContent = tr('Saving…');
            resetUserBtn.disabled = true;
            try {
                const body = new URLSearchParams();
                body.set('userId', userId);
                body.set('requesttoken', OC.requestToken);
                const response = await fetch(resetUserBtn.dataset.resetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken },
                    body,
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || data.status === 'error') {
                    resetUserStatus.textContent = data.message === 'unknown_user' ? tr('No such user.') : tr('Save failed: {msg}', { msg: data.message || ('HTTP ' + response.status) });
                    return;
                }
                resetUserStatus.textContent = tr('User reset. They will start fresh on their next visit.');
                resetUserInput.value = '';
            } catch (error) {
                resetUserStatus.textContent = tr('Save failed: {msg}', { msg: error.message });
            } finally {
                resetUserBtn.disabled = false;
            }
        });
    }
})();
