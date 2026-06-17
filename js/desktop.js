(() => {
    'use strict';
    const t = (text, vars = {}) => window.OC?.L10N?.translate ? OC.L10N.translate('desktop', text, vars) : text.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? '');

    const root = document.querySelector('[data-desktop-app-root]');
    if (!root) return;

    const stage = document.getElementById('desktop-stage');
    const startButton = document.getElementById('desktop-start');
    const startMenu = document.getElementById('desktop-start-menu');
    const launcher = document.getElementById('desktop-launcher');
    const taskList = document.getElementById('desktop-task-list');
    const search = document.getElementById('desktop-search');
    const clock = document.getElementById('desktop-clock');
    const headerEndSlot = document.getElementById('desktop-header-end-slot');
    const desktopLogo = document.getElementById('desktop-nextcloud-logo');

    const debugEnabled = root.dataset.debugEnabled === 'true';
    const debugUrl = root.dataset.debugUrl;
    const windows = new Map();
    let zIndex = 20;
    let launcherApps = [];
    let headerMenuPositionObserver = null;
    let favoritesReload = null;
    let applyIconSettings = null;

    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));

    function debugLog(event, payload = {}) {
        if (!debugEnabled || !debugUrl) return;
        const body = new URLSearchParams();
        body.set('event', event);
        body.set('payload', JSON.stringify(payload));
        if (window.OC?.requestToken) body.set('requesttoken', OC.requestToken);
        fetch(debugUrl, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                ...(window.OC?.requestToken ? { requesttoken: OC.requestToken } : {}),
            },
            body,
        }).catch(() => {});
    }

    function pruneHeaderEnd() {
        const headerEnd = headerEndSlot && headerEndSlot.querySelector('.header-end');
        if (!headerEnd) return;
        // The Contacts app is available on its own, so drop the header contacts menu.
        headerEnd.querySelectorAll('#contactsmenu, .contactsmenu, [id*="contactsmenu"]').forEach((el) => el.remove());
        // Reload-desktop button was removed for now.
        headerEnd.querySelectorAll('#desktop-reload-button').forEach((el) => el.remove());
    }

    function moveHeaderEndToTaskbar() {
        if (!headerEndSlot || headerEndSlot.dataset.moved === 'true') return;
        const headerEnd = document.querySelector('#header .header-end');
        if (!headerEnd) {
            debugLog('header_end_not_found');
            return;
        }
        headerEndSlot.replaceChildren(headerEnd);
        headerEndSlot.dataset.moved = 'true';
        pruneHeaderEnd();
        debugLog('header_end_moved_to_taskbar');
    }

    function positionHeaderEndMenus() {
        if (!headerEndSlot) return;
        pruneHeaderEnd();
        const taskbar = document.querySelector('.desktop-taskbar');
        const taskbarTop = taskbar?.getBoundingClientRect().top ?? window.innerHeight - 54;
        const bottom = Math.max(8, window.innerHeight - taskbarTop + 8);
        const menus = document.querySelectorAll('.header-menu__wrapper, .popovermenu:not(.account-menu__avatar):not(.contact__avatar):not(.avatardiv), .popovermenu-wrapper:not(.account-menu__avatar):not(.contact__avatar):not(.avatardiv)');
        menus.forEach((menu) => {
            const rect = menu.getBoundingClientRect();
            const style = getComputedStyle(menu);
            if (rect.height <= 20 || style.display === 'none' || style.visibility === 'hidden') return;
            if (menu.classList.contains('header-menu__wrapper') && menu.parentElement !== document.body) {
                document.body.appendChild(menu);
            }
            const slotRect = headerEndSlot.getBoundingClientRect();
            const freshRect = menu.getBoundingClientRect();
            const freshStyle = getComputedStyle(menu);
            const contentWidth = Math.max(freshRect.width || rect.width || 0, menu.scrollWidth || 0, menu.firstElementChild?.getBoundingClientRect().width || 0, 320);
            const width = Math.min(contentWidth, window.innerWidth - 16);
            const currentCssLeft = parseFloat(freshStyle.left) || 0;
            const coordinateOffset = freshRect.left - currentCssLeft;
            const desiredRenderedLeft = Math.max(8, Math.min(slotRect.right - width, window.innerWidth - width - 8));
            const left = desiredRenderedLeft - coordinateOffset;
            menu.style.setProperty('position', 'fixed', 'important');
            menu.style.setProperty('top', 'auto', 'important');
            menu.style.setProperty('bottom', `${bottom}px`, 'important');
            menu.style.setProperty('left', `${left}px`, 'important');
            menu.style.setProperty('right', 'auto', 'important');
            menu.style.setProperty('width', `${width}px`, 'important');
            menu.style.setProperty('transform', 'none', 'important');
            menu.style.setProperty('z-index', '100020', 'important');
        });
    }

    function scheduleHeaderEndMenuPositioning() {
        requestAnimationFrame(positionHeaderEndMenus);
        setTimeout(positionHeaderEndMenus, 80);
        setTimeout(positionHeaderEndMenus, 250);
        setTimeout(positionHeaderEndMenus, 700);
        setTimeout(positionHeaderEndMenus, 1200);
        setTimeout(positionHeaderEndMenus, 1800);
        setTimeout(positionHeaderEndMenus, 2400);
    }


    function observeHeaderEndMenus() {
        if (headerMenuPositionObserver) return;
        headerMenuPositionObserver = new MutationObserver(() => scheduleHeaderEndMenuPositioning());
        headerMenuPositionObserver.observe(document.body, { childList: true, subtree: true });
    }

    function copyHeaderLogoToTaskbar() {
        if (!desktopLogo || desktopLogo.dataset.logoCopied === 'true') return;
        const originalLogo = document.querySelector('#nextcloud .logo, #nextcloud .logo-icon');
        if (!originalLogo) {
            debugLog('header_logo_not_found');
            return;
        }
        const clonedLogo = originalLogo.cloneNode(true);
        clonedLogo.removeAttribute('id');
        clonedLogo.setAttribute('aria-hidden', 'true');
        const style = getComputedStyle(originalLogo);
        for (const property of ['background-image', 'background-size', 'background-position', 'background-repeat']) {
            const value = style.getPropertyValue(property);
            if (value) clonedLogo.style.setProperty(property, value, 'important');
        }
        desktopLogo.replaceChildren(clonedLogo);
        desktopLogo.dataset.logoCopied = 'true';
        applyLogoContrast();
        debugLog('header_logo_copied_to_taskbar');
    }

    function syncDesktopTheme() {
        const source = document.body || document.documentElement;
        const computed = getComputedStyle(source);
        const variables = [
            '--color-main-background', '--color-main-background-rgb', '--color-main-text', '--color-primary', '--color-primary-text',
            '--color-primary-light', '--color-border', '--color-background-hover', '--color-background-darker', '--color-text-maxcontrast',
            '--color-primary-element', '--color-primary-element-text', '--color-primary-element-light', '--color-primary-element-light-text'
        ];
        for (const variable of variables) {
            const value = computed.getPropertyValue(variable).trim();
            if (value) root.style.setProperty(variable, value);
        }
        root.dataset.theme = document.documentElement.dataset.theme || document.body.dataset.theme || '';
    }

    function applyUserBackground() {
        const candidates = [document.body, document.documentElement, document.querySelector('#body-user')].filter(Boolean);
        for (const element of candidates) {
            const style = getComputedStyle(element);
            for (const key of ['--image-background', '--image-background-default']) {
                const value = style.getPropertyValue(key).trim();
                if (value && value !== 'none') {
                    root.style.setProperty('--desktop-background-image', value);
                    debugLog('background_applied', { source: key, value });
                    return;
                }
            }
            if (style.backgroundImage && style.backgroundImage !== 'none') {
                root.style.setProperty('--desktop-background-image', style.backgroundImage);
                debugLog('background_applied', { source: 'computed-background-image', value: style.backgroundImage });
                return;
            }
        }
        debugLog('background_fallback_used');
    }

    function applyLogoContrast() {
        // The taskbar logo is cloned from the NC header, where it is the light variant (for the dark
        // header). On a bright taskbar panel that variant is invisible, so darken it via filter.
        if (!desktopLogo || desktopLogo.dataset.logoCopied !== 'true') return;
        const node = desktopLogo.firstElementChild;
        if (!node) return;
        const readLum = (el) => {
            const m = el && getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
            if (!m) return null;
            const [r, g, b, a = 1] = m.map(Number);
            if (a === 0) return null;
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        };
        const lum = readLum(document.querySelector('.desktop-taskbar')) ?? readLum(document.body) ?? 1;
        node.style.setProperty('filter', lum > 0.5 ? 'invert(1) hue-rotate(180deg) saturate(1.2)' : 'none', 'important');
    }

    function applyIconTextContrast() {
        // Light theme -> dark label text -> needs a white shadow to stand out on dark wallpapers.
        // Dark theme  -> light label text -> keep the black shadow.
        const parseLum = (raw) => {
            if (!raw) return null;
            raw = raw.trim();
            if (raw[0] === '#') {
                let h = raw.slice(1);
                if (h.length === 3) h = h.split('').map((c) => c + c).join('');
                if (h.length < 6) return null;
                const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
                return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            }
            const m = raw.match(/[\d.]+/g);
            if (!m || m.length < 3) return null;
            const [r, g, b] = m.map(Number);
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        };
        const lum = parseLum(getComputedStyle(document.body).getPropertyValue('--color-main-text'));
        // dark text (low luminance) => light theme
        root.classList.toggle('desktop-theme-light', lum !== null && lum < 0.5);
    }

    function syncAppearance() {
        syncDesktopTheme();
        applyUserBackground();
        applyLogoContrast();
        applyIconTextContrast();
    }

    function observeAppearanceChanges() {
        const observer = new MutationObserver(() => syncAppearance());
        for (const element of [document.documentElement, document.body, document.querySelector('#body-user')].filter(Boolean)) {
            observer.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
        }
        window.addEventListener('storage', (event) => {
            if (String(event.key || '').toLowerCase().includes('background') || String(event.key || '').toLowerCase().includes('theme')) syncAppearance();
        });
        setInterval(syncAppearance, 5000);
    }

    function loadState() {
        try { return JSON.parse(root.dataset.windowStates || '{"windows":[]}'); }
        catch { return { windows: [] }; }
    }

    // The folder/file a window targets, used to drop windows whose target is gone on restore.
    function targetPathFromHref(href) {
        try {
            const u = new URL(href, window.location.origin);
            return u.searchParams.get('dir') || u.searchParams.get('filePath') || '';
        } catch (e) { return ''; }
    }

    let windowSaveTimer = null;
    function saveState() {
        const registered = new Set(getApps().map((a) => a.id));
        const data = {
            windows: Array.from(windows.values()).map(({ app, window: win }) => ({
                appId: app.id,
                sourceAppId: app.sourceAppId || app.id,
                name: app.name || '',
                icon: app.icon || '',
                href: app.href || '',
                desktopMode: app.desktopMode || '',
                fileApp: !!app.fileApp,
                multiInstance: !!app.multiInstance,
                appWindow: registered.has(app.sourceAppId || app.id),
                checkPath: targetPathFromHref(app.href || ''),
                left: win.style.left,
                top: win.style.top,
                width: win.style.width,
                height: win.style.height,
                zIndex: win.style.zIndex,
                hidden: win.classList.contains('is-minimized'),
                minimized: win.classList.contains('is-minimized'),
                restoreLeft: win.dataset.restoreLeft || '',
                restoreTop: win.dataset.restoreTop || '',
                restoreWidth: win.dataset.restoreWidth || '',
                restoreHeight: win.dataset.restoreHeight || '',
                maximized: win.classList.contains('is-maximized'),
            })),
        };
        const url = root.dataset.windowSaveUrl;
        if (!url || !window.OC) return;
        clearTimeout(windowSaveTimer);
        windowSaveTimer = setTimeout(() => {
            const body = new URLSearchParams();
            body.set('windows', JSON.stringify(data));
            body.set('requesttoken', OC.requestToken);
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body }).catch(() => {});
        }, 500);
    }

    function getApps() {
        let apps = [];
        try {
            apps = JSON.parse(root.dataset.apps || '[]').map((entry) => ({
                id: String(entry.id || entry.href || entry.name).replace(/[^a-z0-9_-]/gi, '_'),
                name: String(entry.name || 'App'),
                href: String(entry.href || '#'),
                icon: String(entry.icon || ''),
                multiInstance: Boolean(entry.multiInstance),
            }));
        } catch (error) {
            debugLog('app_list_parse_failed', { message: error.message });
        }
        const seen = new Set();
        const filtered = apps.filter((app) => {
            const key = `${app.name}:${app.href}`;
            if (!app.name || !app.href || app.href.includes('/apps/desktop') || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const files = filtered.find((app) => app.id === 'files' || app.href.includes('/apps/files'));
        const desktopfilesEnabled = root.dataset.desktopfilesEnabled === 'true';
        if (!desktopfilesEnabled) {
            return filtered;
        }
        const withoutFiles = filtered.filter((app) => !(app.id === 'files' || app.href.includes('/apps/files')));
        return [{
            id: 'desktop-files',
            name: t('Desktop Files'),
            href: `${window.location.origin}/index.php/apps/desktop/files?desktop=1`,
            icon: files?.icon || (window.OC && OC.imagePath && OC.imagePath('desktop','files.svg')) || '/apps/desktop/img/files.svg',
            desktopMode: 'iframe',
            fileApp: true,
            multiInstance: true,
        }, ...withoutFiles];
    }

    function createAppButton(app) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'desktop-app-tile';
        button.dataset.name = app.name.toLowerCase();
        button.innerHTML = `<span class="desktop-app-icon">${app.icon ? `<img alt="" src="${escapeHtml(app.icon)}">` : escapeHtml(app.name.slice(0, 1))}</span><span>${escapeHtml(app.name)}</span>`;
        const isFileApp = app.fileApp === true || app.id === 'files' || (app.href && app.href.includes('/apps/files'));
        const allowMulti = isFileApp || app.multiInstance === true;
        button.addEventListener('click', () => { closeStartMenu(); openWindow(allowMulti ? { ...app, multiInstance: true } : app); });
        return button;
    }

    function renderLauncher() {
        const apps = getApps();
        launcher.replaceChildren(...apps.map(createAppButton));
        if (!apps.length) launcher.innerHTML = '<p class="desktop-empty">No apps found.</p>';
        return apps;
    }

    function openStartMenu() { startMenu.hidden = false; startButton.setAttribute('aria-expanded', 'true'); search.focus(); }
    function closeStartMenu() { startMenu.hidden = true; startButton.setAttribute('aria-expanded', 'false'); }
    function toggleStartMenu() { startMenu.hidden ? openStartMenu() : closeStartMenu(); }

    const fullscreenButton = document.getElementById('desktop-fullscreen');
    fullscreenButton?.addEventListener('click', () => {
        if (document.fullscreenElement) {
            (document.exitFullscreen && document.exitFullscreen()) || (document.webkitExitFullscreen && document.webkitExitFullscreen());
        } else {
            const el = document.documentElement;
            const req = el.requestFullscreen || el.webkitRequestFullscreen;
            if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }
        }
    });

    const settingsButton = document.getElementById('desktop-settings-button');
    function openDesktopSettings() {
        const url = (settingsButton && settingsButton.dataset.settingsUrl) || '/index.php/settings/user/desktop';
        const icon = (window.OC && OC.imagePath && OC.imagePath('desktop', 'app.svg')) || '/apps/desktop/img/app.svg';
        openExternalWindow({ appId: 'desktop-settings', title: t('Desktop Settings'), href: url, icon });
    }
    function openDesktopAdminSettings() {
        const url = (window.OC && OC.generateUrl) ? OC.generateUrl('/settings/admin/desktop') : '/index.php/settings/admin/desktop';
        const icon = (window.OC && OC.imagePath && OC.imagePath('desktop', 'app.svg')) || '/apps/desktop/img/app.svg';
        openExternalWindow({ appId: 'desktop-admin-settings', title: t('Desktop Admin Settings'), href: url, icon });
    }
    function isAdminUser() { return !!(window.OC && OC.isUserAdmin && OC.isUserAdmin()); }
    settingsButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        closeStartMenu();
        openDesktopSettings();
    });

    function restoreWindowGeometry(entry) {
        const win = entry.window;
        if (win.dataset.restoreLeft) win.style.left = win.dataset.restoreLeft;
        if (win.dataset.restoreTop) win.style.top = win.dataset.restoreTop;
        if (win.dataset.restoreWidth) win.style.width = win.dataset.restoreWidth;
        if (win.dataset.restoreHeight) win.style.height = win.dataset.restoreHeight;
    }

    function setWindowMinimized(id, minimized) {
        const entry = windows.get(id);
        if (!entry) return;
        const win = entry.window;
        if (minimized) {
            if (!win.classList.contains('is-minimized')) {
                win.dataset.restoreLeft = win.style.left || `${win.offsetLeft}px`;
                win.dataset.restoreTop = win.style.top || `${win.offsetTop}px`;
                win.dataset.restoreWidth = win.style.width || `${win.offsetWidth}px`;
                win.dataset.restoreHeight = win.style.height || `${win.offsetHeight}px`;
            }
            win.classList.add('is-minimized');
            win.classList.remove('is-focused');
            win.setAttribute('aria-hidden', 'true');
            win.style.left = '0px';
            win.style.top = 'calc(100% + 96px)';
            win.style.width = '1px';
            win.style.height = '1px';
            entry.task.classList.remove('is-active');
            entry.task.classList.add('is-minimized');
            entry.task.setAttribute('aria-pressed', 'false');
            debugLog('window_minimized', { appId: id });
        } else {
            win.classList.remove('is-minimized');
            win.removeAttribute('aria-hidden');
            restoreWindowGeometry(entry);
            debugLog('window_unminimized', { appId: id });
        }
        saveState();
    }

    function focusWindow(id) {
        const entry = windows.get(id);
        if (!entry) return;
        if (entry.window.classList.contains('is-minimized')) setWindowMinimized(id, false);
        entry.window.style.zIndex = String(++zIndex);
        windows.forEach((other) => {
            const isFocused = other === entry;
            const isMinimized = other.window.classList.contains('is-minimized');
            other.window.classList.toggle('is-focused', isFocused && !isMinimized);
            other.task.classList.toggle('is-active', isFocused && !isMinimized);
            other.task.classList.toggle('is-minimized', isMinimized);
            other.task.setAttribute('aria-pressed', isFocused && !isMinimized ? 'true' : 'false');
        });
        saveState();
    }

    function setWindowMeta(id, meta = {}) {
        const entry = windows.get(id);
        if (!entry) return;
        if (meta.title) {
            entry.app.name = String(meta.title);
            entry.window.querySelector('[data-window-title]').textContent = entry.app.name;
            entry.task.querySelector('[data-task-title]').textContent = entry.app.name;
        }
        const subtitle = meta.subtitle || '';
        entry.app.subtitle = subtitle;
        // Desktop Files reports its current folder via the subtitle (its URL stays static).
        // Mirror it into the stored href so the window restores at the last-viewed folder.
        if (subtitle && subtitle.charAt(0) === '/' && /\/apps\/desktop\/files/.test(entry.app.href || '')) {
            try {
                const u = new URL(entry.app.href, window.location.origin);
                u.searchParams.set('dir', subtitle);
                u.searchParams.delete('windowId');
                entry.app.href = u.toString();
            } catch (e) { /* ignore */ }
        }
        const subtitleNode = entry.window.querySelector('[data-window-subtitle]');
        subtitleNode.textContent = subtitle;
        subtitleNode.hidden = !subtitle;
        saveState();
    }

    function minimizeWindow(id) {
        setWindowMinimized(id, true);
    }

    function ensureTaskContextMenu() {
        let menu = document.getElementById('desktop-task-context-menu');
        if (menu) return menu;
        menu = document.createElement('div');
        menu.id = 'desktop-task-context-menu';
        menu.className = 'desktop-task-context-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        menu.innerHTML = `
            <button type="button" role="menuitem" data-action="minimize">${escapeHtml(t('Minimize'))}</button>
            <button type="button" role="menuitem" data-action="maximize">${escapeHtml(t('Maximize'))}</button>
            <button type="button" role="menuitem" data-action="close">${escapeHtml(t('Close'))}</button>`;
        document.body.appendChild(menu);
        menu.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const id = menu.dataset.windowId;
            const entry = windows.get(id);
            if (!entry) return closeTaskContextMenu();
            const action = button.dataset.action;
            if (action === 'minimize') minimizeWindow(id);
            if (action === 'maximize') {
                setWindowMinimized(id, false);
                entry.window.classList.toggle('is-maximized');
                focusWindow(id);
                saveState();
            }
            if (action === 'close') closeWindow(id);
            closeTaskContextMenu();
        });
        return menu;
    }

    function closeTaskContextMenu() {
        const menu = document.getElementById('desktop-task-context-menu');
        if (!menu) return;
        menu.hidden = true;
        delete menu.dataset.windowId;
    }

    function openTaskContextMenu(id, event) {
        const entry = windows.get(id);
        if (!entry) return;
        event.preventDefault();
        event.stopPropagation();
        const menu = ensureTaskContextMenu();
        menu.dataset.windowId = id;
        menu.hidden = false;
        const width = menu.offsetWidth || 180;
        const height = menu.offsetHeight || 120;
        const x = Math.min(event.clientX, window.innerWidth - width - 8);
        const y = Math.min(event.clientY, window.innerHeight - height - 8);
        menu.style.left = `${Math.max(8, x)}px`;
        menu.style.top = `${Math.max(8, y)}px`;
        menu.querySelector('[data-action="minimize"]').textContent = entry.window.classList.contains('is-minimized') ? t('Restore') : t('Minimize');
        menu.querySelector('[data-action="maximize"]').textContent = entry.window.classList.contains('is-maximized') ? t('Restore size') : t('Maximize');
        menu.querySelector('button')?.focus();
    }

    function closeWindow(id) {
        const entry = windows.get(id);
        if (!entry) return;
        entry.window.remove();
        entry.task.remove();
        windows.delete(id);
        saveState();
    }

    function openExternalWindow({ appId, title, subtitle = '', href, icon = '' }) {
        const id = String(appId || href || title).replace(/[^a-z0-9_-]/gi, '_');
        openWindow({ id, name: title || 'Nextcloud', href, icon, desktopMode: 'iframe' });
        setWindowMeta(id, { title: title || 'Nextcloud', subtitle });
    }

    function normalizeDesktopHref(rawHref) {
        if (!rawHref) return null;
        const url = new URL(rawHref, window.location.href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (url.hash && `${url.origin}${url.pathname}${url.search}` === `${window.location.origin}${window.location.pathname}${window.location.search}`) return null;
        if (url.pathname.includes('/logout')) return null;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
        if (url.origin !== window.location.origin && (url.pathname.startsWith('/index.php') || url.pathname.startsWith('/apps/'))) {
            url.protocol = window.location.protocol;
            url.host = window.location.host;
        }
        return url;
    }

    function closeSourceOverlay(link, source) {
        if (source === 'header-menu') {
            const menu = link.closest('.header-menu');
            const trigger = menu?.querySelector('button[aria-expanded="true"]');
            trigger?.click();
            return;
        }
        if (source === 'unified-search') {
            const closeButton = document.querySelector('[id*="unified-search"] button[aria-label="Close"], [class*="unified-search"] button[aria-label="Close"], button[aria-label="Close search"]');
            if (closeButton) closeButton.click();
            else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
    }

    function openLinkInDesktopWindow(link, source = 'link') {
        const url = normalizeDesktopHref(link.href || link.getAttribute('href'));
        if (!url) return false;
        const title = link.getAttribute('title') || link.getAttribute('aria-label') || link.textContent.trim().replace(/\s+/g, ' ') || 'Nextcloud';
        const appId = `link-${source}-${url.pathname}${url.search}`.replace(/[^a-z0-9_-]/gi, '_');
        openExternalWindow({
            appId,
            title,
            subtitle: url.pathname,
            href: url.toString(),
            icon: '/core/img/logo/logo.svg',
        });
        debugLog('desktop_link_opened_in_window', { source, title, href: url.toString() });
        return true;
    }

    function isUnifiedSearchResultLink(link) {
        return Boolean(link.closest('[id*="unified-search"], [class*="unified-search"], [class*="search-result"], [class*="search__result"]'));
    }

    function handleDesktopLinkClick(event) {
        const link = event.target.closest?.('a[href]');
        if (!link) return;
        if (link.closest('#user_status_menu_item, .user-status-menu-item, [data-id="user_status"]')) return; // native status modal
        const inMovedHeaderMenu = Boolean(headerEndSlot?.contains(link));
        const inSearchResult = isUnifiedSearchResultLink(link);
        if (!inMovedHeaderMenu && !inSearchResult) return;
        if (!normalizeDesktopHref(link.href || link.getAttribute('href'))) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const source = inMovedHeaderMenu ? 'header-menu' : 'unified-search';
        openLinkInDesktopWindow(link, source);
        setTimeout(() => closeSourceOverlay(link, source), 0);
    }

    function hideHeaderApps(apps) {
        const names = new Set(apps.map((app) => app.name).filter(Boolean));
        names.add(t('Files'));
        names.add(t('Desktop Files'));
        document.querySelectorAll('[aria-label="Applications menu"] a, #appmenu a').forEach((link) => {
            const text = link.textContent.trim();
            if (names.has(text)) {
                const item = link.closest('li') || link;
                item.hidden = true;
                item.setAttribute('data-desktop-hidden-app', 'true');
            }
        });
    }

    function uniqueWindowId(baseId) {
        let index = 1;
        let candidate = baseId;
        while (windows.has(candidate)) candidate = `${baseId}-${++index}`;
        return candidate;
    }

    function prepareWindowApp(app, restoredState = null) {
        if (restoredState) return { ...app, id: restoredState.appId || app.id, sourceAppId: restoredState.sourceAppId || app.id };
        if (!app.multiInstance) return app;
        return { ...app, id: uniqueWindowId(app.id), sourceAppId: app.id };
    }

    function openWindow(inputApp, restoredState = null) {
        const app = prepareWindowApp(inputApp, restoredState);
        if (windows.has(app.id)) {
            const entry = windows.get(app.id);
            setWindowMinimized(app.id, false);
            focusWindow(app.id);
            return;
        }
        const win = document.createElement('section');
        win.className = 'desktop-window is-focused';
        win.style.left = restoredState?.left || `${80 + windows.size * 28}px`;
        win.style.top = restoredState?.top || `${50 + windows.size * 22}px`;
        win.style.width = restoredState?.width || 'min(1120px, calc(100vw - 120px))';
        win.style.height = restoredState?.height || 'min(760px, calc(100vh - 150px))';
        win.style.zIndex = restoredState?.zIndex || String(++zIndex);
        const restoredMinimized = Boolean(restoredState?.minimized ?? restoredState?.hidden);
        if (restoredMinimized) {
            win.classList.add('is-minimized');
            win.setAttribute('aria-hidden', 'true');
            win.dataset.restoreLeft = restoredState?.restoreLeft || win.style.left;
            win.dataset.restoreTop = restoredState?.restoreTop || win.style.top;
            win.dataset.restoreWidth = restoredState?.restoreWidth || win.style.width;
            win.dataset.restoreHeight = restoredState?.restoreHeight || win.style.height;
            win.style.left = '0px';
            win.style.top = 'calc(100% + 96px)';
            win.style.width = '1px';
            win.style.height = '1px';
        }
        if (restoredState?.maximized) win.classList.add('is-maximized');
        win.innerHTML = `
            <header class="desktop-window-titlebar">
                <div class="desktop-window-title">
                    <span class="desktop-window-icon">${app.icon ? `<img alt="" draggable="false" src="${escapeHtml(app.icon)}">` : escapeHtml(app.name.slice(0, 1))}</span>
                    <span class="desktop-window-title-text"><strong data-window-title>${escapeHtml(app.name)}</strong><small data-window-subtitle hidden></small></span>
                </div>
                <div class="desktop-window-actions">
                    <button type="button" data-action="reload" title="${escapeHtml(t('Refresh content'))}" aria-label="${escapeHtml(t('Refresh content'))}">&#x21BA;</button>
                    <span class="desktop-window-actions-divider" aria-hidden="true"></span>
                    <button type="button" data-action="minimize" title="${escapeHtml(t('Minimize'))}">—</button>
                    <button type="button" data-action="maximize" title="${escapeHtml(t('Maximize'))}">□</button>
                    <button type="button" data-action="close" title="${escapeHtml(t('Close'))}">×</button>
                </div>
            </header>
            <div class="desktop-window-body is-loading" role="document">Loading ${escapeHtml(app.name)}…</div>
            <div class="desktop-resize desktop-resize-n" data-dir="n"></div>
            <div class="desktop-resize desktop-resize-s" data-dir="s"></div>
            <div class="desktop-resize desktop-resize-e" data-dir="e"></div>
            <div class="desktop-resize desktop-resize-w" data-dir="w"></div>
            <div class="desktop-resize desktop-resize-ne" data-dir="ne"></div>
            <div class="desktop-resize desktop-resize-nw" data-dir="nw"></div>
            <div class="desktop-resize desktop-resize-se" data-dir="se"></div>
            <div class="desktop-resize desktop-resize-sw" data-dir="sw"></div>`;
        const task = document.createElement('button');
        task.type = 'button';
        task.className = `desktop-task-button${win.classList.contains('is-minimized') ? ' is-minimized' : ' is-active'}`;
        task.innerHTML = `${app.icon ? `<img alt="" src="${escapeHtml(app.icon)}">` : ''}<span data-task-title>${escapeHtml(app.name)}</span>`;
        task.setAttribute('aria-pressed', win.classList.contains('is-minimized') ? 'false' : 'true');
        task.addEventListener('click', () => {
            const isFocused = win.classList.contains('is-focused') && !win.classList.contains('is-minimized');
            if (isFocused) {
                minimizeWindow(app.id);
                return;
            }
            focusWindow(app.id);
        });
        task.addEventListener('contextmenu', (event) => openTaskContextMenu(app.id, event));
        wireWindowControls(app.id, win, task);
        stage.appendChild(win);
        taskList.appendChild(task);
        windows.set(app.id, { window: win, task, app });
        if (!win.classList.contains('is-minimized')) focusWindow(app.id);
        saveState();
        debugLog(restoredState ? 'window_restored' : 'window_opened', { appId: app.id, appName: app.name, mode: 'safe-native' });
        loadNativeApp(app, win.querySelector('.desktop-window-body'));
    }

    async function loadNativeApp(app, target) {
        target.classList.add('is-loading');
        try {
            loadIframeFallback(app, target);
        } catch (error) {
            target.classList.remove('is-loading');
            target.innerHTML = `<div class="desktop-window-error"><div><strong>${escapeHtml(app.name)} could not be opened natively.</strong><p>${escapeHtml(error.message)}</p><button class="desktop-window-open-full" type="button">Open as full page</button></div></div>`;
            target.querySelector('button')?.addEventListener('click', () => { window.location.href = app.href; });
            debugLog('native_app_load_failed', { appId: app.id, appName: app.name, href: app.href, message: error.message });
        }
    }

    async function loadNativeFiles(target, dir = '/') {
        const uid = OC?.getCurrentUser?.()?.uid || OC?.currentUser || 'admin';
        const cleanDir = dir.startsWith('/') ? dir : `/${dir}`;
        const davPath = `/remote.php/dav/files/${encodeURIComponent(uid)}${cleanDir.split('/').map(encodeURIComponent).join('/')}`;
        const response = await fetch(davPath, {
            method: 'PROPFIND',
            credentials: 'same-origin',
            headers: {
                Depth: '1',
                'Content-Type': 'application/xml; charset=utf-8',
                'X-Requested-With': 'XMLHttpRequest',
                ...(window.OC?.requestToken ? { requesttoken: OC.requestToken } : {}),
            },
            body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>`,
        });
        if (!response.ok) throw new Error(`WebDAV HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        const rows = Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).slice(1).map((node) => {
            const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
            const name = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || '');
            const isFolder = Boolean(node.getElementsByTagNameNS('DAV:', 'collection')[0]);
            const size = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '';
            const modified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';
            return { name, isFolder, size, modified };
        }).filter((row) => row.name);
        target.classList.remove('is-loading');
        target.innerHTML = `
            <div class="desktop-files-native">
                <div class="desktop-files-toolbar"><strong>Files</strong><span>${escapeHtml(cleanDir)}</span><button type="button" data-refresh>Refresh</button></div>
                <table class="desktop-files-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Modified</th></tr></thead>
                    <tbody>${rows.map((row) => `<tr><td>${row.isFolder ? '📁' : '📄'} ${escapeHtml(row.name)}</td><td>${row.isFolder ? 'Folder' : 'File'}</td><td>${row.isFolder ? '' : escapeHtml(row.size)}</td><td>${escapeHtml(row.modified)}</td></tr>`).join('') || '<tr><td colspan="4">No files</td></tr>'}</tbody>
                </table>
            </div>`;
        target.querySelector('[data-refresh]')?.addEventListener('click', () => loadNativeFiles(target, cleanDir));
    }

    function loadIframeFallback(app, target) {
        const iframeUrl = new URL(app.href, window.location.href);
        iframeUrl.searchParams.set('windowId', app.id);
        const absoluteHref = iframeUrl.toString();
        target.classList.remove('is-loading');
        target.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.className = 'desktop-window-iframe';
        iframe.title = app.name;
        iframe.src = absoluteHref;
        iframe.loading = 'eager';
        const focusIfNotMinimized = () => {
            const entry = windows.get(app.id);
            if (!entry || entry.window.classList.contains('is-minimized')) return;
            focusWindow(app.id);
        };
        iframe.addEventListener('pointerdown', focusIfNotMinimized);
        iframe.addEventListener('focus', focusIfNotMinimized);
        iframe.addEventListener('mouseenter', () => {
            iframe.contentWindow?.addEventListener?.('pointerdown', focusIfNotMinimized, { once: true });
        });
        iframe.addEventListener('load', () => {
            focusIfNotMinimized();
            hideIframeChrome(iframe, app);
            watchIframeFileViewer(iframe, app);
            debugLog('iframe_app_loaded', { appId: app.id, appName: app.name, href: absoluteHref });
        });
        target.appendChild(iframe);
        debugLog('iframe_fallback_opened', { appId: app.id, appName: app.name, href: absoluteHref });
    }

    function watchIframeFileViewer(iframe, app) {
        if (!String(app.id).startsWith('file-') && !String(app.id).startsWith('file_')) return;
        let interval = null;
        const closeWindow = () => {
            const entry = windows.get(app.id);
            if (!entry) return;
            entry.window.remove();
            entry.task.remove();
            windows.delete(app.id);
            if (interval) clearInterval(interval);
            saveState();
            debugLog('file_window_closed_by_viewer', { appId: app.id, appName: app.name });
        };
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;
            doc.addEventListener('pointerdown', () => {
                const entry = windows.get(app.id);
                if (entry && !entry.window.classList.contains('is-minimized')) focusWindow(app.id);
            }, true);
            const closeSelectors = [
                '.viewer__close',
                '.viewer-close',
                '.modal-header__close',
                'button[aria-label="Close"]',
                'button[title="Close"]',
                '[data-cy-files-preview-close]',
                '.icon-close',
            ].join(',');
            doc.addEventListener('click', (event) => {
                if (event.target.closest(closeSelectors)) {
                    setTimeout(closeWindow, 100);
                }
            }, true);
            interval = setInterval(() => {
                try {
                    const url = iframe.contentWindow?.location?.href || '';
                    const hasViewer = Boolean(doc.querySelector('.viewer, #viewer, [class*="viewer"], [id*="viewer"], .modal-container'));
                    const hasClose = Boolean(doc.querySelector(closeSelectors));
                    if (!url.includes('/index.php/f/') && !hasViewer && !hasClose) closeWindow();
                } catch {
                    clearInterval(interval);
                }
            }, 1000);
        } catch (error) {
            debugLog('file_viewer_watch_failed', { appId: app.id, message: error.message });
        }
    }

    function hideIframeChrome(iframe, app) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;
            doc.addEventListener('pointerdown', () => {
                const entry = windows.get(app.id);
                if (entry && !entry.window.classList.contains('is-minimized')) focusWindow(app.id);
            }, true);
            doc.addEventListener('focusin', () => {
                const entry = windows.get(app.id);
                if (entry && !entry.window.classList.contains('is-minimized')) focusWindow(app.id);
            }, true);
            const style = doc.createElement('style');
            style.dataset.desktopChromePatch = 'true';
            style.textContent = `
                #header, header#header, .skip-navigation, #appmenu, .app-menu-main, .unified-search {
                    display: none !important;
                }
                #content, #content-vue, .content {
                    margin-top: 0 !important;
                    min-height: 100vh !important;
                }
                body { padding-top: 0 !important; }
            `;
            doc.head?.appendChild(style);
            debugLog('iframe_chrome_hidden', { appId: app.id, appName: app.name });
        } catch (error) {
            debugLog('iframe_chrome_hide_failed', { appId: app.id, appName: app.name, message: error.message });
        }
    }

    function extractSafeContent(doc) {
        doc.querySelectorAll('#header, header#header, .skip-navigation, #appmenu, .app-menu-main, .unified-search, script, noscript, style').forEach((node) => node.remove());
        const selected = doc.querySelector('#content-vue') || doc.querySelector('#content') || doc.querySelector('main') || doc.body;
        const wrapper = document.createElement('div');
        wrapper.className = 'desktop-native-content';
        wrapper.appendChild(document.importNode(selected, true));
        wrapper.querySelectorAll('[id]').forEach((node) => node.id = `desktop-native-${node.id}`);
        return wrapper;
    }

    function rewriteRelativeUrls(container, baseHref) {
        for (const [selector, attr] of [['a', 'href'], ['form', 'action'], ['img', 'src'], ['source', 'src'], ['link', 'href']]) {
            container.querySelectorAll(`${selector}[${attr}]`).forEach((element) => {
                const value = element.getAttribute(attr);
                if (!value || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) return;
                element.setAttribute(attr, new URL(value, baseHref).toString());
            });
        }
        container.querySelectorAll('a[href]').forEach((link) => {
            link.addEventListener('click', (event) => {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('#')) return;
                event.preventDefault();
                openWindow({ id: `link_${Date.now()}`, name: link.textContent.trim() || 'Nextcloud', href, icon: '' });
            });
        });
    }

    // --- Window snapping / tiling (Windows-style aero snap) ---
    let snapPreview = null;
    function getSnapPreview() {
        if (!snapPreview) {
            snapPreview = document.createElement('div');
            snapPreview.className = 'desktop-snap-preview';
            snapPreview.hidden = true;
            stage.appendChild(snapPreview);
        }
        return snapPreview;
    }
    const TILE = {
        left:  { left: '0%',  top: '0%',  width: '50%',  height: '100%' },
        right: { left: '50%', top: '0%',  width: '50%',  height: '100%' },
        tl:    { left: '0%',  top: '0%',  width: '50%',  height: '50%' },
        tr:    { left: '50%', top: '0%',  width: '50%',  height: '50%' },
        bl:    { left: '0%',  top: '50%', width: '50%',  height: '50%' },
        br:    { left: '50%', top: '50%', width: '50%',  height: '50%' },
        max:   { left: '0%',  top: '0%',  width: '100%', height: '100%' },
    };
    function snapZoneAt(clientX, clientY) {
        const r = stage.getBoundingClientRect();
        const EDGE = 16;
        const x = clientX - r.left, y = clientY - r.top;
        const onLeft = x <= EDGE, onRight = x >= r.width - EDGE;
        const onTop = y <= EDGE, onBottom = y >= r.height - EDGE;
        const colL = x <= r.width * 0.25, colR = x >= r.width * 0.75;
        const rowT = y <= r.height * 0.25, rowB = y >= r.height * 0.75;
        if (onLeft) return rowT ? 'tl' : rowB ? 'bl' : 'left';
        if (onRight) return rowT ? 'tr' : rowB ? 'br' : 'right';
        if (onTop) return colL ? 'tl' : colR ? 'tr' : 'max';
        if (onBottom) return colL ? 'bl' : colR ? 'br' : null; // bottom middle does nothing
        return null;
    }
    function showSnapPreview(zone) {
        const p = getSnapPreview();
        if (!zone || !TILE[zone]) { p.hidden = true; return; }
        Object.assign(p.style, TILE[zone]);
        p.hidden = false;
    }
    function applyTile(win, zone) {
        if (!zone || !TILE[zone]) return;
        if (!win.dataset.tiled) {
            win.dataset.untiledLeft = win.style.left;
            win.dataset.untiledTop = win.style.top;
            win.dataset.untiledWidth = win.style.width;
            win.dataset.untiledHeight = win.style.height;
        }
        win.classList.remove('is-maximized');
        const g = TILE[zone];
        win.style.left = g.left; win.style.top = g.top; win.style.width = g.width; win.style.height = g.height;
        win.dataset.tiled = zone;
    }
    function untileForDrag(win, clientX) {
        if (!win.dataset.tiled && !win.classList.contains('is-maximized')) return;
        win.classList.remove('is-maximized');
        if (win.dataset.untiledWidth) {
            win.style.width = win.dataset.untiledWidth;
            win.style.height = win.dataset.untiledHeight;
        }
        const stageRect = stage.getBoundingClientRect();
        const w = win.offsetWidth || 720;
        let nl = clientX - stageRect.left - w / 2;
        nl = Math.max(0, Math.min(nl, stage.clientWidth - 80));
        win.style.left = `${nl}px`;
        delete win.dataset.tiled;
    }

    function wireResize(id, win) {
        const MINW = 320, MINH = 180;
        win.querySelectorAll('.desktop-resize').forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                focusWindow(id);
                win.classList.remove('is-maximized');
                delete win.dataset.tiled;
                const dir = handle.dataset.dir;
                const stageEl = win.offsetParent || stage;
                const start = {
                    x: event.clientX, y: event.clientY,
                    left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight,
                    stageW: stageEl.clientWidth, stageH: stageEl.clientHeight,
                };
                handle.setPointerCapture(event.pointerId);
                const onMove = (ev) => {
                    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
                    let { left, top, width, height } = start;
                    if (dir.includes('e')) width = Math.max(MINW, start.width + dx);
                    if (dir.includes('s')) height = Math.max(MINH, start.height + dy);
                    if (dir.includes('w')) { const nw = Math.max(MINW, start.width - dx); left = start.left + (start.width - nw); width = nw; }
                    if (dir.includes('n')) { const nh = Math.max(MINH, start.height - dy); top = Math.max(0, start.top + (start.height - nh)); height = nh; }
                    if (left < 0) { width += left; left = 0; }
                    if (left + width > start.stageW) width = Math.max(MINW, start.stageW - left);
                    if (top + height > start.stageH) height = Math.max(MINH, start.stageH - top);
                    win.style.left = `${left}px`; win.style.top = `${top}px`;
                    win.style.width = `${width}px`; win.style.height = `${height}px`;
                };
                const onUp = (ev) => {
                    handle.releasePointerCapture(event.pointerId);
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                    saveState();
                };
                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
            });
        });
    }

    function wireWindowControls(id, win, task) {
        let drag = null;
        wireResize(id, win);
        const titlebar = win.querySelector('.desktop-window-titlebar');
        titlebar.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')) {
                event.stopPropagation();
                return;
            }
            focusWindow(id);
            drag = {
                startX: event.clientX, startY: event.clientY, moved: false,
                wasTiled: Boolean(win.dataset.tiled) || win.classList.contains('is-maximized'),
                x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop,
                bounds: null, zone: null,
            };
            titlebar.setPointerCapture(event.pointerId);
        });
        function computeDragBounds() {
            const stageEl = win.offsetParent || win.parentElement;
            const winRect = win.getBoundingClientRect();
            const reload = win.querySelector('[data-action="reload"]');
            const icon = win.querySelector('.desktop-window-icon');
            const cursorW = 20;
            const reloadOffsetX = reload ? reload.getBoundingClientRect().left - winRect.left : 0;
            const iconRightX = icon ? (icon.getBoundingClientRect().left - winRect.left) + icon.offsetWidth : winRect.width;
            const stageW = stageEl ? stageEl.clientWidth : window.innerWidth;
            const stageH = stageEl ? stageEl.clientHeight : window.innerHeight;
            return {
                minLeft: cursorW - reloadOffsetX,
                maxLeft: stageW - iconRightX,
                minTop: 0,
                maxTop: Math.max(0, stageH - titlebar.offsetHeight),
            };
        }
        titlebar.addEventListener('pointermove', (event) => {
            if (!drag) return;
            if (!drag.moved) {
                if (Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return;
                drag.moved = true;
                if (drag.wasTiled) untileForDrag(win, event.clientX); // only leave the tile once actually dragged
                drag.x = event.clientX; drag.y = event.clientY;
                drag.left = win.offsetLeft; drag.top = win.offsetTop;
                drag.bounds = computeDragBounds();
            }
            const b = drag.bounds;
            let nl = drag.left + event.clientX - drag.x;
            let nt = drag.top + event.clientY - drag.y;
            nl = Math.min(Math.max(nl, b.minLeft), Math.max(b.minLeft, b.maxLeft));
            nt = Math.min(Math.max(nt, b.minTop), b.maxTop);
            win.style.left = `${nl}px`;
            win.style.top = `${nt}px`;
            drag.zone = snapZoneAt(event.clientX, event.clientY);
            showSnapPreview(drag.zone);
        });
        titlebar.addEventListener('pointerup', () => {
            showSnapPreview(null);
            if (drag && drag.moved && drag.zone) applyTile(win, drag.zone);
            drag = null;
            saveState();
        });
        win.addEventListener('pointerdown', () => focusWindow(id));
        win.addEventListener('mouseup', () => setTimeout(saveState, 0));
        const minimizeButton = win.querySelector('[data-action="minimize"]');
        const handleMinimize = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!win.classList.contains('is-minimized')) minimizeWindow(id);
        };
        minimizeButton?.addEventListener('pointerdown', handleMinimize);
        minimizeButton?.addEventListener('click', handleMinimize);
        win.querySelector('[data-action="maximize"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            win.classList.toggle('is-maximized');
            focusWindow(id);
            saveState();
        });
        win.querySelector('[data-action="reload"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            focusWindow(id);
            const iframe = win.querySelector('.desktop-window-iframe');
            if (iframe) {
                try { iframe.contentWindow.location.reload(); }
                catch (e) { iframe.src = iframe.src; }
            } else {
                const entry = windows.get(id);
                const body = win.querySelector('.desktop-window-body');
                if (entry && body) loadNativeApp(entry.app, body);
            }
            debugLog('window_reloaded', { appId: id });
        });
        win.querySelector('[data-action="close"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeWindow(id);
        });
    }

    async function targetExists(path) {
        try {
            const uid = (window.OC && OC.getCurrentUser && OC.getCurrentUser() || {}).uid;
            if (!uid || !path) return true; // can't check → keep the window
            const url = `${(OC.getRootPath && OC.getRootPath()) || ''}/remote.php/dav/files/${encodeURIComponent(uid)}/`
                + path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
            const res = await fetch(url, { method: 'PROPFIND', headers: { Depth: '0', requesttoken: OC.requestToken } });
            return res.status !== 404;
        } catch (e) { return true; } // network/other error → don't drop on a false negative
    }

    // Track in-iframe navigation (e.g. the native Files app uses client-side routing, so no
    // 'load' fires) and remember the last URL per window, so a window restores where it was left.
    function trackIframeUrls() {
        let changed = false;
        windows.forEach((entry) => {
            const iframe = entry.window.querySelector('iframe.desktop-window-iframe');
            if (!iframe) return;
            // Desktop Files (and its viewer/details) keep a static URL and report their folder via
            // window-meta, so leave their stored href alone here — otherwise we'd overwrite the dir.
            if (/\/apps\/desktop\/files/.test(iframe.src || '')) return;
            let href = '';
            try { href = (iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href) || ''; }
            catch (e) { return; } // cross-origin (shouldn't happen for our apps) → skip
            if (!href || href === 'about:blank') return;
            try {
                const u = new URL(href, window.location.origin);
                u.searchParams.delete('windowId');
                const cleaned = u.toString();
                if (cleaned && cleaned !== entry.app.href) { entry.app.href = cleaned; changed = true; }
            } catch (e) { /* ignore */ }
        });
        if (changed) saveState();
    }
    setInterval(trackIframeUrls, 2000);

    function reconstructApp(item) {
        return {
            id: item.appId,
            name: item.name || 'Nextcloud',
            href: item.href || '#',
            icon: item.icon || '',
            desktopMode: item.desktopMode || undefined,
            sourceAppId: item.sourceAppId || item.appId,
            fileApp: !!item.fileApp,
            multiInstance: !!item.multiInstance,
        };
    }

    async function restoreWindows(apps) {
        const byId = new Map(apps.map((app) => [app.id, app]));
        const registered = new Set(apps.map((app) => app.id));
        let dropped = false;
        for (const item of loadState().windows || []) {
            // App window whose app was removed or disabled → don't restore.
            if (item.appWindow && !registered.has(item.sourceAppId || item.appId)) { dropped = true; continue; }
            // Window showing a file/folder that no longer exists → don't restore.
            if (item.checkPath) {
                const ok = await targetExists(item.checkPath); // eslint-disable-line no-await-in-loop
                if (!ok) { dropped = true; continue; }
            }
            const base = byId.get(item.sourceAppId || item.appId);
            // Registered apps keep their fresh metadata (icon/name) but reopen at the LAST url
            // the window was on, not the canonical app url.
            const app = base ? { ...base, href: item.href || base.href } : reconstructApp(item);
            openWindow(app, item);
        }
        if (dropped) saveState(); // persist the pruned set so it stays pruned
    }

    function updateClock() {
        const now = new Date();
        clock.dateTime = now.toISOString();
        clock.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now);
    }

    startButton.addEventListener('click', toggleStartMenu);
    document.addEventListener('click', handleDesktopLinkClick, true);
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'nextcloud-desktop:window-meta') {
            setWindowMeta(String(event.data.appId || ''), event.data);
        } else if (event.data?.type === 'nextcloud-desktop:open-file' || event.data?.type === 'nextcloud-desktop:open-app') {
            openExternalWindow(event.data);
            debugLog(event.data.type === 'nextcloud-desktop:open-file' ? 'file_window_requested' : 'app_window_requested', event.data);
        } else if (event.data?.type === 'nextcloud-desktop:desktop-reload') {
            if (typeof favoritesReload === 'function') favoritesReload();
        } else if (event.data?.type === 'nextcloud-desktop:settings-changed') {
            if (typeof applyIconSettings === 'function') applyIconSettings(event.data.settings || {});
        } else if (event.data?.type === 'nextcloud-desktop:close-window') {
            const id = String(event.data.appId || '').replace(/[^a-z0-9_-]/gi, '_');
            const entry = windows.get(id);
            if (entry) {
                entry.window.remove();
                entry.task.remove();
                windows.delete(id);
                saveState();
                debugLog('window_closed_by_child', { appId: id });
            }
        }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStartMenu(); });
    document.addEventListener('pointerdown', (event) => {
        if (!startMenu.hidden && !startMenu.contains(event.target) && !startButton.contains(event.target)) closeStartMenu();
        const menu = document.getElementById('desktop-task-context-menu');
        if (menu && !menu.hidden && !menu.contains(event.target)) closeTaskContextMenu();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeTaskContextMenu(); });
    headerEndSlot?.addEventListener('click', scheduleHeaderEndMenuPositioning, true);
    document.addEventListener('click', (event) => {
        if (event.target.closest('#desktop-header-end-slot')) scheduleHeaderEndMenuPositioning();
    }, true);

    // Header-end menu items (notifications, search results, contacts, the user/account menu, …) open as
    // desktop windows instead of navigating the shell away or being swallowed by an app's own per-link
    // handler (e.g. the "External sites" app). Strategy: bind directly on each menu anchor as it appears
    // (stopImmediatePropagation beats per-link handlers), with a document-level capture fallback.
    function headerMenuTarget(link) {
        if (!link) return null;
        if (link.closest('#desktop-nextcloud-logo, #desktop-start-menu, #desktop-launcher, #desktop-task-list')) return null; // shell chrome
        if (link.closest('.avatardiv, .contact__avatar')) return null;                  // avatar trigger
        if (link.closest('#user_status_menu_item, .user-status-menu-item, [data-id="user_status"]')) return null; // opens its own modal overlay
        if (link.hasAttribute('aria-haspopup') || link.getAttribute('aria-expanded') !== null) return null; // a menu toggle
        if (link.hasAttribute('download')) return null;
        let url;
        try { url = new URL(link.href, window.location.origin); } catch (e) { return null; }
        if (url.origin !== window.location.origin) return null;                          // external origin → leave alone
        if (/\/logout/i.test(url.pathname)) return null;                                 // never trap logout
        if (/\.(js|css|svg|png|jpe?g|gif|webp|woff2?|ico|map)(\?|$)/i.test(url.pathname)) return null; // static asset
        return url;
    }

    function buildHeaderLinkMeta(link, url) {
        const title = (link.getAttribute('aria-label') || link.textContent || 'Nextcloud').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Nextcloud';
        const icon = link.querySelector('img')?.getAttribute('src') || '';
        return { appId: `headerlink_${url.pathname}`, title, href: url.href, icon };
    }

    // Open as early as possible. Some menus (NcListItem inside the account menu's NcPopover) close and
    // DETACH the anchor on pointerdown, so the click never reaches a handler — opening on pointerdown
    // beats that. Propagation is left intact here so the menu still closes itself.
    document.addEventListener('pointerdown', (event) => {
        if (event.button) return;                               // primary button only
        const url = headerMenuTarget(event.target.closest('a[href]'));
        if (!url) return;
        const link = event.target.closest('a[href]');
        event.preventDefault();
        debugLog('header_link_pointerdown', { path: url.pathname });
        openExternalWindow(buildHeaderLinkMeta(link, url));
    }, true);

    // Click handler: suppress the native navigation and catch anything pointerdown missed. Deduped by
    // window id, so the same link just focuses its existing window rather than opening a second one.
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) {
            if (event.target.closest('#desktop-header-end-slot')) debugLog('header_click_no_anchor', { tag: event.target.tagName, cls: String(event.target.className || '').slice(0, 140) });
            return;
        }
        const url = headerMenuTarget(link);
        if (!url) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        debugLog('header_link_open', { path: url.pathname });
        openExternalWindow(buildHeaderLinkMeta(link, url));
    }, true);
    window.addEventListener('resize', positionHeaderEndMenus);
    setInterval(positionHeaderEndMenus, 400);
    search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        launcher.querySelectorAll('.desktop-app-tile').forEach((tile) => { tile.hidden = q && !tile.dataset.name.includes(q); });
    });

    moveHeaderEndToTaskbar();
    observeHeaderEndMenus();
    copyHeaderLogoToTaskbar();
    setTimeout(moveHeaderEndToTaskbar, 500);
    setTimeout(copyHeaderLogoToTaskbar, 500);
    syncAppearance();
    observeAppearanceChanges();
    const apps = renderLauncher();
    launcherApps = apps;
    hideHeaderApps(apps);
    setTimeout(() => hideHeaderApps(launcherApps), 500);
    setTimeout(() => hideHeaderApps(launcherApps), 1500);
    restoreWindows(apps);
    initFavorites();
    updateClock();
    if (root.dataset.firstVisit === 'true') {
        // First visit ever (also after a full reset): show the user their desktop settings.
        setTimeout(() => { try { openDesktopSettings(); } catch (e) { /* ignore */ } }, 400);
    }
    debugLog('desktop_loaded', { appCount: apps.length, logPath: root.dataset.debugLogPath, mode: 'safe-native' });
    setInterval(updateClock, 30000);

    (function startHeartbeat() {
        const url = root.dataset.heartbeatUrl;
        if (!url || !window.OC) return;
        const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ping = () => {
            const body = new URLSearchParams();
            body.set('instanceId', instanceId);
            body.set('requesttoken', OC.requestToken);
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body }).catch(() => {});
        };
        ping();
        setInterval(ping, 60000);
    })();

    // === Desktop favorites ===
    function initFavorites() {
        let desktopFolder = (root.dataset.desktopFolder || '').trim();
        let dfEnabled = root.dataset.desktopfilesEnabled === 'true';
        let showFav = root.dataset.showFavorites === 'true';
        const layer = document.getElementById('desktop-favorites');
        if (!layer || !window.OC || !OC.getCurrentUser) return;
        const uid = (OC.getCurrentUser() || {}).uid;
        if (!uid) return;
        layer.hidden = false;

        const CELL_W = 120, CELL_H = 100, PAD = 16;
        let noConfirm = root.dataset.favoritesNoConfirm === 'true';
        let trashNoConfirm = root.dataset.trashNoConfirm === 'true';
        let clipboard = null; // { mode: 'move'|'copy', refs: [{path,name}] }
        const davBase = `${(OC.getRootPath && OC.getRootPath()) || ''}/remote.php/dav/files/${encodeURIComponent(uid)}/`;
        const basePath = new URL(davBase, window.location.origin).pathname;
        const enc = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
        const davUrl = (p) => new URL(davBase + enc(p), window.location.origin).href;
        async function davDelete(path) {
            // Plain WebDAV DELETE on the files endpoint moves the item to the user's Recycling Bin.
            const res = await fetch(davUrl(path), { method: 'DELETE', headers: { requesttoken: OC.requestToken } });
            if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
        }
        async function davMove(src, dest) {
            const res = await fetch(davUrl(src), { method: 'MOVE', headers: { Destination: davUrl(dest), Overwrite: 'F', requesttoken: OC.requestToken } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        async function davCopy(src, dest) {
            const res = await fetch(davUrl(src), { method: 'COPY', headers: { Destination: davUrl(dest), Overwrite: 'F', requesttoken: OC.requestToken } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        async function setFavorite(path, on) {
            const body = '<?xml version="1.0"?>'
                + '<d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">'
                + `<d:set><d:prop><oc:favorite>${on ? 1 : 0}</oc:favorite></d:prop></d:set>`
                + '</d:propertyupdate>';
            const res = await fetch(davUrl(path), { method: 'PROPPATCH', headers: { 'Content-Type': 'application/xml', requesttoken: OC.requestToken }, body });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }

        // Cross-window clipboard, shared with the Desktop Files manager via localStorage so
        // cut/copy in one and paste in the other interoperate. Shape: { mode:'cut'|'copy', items:[{path,name,isFolder}] }.
        const SHARED_CLIP_KEY = 'desktop-files:clipboard';
        function writeSharedClipboard(mode, items) {
            try { localStorage.setItem(SHARED_CLIP_KEY, JSON.stringify({ mode, items, ts: Date.now() })); } catch (e) { /* ignore */ }
        }
        function readSharedClipboard() {
            try { const v = JSON.parse(localStorage.getItem(SHARED_CLIP_KEY) || 'null'); return (v && Array.isArray(v.items) && v.items.length) ? v : null; } catch (e) { return null; }
        }
        function clearSharedClipboard() { try { localStorage.removeItem(SHARED_CLIP_KEY); } catch (e) { /* ignore */ } }
        clearSharedClipboard(); // a fresh desktop session starts with an empty clipboard

        let positions = (() => { try { return JSON.parse(root.dataset.iconPositions || '{}'); } catch (e) { return {}; } })();
        let saveTimer = null;
        const savePositions = () => {
            const url = root.dataset.iconSaveUrl;
            if (!url) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                const body = new URLSearchParams();
                body.set('positions', JSON.stringify(positions));
                body.set('requesttoken', OC.requestToken);
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body }).catch(() => {});
            }, 500);
        };
        const occupied = new Map();
        const keyOf = (c, r) => `${c},${r}`;
        const cellXY = (c, r) => ({ x: PAD + c * CELL_W, y: PAD + r * CELL_H });
        // Usable height = from the top of the icon layer down to the top of the taskbar,
        // so icons never sit behind the taskbar (in fullscreen or any window size).
        function usableHeight() {
            const lr = layer.getBoundingClientRect();
            const taskbar = document.querySelector('.desktop-taskbar');
            let bottom = lr.bottom;
            if (taskbar) bottom = Math.min(bottom, taskbar.getBoundingClientRect().top);
            return Math.max(CELL_H, bottom - lr.top);
        }
        const rowsAvail = () => Math.max(1, Math.floor((usableHeight() - PAD) / CELL_H));
        const isFree = (c, r, except) => { const o = occupied.get(keyOf(c, r)); return !o || o === except; };
        function nextFreeCell() {
            const rows = rowsAvail();
            for (let c = 0; c < 1000; c++) for (let r = 0; r < rows; r++) if (isFree(c, r)) return { col: c, row: r };
            return { col: 0, row: 0 };
        }
        function nearestFreeCell(col, row, except) {
            const rows = rowsAvail();
            col = Math.max(0, col);
            row = Math.min(Math.max(0, row), rows - 1); // never below the usable area
            if (isFree(col, row, except)) return { col, row };
            for (let radius = 1; radius < 80; radius++) {
                for (let dc = -radius; dc <= radius; dc++) for (let dr = -radius; dr <= radius; dr++) {
                    const c = col + dc, r = row + dr;
                    if (c < 0 || r < 0 || r >= rows) continue;
                    if (isFree(c, r, except)) return { col: c, row: r };
                }
            }
            return { col, row };
        }
        function placeIcon(el, col, row) {
            const { x, y } = cellXY(col, row);
            el.style.left = `${x}px`; el.style.top = `${y}px`;
            el.dataset.col = col; el.dataset.row = row;
            occupied.set(keyOf(col, row), el.dataset.fileId);
        }

        // --- selection ---
        const selection = new Set();
        const selectIcon = (el) => { selection.add(el); el.classList.add('is-selected'); };
        const deselectIcon = (el) => { selection.delete(el); el.classList.remove('is-selected'); };
        const clearSelection = () => { selection.forEach((i) => i.classList.remove('is-selected')); selection.clear(); };

        function favVisual(item) {
            const mime = item.isFolder ? 'dir' : (item.mime || 'application/octet-stream');
            const fb = (OC.MimeType && OC.MimeType.getIconUrl) ? OC.MimeType.getIconUrl(mime) : '';
            if (!item.isFolder && item.fileId && OC.generateUrl) {
                const url = OC.generateUrl('/core/preview?fileId={id}&x=64&y=64&a=1&mimeFallback=true', { id: String(item.fileId) });
                return `<img src="${url}" alt=""${fb ? ` onerror="this.onerror=null;this.src='${fb}'"` : ''}>`;
            }
            return `<img src="${fb}" alt="">`;
        }
        const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#a37200" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>';
        function makeIcon(item) {
            const el = document.createElement('div');
            el.className = 'desktop-fav';
            el.tabIndex = 0;
            el.dataset.fileId = item.id || item.fileId || '';
            el.dataset.path = item.path || '';
            el.dataset.name = item.name;
            el.dataset.mime = item.mime || '';
            el.dataset.folder = item.isFolder ? 'true' : 'false';
            el.dataset.kind = item.special ? 'special' : (item.kind || 'fav');
            el.dataset.favorited = item.favorited ? 'true' : 'false';
            if (item.special) el.dataset.special = item.special;
            const visual = item.special
                ? (item.svg || `<img src="${item.iconUrl}" alt=""${item.iconFallback ? ` onerror="this.onerror=null;this.src='${item.iconFallback}'"` : ''}>`)
                : favVisual(item);
            const badge = item.favorited ? `<span class="desktop-fav-badge">${STAR_SVG}</span>` : '';
            el.innerHTML = `<span class="desktop-fav-icon">${visual}${badge}</span><span class="desktop-fav-label">${escapeHtml(item.name)}</span>`;
            return el;
        }

        function trashItem() {
            // Material Design "delete" icon (inline). core/img icons are deprecated since NC 25.
            // Dark fill so it stays visible on the white tile.
            const svg = '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">'
                + '<path fill="#2c2c2c" d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/></svg>';
            return { id: '__trash__', special: 'trash', name: t('Recycling Bin'), svg, isFolder: true };
        }
        function homeItem() {
            const icon = (OC.MimeType && OC.MimeType.getIconUrl) ? OC.MimeType.getIconUrl('dir') : '';
            return { id: '__home__', special: 'home', name: t('Home'), iconUrl: icon, iconFallback: icon, isFolder: true };
        }

        async function fetchFavorites() {
            const body = '<?xml version="1.0"?>'
                + '<oc:filter-files xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">'
                + '<d:prop><oc:fileid/><d:resourcetype/><d:getcontenttype/></d:prop>'
                + '<oc:filter-rules><oc:favorite>1</oc:favorite></oc:filter-rules>'
                + '</oc:filter-files>';
            const res = await fetch(davBase, { method: 'REPORT', headers: { 'Content-Type': 'application/xml', requesttoken: OC.requestToken }, body });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
            const items = [];
            for (const r of Array.from(doc.getElementsByTagNameNS('DAV:', 'response'))) {
                const hrefEl = r.getElementsByTagNameNS('DAV:', 'href')[0];
                if (!hrefEl) continue;
                let path = decodeURIComponent(new URL(hrefEl.textContent || '', window.location.origin).pathname);
                if (path.startsWith(basePath)) path = path.slice(basePath.length);
                path = path.replace(/\/$/, '');
                if (!path) continue;
                const isFolder = r.getElementsByTagNameNS('DAV:', 'collection').length > 0;
                const idEl = r.getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')[0];
                const mimeEl = r.getElementsByTagNameNS('DAV:', 'getcontenttype')[0];
                items.push({
                    path, name: path.split('/').pop(),
                    fileId: idEl ? idEl.textContent.trim() : '',
                    isFolder, mime: mimeEl ? mimeEl.textContent.trim() : '',
                    favorited: true, kind: 'fav',
                });
            }
            return items;
        }

        async function fetchDesktopFolder(folderPath) {
            const folderRel = folderPath.replace(/^\/+|\/+$/g, '');
            const body = '<?xml version="1.0"?>'
                + '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">'
                + '<d:prop><oc:fileid/><d:resourcetype/><d:getcontenttype/><oc:favorite/></d:prop>'
                + '</d:propfind>';
            const res = await fetch(davUrl(folderRel), {
                method: 'PROPFIND',
                headers: { 'Content-Type': 'application/xml', Depth: '1', requesttoken: OC.requestToken },
                body,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
            const items = [];
            for (const r of Array.from(doc.getElementsByTagNameNS('DAV:', 'response'))) {
                const hrefEl = r.getElementsByTagNameNS('DAV:', 'href')[0];
                if (!hrefEl) continue;
                let path = decodeURIComponent(new URL(hrefEl.textContent || '', window.location.origin).pathname);
                if (path.startsWith(basePath)) path = path.slice(basePath.length);
                path = path.replace(/\/$/, '');
                if (!path || path === folderRel) continue; // skip the folder itself
                const isFolder = r.getElementsByTagNameNS('DAV:', 'collection').length > 0;
                const idEl = r.getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')[0];
                const mimeEl = r.getElementsByTagNameNS('DAV:', 'getcontenttype')[0];
                const favEls = r.getElementsByTagNameNS('http://owncloud.org/ns', 'favorite');
                let favorited = false;
                for (const fe of Array.from(favEls)) { if ((fe.textContent || '').trim() === '1') { favorited = true; break; } }
                items.push({
                    path, name: path.split('/').pop(),
                    fileId: idEl ? idEl.textContent.trim() : '',
                    isFolder, mime: mimeEl ? mimeEl.textContent.trim() : '',
                    favorited,
                    kind: 'file',
                });
            }
            items.sort((a, b) => (b.isFolder - a.isFolder) || a.name.localeCompare(b.name));
            return items;
        }

        function openFolderInDefaultManager(dir, fallbackTitle, idPrefix) {
            if (root.dataset.desktopfilesEnabled === 'true') {
                const url = OC.generateUrl('/apps/desktop/files') + '?desktop=1&dir=' + encodeURIComponent(dir);
                const icon = (OC.imagePath && OC.imagePath('desktop', 'files.svg')) || '/apps/desktop/img/files.svg';
                openExternalWindow({ appId: `${idPrefix}-${Date.now()}`, title: t('Desktop Files'), subtitle: dir, href: url, icon });
            } else {
                const url = OC.generateUrl('/apps/files/') + '?dir=' + encodeURIComponent(dir);
                openExternalWindow({ appId: `${idPrefix}-${Date.now()}`, title: t('Files'), subtitle: dir, href: url, icon: '/core/img/logo/logo.svg' });
            }
        }

        function openFavorite(el) {
            if (el.dataset.special === 'trash') {
                // Deleted files always open in the Nextcloud file manager (trashbin view).
                const url = OC.generateUrl('/apps/files/trashbin');
                const icon = (OC.imagePath && OC.imagePath('core', 'actions/delete.svg')) || '/core/img/logo/logo.svg';
                openExternalWindow({ appId: `files-trash-${Date.now()}`, title: t('Recycling Bin'), subtitle: '/', href: url, icon });
                return;
            }
            if (el.dataset.special === 'home') {
                openFolderInDefaultManager('/', t('Home'), 'home-folder');
                return;
            }
            const path = el.dataset.path;
            const name = el.dataset.name || path.split('/').pop();
            if (el.dataset.folder !== 'true') {
                // Open a file exactly as Desktop Files would — its viewer — regardless of the
                // experimental file manager being enabled.
                const mime = el.dataset.mime || '';
                const fileId = el.dataset.fileId || '';
                const direct = mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf' || mime.startsWith('text/') || /\.(md|txt|csv|log|json|xml|yml|yaml)$/i.test(name);
                const absPath = '/' + path.replace(/^\/+/, ''); // viewer needs an absolute path, like Desktop Files passes
                const query = new URLSearchParams({ fileId, name, mime, filePath: absPath });
                const href = (direct && fileId)
                    ? `${OC.getRootPath ? OC.getRootPath() : ''}/index.php/apps/desktop/files/viewer?${query.toString()}`
                    : (fileId ? `${OC.getRootPath ? OC.getRootPath() : ''}/index.php/f/${encodeURIComponent(fileId)}` : '');
                if (!href) return;
                const mimeIcon = (OC.MimeType && OC.MimeType.getIconUrl) ? OC.MimeType.getIconUrl(mime || 'application/octet-stream') : '/core/img/logo/logo.svg';
                openExternalWindow({ appId: `file-fav-${fileId || Date.now()}-${Date.now()}`, title: name, subtitle: absPath, href, icon: mimeIcon });
                return;
            }
            openFolderInDefaultManager('/' + path.replace(/^\/+/, ''), name, `desktop-files-fav-${el.dataset.fileId}`);
        }

        function setNoConfirm(val) {
            noConfirm = val;
            const url = root.dataset.personalSaveUrl;
            if (!url) return;
            const body = new URLSearchParams();
            body.set('favorites_no_confirm', val ? 'yes' : 'no');
            body.set('requesttoken', OC.requestToken);
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body }).catch(() => {});
        }
        function setTrashNoConfirm(val) {
            trashNoConfirm = val;
            const url = root.dataset.personalSaveUrl;
            if (!url) return;
            const body = new URLSearchParams();
            body.set('trash_no_confirm', val ? 'yes' : 'no');
            body.set('requesttoken', OC.requestToken);
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', requesttoken: OC.requestToken }, body }).catch(() => {});
        }

        // --- file operations (desktop-folder items) ---
        function downloadItem(el) {
            const p = el.dataset.path;
            if (!p) return;
            const a = document.createElement('a');
            a.href = davUrl(p);
            a.download = el.dataset.name || '';
            document.body.appendChild(a); a.click(); a.remove();
        }
        async function renameItem(el) {
            const oldPath = el.dataset.path;
            if (!oldPath) return;
            const cur = el.dataset.name || oldPath.split('/').pop();
            const next = (window.prompt(t('New name'), cur) || '').trim();
            if (!next || next === cur) return;
            if (/[\\/]/.test(next)) { debugLog('rename_invalid', { next }); return; }
            const parent = oldPath.split('/').slice(0, -1).join('/');
            const dest = (parent ? parent + '/' : '') + next;
            try { await davMove(oldPath, dest); favoritesReload(); }
            catch (e) { debugLog('rename_failed', { message: e.message }); }
        }
        function cutCopy(items, mode) {
            const refs = items.filter((el) => el.dataset.kind === 'file' && el.dataset.path)
                .map((el) => ({ path: el.dataset.path, name: el.dataset.name || el.dataset.path.split('/').pop(), isFolder: el.dataset.folder === 'true' }));
            if (!refs.length) return;
            const sharedMode = mode === 'move' ? 'cut' : 'copy';
            clipboard = { mode: sharedMode, items: refs };
            writeSharedClipboard(sharedMode, refs);
            layer.querySelectorAll('.desktop-fav.is-cut').forEach((n) => n.classList.remove('is-cut'));
            if (sharedMode === 'cut') items.forEach((el) => el.classList.add('is-cut'));
        }
        async function pasteIntoDesktop() {
            const cb = readSharedClipboard();
            if (!cb || !cb.items.length || !desktopFolder) return;
            const targetDir = desktopFolder.replace(/^\/+|\/+$/g, '');
            for (const ref of cb.items) {
                if (cb.mode === 'cut' && (ref.path.split('/').slice(0, -1).join('/').replace(/^\/+/, '')) === targetDir) continue; // already here
                const dest = targetDir + '/' + ref.name;
                try { if (cb.mode === 'cut') await davMove(ref.path, dest); else await davCopy(ref.path, dest); } // eslint-disable-line no-await-in-loop
                catch (e) { debugLog('paste_failed', { message: e.message }); }
            }
            if (cb.mode === 'cut') { clearSharedClipboard(); clipboard = null; }
            favoritesReload();
        }
        async function toggleFavorites(items) {
            const targets = items.filter((el) => el.dataset.kind === 'file' && el.dataset.path);
            if (!targets.length) return;
            const on = !targets.some((el) => el.dataset.favorited === 'true');
            for (const el of targets) { try { await setFavorite(el.dataset.path, on); } catch (e) { debugLog('favorite_toggle_failed', { message: e.message }); } } // eslint-disable-line no-await-in-loop
            favoritesReload();
        }
        async function deleteToTrash(items) {
            const targets = items.filter((el) => el.dataset.kind === 'file' && el.dataset.path);
            for (const el of targets) {
                try {
                    await davDelete(el.dataset.path); // eslint-disable-line no-await-in-loop
                    occupied.delete(keyOf(Number(el.dataset.col), Number(el.dataset.row)));
                    delete positions[el.dataset.fileId];
                    deselectIcon(el);
                    icons = icons.filter((x) => x !== el);
                    el.remove();
                } catch (e) { debugLog('trash_failed', { message: e.message }); }
            }
            savePositions();
        }
        function confirmTrash(items) {
            const targets = items.filter((el) => el.dataset.kind === 'file' && el.dataset.path);
            if (!targets.length) return;
            if (trashNoConfirm) { deleteToTrash(targets); return; }
            const overlay = document.createElement('div');
            overlay.className = 'desktop-fav-dialog-overlay';
            const msg = targets.length === 1
                ? t('Move “{name}” to deleted files?', { name: targets[0].querySelector('.desktop-fav-label').textContent })
                : t('Move {count} items to deleted files?', { count: targets.length });
            overlay.innerHTML = `
                <div class="desktop-fav-dialog" role="dialog" aria-modal="true">
                    <p>${escapeHtml(msg)}</p>
                    <p class="settings-hint">${escapeHtml(t('Items are moved to the Recycling Bin and can be restored from there.'))}</p>
                    <label class="desktop-fav-dialog-dontask"><input type="checkbox" class="desktop-fav-dontask"> ${escapeHtml(t('Don’t ask again'))}</label>
                    <div class="desktop-fav-dialog-buttons">
                        <button type="button" class="desktop-fav-cancel">${escapeHtml(t('Cancel'))}</button>
                        <button type="button" class="primary desktop-fav-confirm">${escapeHtml(t('Move to deleted files'))}</button>
                    </div>
                </div>`;
            stage.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            overlay.querySelector('.desktop-fav-cancel').addEventListener('click', close);
            overlay.querySelector('.desktop-fav-confirm').addEventListener('click', () => {
                if (overlay.querySelector('.desktop-fav-dontask').checked) setTrashNoConfirm(true);
                close();
                deleteToTrash(targets);
            });
        }

        async function removeOne(el) {
            const path = el.dataset.path;
            if (!path) return;
            const body = '<?xml version="1.0"?>'
                + '<d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">'
                + '<d:set><d:prop><oc:favorite>0</oc:favorite></d:prop></d:set>'
                + '</d:propertyupdate>';
            try {
                const res = await fetch(davBase + path.split('/').map(encodeURIComponent).join('/'), {
                    method: 'PROPPATCH', headers: { 'Content-Type': 'application/xml', requesttoken: OC.requestToken }, body,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (e) {
                debugLog('favorite_remove_failed', { path, message: e.message });
            }
            occupied.delete(keyOf(Number(el.dataset.col), Number(el.dataset.row)));
            delete positions[el.dataset.fileId];
            deselectIcon(el);
            el.remove();
        }
        async function removeFavorites(list) {
            const targets = list.filter((el) => !el.dataset.special && el.dataset.path);
            for (const el of targets) await removeOne(el); // eslint-disable-line no-await-in-loop
            savePositions();
        }

        function confirmRemove(targets) {
            const favs = targets.filter((el) => !el.dataset.special && el.dataset.path);
            if (favs.length === 0) return;
            if (noConfirm) { removeFavorites(favs); return; }
            const overlay = document.createElement('div');
            overlay.className = 'desktop-fav-dialog-overlay';
            const msg = favs.length === 1
                ? t('Remove “{name}” from your favorites?', { name: favs[0].querySelector('.desktop-fav-label').textContent })
                : t('Remove {count} items from your favorites?', { count: favs.length });
            overlay.innerHTML = `
                <div class="desktop-fav-dialog" role="dialog" aria-modal="true">
                    <p>${escapeHtml(msg)}</p>
                    <label class="desktop-fav-dialog-dontask"><input type="checkbox" class="desktop-fav-dontask"> ${escapeHtml(t('Don’t ask again'))}</label>
                    <div class="desktop-fav-dialog-buttons">
                        <button type="button" class="desktop-fav-cancel">${escapeHtml(t('Cancel'))}</button>
                        <button type="button" class="primary desktop-fav-confirm">${escapeHtml(t('Remove from favorites'))}</button>
                    </div>
                </div>`;
            stage.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            overlay.querySelector('.desktop-fav-cancel').addEventListener('click', close);
            overlay.querySelector('.desktop-fav-confirm').addEventListener('click', () => {
                if (overlay.querySelector('.desktop-fav-dontask').checked) setNoConfirm(true);
                close();
                removeFavorites(favs);
            });
        }

        let favMenu = null;
        const closeFavMenu = () => { if (favMenu) { favMenu.remove(); favMenu = null; } };
        function buildMenu(entries, x, y) {
            closeFavMenu();
            favMenu = document.createElement('div');
            favMenu.className = 'desktop-fav-menu';
            favMenu.innerHTML = entries.map(([a, l]) => `<button type="button" data-act="${a}">${escapeHtml(l)}</button>`).join('');
            document.body.appendChild(favMenu);
            favMenu.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
            favMenu.style.top = `${Math.min(y, window.innerHeight - (entries.length * 38 + 16))}px`;
            return favMenu;
        }
        function openFavMenu(el, x, y) {
            const selected = Array.from(selection);
            const entries = [['open', t('Open')]];
            if (el.dataset.kind === 'file') {
                const files = selected.filter((i) => i.dataset.kind === 'file' && i.dataset.path);
                if (el.dataset.folder !== 'true') entries.push(['download', t('Download')]);
                if (files.length === 1) entries.push(['rename', t('Rename')]);
                if (dfEnabled) {
                    entries.push(['cut', t('Cut')]);
                    entries.push(['copy', t('Copy')]);
                    if (readSharedClipboard()) entries.push(['paste', t('Paste')]);
                }
                const anyFav = files.some((i) => i.dataset.favorited === 'true');
                entries.push(['fav', anyFav ? t('Remove from favorites') : t('Add to favorites')]);
                const delLabel = files.length > 1 ? t('Move {count} items to deleted files', { count: files.length }) : t('Move to deleted files');
                entries.push(['delete', delLabel]);
                buildMenu(entries, x, y).addEventListener('click', (ev) => {
                    const b = ev.target.closest('button'); if (!b) return;
                    const act = b.dataset.act; closeFavMenu();
                    if (act === 'open') openFavorite(el);
                    else if (act === 'download') downloadItem(el);
                    else if (act === 'rename') renameItem(el);
                    else if (act === 'cut') cutCopy(files, 'move');
                    else if (act === 'copy') cutCopy(files, 'copy');
                    else if (act === 'paste') pasteIntoDesktop();
                    else if (act === 'fav') toggleFavorites(files);
                    else if (act === 'delete') confirmTrash(files);
                });
                return;
            }
            if (el.dataset.kind === 'fav') {
                const favs = selected.filter((i) => i.dataset.kind === 'fav' && i.dataset.path);
                const removeLabel = favs.length > 1 ? t('Remove {count} from favorites', { count: favs.length }) : t('Remove from favorites');
                if (favs.length > 0) entries.push(['remove', removeLabel]);
                buildMenu(entries, x, y).addEventListener('click', (ev) => {
                    const b = ev.target.closest('button'); if (!b) return;
                    const act = b.dataset.act; closeFavMenu();
                    if (act === 'open') openFavorite(el);
                    else if (act === 'remove') confirmRemove(favs);
                });
                return;
            }
            // special (home/trash): open only
            buildMenu(entries, x, y).addEventListener('click', (ev) => {
                if (ev.target.closest('button')) { closeFavMenu(); openFavorite(el); }
            });
        }
        function openPasteMenu(x, y) {
            buildMenu([['paste', t('Paste')]], x, y).addEventListener('click', (ev) => {
                if (ev.target.closest('button')) { closeFavMenu(); pasteIntoDesktop(); }
            });
        }
        document.addEventListener('click', closeFavMenu);
        document.addEventListener('pointerdown', (e) => { if (favMenu && !favMenu.contains(e.target)) closeFavMenu(); });

        function snapItem(el) {
            const col = Math.max(0, Math.round((el.offsetLeft - PAD) / CELL_W));
            const row = Math.max(0, Math.round((el.offsetTop - PAD) / CELL_H));
            const free = nearestFreeCell(col, row, el.dataset.fileId);
            placeIcon(el, free.col, free.row);
            positions[el.dataset.fileId] = { col: free.col, row: free.row };
        }

        function trashElementAt(e) {
            const tb = layer.querySelector('.desktop-fav[data-special="trash"]');
            if (!tb || selection.has(tb)) return null;
            const r = tb.getBoundingClientRect();
            return (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) ? tb : null;
        }
        function broadcastFilesReload() {
            document.querySelectorAll('iframe.desktop-window-iframe').forEach((f) => {
                try { f.contentWindow && f.contentWindow.postMessage({ type: 'nextcloud-desktop:files-reload' }, window.location.origin); } catch (e) { /* ignore */ }
            });
        }
        function filesIframeAt(e) {
            // See through the dragged icons so elementFromPoint reports the window below them.
            const dragging = Array.from(layer.querySelectorAll('.desktop-fav.is-dragging'));
            dragging.forEach((d) => { d.style.pointerEvents = 'none'; });
            const elAt = document.elementFromPoint(e.clientX, e.clientY);
            dragging.forEach((d) => { d.style.pointerEvents = ''; });
            const iframe = elAt && elAt.closest && elAt.closest('iframe.desktop-window-iframe');
            return (iframe && /\/apps\/desktop\/files/.test(iframe.src || '')) ? iframe : null;
        }

        function wireIcon(el) {
            let st = null;
            el.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                if (e.ctrlKey || e.metaKey) { // toggle, no drag
                    if (selection.has(el)) deselectIcon(el); else selectIcon(el);
                    e.stopPropagation();
                    return;
                }
                if (!selection.has(el)) { clearSelection(); selectIcon(el); }
                el.setPointerCapture(e.pointerId);
                st = { x: e.clientX, y: e.clientY, moved: false, items: Array.from(selection).map((g) => ({ el: g, left: g.offsetLeft, top: g.offsetTop })) };
                e.stopPropagation();
            });
            el.addEventListener('pointermove', (e) => {
                if (!st) return;
                const dx = e.clientX - st.x, dy = e.clientY - st.y;
                if (!st.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
                st.moved = true;
                st.items.forEach((it) => { it.el.style.left = `${it.left + dx}px`; it.el.style.top = `${it.top + dy}px`; it.el.classList.add('is-dragging'); });
                const tEl = trashElementAt(e);
                const tb = layer.querySelector('.desktop-fav[data-special="trash"]');
                if (tb) tb.classList.toggle('is-drop-target', !!tEl && st.items.some((it) => it.el.dataset.kind === 'file'));
            });
            el.addEventListener('pointerup', (e) => {
                if (!st) return;
                el.releasePointerCapture(e.pointerId);
                const overTrash = st.moved && trashElementAt(e);
                const tb = layer.querySelector('.desktop-fav[data-special="trash"]');
                if (tb) tb.classList.remove('is-drop-target');
                const filesFrame = (!overTrash && st.moved && dfEnabled) ? filesIframeAt(e) : null;
                if (overTrash) {
                    // Dropped on the Recycling Bin: restore positions, then delete to trash.
                    const files = st.items.map((it) => it.el).filter((g) => g.dataset.kind === 'file' && g.dataset.path);
                    st.items.forEach((it) => it.el.classList.remove('is-dragging'));
                    layout();
                    if (files.length) confirmTrash(files);
                } else if (filesFrame) {
                    // Dropped on a Desktop Files window: hand the paths to it to move into its folder.
                    const files = st.items.map((it) => it.el).filter((g) => g.dataset.kind === 'file' && g.dataset.path);
                    st.items.forEach((it) => it.el.classList.remove('is-dragging'));
                    layout();
                    if (files.length) {
                        try { filesFrame.contentWindow.postMessage({ type: 'nextcloud-desktop:files-drop', paths: files.map((g) => g.dataset.path) }, window.location.origin); } catch (err) { debugLog('cross_drop_out_failed', { message: err.message }); }
                    }
                } else if (st.moved) {
                    st.items.forEach((it) => { occupied.delete(keyOf(Number(it.el.dataset.col), Number(it.el.dataset.row))); it.el.classList.remove('is-dragging'); });
                    st.items.forEach((it) => snapItem(it.el));
                    savePositions();
                } else {
                    clearSelection(); selectIcon(el);
                }
                st = null;
            });
            el.addEventListener('dblclick', () => openFavorite(el));
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!selection.has(el)) { clearSelection(); selectIcon(el); }
                openFavMenu(el, e.clientX, e.clientY);
            });
        }

        async function createDesktopFolderItem() {
            if (!desktopFolder) return;
            const raw = (window.prompt(t('New folder name'), t('New folder')) || '').trim();
            if (!raw || /[\\/]/.test(raw)) return;
            const dir = desktopFolder.replace(/^\/+|\/+$/g, '');
            try {
                const res = await fetch(davUrl(dir + '/' + raw), { method: 'MKCOL', headers: { requesttoken: OC.requestToken } });
                if (!res.ok && res.status !== 405) throw new Error(`HTTP ${res.status}`); // 405 = already exists
                favoritesReload();
            } catch (e) { debugLog('create_folder_failed', { message: e.message }); }
        }

        stage.addEventListener('contextmenu', (e) => {
            if (e.target !== stage && e.target !== layer) return;
            e.preventDefault();
            const entries = [];
            if (desktopFolder) entries.push(['newfolder', t('New folder')]);
            if (dfEnabled && desktopFolder && readSharedClipboard()) entries.push(['paste', t('Paste')]);
            entries.push(['settings', t('Desktop Settings')]);
            if (isAdminUser()) entries.push(['adminsettings', t('Desktop Admin Settings')]);
            buildMenu(entries, e.clientX, e.clientY).addEventListener('click', (ev) => {
                const b = ev.target.closest('button'); if (!b) return;
                const act = b.dataset.act; closeFavMenu();
                if (act === 'newfolder') createDesktopFolderItem();
                else if (act === 'paste') pasteIntoDesktop();
                else if (act === 'settings') openDesktopSettings();
                else if (act === 'adminsettings') openDesktopAdminSettings();
            });
        });

        // Drops onto the desktop: files from the computer are uploaded into the desktop folder
        // (with a progress bar); paths dragged from a Desktop Files window are moved into it.
        function putWithProgress(url, file, onProgress) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', url, true);
                xhr.setRequestHeader('requesttoken', OC.requestToken);
                if (file.type) xhr.setRequestHeader('Content-Type', file.type);
                xhr.upload.onprogress = (ev) => { if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100)); };
                xhr.onload = () => { (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`)); };
                xhr.onerror = () => reject(new Error('network error'));
                xhr.send(file);
            });
        }
        function makeUploadOverlay() {
            const el = document.createElement('div');
            el.className = 'desktop-upload-overlay';
            el.innerHTML = '<div class="desktop-upload-card"><div class="desktop-upload-text"></div><div class="desktop-upload-bar"><div class="desktop-upload-fill"></div></div></div>';
            stage.appendChild(el);
            const text = el.querySelector('.desktop-upload-text');
            const fill = el.querySelector('.desktop-upload-fill');
            return {
                update(idx, total, name, pct) { text.textContent = t('Uploading {index}/{total}: {name} ({pct}%)', { index: idx, total, name, pct }); fill.style.width = `${pct}%`; },
                remove() { el.remove(); },
            };
        }
        async function uploadFilesToDesktop(fileList) {
            const files = Array.from(fileList || []);
            if (!files.length || !desktopFolder) return;
            const targetDir = desktopFolder.replace(/^\/+|\/+$/g, '');
            const overlay = makeUploadOverlay();
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try { await putWithProgress(davUrl(`${targetDir}/${file.name}`), file, (pct) => overlay.update(i + 1, files.length, file.name, pct)); } // eslint-disable-line no-await-in-loop
                catch (e) { debugLog('upload_failed', { name: file.name, message: e.message }); }
            }
            overlay.remove();
            favoritesReload();
            broadcastFilesReload();
        }
        if (desktopFolder) {
            const targetDir = desktopFolder.replace(/^\/+|\/+$/g, '');
            stage.addEventListener('dragover', (e) => {
                if (!e.dataTransfer) return;
                e.preventDefault();
                const isFiles = Array.from(e.dataTransfer.types || []).includes('Files');
                e.dataTransfer.dropEffect = isFiles ? 'copy' : 'move';
                layer.classList.add('desktop-drop-active');
            });
            stage.addEventListener('dragleave', (e) => { if (e.target === stage) layer.classList.remove('desktop-drop-active'); });
            stage.addEventListener('drop', async (e) => {
                layer.classList.remove('desktop-drop-active');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                    e.preventDefault();
                    uploadFilesToDesktop(e.dataTransfer.files);
                    return;
                }
                if (!dfEnabled) return; // cross-window moves only when the file manager is enabled
                const raw = (e.dataTransfer && e.dataTransfer.getData('text/plain') || '').trim();
                if (!raw) return;
                e.preventDefault();
                const paths = raw.split('\n').map((s) => s.trim()).filter(Boolean);
                for (const p of paths) {
                    const name = p.split('/').pop();
                    const parent = p.split('/').slice(0, -1).join('/').replace(/^\/+/, '');
                    if (parent === targetDir) continue; // already in the desktop folder
                    try { await davMove(p, `${targetDir}/${name}`); } // eslint-disable-line no-await-in-loop
                    catch (err) { debugLog('cross_drop_in_failed', { message: err.message }); }
                }
                favoritesReload();
                broadcastFilesReload();
            });
        }

        // --- rubber-band selection on empty desktop ---
        let band = null;
        stage.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target !== stage) return; // only empty desktop
            const rect = stage.getBoundingClientRect();
            band = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, el: null, additive: e.ctrlKey || e.metaKey, moved: false };
            if (!band.additive) clearSelection();
            stage.setPointerCapture(e.pointerId);
        });
        stage.addEventListener('pointermove', (e) => {
            if (!band) return;
            const rect = stage.getBoundingClientRect();
            const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
            if (!band.moved && Math.abs(x1 - band.x0) < 3 && Math.abs(y1 - band.y0) < 3) return;
            band.moved = true;
            if (!band.el) { band.el = document.createElement('div'); band.el.className = 'desktop-band'; layer.appendChild(band.el); }
            const left = Math.min(band.x0, x1), top = Math.min(band.y0, y1), w = Math.abs(x1 - band.x0), h = Math.abs(y1 - band.y0);
            Object.assign(band.el.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
            layer.querySelectorAll('.desktop-fav').forEach((icon) => {
                const il = icon.offsetLeft, it = icon.offsetTop, ir = il + icon.offsetWidth, ib = it + icon.offsetHeight;
                const hit = !(ir < left || il > left + w || ib < top || it > top + h);
                if (hit) selectIcon(icon);
                else if (!band.additive) deselectIcon(icon);
            });
        });
        stage.addEventListener('pointerup', (e) => {
            if (!band) return;
            try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (band.el) band.el.remove();
            if (!band.moved && !band.additive) clearSelection();
            band = null;
        });

        let icons = []; // current icon elements, in placement-priority order

        // Lay out every icon: each prefers its saved cell; icons whose saved cell no longer
        // fits (e.g. below the taskbar after the window shrank) are relocated to a free cell
        // WITHOUT changing their saved position, so they return once there is room again.
        function layout() {
            icons = icons.filter((el) => el.isConnected);
            occupied.clear();
            const rows = rowsAvail();
            const overflow = [];
            icons.forEach((el) => {
                const saved = positions[el.dataset.fileId];
                if (saved && saved.col >= 0 && saved.row >= 0 && saved.row < rows && isFree(saved.col, saved.row)) {
                    placeIcon(el, saved.col, saved.row);
                } else {
                    overflow.push(el);
                }
            });
            overflow.forEach((el) => { const f = nextFreeCell(); placeIcon(el, f.col, f.row); });
        }
        let layoutTimer = null;
        const relayout = () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 120); };
        window.addEventListener('resize', relayout);
        document.addEventListener('fullscreenchange', relayout);

        async function renderAll() {
            layer.querySelectorAll('.desktop-fav').forEach((n) => n.remove());
            occupied.clear();
            clearSelection();
            icons = [];
            const add = (item) => { const el = makeIcon(item); layer.appendChild(el); wireIcon(el); icons.push(el); };
            if (root.dataset.showHome === 'true') add(homeItem()); // Home takes the first cell
            if (desktopFolder) {
                // Show the chosen desktop folder's contents AND favorites together.
                // Favorites that already appear as folder contents are not added twice.
                let folderItems = [];
                try { folderItems = await fetchDesktopFolder(desktopFolder); }
                catch (e) { debugLog('desktop_folder_load_failed', { message: e.message }); }
                folderItems.forEach(add);
                if (showFav) {
                    try {
                        const seen = new Set(folderItems.map((it) => it.fileId || it.path));
                        (await fetchFavorites())
                            .filter((it) => !seen.has(it.fileId || it.path))
                            .forEach(add);
                    } catch (e) { debugLog('favorites_load_failed', { message: e.message }); }
                }
            } else if (showFav) {
                try { (await fetchFavorites()).forEach(add); }
                catch (e) { debugLog('favorites_load_failed', { message: e.message }); }
            }
            if (root.dataset.showTrash === 'true') add(trashItem()); // right after the favorites
            layout();
            debugLog('desktop_icons_loaded', { count: icons.length });
        }
        favoritesReload = renderAll;
        applyIconSettings = (s) => {
            if ('showFavorites' in s) { showFav = !!s.showFavorites; root.dataset.showFavorites = showFav ? 'true' : 'false'; }
            if ('desktopFolder' in s) { desktopFolder = (s.desktopFolder || '').trim(); root.dataset.desktopFolder = desktopFolder; }
            if ('desktopfilesEnabled' in s) { dfEnabled = !!s.desktopfilesEnabled; }
            if ('showTrash' in s) root.dataset.showTrash = s.showTrash ? 'true' : 'false';
            if ('showHome' in s) root.dataset.showHome = s.showHome ? 'true' : 'false';
            if ('trashNoConfirm' in s) trashNoConfirm = !!s.trashNoConfirm;
            if ('favoritesNoConfirm' in s) noConfirm = !!s.favoritesNoConfirm;
            layer.hidden = false;
            renderAll();
        };
        renderAll();
    }
})();
