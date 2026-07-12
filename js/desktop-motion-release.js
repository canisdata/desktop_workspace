(() => {
    'use strict';
    const t = (text, vars = {}) => window.OC?.L10N?.translate ? OC.L10N.translate('desktop_workspace', text, vars) : text.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? '');
    const dt = (text, vars = {}) => dynamicLabels[text] || t(text, vars);

    const root = document.querySelector('[data-desktop-app-root]');
    if (!root) return;

    const stage = document.getElementById('desktop-stage');
    const startButton = document.getElementById('desktop-start');
    const startMenu = document.getElementById('desktop-start-menu');
    const launcher = document.getElementById('desktop-launcher');
    const taskList = document.getElementById('desktop-task-list');
    const search = document.getElementById('desktop-unified-search');
    const pinnedApps = document.getElementById('desktop-pinned-apps');
    const clock = document.getElementById('desktop-clock');
    const headerEndSlot = document.getElementById('desktop-header-end-slot');
    const desktopLogo = document.getElementById('desktop-nextcloud-logo');

    const windows = new Map();
    let zIndex = 20;
    let launcherApps = [];
    let dynamicLabels = {};
    let dynamicDataReloadTimer = null;
    let dynamicDataReloading = false;
    let headerMenuPositionObserver = null;
    let favoritesReload = null;
    let refreshDesktopPinnedApps = null;
    let applyIconSettings = null;
    let liveThemingApplied = false;

    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));


    function pruneHeaderEnd() {
        const headerEnd = headerEndSlot && headerEndSlot.querySelector('.header-end');
        if (!headerEnd) return;
        // The Contacts app is available on its own, so drop the header contacts menu.
        headerEnd.querySelectorAll('#contactsmenu, .contactsmenu, [id*="contactsmenu"]').forEach((el) => el.remove());
        // Keep unified search alive in the moved header-end; the Apps menu search trigger clicks it.
        // Reload-desktop button was removed for now.
        headerEnd.querySelectorAll('#desktop-reload-button').forEach((el) => el.remove());
    }

    function moveHeaderEndToTaskbar() {
        if (!headerEndSlot || headerEndSlot.dataset.moved === 'true') return;
        const headerEnd = document.querySelector('#header .header-end');
        if (!headerEnd) {

            return;
        }
        headerEndSlot.replaceChildren(headerEnd);
        headerEndSlot.dataset.moved = 'true';
        pruneHeaderEnd();

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
        bindNativeAccountMenuControls();
        requestAnimationFrame(() => { positionHeaderEndMenus(); bindNativeAccountMenuControls(); });
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

    }

    const THEME_VARIABLES = [
        '--color-main-background', '--color-main-background-rgb', '--color-main-text', '--color-primary', '--color-primary-text',
        '--color-primary-light', '--color-border', '--color-background-hover', '--color-background-darker', '--color-text-maxcontrast',
        '--color-primary-element', '--color-primary-element-text', '--color-primary-element-light', '--color-primary-element-light-text'
    ];

    function syncDesktopTheme(sourceDocument = document) {
        const source = sourceDocument.body || sourceDocument.documentElement;
        if (!source) return;
        const computed = sourceDocument.defaultView.getComputedStyle(source);
        for (const variable of THEME_VARIABLES) {
            const value = computed.getPropertyValue(variable).trim();
            if (value) root.style.setProperty(variable, value);
        }
        root.dataset.theme = sourceDocument.documentElement.dataset.theme || sourceDocument.body?.dataset.theme || '';
    }

    function applyUserBackground(sourceDocument = document) {
        const candidates = [sourceDocument.body, sourceDocument.documentElement, sourceDocument.querySelector('#body-user')].filter(Boolean);
        for (const element of candidates) {
            const style = sourceDocument.defaultView.getComputedStyle(element);
            for (const key of ['--image-background', '--image-background-default']) {
                const value = style.getPropertyValue(key).trim();
                if (value && value !== 'none') {
                    root.style.setProperty('--desktop-background-image', value);

                    return;
                }
            }
            if (style.backgroundImage && style.backgroundImage !== 'none') {
                root.style.setProperty('--desktop-background-image', style.backgroundImage);

                return;
            }
        }

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

    function applyIconTextContrast(sourceDocument = document) {
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
        const lum = parseLum(sourceDocument.defaultView.getComputedStyle(sourceDocument.body).getPropertyValue('--color-main-text'));
        // dark text (low luminance) => light theme
        root.classList.toggle('desktop-theme-light', lum !== null && lum < 0.5);
    }

    function syncAppearance(sourceDocument = document) {
        syncDesktopTheme(sourceDocument);
        applyUserBackground(sourceDocument);
        applyLogoContrast();
        applyIconTextContrast(sourceDocument);
    }

    function observeAppearanceChanges() {
        const syncNativeAppearance = () => { if (!liveThemingApplied) syncAppearance(); };
        const observer = new MutationObserver(syncNativeAppearance);
        for (const element of [document.documentElement, document.body, document.querySelector('#body-user')].filter(Boolean)) {
            observer.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
        }
        window.addEventListener('storage', (event) => {
            if (!liveThemingApplied && (String(event.key || '').toLowerCase().includes('background') || String(event.key || '').toLowerCase().includes('theme'))) syncAppearance();
        });
        setInterval(syncNativeAppearance, 5000);
    }

    const themingIframeMonitors = new WeakMap();
    const desktopLanguage = window.OC?.getLanguage?.() || document.documentElement.lang || navigator.language || '';
    const desktopLocale = window.OC?.getLocale?.() || document.documentElement.dataset.locale || desktopLanguage;

    function isThemingSettingsUrl(href = '') {
        try {
            const url = new URL(href, window.location.origin);
            return url.origin === window.location.origin && /\/settings\/user\/theming\/?$/.test(url.pathname);
        } catch (e) { return false; }
    }

    function iframeHref(iframe) {
        try { return iframe.contentWindow?.location?.href || iframe.src || ''; }
        catch (e) { return iframe.src || ''; }
    }

    function syncAppearanceFromThemingIframe(iframe) {
        try {
            const doc = iframe.contentDocument;
            if (!doc || !isThemingSettingsUrl(iframeHref(iframe))) return;
            liveThemingApplied = true;
            syncAppearance(doc);

        } catch (error) {

        }
    }

    function monitorThemingIframe(iframe) {
        if (!iframe || !isThemingSettingsUrl(iframeHref(iframe)) || themingIframeMonitors.has(iframe)) return;
        let observer = null;
        const sync = () => syncAppearanceFromThemingIframe(iframe);
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;
            observer = new MutationObserver(sync);
            for (const element of [doc.documentElement, doc.body, doc.querySelector('#body-user')].filter(Boolean)) {
                observer.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
            }
        } catch (error) {

        }
        const timer = window.setInterval(sync, 500);
        themingIframeMonitors.set(iframe, { observer, timer });
        sync();

    }

    function stopThemingIframeMonitor(iframe) {
        const monitor = themingIframeMonitors.get(iframe);
        if (!monitor) return;
        monitor.observer?.disconnect();
        window.clearInterval(monitor.timer);
        themingIframeMonitors.delete(iframe);

    }

    function refreshThemingIframeMonitor(iframe) {
        if (isThemingSettingsUrl(iframeHref(iframe))) monitorThemingIframe(iframe);
        else stopThemingIframeMonitor(iframe);
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
            windows: Array.from(windows.values()).map(({ app, window: win }) => {
                const nativeFilesWindow = /\/apps\/files(\/|$)/.test(String(app.href || '')) || app.id === 'files';
                const folderMode = nativeFilesWindow && win.dataset.nativeFilesFileOpen !== 'true';
                const savedApp = folderMode ? {
                    ...app,
                    icon: win.dataset.nativeFilesBaseIcon || app.icon || '',
                    name: win.querySelector('[data-window-title]')?.textContent || app.name || 'Files',
                } : app;
                return {
                    appId: savedApp.id,
                    sourceAppId: savedApp.sourceAppId || savedApp.id,
                    name: savedApp.name || '',
                    icon: savedApp.icon || '',
                    href: savedApp.href || '',
                    desktopMode: savedApp.desktopMode || '',
                    fileApp: !!savedApp.fileApp,
                    multiInstance: !!savedApp.multiInstance,
                    appWindow: registered.has(savedApp.sourceAppId || savedApp.id),
                    checkPath: targetPathFromHref(savedApp.href || ''),
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
                };
            }),
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
                target: Boolean(entry.target),
                multiInstance: Boolean(entry.multiInstance),
            }));
        } catch (error) {

        }
        const seen = new Set();
        const filtered = apps.filter((app) => {
            const key = `${app.name}:${app.href}`;
            if (!app.name || !app.href || app.href.includes('/apps/desktop_workspace') || seen.has(key)) return false;
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
            name: dt('Desktop Files'),
            href: `${window.location.origin}/index.php/apps/desktop_workspace/files?desktop=1`,
            icon: files?.icon || (window.OC && OC.imagePath && OC.imagePath('desktop_workspace','files.svg')) || '/apps/desktop_workspace/img/files.svg',
            desktopMode: 'iframe',
            fileApp: true,
            multiInstance: true,
        }, ...withoutFiles];
    }

    function appById(apps, id) {
        return apps.find((app) => app.id === id) || null;
    }

    function applyDecoration(value) {
        root.dataset.decoration = value === 'redmond' ? 'redmond' : 'standard';
    }

    function applyDynamicAppData(data = {}) {
        const previousApps = getApps();
        if (typeof data.decoration === 'string') applyDecoration(data.decoration);
        if (data.labels && typeof data.labels === 'object') dynamicLabels = data.labels;
        if (Array.isArray(data.apps)) root.dataset.apps = JSON.stringify(data.apps);
        const nextApps = getApps();
        launcherApps = nextApps;
        renderLauncher();
        renderPinnedApps();
        renderPinnedDesktopApps();
        hideHeaderApps(nextApps);
        if (startButton) startButton.textContent = dt('Apps');
        search?.querySelector('span:last-child')?.replaceChildren(dt('Search'));
        if (settingsButton) {
            settingsButton.title = dt('Desktop Settings');
            settingsButton.setAttribute('aria-label', dt('Desktop Settings'));
        }
        windows.forEach((entry) => {
            if (entry.app.id === 'desktop-settings' || /\/settings\/user\//.test(entry.app.href || '')) {
                const currentTitle = entry.window.querySelector('[data-window-title]')?.textContent || entry.app.name;
                const settingsTitle = dt('Desktop Settings');
                if (currentTitle === entry.app.name || currentTitle === t('Desktop Settings') || currentTitle === 'Desktop Settings') {
                    entry.app.name = settingsTitle;
                    entry.window.querySelector('[data-window-title]').textContent = settingsTitle;
                    entry.task.querySelector('[data-task-title]').textContent = settingsTitle;
                    entry.task.title = settingsTitle;
                    entry.task.setAttribute('aria-label', settingsTitle);
                }
                return;
            }
            const next = appById(nextApps, entry.app.id);
            const previous = appById(previousApps, entry.app.id);
            if (!next) return;
            const currentTitle = entry.window.querySelector('[data-window-title]')?.textContent || entry.app.name;
            const titleWasAppName = currentTitle === entry.app.name || currentTitle === previous?.name;
            entry.app = { ...entry.app, ...next };
            if (titleWasAppName && next.name && next.name !== currentTitle) setWindowMeta(entry.app.id, { title: next.name, icon: next.icon || entry.app.icon });
        });

    }

    async function reloadDynamicAppData() {
        const url = root.dataset.dynamicDataUrl;
        if (!url || dynamicDataReloading) return;
        dynamicDataReloading = true;
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            applyDynamicAppData(await response.json());
        } catch (error) {

        } finally {
            dynamicDataReloading = false;
        }
    }

    function scheduleDynamicAppDataReload(delay = 250) {
        window.clearTimeout(dynamicDataReloadTimer);
        dynamicDataReloadTimer = window.setTimeout(reloadDynamicAppData, delay);
    }

    const APP_PIN_KEY = 'desktop_workspace:app-pins:v1';
    function appKey(app) { return String(app?.id || app?.href || app?.name || '').replace(/[^a-z0-9_-]/gi, '_'); }
    function readAppPins() {
        try { const parsed = JSON.parse(localStorage.getItem(APP_PIN_KEY) || '{}'); return { taskbar: [], desktop: [], ...parsed }; } catch (e) { return { taskbar: [], desktop: [] }; }
    }
    function writeAppPins(pins) { try { localStorage.setItem(APP_PIN_KEY, JSON.stringify(pins)); } catch (e) { /* ignore */ } }
    function isAppPinned(app, where) { return readAppPins()[where]?.includes(appKey(app)); }
    function setAppPinned(app, where, pinned) {
        const pins = readAppPins();
        const key = appKey(app);
        pins[where] = (pins[where] || []).filter((id) => id !== key);
        if (pinned) pins[where].push(key);
        writeAppPins(pins);
        renderPinnedApps();
        if (where === 'desktop' && typeof favoritesReload === 'function') favoritesReload();
    }
    function launchApp(app) {
        if (app.target) {
            closeStartMenu();
            window.open(app.href, '_blank', 'noopener,noreferrer');

            return;
        }
        const isFileApp = app.fileApp === true || app.id === 'files' || (app.href && app.href.includes('/apps/files'));
        const allowMulti = isFileApp || app.multiInstance === true;
        closeStartMenu();
        openWindow(allowMulti ? { ...app, multiInstance: true } : app);
    }
    function createAppSymbol(app, extraClass = '', location = 'menu') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `desktop-app-symbol ${extraClass}`.trim();
        button.dataset.appKey = appKey(app);
        button.dataset.pinLocation = location;
        button.title = app.name;
        button.setAttribute('aria-label', app.name);
        if (location === 'menu' && app.target) {
            button.dataset.externalNewTabTooltip = t('Opens in new tab');
        }
        button.innerHTML = `<span class="desktop-app-menu-icon">${app.icon ? `<img alt="" draggable="false" src="${escapeHtml(app.icon)}">` : escapeHtml(app.name.slice(0, 1))}</span><span class="desktop-app-menu-label">${escapeHtml(app.name)}</span>`;
        button.addEventListener('click', () => launchApp(app));
        button.addEventListener('contextmenu', (event) => openAppContextMenu(app, event, location));
        return button;
    }
    function createAppButton(app) {
        return createAppSymbol(app, 'desktop-app-tile', 'menu');
    }

    function appFromKey(key) { return launcherApps.find((app) => appKey(app) === key); }
    function ensureAppContextMenu() {
        let menu = document.getElementById('desktop-app-context-menu');
        if (menu) return menu;
        menu = document.createElement('div');
        menu.id = 'desktop-app-context-menu';
        menu.className = 'desktop-task-context-menu desktop-app-context-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        menu.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const app = appFromKey(menu.dataset.appKey);
            if (!app) return closeAppContextMenu();
            if (button.dataset.action === 'taskbar-add') setAppPinned(app, 'taskbar', true);
            if (button.dataset.action === 'taskbar-remove') setAppPinned(app, 'taskbar', false);
            if (button.dataset.action === 'desktop-add') setAppPinned(app, 'desktop', true);
            if (button.dataset.action === 'desktop-remove') setAppPinned(app, 'desktop', false);
            closeAppContextMenu();
        });
        document.body.appendChild(menu);
        return menu;
    }
    function closeAppContextMenu() { const menu = document.getElementById('desktop-app-context-menu'); if (menu) menu.hidden = true; }
    function openAppContextMenu(app, event, location = 'menu') {
        event.preventDefault();
        event.stopPropagation();
        const menu = ensureAppContextMenu();
        menu.dataset.appKey = appKey(app);
        const taskbarPinned = isAppPinned(app, 'taskbar');
        const desktopPinned = isAppPinned(app, 'desktop');
        if (location === 'taskbar') {
            menu.innerHTML = `<button type="button" role="menuitem" data-action="taskbar-remove">${escapeHtml(t('Remove from taskbar'))}</button>`;
        } else if (location === 'desktop') {
            menu.innerHTML = `<button type="button" role="menuitem" data-action="desktop-remove">${escapeHtml(t('Remove from desktop'))}</button>`;
        } else {
            menu.innerHTML = `
                <button type="button" role="menuitem" data-action="${taskbarPinned ? 'taskbar-remove' : 'taskbar-add'}">${escapeHtml(taskbarPinned ? t('Remove from taskbar') : t('Add to taskbar'))}</button>
                <button type="button" role="menuitem" data-action="${desktopPinned ? 'desktop-remove' : 'desktop-add'}">${escapeHtml(desktopPinned ? t('Remove from desktop') : t('Add to desktop'))}</button>`;
        }
        menu.hidden = false;
        const width = menu.offsetWidth || 220;
        const height = menu.offsetHeight || 90;
        menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))}px`;
        menu.querySelector('button')?.blur();
    }
    function renderPinnedApps() {
        if (!pinnedApps) return;
        const pins = readAppPins().taskbar || [];
        const nodes = pins.map(appFromKey).filter(Boolean).map((app) => {
            const node = createAppSymbol(app, 'desktop-pinned-app', 'taskbar');
            node.draggable = true;
            node.addEventListener('dragstart', (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/x-desktop-app-key', appKey(app));
                node.classList.add('is-dragging');
            });
            node.addEventListener('dragend', () => node.classList.remove('is-dragging'));
            return node;
        });
        pinnedApps.replaceChildren(...nodes);
    }
    function reorderPinnedApps(dragKey, beforeKey = '') {
        const pins = readAppPins();
        const list = (pins.taskbar || []).filter((key) => key !== dragKey);
        const beforeIndex = beforeKey ? list.indexOf(beforeKey) : -1;
        if (beforeIndex >= 0) list.splice(beforeIndex, 0, dragKey);
        else list.push(dragKey);
        pins.taskbar = list;
        writeAppPins(pins);
        renderPinnedApps();
    }
    function initPinnedAppReordering() {
        if (!pinnedApps || pinnedApps.dataset.reorderBound === 'true') return;
        pinnedApps.dataset.reorderBound = 'true';
        pinnedApps.addEventListener('dragover', (event) => {
            if (!Array.from(event.dataTransfer.types || []).includes('text/x-desktop-app-key')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        });
        pinnedApps.addEventListener('drop', (event) => {
            const dragKey = event.dataTransfer.getData('text/x-desktop-app-key');
            if (!dragKey) return;
            event.preventDefault();
            const target = event.target.closest('.desktop-pinned-app');
            const beforeKey = target && target.dataset.appKey !== dragKey ? target.dataset.appKey : '';
            reorderPinnedApps(dragKey, beforeKey);
        });
    }
    function renderPinnedDesktopApps() { if (typeof refreshDesktopPinnedApps === 'function') refreshDesktopPinnedApps(); }
    function openUnifiedSearchOverlay() {
        closeStartMenu();
        const selectors = [
            '.unified-search-input__button', '.unified-search-menu button',
            '#unified-search button', '[id*="unified-search"] button', '[class*="unified-search"] button',
            'button[aria-label*="Search"]', 'button[title*="Search"]'
        ];
        const trigger = selectors.map((sel) => document.querySelector(sel)).find((el) => el && !search?.contains(el));
        if (trigger) { trigger.click(); setTimeout(positionHeaderEndMenus, 0);  return; }

    }
    function renderLauncher() {
        const apps = getApps();
        launcher.replaceChildren(...apps.map(createAppButton));
        if (!apps.length) launcher.innerHTML = '<p class="desktop-empty">No apps found.</p>';
        alignAppsMenuIcons();
        return apps;
    }

    const APPS_MENU_SIZE_KEY = 'desktop_workspace:apps-menu-size:v1';
    function readAppsMenuSize() {
        try { return JSON.parse(localStorage.getItem(APPS_MENU_SIZE_KEY) || 'null') || {}; } catch (e) { return {}; }
    }
    function writeAppsMenuSize(size) {
        try { localStorage.setItem(APPS_MENU_SIZE_KEY, JSON.stringify(size)); } catch (e) { /* ignore */ }
    }
    function appsMenuMetrics(width = startMenu?.clientWidth || 320) {
        const appCount = Math.max(1, launcherApps.length || getApps().length || launcher?.children?.length || 1);
        const minRows = 3;
        const minColumns = 4;
        const tileWidth = 69;
        const tileHeight = 76;
        const columnGap = 8;
        const rowGap = 8;
        const launcherPadding = 16;
        const minWidth = launcherPadding * 2 + minColumns * tileWidth + (minColumns - 1) * columnGap + 12;
        const columnPitch = tileWidth + columnGap;
        const availableColumns = Math.floor((Math.max(tileWidth, width) - launcherPadding * 2 + columnGap) / columnPitch);
        const columns = Math.max(minColumns, availableColumns);
        const rows = Math.max(minRows, Math.ceil(appCount / columns));
        const headerHeight = startMenu?.querySelector('.desktop-start-header')?.offsetHeight || 58;
        const minHeight = headerHeight + launcherPadding * 2 + rows * tileHeight + Math.max(0, rows - 1) * rowGap + 12;
        return { appCount, minRows, minColumns, minWidth, columns, rows, minHeight, tileWidth };
    }
    function clampAppsMenuSize(width, height) {
        const metricsAtMinimum = appsMenuMetrics();
        const maxWidth = Math.max(metricsAtMinimum.minWidth, window.innerWidth - 28);
        const maxHeight = Math.max(260, window.innerHeight - 80);
        const widthBase = Math.min(Math.max(Math.round(width || 320), metricsAtMinimum.minWidth), maxWidth);
        const metrics = appsMenuMetrics(widthBase);
        return {
            width: widthBase,
            height: Math.min(Math.max(Math.round(height || metrics.minHeight), metrics.minHeight), maxHeight),
        };
    }
    function applyAppsMenuSize() {
        if (!startMenu) return;
        const size = clampAppsMenuSize(readAppsMenuSize().width, readAppsMenuSize().height);
        startMenu.style.width = `${size.width}px`;
        startMenu.style.height = `${size.height}px`;
        alignAppsMenuIcons();
    }
    function alignAppsMenuIcons() {
        if (!launcher || !startMenu) return;
        const metrics = appsMenuMetrics(startMenu.clientWidth || 320);
        launcher.style.gridTemplateColumns = `repeat(${metrics.columns}, 69px)`;
    }
    function ensureAppsMenuResizeHandles() {
        if (!startMenu || startMenu.dataset.resizeHandles === 'true') return;
        ['n', 'e', 'ne'].forEach((dir) => {
            const handle = document.createElement('div');
            handle.className = `desktop-start-resize desktop-start-resize-${dir}`;
            handle.dataset.dir = dir;
            startMenu.appendChild(handle);
            handle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handle.setPointerCapture(event.pointerId);
                const start = { x: event.clientX, y: event.clientY, width: startMenu.offsetWidth, height: startMenu.offsetHeight };
                const move = (moveEvent) => {
                    const dx = moveEvent.clientX - start.x;
                    const dy = moveEvent.clientY - start.y;
                    const rawWidth = dir.includes('e') ? start.width + dx : start.width;
                    const rawHeight = dir.includes('n') ? start.height - dy : start.height;
                    const size = clampAppsMenuSize(rawWidth, rawHeight);
                    startMenu.style.width = `${size.width}px`;
                    startMenu.style.height = `${size.height}px`;
                    alignAppsMenuIcons();
                };
                const up = (upEvent) => {
                    handle.releasePointerCapture(upEvent.pointerId);
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', up);
                    const rect = startMenu.getBoundingClientRect();
                    writeAppsMenuSize(clampAppsMenuSize(rect.width, rect.height));
                };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', up, { once: true });
            });
        });
        startMenu.dataset.resizeHandles = 'true';
    }

    function observeAppsMenuSize() {
        if (!startMenu || !window.ResizeObserver) return;
        let timer = null;
        const observer = new ResizeObserver(() => {
            alignAppsMenuIcons();
            if (startMenu.hidden) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                const rect = startMenu.getBoundingClientRect();
                writeAppsMenuSize(clampAppsMenuSize(rect.width, rect.height));
            }, 250);
        });
        observer.observe(startMenu);
        window.addEventListener('resize', () => { applyAppsMenuSize(); alignAppsMenuIcons(); });
    }

    function openStartMenu() { ensureAppsMenuResizeHandles(); applyAppsMenuSize(); startMenu.hidden = false; startButton.setAttribute('aria-expanded', 'true'); alignAppsMenuIcons(); search?.focus(); }
    function closeStartMenu() { startMenu.hidden = true; startButton.setAttribute('aria-expanded', 'false'); }
    function toggleStartMenu() { startMenu.hidden ? openStartMenu() : closeStartMenu(); }
    function clearTransientButtonHighlight(button) { setTimeout(() => button?.blur?.(), 0); }

    const fullscreenButton = document.getElementById('desktop-fullscreen');
    function detectMobileBrowserTaskbar() {
        const ua = navigator.userAgent || '';
        const mobileUa = /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua);
        const coarseSmall = window.matchMedia?.('(pointer: coarse)')?.matches && window.matchMedia?.('(max-width: 900px)')?.matches;
        root.classList.toggle('desktop-mobile-browser', Boolean(mobileUa || coarseSmall));
    }
    detectMobileBrowserTaskbar();
    window.addEventListener('resize', detectMobileBrowserTaskbar);
    fullscreenButton?.addEventListener('click', (event) => {
        clearTransientButtonHighlight(event.currentTarget);
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
        const url = (settingsButton && settingsButton.dataset.settingsUrl) || '/index.php/settings/user/desktop_workspace';
        const icon = (window.OC && OC.imagePath && OC.imagePath('desktop_workspace', 'app.svg')) || '/apps/desktop_workspace/img/app.svg';
        openExternalWindow({ appId: 'desktop-settings', title: dt('Desktop Settings'), href: url, icon });
    }
    function openDesktopAdminSettings() {
        const url = (window.OC && OC.generateUrl) ? OC.generateUrl('/settings/admin/desktop_workspace') : '/index.php/settings/admin/desktop_workspace';
        const icon = (window.OC && OC.imagePath && OC.imagePath('desktop_workspace', 'app.svg')) || '/apps/desktop_workspace/img/app.svg';
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

        } else {
            win.classList.remove('is-minimized');
            win.removeAttribute('aria-hidden');
            restoreWindowGeometry(entry);

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
        entry.task.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        saveState();
    }

    function setWindowIcon(entry, icon) {
        if (!entry || !icon) return;
        entry.app.icon = String(icon);
        const html = `<img alt="" draggable="false" src="${escapeHtml(entry.app.icon)}">`;
        const windowIcon = entry.window.querySelector('.desktop-window-icon');
        const taskIcon = entry.task.querySelector('.desktop-task-icon');
        if (windowIcon) windowIcon.innerHTML = html;
        if (taskIcon) taskIcon.innerHTML = html;
    }

    function setWindowMeta(id, meta = {}) {
        const entry = windows.get(id);
        if (!entry) return;
        if (meta.icon) setWindowIcon(entry, meta.icon);
        if (meta.title) {
            entry.app.name = String(meta.title);
            entry.window.querySelector('[data-window-title]').textContent = entry.app.name;
            entry.task.querySelector('[data-task-title]').textContent = entry.app.name;
            entry.task.title = entry.app.name;
            entry.task.setAttribute('aria-label', entry.app.name);
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

    function toggleWindowMaximized(id) {
        const entry = windows.get(id);
        if (!entry) return;
        setWindowMinimized(id, false);
        const win = entry.window;
        const before = win.getBoundingClientRect();
        win.classList.add('is-geometry-animating');
        win.classList.toggle('is-maximized');
        const after = win.getBoundingClientRect();
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && before.width && before.height && after.width && after.height) {
            const animation = win.animate([
                { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
                { transform: 'translate(0, 0) scale(1)' },
            ], { duration: 83, easing: 'cubic-bezier(0, 0, 0, 1)' });
            animation.addEventListener('finish', () => win.classList.remove('is-geometry-animating'), { once: true });
            animation.addEventListener('cancel', () => win.classList.remove('is-geometry-animating'), { once: true });
        } else {
            win.classList.remove('is-geometry-animating');
        }
        focusWindow(id);
        saveState();
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
                toggleWindowMaximized(id);
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
        menu.querySelector('button')?.blur();
    }

    function removeWindowEntry(id, reason = 'window_closed') {
        const entry = windows.get(id);
        if (!entry) return;
        const iframe = entry.window.querySelector('iframe.desktop-window-iframe');
        if (iframe) stopThemingIframeMonitor(iframe);
        entry.window.remove();
        entry.task.remove();
        windows.delete(id);
        saveState();

    }

    function prepareIframeForClose(entry) {
        const iframe = entry?.window?.querySelector('iframe');
        if (!iframe) return false;
        let requested = false;
        try {
            iframe.contentWindow?.postMessage({ type: 'nextcloud-desktop:prepare-close', appId: entry.app?.id || '' }, window.location.origin);
            requested = true;
        } catch (error) {

        }
        try {
            const viewer = iframe.contentWindow?.OCA?.Viewer;
            if (viewer && typeof viewer.close === 'function') {
                viewer.close();
                requested = true;
            }
        } catch (error) {

        }
        return requested;
    }

    function closeWindow(id, reason = 'window_closed') {
        const entry = windows.get(id);
        if (!entry) return;
        if (entry.window.dataset.desktopClosing === 'true') return;
        entry.window.dataset.desktopClosing = 'true';
        const graceful = prepareIframeForClose(entry);
        window.setTimeout(() => removeWindowEntry(id, reason), graceful ? 120 : 0);
    }

    function openExternalWindow({ appId, title, subtitle = '', href, icon = '' }) {
        const id = String(appId || href || title).replace(/[^a-z0-9_-]/gi, '_');
        openWindow({ id, name: title || 'Nextcloud', href, icon, desktopMode: 'iframe' });
        setWindowMeta(id, { title: title || 'Nextcloud', subtitle, icon });
    }

    // Official Nextcloud Files translations for the row action labelled "View" (NC34).
    // Used only to recognise the native Files row-name View button; folders and downloads are left alone.
    const NATIVE_FILES_VIEW_LABELS = new Set([
        'amharc', 'angalia', 'ansehen', 'ansicht', 'bekijken', 'görüntüle', 'harah', 'ikusi',
        'nézet', 'näytä', 'podgląd', 'pogled', 'pogledaj', 'pregledaj', 'προβολή', 'режим просмотра',
        'rodyti', 'skoa', 'skoða', 'tampilan', 'ver', 'view', 'vis', 'visa', 'vista',
        'visualizza', 'visualització', 'visualização', 'voir', 'vaata', 'xem', 'zobrazit',
        'zobraziť', 'выгляд', 'изглед', 'подання', 'поглед', 'погледај', 'харах',
        'عرض', 'نمایش', 'كۆرۈنۈش', 'ເບິ່ງ', '보기', '表示', '查看', '檢視'
    ].map((label) => String(label).toLocaleLowerCase()));

    function normaliseActionLabel(value = '') {
        return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    }

    function isDownloadLikeLink(anchor) {
        if (!anchor) return false;
        const href = anchor.getAttribute('href') || '';
        return anchor.hasAttribute('download') || /(?:^|[/?&])download(?:[=/?&]|$)|[?&]download(?:=1|=true)?(?:&|$)/i.test(href);
    }

    function sameOriginHref(href) {
        try {
            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin) return '';
            return url.toString();
        } catch (e) { return ''; }
    }

    function titleFromIframeLink(anchor, href) {
        const text = anchor?.textContent?.trim() || anchor?.getAttribute?.('title') || anchor?.getAttribute?.('aria-label') || '';
        if (text) return text.replace(/\s+/g, ' ');
        try { return decodeURIComponent(new URL(href, window.location.origin).pathname.split('/').filter(Boolean).pop() || 'Nextcloud'); } catch (e) { return 'Nextcloud'; }
    }

    function isNewWindowGesture(event) {
        return event && (event.button === 1 || event.ctrlKey || event.metaKey);
    }

    function rowFileId(row) {
        return row?.dataset?.fileid || row?.dataset?.fileId || row?.dataset?.cyFilesListRowFileid || row?.getAttribute?.('data-fileid') || row?.getAttribute?.('data-id') || row?.getAttribute?.('data-cy-files-list-row-fileid') || '';
    }

    function rowName(row, button = null) {
        const nameNode = row?.querySelector?.('.files-list__row-name-text, .files-list__row-name-link, [data-cy-files-list-row-name]');
        return (row?.getAttribute?.('data-cy-files-list-row-name') || nameNode?.textContent || button?.textContent || button?.getAttribute?.('title') || '').trim().replace(/\s+/g, ' ');
    }

    function currentFilesDir(doc) {
        try {
            const url = new URL(doc.defaultView?.location?.href || '', window.location.origin);
            const dir = url.searchParams.get('dir') || url.searchParams.get('path') || '';
            return dir ? (dir.startsWith('/') ? dir : `/${dir}`) : '/';
        } catch (e) { return '/'; }
    }

    function joinFilesPath(dir, name) {
        const base = String(dir || '/').replace(/\/+$/, '');
        const leaf = String(name || '').replace(/^\/+/, '');
        return `${base || ''}/${leaf}` || '/';
    }

    function desktopFileViewerHref(fileId, name, filePath, mime = '') {
        if (!fileId) return '';
        const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
        const direct = mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf'
            || /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp|m4v|mkv|mov|mp4|ogv|webm|avi|flac|m4a|mp3|oga|ogg|opus|wav|pdf)$/i.test(name);
        if (!direct) return `${OC.getRootPath ? OC.getRootPath() : ''}/index.php/f/${encodeURIComponent(fileId)}`;
        const query = new URLSearchParams({ fileId, name, mime, filePath: normalizedPath });
        return `${OC.getRootPath ? OC.getRootPath() : ''}/index.php/apps/desktop_workspace/files/viewer?${query.toString()}`;
    }

    function filesFolderHref(name, doc) {
        const url = new URL('/index.php/apps/files/files', window.location.origin);
        url.searchParams.set('dir', joinFilesPath(currentFilesDir(doc), name));
        return url.toString();
    }

    function openIframeHrefInDesktopWindow(href, title = '', sourceApp = null) {
        const absolute = sameOriginHref(href);
        if (!absolute) return false;
        let hash = '';
        try { hash = btoa(unescape(encodeURIComponent(absolute))).replace(/=+$/g, '').slice(0, 48); } catch (e) { hash = String(Date.now()); }
        openWindow({
            id: uniqueWindowId(`iframe-link-${hash}`),
            name: title || 'Nextcloud',
            href: absolute,
            icon: sourceApp?.icon || '',
            desktopMode: 'iframe',
        });

        return true;
    }

    function openNativeFilesViewerWindow(row, button, sourceApp = null) {
        if (!row || !button) return false;
        const fileId = rowFileId(row);
        if (!fileId) return false;
        const name = rowName(row, button) || t('File');
        const icon = iconForFileName(name) || sourceApp?.icon || '';
        const id = `file-${String(fileId).replace(/[^a-z0-9_-]/gi, '_')}`;
        const path = joinFilesPath(currentFilesDir(row.ownerDocument), name);
        const mime = row.dataset?.mime || row.dataset?.mimetype || row.dataset?.fileMimetype || row.getAttribute?.('data-mime') || row.getAttribute?.('data-mimetype') || '';
        openWindow({ id, name, href: desktopFileViewerHref(fileId, name, path, mime), icon, desktopMode: 'iframe' });
        setWindowMeta(id, { title: name, icon });

        return true;
    }

    function openNativeFilesFolderWindow(row, button, sourceApp = null) {
        const name = rowName(row, button);
        if (!name) return false;
        const href = filesFolderHref(name, row.ownerDocument);
        const id = uniqueWindowId(`files-${name.replace(/[^a-z0-9_-]/gi, '_')}`);
        const icon = sourceApp?.icon || ((window.OC && OC.imagePath && OC.imagePath('core', 'places/files.svg')) || '');
        openWindow({ id, name, href, icon, desktopMode: 'iframe' });
        setWindowMeta(id, { title: name, subtitle: new URL(href).searchParams.get('dir') || '', icon });

        return true;
    }

    function wireIframeNavigationInterception(doc, app) {
        if (!doc || doc.__desktopNavigationIntercept === true) return;
        doc.__desktopNavigationIntercept = true;
        if (doc.documentElement?.dataset) doc.documentElement.dataset.desktopNavigationIntercept = 'true';
        const shouldOpenNewDesktopWindow = (event, anchor) => {
            if (!anchor || isDownloadLikeLink(anchor)) return false;
            return event.button === 1 || event.ctrlKey || event.metaKey || anchor.target === '_blank';
        };
        const onActivate = (event) => {
            const button = event.target?.closest?.('.files-list__row-name-link');
            if (button) {
                const label = normaliseActionLabel(button.getAttribute('title') || button.getAttribute('aria-label') || '');
                const row = button.closest('.files-list__row');
                const isFolderRow = row?.classList.contains('files-list__row--folder') || /^open folder\b/i.test(button.getAttribute('title') || button.getAttribute('aria-label') || '');
                if (isFolderRow && isNewWindowGesture(event)) {
                    if (openNativeFilesFolderWindow(row, button, app)) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return;
                    }
                }
                if (NATIVE_FILES_VIEW_LABELS.has(label) && row && !row.classList.contains('files-list__row--folder')) {
                    if (openNativeFilesViewerWindow(row, button, app)) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return;
                    }
                }
            }
            const anchor = event.target?.closest?.('a[href]');
            if (anchor && shouldOpenNewDesktopWindow(event, anchor)) {
                const href = anchor.getAttribute('href');
                const absolute = sameOriginHref(href);
                if (absolute && openIframeHrefInDesktopWindow(absolute, titleFromIframeLink(anchor, absolute), app)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            }
        };
        doc.addEventListener('click', onActivate, true);
        doc.addEventListener('auxclick', onActivate, true);
    }

    function openProperties(el) {
        if (!el || !el.dataset || !el.dataset.path) return;
        const path = '/' + String(el.dataset.path).replace(/^\/+/, '');
        const name = el.dataset.name || path.split('/').filter(Boolean).pop() || path;
        const fileId = el.dataset.fileId || '';
        const params = new URLSearchParams({
            filePath: path, name, fileId,
            folder: el.dataset.folder === 'true' ? '1' : '0',
            mime: el.dataset.mime || '', size: '', modified: '',
        });
        const icon = (window.OC && OC.imagePath && OC.imagePath('desktop_workspace', 'files.svg')) || '/apps/desktop_workspace/img/files.svg';
        let hash = fileId;
        if (!hash) { try { hash = btoa(unescape(encodeURIComponent(path))).replace(/=+$/g, ''); } catch (e) { hash = path; } }
        openExternalWindow({
            appId: 'details-' + hash,
            title: t('{name} Properties', { name }),
            subtitle: path,
            href: '/index.php/apps/desktop_workspace/files/details?' + params.toString(),
            icon,
        });
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

        return true;
    }

    function isUnifiedSearchResultLink(link) {
        return Boolean(link.closest('[id*="unified-search"], [class*="unified-search"], [class*="search-result"], [class*="search__result"]'));
    }

    function isNativeHeaderOverlayLink(link) {
        if (!link) return false;
        if (link.id === 'firstrunwizard_about' || link.closest('#firstrunwizard_about')) return true;
        const rawHref = link.getAttribute('href');
        const text = (link.textContent || '').trim().replace(/\s+/g, ' ');
        return rawHref === '' && /About\s*&\s*What/i.test(text);
    }

    function isNotificationPopoverInteraction(event, link) {
        const notificationRoot = link.closest('#notifications, [id*="notification"], [class*="notification"]');
        if (!notificationRoot) return false;
        const url = normalizeDesktopHref(link.href || link.getAttribute('href'));
        if (!url) return true;
        // Nextcloud notifications use in-popover controls/expanders that can be anchors.
        // Let those native handlers run so the popover stays open; only route actual
        // notification target links to a desktop window.
        if (link.hasAttribute('aria-expanded') || link.closest('[aria-expanded]')) return true;
        if (event.target.closest('button, [role="button"], [data-action], [class*="expand"], [class*="toggle"]')) return true;
        const text = (link.textContent || '').trim();
        if (!text && !link.querySelector('img, svg')) return true;
        return false;
    }

    function handleDesktopLinkClick(event) {
        const link = event.target.closest?.('a[href]');
        if (!link) return;
        if (link.closest('#user_status_menu_item, .user-status-menu-item, [data-id="user_status"]')) return; // native status modal
        if (isNativeHeaderOverlayLink(link)) return; // native About/What's New modal
        const inMovedHeaderMenu = Boolean(headerEndSlot?.contains(link));
        const inSearchResult = isUnifiedSearchResultLink(link);
        if (!inMovedHeaderMenu && !inSearchResult) return;
        if (isNotificationPopoverInteraction(event, link)) return;
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
        task.innerHTML = `${app.icon ? `<span class="desktop-task-icon"><img alt="" src="${escapeHtml(app.icon)}"></span>` : '<span class="desktop-task-icon" aria-hidden="true"></span>'}<span data-task-title>${escapeHtml(app.name)}</span>`;
        task.title = app.name;
        task.setAttribute('aria-label', app.name);
        task.setAttribute('aria-pressed', win.classList.contains('is-minimized') ? 'false' : 'true');
        task.addEventListener('click', (event) => {
            clearTransientButtonHighlight(event.currentTarget);
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
                <div class="desktop-files-toolbar"><strong>${escapeHtml(t('Files'))}</strong><span>${escapeHtml(cleanDir)}</span><button type="button" data-refresh>${escapeHtml(t('Refresh'))}</button></div>
                <table class="desktop-files-table">
                    <thead><tr><th>${escapeHtml(t('Name'))}</th><th>${escapeHtml(t('Type'))}</th><th>${escapeHtml(t('Size'))}</th><th>${escapeHtml(t('Modified'))}</th></tr></thead>
                    <tbody>${rows.map((row) => `<tr><td>${row.isFolder ? '📁' : '📄'} ${escapeHtml(row.name)}</td><td>${escapeHtml(row.isFolder ? t('Folder') : t('File'))}</td><td>${row.isFolder ? '' : escapeHtml(row.size)}</td><td>${escapeHtml(row.modified)}</td></tr>`).join('') || `<tr><td colspan="4">${escapeHtml(t('No files'))}</td></tr>`}</tbody>
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
        iframe.dataset.desktopCreatedAt = String(Date.now());
        const focusFromIntentionalPointer = () => {
            const entry = windows.get(app.id);
            if (!entry || entry.window.classList.contains('is-minimized')) return;
            focusWindow(app.id);
        };
        // Only raise a background iframe window for an explicit pointer press. Some embedded
        // apps focus controls on hover (Deck cards, Memories year rail), which dispatches
        // focus/focusin without the user clicking the window and used to raise it accidentally.
        iframe.addEventListener('pointerdown', focusFromIntentionalPointer);
        iframe.addEventListener('load', () => {
            iframe.dataset.desktopLoadedAt = String(Date.now());
            refreshThemingIframeMonitor(iframe);
            hideIframeChrome(iframe, app);
            watchIframeFileViewer(iframe, app);

        });
        target.appendChild(iframe);
        primeIframeChromeHiding(iframe, app);
        refreshThemingIframeMonitor(iframe);
        watchIframeFileViewer(iframe, app);

    }

    function normalizeFileTitle(name = '') {
        const value = String(name || '').trim();
        const direct = value.match(/^(.+?\.[A-Za-z0-9]{1,8})(?:\s[-–]\s.+)?$/);
        return direct ? direct[1].trim() : value;
    }

    function fileExtension(name = '') {
        const clean = normalizeFileTitle(name).split('?')[0].split('#')[0];
        const match = clean.match(/\.([A-Za-z0-9]{1,8})$/);
        return match ? match[1].toLowerCase() : '';
    }

    function inferMimeFromName(name = '') {
        const ext = fileExtension(name);
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'avif'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        if (['mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video/mp4';
        if (['mp3', 'm4a', 'ogg', 'oga', 'flac', 'wav'].includes(ext)) return 'audio/mpeg';
        if (ext === 'pdf') return 'application/pdf';
        if (['txt', 'md', 'markdown', 'log'].includes(ext)) return 'text/plain';
        if (['csv'].includes(ext)) return 'text/csv';
        if (['ics'].includes(ext)) return 'text/calendar';
        if (['vcf', 'vcard'].includes(ext)) return 'text/vcard';
        if (['html', 'htm', 'css', 'js', 'ts', 'json', 'xml', 'yaml', 'yml', 'php', 'py', 'sh', 'sql'].includes(ext)) return 'text/code';
        if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return 'package/x-generic';
        if (['odt', 'ott', 'doc', 'docx', 'rtf'].includes(ext)) return 'x-office/document';
        if (['ods', 'ots', 'xls', 'xlsx'].includes(ext)) return 'x-office/spreadsheet';
        if (['odp', 'otp', 'ppt', 'pptx'].includes(ext)) return 'x-office/presentation';
        return 'application/octet-stream';
    }

    function isGenericFileIcon(src = '') {
        try {
            return /\/filetypes\/file\.svg(?:[?#].*)?$/i.test(new URL(src, window.location.origin).pathname + (new URL(src, window.location.origin).search || ''))
                || /\/filetypes\/application\.svg(?:[?#].*)?$/i.test(new URL(src, window.location.origin).pathname + (new URL(src, window.location.origin).search || ''));
        } catch (e) {
            return /\/filetypes\/(?:file|application)\.svg(?:[?#].*)?$/i.test(String(src));
        }
    }

    function iconForMime(mime = '') {
        if (!window.OC?.MimeType?.getIconUrl) return '';
        try { return OC.MimeType.getIconUrl(mime || 'application/octet-stream'); } catch (e) { return ''; }
    }

    function iconForFileType(type = '') {
        const filetype = type || 'file';
        if (window.OC?.imagePath) return OC.imagePath('core', `filetypes/${filetype}.svg`);
        return `/core/img/filetypes/${filetype}.svg`;
    }

    function fileTypeAliasForName(name = '') {
        const ext = fileExtension(name);
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'avif'].includes(ext)) return 'image';
        if (['mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
        if (['mp3', 'm4a', 'ogg', 'oga', 'flac', 'wav'].includes(ext)) return 'audio';
        if (ext === 'pdf') return 'application-pdf';
        if (['html', 'htm', 'css', 'js', 'ts', 'json', 'xml', 'yaml', 'yml', 'php', 'py', 'sh', 'sql'].includes(ext)) return 'text-code';
        if (['ics'].includes(ext)) return 'text-calendar';
        if (['vcf', 'vcard'].includes(ext)) return 'text-vcard';
        if (['txt', 'md', 'markdown', 'log', 'csv'].includes(ext)) return 'text';
        if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return 'package-x-generic';
        if (['odt', 'ott', 'doc', 'docx', 'rtf'].includes(ext)) return 'x-office-document';
        if (['ods', 'ots', 'xls', 'xlsx'].includes(ext)) return 'x-office-spreadsheet';
        if (['odp', 'otp', 'ppt', 'pptx'].includes(ext)) return 'x-office-presentation';
        return '';
    }

    function iconForFileName(name = '') {
        const byMime = iconForMime(inferMimeFromName(name));
        if (byMime && !isGenericFileIcon(byMime)) return byMime;
        const alias = fileTypeAliasForName(name);
        return alias ? iconForFileType(alias) : byMime;
    }

    function readViewerFileMime(doc, title = '') {
        const selectors = [
            '[data-mime]', '[data-mimetype]', '[data-file-mimetype]', '[data-contenttype]',
            '.viewer__file [data-mime]', '.viewer__file [data-mimetype]',
            '.modal-container [data-mime]', '.modal-container [data-mimetype]'
        ];
        for (const selector of selectors) {
            for (const node of Array.from(doc.querySelectorAll(selector))) {
                if (node.closest('.files-list__header-recommendations, .recommendation, .files-list__row, .files-list, #app-navigation')) continue;
                const mime = node.dataset?.mime || node.dataset?.mimetype || node.dataset?.fileMimetype || node.dataset?.contenttype || '';
                if (mime && mime.includes('/')) return mime;
            }
        }
        return inferMimeFromName(title);
    }

    function readViewerFileIcon(doc, title = '') {
        const iconSelectors = [
            '.viewer__file-title img[src]', '.viewer__file-name img[src]', '.modal-header img[src]',
            '[data-cy-files-preview-title] img[src]', '.app-sidebar-header img[src]',
            'img[src*="/core/img/filetypes/"]', 'img[src*="/apps/files/img/filetypes/"]'
        ];
        for (const selector of iconSelectors) {
            for (const img of Array.from(doc.querySelectorAll(selector))) {
                if (img.closest('.files-list__header-recommendations, .recommendation, .files-list__row, .files-list, #app-navigation')) continue;
                const src = img.getAttribute('src') || '';
                if (src && !isGenericFileIcon(src)) return new URL(src, window.location.origin).toString();
            }
        }
        const byMime = iconForMime(readViewerFileMime(doc, title));
        return byMime && !isGenericFileIcon(byMime) ? byMime : iconForFileName(title);
    }

    function readFilesFolder(doc, iframe) {
        const fromUrl = () => {
            try {
                const url = new URL(iframe.contentWindow?.location?.href || iframe.src, window.location.origin);
                const dir = url.searchParams.get('dir') || url.searchParams.get('path') || '';
                if (dir) return dir.startsWith('/') ? dir : `/${dir}`;
                if (url.hash) {
                    const hashParams = new URLSearchParams(url.hash.replace(/^#/, '').replace(/^.*?\?/, ''));
                    const hashDir = hashParams.get('dir') || hashParams.get('path');
                    if (hashDir) return hashDir.startsWith('/') ? hashDir : `/${hashDir}`;
                }
            } catch (e) { /* ignore */ }
            return '';
        };
        const path = fromUrl();
        const pathLabel = path.split('/').filter(Boolean).pop();
        const titleMatch = String(doc.title || '').match(/^(.+?)\s+-\s+(?:All files|Files)\b/i);
        const label = pathLabel || titleMatch?.[1]?.trim() || 'Files';
        return { label, path: path || (label === 'Files' ? '/' : `/${label}`) };
    }

    function readViewerFileName(doc, iframe) {
        const title = normalizeFileTitle((doc.title || '').replace(/\s[-–]\sNextcloud.*$/i, '').trim());
        const titleLooksLikeFile = /\.[A-Za-z0-9]{1,8}$/.test(title);
        if (titleLooksLikeFile && title !== 'Files') return title;
        const selectors = [
            '.viewer__file-title', '.viewer__file-name', '.modal-header h2', '.modal-header__title',
            '[data-cy-files-preview-title]', '.app-sidebar-header__figure + h2',
            '[data-filename]', '[data-file-name]',
        ];
        let fallback = '';
        for (const selector of selectors) {
            const nodes = Array.from(doc.querySelectorAll(selector));
            for (const node of nodes) {
                // Ignore Files recommendation/list/sidebar names while a viewer is mounting; those can
                // contain unrelated recent documents such as the Welcome .docx recommendation.
                if (node.closest('.files-list__header-recommendations, .recommendation, .files-list__row, .files-list, #app-navigation')) continue;
                const value = (node?.dataset?.filename || node?.dataset?.fileName || node?.getAttribute?.('title') || node?.textContent || '').trim();
                if (!value) continue;
                if (/\.[A-Za-z0-9]{1,8}(\s|$)/.test(value)) return value;
                if (!fallback) fallback = value;
            }
        }
        if (title && title !== 'Files' && !/\s+-\s+(?:All files|Files)\b/i.test(title)) return title;
        if (fallback) return fallback;
        try {
            const url = new URL(iframe.contentWindow?.location?.href || iframe.src, window.location.origin);
            const path = url.searchParams.get('filePath') || url.searchParams.get('dir') || url.pathname;
            const leaf = decodeURIComponent(String(path).split('/').filter(Boolean).pop() || '');
            return leaf.includes('.') ? leaf : '';
        } catch (e) { return ''; }
    }

    function watchIframeFileViewer(iframe, app) {
        const isFileWindow = String(app.id).startsWith('file-') || String(app.id).startsWith('file_');
        const isNativeFilesWindow = /\/apps\/files(\/|$)/.test(String(app.href || '')) || app.id === 'files';
        if (!isFileWindow && !isNativeFilesWindow) return;
        if (iframe.dataset.desktopMetaWatch === 'true') return;
        iframe.dataset.desktopMetaWatch = 'true';
        const baseTitle = app.name || 'Files';
        const baseIcon = app.icon || ((window.OC && OC.imagePath && OC.imagePath('core', 'places/files.svg')) || '');
        iframe.closest('.desktop-window')?.setAttribute('data-native-files-base-icon', baseIcon);
        let interval = null;
        let lastTitle = '';
        let lastIcon = '';
        const closeFileWindow = () => {
            if (!isFileWindow) return;
            closeWindow(app.id, 'file_window_closed_by_viewer');
            if (interval) clearInterval(interval);
        };
        try {
            const doc = iframe.contentDocument;
            const closeSelectors = [
                '.viewer__close',
                '.viewer-close',
                '.modal-header__close',
                'button[aria-label="Close"]',
                'button[title="Close"]',
                '[data-cy-files-preview-close]',
                '.icon-close',
            ].join(',');
            if (doc) {
                wireIframeNavigationInterception(doc, app);
                doc.addEventListener('pointerdown', () => {
                    const entry = windows.get(app.id);
                    if (entry && !entry.window.classList.contains('is-minimized')) focusWindow(app.id);
                }, true);
                doc.addEventListener('click', (event) => {
                    if (event.target.closest(closeSelectors)) {
                        setTimeout(closeFileWindow, 100);
                    }
                }, true);
            }
            interval = setInterval(() => {
                try {
                    const currentDoc = iframe.contentDocument;
                    if (!currentDoc) return;
                    const url = iframe.contentWindow?.location?.href || '';
                    const hasViewer = Boolean(currentDoc.querySelector('#viewer, .viewer__file, .modal-container, .modal-mask, [data-cy-files-preview-close], [data-image-viewer]'));
                    const hasOfficeFrame = Boolean(currentDoc.querySelector('iframe[src*="richdocuments"], iframe[src*="onlyoffice"], iframe[id*="richdocuments"], iframe[name*="richdocuments"], #richdocumentsframe'));
                    const hasViewerClose = Boolean(currentDoc.querySelector('.viewer__close, .viewer-close, .modal-header__close, [data-cy-files-preview-close]'));
                    const viewerTitle = readViewerFileName(currentDoc, iframe);
                    const looksLikeFileTitle = /\.[A-Za-z0-9]{1,8}(\s|$)/.test(viewerTitle);
                    const fileRoute = url.includes('/index.php/f/') || /\/apps\/(richdocuments|onlyoffice|text)\b/.test(url);
                    const nativeFilesFileOpen = isNativeFilesWindow && (hasViewerClose || hasViewer || hasOfficeFrame) && looksLikeFileTitle;
                    if (isFileWindow || fileRoute || nativeFilesFileOpen) {
                        const title = viewerTitle;
                        if (title) {
                            const icon = readViewerFileIcon(currentDoc, title) || iconForFileName(title);
                            if (title !== lastTitle || icon !== lastIcon) {
                                lastTitle = title;
                                lastIcon = icon;
                                iframe.closest('.desktop-window')?.setAttribute('data-native-files-file-open', 'true');
                                setWindowMeta(app.id, { title, icon });
                            }
                        }
                    } else if (isNativeFilesWindow) {
                        const folder = readFilesFolder(currentDoc, iframe);
                        const title = folder.label || baseTitle;
                        const subtitle = folder.path || '';
                        const key = `${title}\n${subtitle}`;
                        if (key !== lastTitle) {
                            lastTitle = key;
                            iframe.closest('.desktop-window')?.setAttribute('data-native-files-file-open', 'false');
                            setWindowMeta(app.id, { title, subtitle, icon: baseIcon });
                        }
                    }
                } catch {
                    clearInterval(interval);
                }
            }, 1000);
        } catch (error) {

        }
    }

    function primeIframeChromeHiding(iframe, app) {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            try {
                hideIframeChrome(iframe, app);
                if (iframe.contentDocument?.body || attempts > 80) clearInterval(timer);
            } catch (e) {
                if (attempts > 80) clearInterval(timer);
            }
        }, 50);
    }

    function hideIframeChrome(iframe, app) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;
            if (doc.documentElement?.dataset.desktopChromePrimed !== 'true') {
                doc.documentElement.dataset.desktopChromePrimed = 'true';
                const earlyStyle = doc.createElement('style');
                earlyStyle.dataset.desktopEarlyChromePatch = 'true';
                earlyStyle.textContent = `
                    #header, header#header, .skip-navigation { display: none !important; }
                    body { padding-top: 0 !important; }
                    #content, #content-vue, .content { margin-top: 0 !important; }
                `;
                (doc.head || doc.documentElement).appendChild(earlyStyle);
            }
            const focusSelf = (event) => {
                if (event?.type !== 'pointerdown') return;
                const entry = windows.get(app.id);
                if (entry && !entry.window.classList.contains('is-minimized')) focusWindow(app.id);
            };
            doc.addEventListener('pointerdown', focusSelf, true);
            wireIframeNavigationInterception(doc, app);

            // Remove the Nextcloud top header outright. Hiding it with display:none left layout/scroll
            // artefacts for some apps (notably the Text editor); removing the element renders cleanly.
            // Only ever the page's own top header — never a header that belongs to a modal or the
            // Viewer (e.g. .modal-header with the close button). Nextcloud apps are SPAs that may
            // (re)mount their header after load, so we keep removing it for a short while, then stop.
            const stripHeader = () => doc.querySelectorAll('#header, header#header').forEach((node) => {
                if (node.closest('.modal-mask, .modal-container, .modal-wrapper, .viewer, #viewer, [class*="viewer"]')) return;
                node.remove();
            });
            stripHeader();
            const observer = new MutationObserver(stripHeader);
            observer.observe(doc.documentElement, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 15000);

            // Reclaim the space the (fixed) header used to occupy and drop the skip-nav link.
            // Dashboard deliberately keeps its own content/background layout: its widgets are
            // meant to float as cards on the selected dashboard background, not be flattened
            // into a full-bleed app panel like regular apps.
            const isDashboard = app.id === 'dashboard' || app.sourceAppId === 'dashboard' || String(app.href || '').includes('/apps/dashboard');
            const style = doc.createElement('style');
            if (doc.head?.querySelector('style[data-desktop-chrome-patch="true"]')) return;
            style.dataset.desktopChromePatch = 'true';
            style.textContent = isDashboard ? `
                body { padding-top: 0 !important; }
                #content, #content-vue, .content { margin-top: 0 !important; }
                .skip-navigation { display: none !important; }
            ` : `
                html, body {
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    background: var(--color-main-background, #fff) !important;
                }
                #body-user, #content, #content-vue, .content, .app-content, #app-content, #app-content-vue {
                    box-sizing: border-box !important;
                    width: 100% !important;
                    height: 100% !important;
                    min-width: 0 !important;
                    min-height: 0 !important;
                    max-width: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border-radius: 0 !important;
                    overflow: auto !important;
                    background: var(--color-main-background, #fff) !important;
                }
                #content, #content-vue, .content {
                    position: relative !important;
                    inset: auto !important;
                    margin-top: 0 !important;
                }
                .skip-navigation { display: none !important; }
            `;
            doc.head?.appendChild(style);

        } catch (error) {

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
                win.classList.add('is-window-dragging');
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
            win.classList.remove('is-window-dragging');
            drag = null;
            saveState();
        });
        titlebar.addEventListener('pointercancel', () => {
            showSnapPreview(null);
            win.classList.remove('is-window-dragging');
            drag = null;
        });
        win.addEventListener('pointerdown', () => focusWindow(id));
        win.addEventListener('mouseup', () => setTimeout(saveState, 0));
        const minimizeButton = win.querySelector('[data-action="minimize"]');
        const handleMinimize = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            clearTransientButtonHighlight(event.currentTarget);
            if (!win.classList.contains('is-minimized')) minimizeWindow(id);
        };
        minimizeButton?.addEventListener('pointerdown', handleMinimize);
        minimizeButton?.addEventListener('click', handleMinimize);
        win.querySelector('[data-action="maximize"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTransientButtonHighlight(event.currentTarget);
            toggleWindowMaximized(id);
        });
        win.querySelector('[data-action="reload"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTransientButtonHighlight(event.currentTarget);
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

        });
        win.querySelector('[data-action="close"]')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTransientButtonHighlight(event.currentTarget);
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
                refreshThemingIframeMonitor(iframe);
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
        const locale = (desktopLocale || desktopLanguage || navigator.language || undefined)?.replace(/_/g, '-');
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        try { clock.textContent = new Intl.DateTimeFormat(locale, options).format(now); }
        catch (e) { clock.textContent = new Intl.DateTimeFormat(undefined, options).format(now); }
    }

    startButton.addEventListener('click', toggleStartMenu);
    document.addEventListener('click', handleDesktopLinkClick, true);
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'nextcloud-desktop:window-meta') {
            setWindowMeta(String(event.data.appId || ''), event.data);
        } else if (event.data?.type === 'nextcloud-desktop:open-file' || event.data?.type === 'nextcloud-desktop:open-app') {
            openExternalWindow(event.data);

        } else if (event.data?.type === 'nextcloud-desktop:desktop-reload') {
            if (typeof favoritesReload === 'function') favoritesReload();
        } else if (event.data?.type === 'nextcloud-desktop:settings-changed') {
            if (typeof applyIconSettings === 'function') applyIconSettings(event.data.settings || {});
            if (event.data.settings && 'decoration' in event.data.settings) applyDecoration(event.data.settings.decoration);
        } else if (event.data?.type === 'nextcloud-desktop:close-window') {
            const id = String(event.data.appId || '').replace(/[^a-z0-9_-]/gi, '_');
            if (windows.has(id)) {
                closeWindow(id, 'window_closed_by_child');
            }
        }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStartMenu(); });
    document.addEventListener('pointerdown', (event) => {
        if (!startMenu.hidden && !startMenu.contains(event.target) && !startButton.contains(event.target)) closeStartMenu();
        const taskMenu = document.getElementById('desktop-task-context-menu');
        if (taskMenu && !taskMenu.hidden && !taskMenu.contains(event.target)) closeTaskContextMenu();
        const appMenu = document.getElementById('desktop-app-context-menu');
        if (appMenu && !appMenu.hidden && !appMenu.contains(event.target)) closeAppContextMenu();
    }, true);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeTaskContextMenu(); closeAppContextMenu(); } });
    headerEndSlot?.addEventListener('click', scheduleHeaderEndMenuPositioning, true);
    document.addEventListener('click', (event) => {
        if (event.target.closest('#desktop-header-end-slot')) {
            scheduleHeaderEndMenuPositioning();
            bindNativeAccountMenuControls();
        }
    }, true);

    // Header-end menu items (notifications, search results, contacts, the user/account menu, …) open as
    // desktop windows instead of navigating the shell away or being swallowed by an app's own per-link
    // handler (e.g. the "External sites" app). Strategy: bind directly on each menu anchor as it appears
    // (stopImmediatePropagation beats per-link handlers), with a document-level capture fallback.
    function isNativeAccountMenuAction(link) {
        if (!link) return false;
        const text = (link.getAttribute('aria-label') || link.textContent || '').trim().toLowerCase();
        const href = link.getAttribute('href') || '';
        const marker = `${link.id || ''} ${link.className || ''} ${link.closest('[id]')?.id || ''} ${link.closest('[class]')?.className || ''}`.toLowerCase();
        // These account-menu entries are Nextcloud overlays/actions, not pages to iframe.
        return marker.includes('user_status') || marker.includes('user-status') ||
            marker.includes('firstrunwizard_about') ||
            marker.includes('qr') || marker.includes('qrcode') || marker.includes('login-flow') ||
            href.includes('/logout') || href.includes('logout=true') ||
            href.includes('/user_status/') || href.includes('/apps/user_status') ||
            text === 'set status' || text === 'status setzen' || text === 'définir le statut' ||
            /about\s*&\s*what/i.test(text) ||
            text.includes('qr') || text.includes('log out') || text.includes('abmelden') || text.includes('déconnexion');
    }

    function headerMenuTarget(link) {
        if (!link) return null;
        if (link.closest('#desktop-nextcloud-logo, #desktop-start-menu, #desktop-launcher, #desktop-task-list')) return null; // shell chrome
        if (link.closest('.avatardiv, .contact__avatar')) return null;                  // avatar trigger
        if (isNativeAccountMenuAction(link)) return null;                                // account overlays/logout stay native
        if (link.hasAttribute('aria-haspopup') || link.getAttribute('aria-expanded') !== null) return null; // a menu toggle
        if (link.hasAttribute('download')) return null;
        const rawHref = link.getAttribute('href') || '';
        if (rawHref === '#' || rawHref.endsWith('#')) return null;                        // native no-op/overlay anchors stay native
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

    function bindNativeAccountMenuControls() {
        document.querySelectorAll('button:has(.qrcode-scan-icon), a[href="#"]:has(.user-status-icon), #firstrunwizard_about a, a#firstrunwizard_about').forEach((control) => {
            if (control.dataset.desktopNativeBound === 'true') return;
            control.dataset.desktopNativeBound = 'true';
            // NcListItem/account-menu controls can be closed by ancestor pointer handling before their
            // Vue click handler runs after the header was moved into the taskbar. Let the real control
            // receive a synthetic click first, then keep the menu click from being converted to a window.
            control.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setTimeout(() => control.click(), 0);
            });
        });
    }

    // Open as early as possible. Some menus (NcListItem inside the account menu's NcPopover) close and
    // DETACH the anchor on pointerdown, so the click never reaches a handler — opening on pointerdown
    // beats that. Propagation is left intact here so the menu still closes itself.
    document.addEventListener('pointerdown', (event) => {
        if (event.button) return;                               // primary button only
        const link = event.target.closest('a[href]');
        if (link && /\/logout/i.test(new URL(link.href, window.location.origin).pathname)) {
            // Account-menu links can be detached before click after the header is moved into the taskbar.
            // For logout, navigate explicitly instead of letting the click disappear.
            event.preventDefault();
            window.location.href = link.href;
            return;
        }
        const url = headerMenuTarget(link);
        if (!url) return;
        event.preventDefault();

        openExternalWindow(buildHeaderLinkMeta(link, url));
    }, true);

    // Click handler: suppress the native navigation and catch anything pointerdown missed. Deduped by
    // window id, so the same link just focuses its existing window rather than opening a second one.
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) {
            if (event.target.closest('#desktop-header-end-slot'))
            return;
        }
        if (/\/logout/i.test(new URL(link.href, window.location.origin).pathname)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.location.href = link.href;
            return;
        }
        const url = headerMenuTarget(link);
        if (!url) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        openExternalWindow(buildHeaderLinkMeta(link, url));
    }, true);
    window.addEventListener('resize', positionHeaderEndMenus);
    setInterval(positionHeaderEndMenus, 400);
    search?.addEventListener('click', openUnifiedSearchOverlay);

    moveHeaderEndToTaskbar();
    observeHeaderEndMenus();
    copyHeaderLogoToTaskbar();
    setTimeout(moveHeaderEndToTaskbar, 500);
    setTimeout(copyHeaderLogoToTaskbar, 500);
    syncAppearance();
    observeAppearanceChanges();
    applyAppsMenuSize();
    observeAppsMenuSize();
    const apps = renderLauncher();
    launcherApps = apps;
    applyAppsMenuSize();
    renderPinnedApps();
    initPinnedAppReordering();
    hideHeaderApps(apps);
    setTimeout(() => hideHeaderApps(launcherApps), 500);
    setTimeout(() => hideHeaderApps(launcherApps), 1500);
    restoreWindows(apps);
    scheduleDynamicAppDataReload(100);
    // Keep administrator policy changes effective for already-running desktops.
    window.setInterval(reloadDynamicAppData, 30000);
    initFavorites();
    updateClock();
    if (root.dataset.firstVisit === 'true') {
        // First visit ever (also after a full reset): show the user their desktop settings.
        setTimeout(() => { try { openDesktopSettings(); } catch (e) { /* ignore */ } }, 400);
    }

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

        const CELL_W = 120, CELL_H = 112, PAD = 16;
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
        // Usable area = the visible icon layer, excluding the taskbar at the bottom.
        // Icons outside either edge are temporarily reflowed into safe cells without
        // overwriting the saved cell, so they return when the desktop grows again.
        function usableHeight() {
            const lr = layer.getBoundingClientRect();
            const taskbar = document.querySelector('.desktop-taskbar');
            let bottom = lr.bottom;
            if (taskbar) bottom = Math.min(bottom, taskbar.getBoundingClientRect().top);
            return Math.max(CELL_H, bottom - lr.top);
        }
        function usableWidth() {
            const lr = layer.getBoundingClientRect();
            return Math.max(CELL_W, lr.width);
        }
        const rowsAvail = () => Math.max(1, Math.floor((usableHeight() - PAD) / CELL_H));
        const colsAvail = () => Math.max(1, Math.floor((usableWidth() - PAD) / CELL_W));
        const isFree = (c, r, except) => { const o = occupied.get(keyOf(c, r)); return !o || o === except; };
        function nextFreeCell() {
            const rows = rowsAvail();
            const cols = colsAvail();
            for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (isFree(c, r)) return { col: c, row: r };
            return { col: Math.max(0, cols - 1), row: 0 };
        }
        function nearestFreeCell(col, row, except) {
            const rows = rowsAvail();
            const cols = colsAvail();
            col = Math.min(Math.max(0, col), cols - 1); // never outside the right edge
            row = Math.min(Math.max(0, row), rows - 1); // never below the usable area
            if (isFree(col, row, except)) return { col, row };
            for (let radius = 1; radius < 80; radius++) {
                for (let dc = -radius; dc <= radius; dc++) for (let dr = -radius; dr <= radius; dr++) {
                    const c = col + dc, r = row + dr;
                    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
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

        function isGroupFolderItem(item) {
            const mount = String(item.mountType || '').toLowerCase();
            return mount.includes('group') || mount.includes('team');
        }
        function folderMime(item) {
            const mount = String(item.mountType || '').toLowerCase();
            if (mount.includes('external')) return 'dir-external';
            if ((item.shareTypes || []).length || item.sharedByOther || isGroupFolderItem(item)) return 'dir-shared';
            return 'dir';
        }
        function isSharedItem(item) {
            const uid = (OC.getCurrentUser && OC.getCurrentUser() || {}).uid || '';
            const owner = String(item.ownerId || '');
            return !!((item.shareTypes || []).length || item.sharedByOther || isGroupFolderItem(item) || (uid && owner && owner !== uid));
        }
        function shareBadgeTitle(item) {
            if (isGroupFolderItem(item)) return t('Group folder');
            if (item.ownerDisplayName) return t('Shared by {owner}', { owner: item.ownerDisplayName });
            return t('Shared');
        }
        function favVisual(item) {
            const mime = item.isFolder ? folderMime(item) : (item.mime || 'application/octet-stream');
            const fb = (OC.MimeType && OC.MimeType.getIconUrl) ? OC.MimeType.getIconUrl(mime) : '';
            if (item.isFolder) {
                return '<svg class="desktop-folder-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                    + '<path fill="currentColor" d="M10,4L12,6H20A2,2 0 0,1 22,8V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H10Z"/></svg>';
            }
            if (item.fileId && OC.generateUrl) {
                const url = OC.generateUrl('/core/preview?fileId={id}&x=64&y=64&a=1&mimeFallback=true', { id: String(item.fileId) });
                return `<img src="${url}" alt="" draggable="false"${fb ? ` data-fallback="${escapeHtml(fb)}"` : ''}>`;
            }
            return `<img src="${fb}" alt="" draggable="false">`;
        }
        const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#a37200" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>';
        const SHARED_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16,13C18.21,13 20,14.79 20,17C20,19.21 18.21,21 16,21C14.14,21 12.57,19.73 12.13,18H7.87C7.43,19.73 5.86,21 4,21C1.79,21 0,19.21 0,17C0,14.79 1.79,13 4,13C5.86,13 7.43,14.27 7.87,16H12.13C12.35,15.13 12.85,14.37 13.54,13.84L8.91,9.21C8.36,9.7 7.64,10 6.85,10C5.1,10 3.7,8.6 3.7,6.85C3.7,5.1 5.1,3.7 6.85,3.7C8.6,3.7 10,5.1 10,6.85C10,7.64 9.7,8.36 9.21,8.91L13.84,13.54C14.47,13.2 15.2,13 16,13M16,15A2,2 0 0,0 14,17A2,2 0 0,0 16,19A2,2 0 0,0 18,17A2,2 0 0,0 16,15M4,15A2,2 0 0,0 2,17A2,2 0 0,0 4,19A2,2 0 0,0 6,17A2,2 0 0,0 4,15Z"/></svg>';
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
            if (item.kind === 'app') el.dataset.appKey = item.appKey || item.id || '';
            el.dataset.favorited = item.favorited ? 'true' : 'false';
            if (item.special) el.dataset.special = item.special;
            const visual = item.kind === 'app'
                ? `<span class="desktop-app-shortcut-circle"><img src="${escapeHtml(item.icon || '')}" alt="" draggable="false"></span>`
                : (item.special
                    ? (item.svg || `<img src="${item.iconUrl}" alt="" draggable="false"${item.iconFallback ? ` data-fallback="${escapeHtml(item.iconFallback)}"` : ''}>`)
                    : favVisual(item));
            const favoriteBadge = item.favorited ? `<span class="desktop-fav-badge desktop-fav-badge-favorite">${STAR_SVG}</span>` : '';
            const sharedBadge = !item.special && isSharedItem(item) ? `<span class="desktop-fav-badge desktop-fav-badge-shared" title="${escapeHtml(shareBadgeTitle(item))}">${SHARED_SVG}</span>` : '';
            el.innerHTML = `<span class="desktop-fav-icon">${visual}${favoriteBadge}${sharedBadge}</span><span class="desktop-fav-label">${escapeHtml(item.name)}</span>`;
            // CSP-safe image fallback (inline onerror handlers are blocked by Nextcloud's CSP).
            el.querySelectorAll('img[data-fallback]').forEach((img) => {
                img.addEventListener('error', function onErr() {
                    img.removeEventListener('error', onErr);
                    if (img.dataset.fallback) img.src = img.dataset.fallback;
                });
            });
            return el;
        }

        function trashItem() {
            // Material Design "delete" icon (inline). core/img icons are deprecated since NC 25.
            // The fill follows CSS color so it can stay visible in both light and dark themes.
            const svg = '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">'
                + '<path fill="currentColor" d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/></svg>';
            return { id: '__trash__', special: 'trash', name: t('Recycling Bin'), svg, isFolder: true };
        }
        function homeItem() {
            const svg = '<svg class="desktop-folder-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                + '<path fill="currentColor" d="M10,4L12,6H20A2,2 0 0,1 22,8V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H10Z"/></svg>';
            return { id: '__home__', special: 'home', name: t('Home'), svg, isFolder: true };
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
                + '<d:prop><oc:fileid/><d:resourcetype/><d:getcontenttype/><oc:favorite/><oc:share-types/><oc:owner-id/><oc:owner-display-name/><nc:mount-type/></d:prop>'
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
                const shareTypes = Array.from(r.getElementsByTagNameNS('http://owncloud.org/ns', 'share-type')).map((n) => (n.textContent || '').trim()).filter(Boolean);
                const mountType = r.getElementsByTagNameNS('http://nextcloud.org/ns', 'mount-type')[0]?.textContent?.trim() || '';
                const ownerId = r.getElementsByTagNameNS('http://owncloud.org/ns', 'owner-id')[0]?.textContent?.trim() || '';
                const ownerDisplayName = r.getElementsByTagNameNS('http://owncloud.org/ns', 'owner-display-name')[0]?.textContent?.trim() || '';
                const uid = (OC.getCurrentUser && OC.getCurrentUser() || {}).uid || '';
                const sharedByOther = !!(uid && ownerId && ownerId !== uid);
                let favorited = false;
                for (const fe of Array.from(favEls)) { if ((fe.textContent || '').trim() === '1') { favorited = true; break; } }
                items.push({
                    path, name: path.split('/').pop(),
                    fileId: idEl ? idEl.textContent.trim() : '',
                    isFolder, mime: mimeEl ? mimeEl.textContent.trim() : '',
                    shareTypes, mountType, ownerId, ownerDisplayName, sharedByOther,
                    favorited,
                    kind: 'file',
                });
            }
            items.sort((a, b) => (b.isFolder - a.isFolder) || a.name.localeCompare(b.name));
            return items;
        }

        function openFolderInDefaultManager(dir, fallbackTitle, idPrefix) {
            if (root.dataset.desktopfilesEnabled === 'true') {
                const url = OC.generateUrl('/apps/desktop_workspace/files') + '?desktop=1&dir=' + encodeURIComponent(dir);
                const icon = (OC.imagePath && OC.imagePath('desktop_workspace', 'files.svg')) || '/apps/desktop_workspace/img/files.svg';
                openExternalWindow({ appId: `${idPrefix}-${Date.now()}`, title: t('Desktop Files'), subtitle: dir, href: url, icon });
            } else {
                const url = OC.generateUrl('/apps/files/') + '?dir=' + encodeURIComponent(dir);
                openExternalWindow({ appId: `${idPrefix}-${Date.now()}`, title: t('Files'), subtitle: dir, href: url, icon: '/core/img/logo/logo.svg' });
            }
        }

        function openFavorite(el) {
            if (el.dataset.kind === 'app') {
                const app = appFromKey(el.dataset.appKey);
                if (app) launchApp(app);
                return;
            }
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
                // Media opens in our fullscreen viewer page; everything Nextcloud opens in an editor
                // (text/markdown/html/code via the Text editor, office docs, …) goes through the Files
                // app deep link, where the native viewer/editor and its own header work correctly.
                const absPath = '/' + path.replace(/^\/+/, ''); // viewer needs an absolute path, like Desktop Files passes
                const href = desktopFileViewerHref(fileId, name, absPath, mime);
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
            if (/[\\/]/.test(next)) {  return; }
            const parent = oldPath.split('/').slice(0, -1).join('/');
            const dest = (parent ? parent + '/' : '') + next;
            try { await davMove(oldPath, dest); favoritesReload(); }
            catch (e) {  }
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
                catch (e) {  }
            }
            if (cb.mode === 'cut') { clearSharedClipboard(); clipboard = null; }
            favoritesReload();
        }
        async function toggleFavorites(items) {
            const targets = items.filter((el) => el.dataset.kind === 'file' && el.dataset.path);
            if (!targets.length) return;
            const on = !targets.some((el) => el.dataset.favorited === 'true');
            for (const el of targets) { try { await setFavorite(el.dataset.path, on); } catch (e) {  } } // eslint-disable-line no-await-in-loop
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
                } catch (e) {  }
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
            if (el.dataset.kind === 'app') {
                entries.push(['desktop-remove', t('Remove from desktop')]);
                buildMenu(entries, x, y).addEventListener('click', (ev) => {
                    const b = ev.target.closest('button'); if (!b) return;
                    const act = b.dataset.act; closeFavMenu();
                    if (act === 'open') openFavorite(el);
                    else if (act === 'desktop-remove') {
                        const app = appFromKey(el.dataset.appKey);
                        if (app) setAppPinned(app, 'desktop', false);
                    }
                });
                return;
            }
            if (el.dataset.kind === 'file') {
                const files = selected.filter((i) => i.dataset.kind === 'file' && i.dataset.path);
                if (el.dataset.folder !== 'true') entries.push(['download', t('Download')]);
                if (files.length === 1) entries.push(['rename', t('Rename')]);
                if (files.length === 1) entries.push(['properties', t('Properties')]);
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
                    else if (act === 'properties') openProperties(el);
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
                if (favs.length === 1) entries.push(['properties', t('Properties')]);
                buildMenu(entries, x, y).addEventListener('click', (ev) => {
                    const b = ev.target.closest('button'); if (!b) return;
                    const act = b.dataset.act; closeFavMenu();
                    if (act === 'open') openFavorite(el);
                    else if (act === 'remove') confirmRemove(favs);
                    else if (act === 'properties') openProperties(el);
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
                        try { filesFrame.contentWindow.postMessage({ type: 'nextcloud-desktop:files-drop', paths: files.map((g) => g.dataset.path) }, window.location.origin); } catch (err) {  }
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
            } catch (e) {  }
        }

        stage.addEventListener('contextmenu', (e) => {
            if (e.target !== stage && e.target !== layer) return;
            e.preventDefault();
            const entries = [];
            if (desktopFolder) entries.push(['newfolder', t('New folder')]);
            if (dfEnabled && desktopFolder && readSharedClipboard()) entries.push(['paste', t('Paste')]);
            entries.push(['settings', dt('Desktop Settings')]);
            if (isAdminUser()) entries.push(['adminsettings', dt('Desktop Admin Settings')]);
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
        function makeUploadOverlay({ blocked = false } = {}) {
            const el = document.createElement('div');
            el.className = blocked ? 'desktop-upload-overlay desktop-upload-overlay-blocked' : 'desktop-upload-overlay';
            el.innerHTML = blocked
                ? `<div class="desktop-upload-card desktop-upload-card-blocked"><div class="desktop-upload-text">${escapeHtml(t('Set a desktop folder to enable drag and drop uploads.'))}</div></div>`
                : '<div class="desktop-upload-card"><div class="desktop-upload-text"></div><div class="desktop-upload-bar"><div class="desktop-upload-fill"></div></div></div>';
            stage.appendChild(el);
            const text = el.querySelector('.desktop-upload-text');
            const fill = el.querySelector('.desktop-upload-fill');
            return {
                update(idx, total, name, pct) { if (fill) { text.textContent = t('Uploading {index}/{total}: {name} ({pct}%)', { index: idx, total, name, pct }); fill.style.width = `${pct}%`; } },
                remove() { el.remove(); },
            };
        }
        function isExternalFileDrag(dataTransfer) {
            if (!dataTransfer) return false;
            const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
            // Real browser drops often expose only the protected "Files" type until the final drop.
            if (types.includes('files') || types.includes('application/x-moz-file')) return true;
            if (dataTransfer.files && dataTransfer.files.length) return true;
            return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
        }
        function dropIsInsideDesktop(event) {
            return !!(event.target && root.contains(event.target));
        }
        let noDesktopFolderDropOverlay = null;
        function showNoDesktopFolderDropHint() {
            layer.classList.add('desktop-drop-active', 'desktop-drop-disabled');
            if (!noDesktopFolderDropOverlay) noDesktopFolderDropOverlay = makeUploadOverlay({ blocked: true });
        }
        function hideNoDesktopFolderDropHint() {
            layer.classList.remove('desktop-drop-disabled');
            if (noDesktopFolderDropOverlay) {
                noDesktopFolderDropOverlay.remove();
                noDesktopFolderDropOverlay = null;
            }
        }
        function handleNoDesktopFolderFileDrop(event) {
            if (desktopFolder || !isExternalFileDrag(event.dataTransfer) || !dropIsInsideDesktop(event)) return false;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            hideNoDesktopFolderDropHint();
            return true;
        }
        async function uploadFilesToDesktop(fileList) {
            const files = Array.from(fileList || []);
            if (!files.length || !desktopFolder) return;
            const targetDir = desktopFolder.replace(/^\/+|\/+$/g, '');
            const overlay = makeUploadOverlay();
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try { await putWithProgress(davUrl(`${targetDir}/${file.name}`), file, (pct) => overlay.update(i + 1, files.length, file.name, pct)); } // eslint-disable-line no-await-in-loop
                catch (e) {  }
            }
            overlay.remove();
            favoritesReload();
            broadcastFilesReload();
        }
        const handleDesktopDragOver = (e) => {
            if (!e.dataTransfer || !dropIsInsideDesktop(e)) return;
            const isFiles = isExternalFileDrag(e.dataTransfer);
            if (!isFiles && !desktopFolder) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = desktopFolder ? (isFiles ? 'copy' : 'move') : 'none';
            if (desktopFolder) {
                hideNoDesktopFolderDropHint();
                layer.classList.add('desktop-drop-active');
            } else if (isFiles) {
                showNoDesktopFolderDropHint();
            }
        };
        root.addEventListener('dragover', handleDesktopDragOver, true);
        stage.addEventListener('dragover', handleDesktopDragOver);
        stage.addEventListener('dragleave', (e) => {
            if (e.target === stage) {
                layer.classList.remove('desktop-drop-active');
                hideNoDesktopFolderDropHint();
            }
        });
        const handleDesktopDrop = async (e) => {
            layer.classList.remove('desktop-drop-active');
            if (handleNoDesktopFolderFileDrop(e)) return;
            hideNoDesktopFolderDropHint();
            const hasComputerFiles = isExternalFileDrag(e.dataTransfer);
            if (hasComputerFiles) {
                e.preventDefault();
                e.stopPropagation();
                uploadFilesToDesktop(e.dataTransfer.files);
                return;
            }
            if (!desktopFolder || !dfEnabled) return; // cross-window moves only when the file manager is enabled
            const targetDir = desktopFolder.replace(/^\/+|\/+$/g, '');
            const raw = (e.dataTransfer && e.dataTransfer.getData('text/plain') || '').trim();
            if (!raw) return;
            e.preventDefault();
            const paths = raw.split('\n').map((s) => s.trim()).filter(Boolean);
            for (const p of paths) {
                const name = p.split('/').pop();
                const parent = p.split('/').slice(0, -1).join('/').replace(/^\/+/, '');
                if (parent === targetDir) continue; // already in the desktop folder
                try { await davMove(p, `${targetDir}/${name}`); } // eslint-disable-line no-await-in-loop
                catch (err) {  }
            }
            favoritesReload();
            broadcastFilesReload();
        };
        root.addEventListener('drop', handleDesktopDrop, true);
        stage.addEventListener('drop', handleDesktopDrop);

        // Desktop icons are moved with pointer events only — they never use native HTML5 drag.
        // Cancel any native drag that tries to start inside the icon layer (e.g. a fast mouse flick
        // grabbing a preview image), which otherwise triggers the drop frame and stray file moves.
        layer.addEventListener('dragstart', (e) => e.preventDefault());

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
            const cols = colsAvail();
            const overflow = [];
            icons.forEach((el) => {
                const saved = positions[el.dataset.fileId];
                if (saved && saved.col >= 0 && saved.row >= 0) {
                    const targetCol = Math.min(saved.col, cols - 1);
                    const targetRow = Math.min(saved.row, rows - 1);
                    const target = nearestFreeCell(targetCol, targetRow, el.dataset.fileId);
                    if (isFree(target.col, target.row, el.dataset.fileId)) {
                        placeIcon(el, target.col, target.row);
                        return;
                    }
                }
                overflow.push(el);
            });
            overflow.forEach((el) => {
                const saved = positions[el.dataset.fileId];
                const target = saved ? nearestFreeCell(saved.col, saved.row, el.dataset.fileId) : nextFreeCell();
                placeIcon(el, target.col, target.row);
            });
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
            const addDesktopPinnedApps = () => {
                (readAppPins().desktop || []).map(appFromKey).filter(Boolean).forEach((app) => add({
                    id: `app-${appKey(app)}`,
                    appKey: appKey(app),
                    kind: 'app',
                    name: app.name,
                    icon: app.icon,
                    isFolder: false,
                }));
            };
            if (root.dataset.showHome === 'true') add(homeItem()); // Home takes the first cell
            addDesktopPinnedApps();
            if (desktopFolder) {
                // Show the chosen desktop folder's contents AND favorites together.
                // Favorites that already appear as folder contents are not added twice.
                let folderItems = [];
                try { folderItems = await fetchDesktopFolder(desktopFolder); }
                catch (e) {  }
                folderItems.forEach(add);
                if (showFav) {
                    try {
                        const seen = new Set(folderItems.map((it) => it.fileId || it.path));
                        (await fetchFavorites())
                            .filter((it) => !seen.has(it.fileId || it.path))
                            .forEach(add);
                    } catch (e) {  }
                }
            } else if (showFav) {
                try { (await fetchFavorites()).forEach(add); }
                catch (e) {  }
            }
            if (root.dataset.showTrash === 'true') add(trashItem()); // right after the favorites
            layout();

        }
        favoritesReload = renderAll;
        refreshDesktopPinnedApps = () => {
            layer.querySelectorAll('.desktop-fav[data-kind="app"][data-app-key]').forEach((el) => {
                const app = appFromKey(el.dataset.appKey);
                if (!app) return;
                el.dataset.name = app.name;
                const label = el.querySelector('.desktop-fav-label');
                if (label) label.textContent = app.name;
                const img = el.querySelector('.desktop-app-shortcut-circle img');
                if (img && app.icon && img.getAttribute('src') !== app.icon) img.setAttribute('src', app.icon);
            });
        };
        applyIconSettings = (s) => {
            if ('showFavorites' in s) { showFav = !!s.showFavorites; root.dataset.showFavorites = showFav ? 'true' : 'false'; }
            if ('desktopFolder' in s) { desktopFolder = (s.desktopFolder || '').trim(); root.dataset.desktopFolder = desktopFolder; }
            if ('desktopfilesEnabled' in s) { dfEnabled = !!s.desktopfilesEnabled; root.dataset.desktopfilesEnabled = dfEnabled ? 'true' : 'false'; renderLauncher(); renderPinnedApps(); }
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
