/**
 * properties-window.js — PROTOTYPE (needs in-browser verification on NC 33/34)
 *
 * Opens the *real* Nextcloud Files sidebar (share / versions / tags / details) as a floating
 * "Properties" window on the desktop, instead of docked on the right.
 *
 * How it works:
 *   1. OCA.Files.Sidebar.open(path)  -> the genuine sidebar component opens and mounts/updates
 *      its single persistent element (#app-sidebar-vue on NC with nextcloud/vue >= 2).
 *   2. We move that element into our own little window frame and restyle it (CSS) to fill it.
 *   3. On close we put the element back where it was, so it can be reused next time.
 *
 * Requirements (server side, see notes):
 *   - The Files sidebar scripts must be loaded on this page. Dispatch \OCA\Files\Event\LoadSidebar
 *     from your PageController so OCA.Files.Sidebar exists AND the share/versions/tags tabs register.
 *
 * Trigger from your code:
 *   window.DesktopProperties.open('/Documents/note.md');           // absolute path (leading slash)
 *   // or post a message from a Desktop Files iframe:
 *   parent.postMessage({ type: 'nextcloud-desktop:open-properties', path: '/Documents/note.md' }, location.origin);
 */
(() => {
    'use strict';

    const SIDEBAR_SELECTOR = '#app-sidebar-vue, #app-sidebar, aside.app-sidebar';
    let win = null;            // our floating window element
    let placeholder = null;    // marks where the sidebar element lived, so we can restore it
    let sidebarEl = null;

    function sidebarApi() {
        return (window.OCA && OCA.Files && OCA.Files.Sidebar) ? OCA.Files.Sidebar : null;
    }

    function findSidebarEl() {
        return document.querySelector(SIDEBAR_SELECTOR);
    }

    // Wait for the sidebar element to exist (it mounts on first open).
    function waitForSidebarEl(timeoutMs = 4000) {
        return new Promise((resolve) => {
            const found = findSidebarEl();
            if (found) { resolve(found); return; }
            const started = Date.now();
            const iv = setInterval(() => {
                const el = findSidebarEl();
                if (el || Date.now() - started > timeoutMs) {
                    clearInterval(iv);
                    resolve(el);
                }
            }, 60);
        });
    }

    function buildWindow(title) {
        const w = document.createElement('div');
        w.className = 'dp-window';
        w.innerHTML = `
            <div class="dp-window-titlebar">
                <span class="dp-window-title"></span>
                <button class="dp-window-close" type="button" aria-label="Close" title="Close">&times;</button>
            </div>
            <div class="dp-window-body"></div>`;
        w.querySelector('.dp-window-title').textContent = title || 'Properties';
        w.querySelector('.dp-window-close').addEventListener('click', close);
        // simple drag by the titlebar
        const bar = w.querySelector('.dp-window-titlebar');
        let drag = null;
        bar.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            drag = { x: e.clientX, y: e.clientY, left: w.offsetLeft, top: w.offsetTop };
            bar.setPointerCapture(e.pointerId);
        });
        bar.addEventListener('pointermove', (e) => {
            if (!drag) return;
            w.style.left = `${drag.left + (e.clientX - drag.x)}px`;
            w.style.top = `${drag.top + (e.clientY - drag.y)}px`;
        });
        bar.addEventListener('pointerup', () => { drag = null; });
        document.body.appendChild(w);
        return w;
    }

    async function open(path) {
        console.info('[DesktopProperties] open()', path);
        const api = sidebarApi();
        if (!api || typeof api.open !== 'function') {
            console.warn('[DesktopProperties] OCA.Files.Sidebar is not available on this page — the Files sidebar shell did not load.');
            try {
                const scripts = Array.from(document.scripts).map((s) => s.src).filter((s) => /\/(files|files_sharing|files_versions|comments|systemtags|activity)\/js\//.test(s));
                console.warn('[DesktopProperties] files-related scripts currently on the page:', scripts.length ? scripts : '(none)');
                console.warn('[DesktopProperties] OCA.Files present:', !!(window.OCA && window.OCA.Files), '| keys:', window.OCA && window.OCA.Files ? Object.keys(window.OCA.Files) : '(no OCA.Files)');
            } catch (e) { /* ignore */ }
            return;
        }
        console.info('[DesktopProperties] OCA.Files.Sidebar found; calling open…');
        try {
            await api.open(path); // resolves after the open transition
            console.info('[DesktopProperties] Sidebar.open() resolved');
        } catch (e) {
            console.warn('[DesktopProperties] Sidebar.open() rejected (continuing to look for the element):', e);
        }

        sidebarEl = await waitForSidebarEl();
        if (!sidebarEl) {
            console.warn('[DesktopProperties] sidebar element (#app-sidebar-vue / #app-sidebar) not found after open()');
            return;
        }
        console.info('[DesktopProperties] sidebar element found, relocating into the properties window:', sidebarEl.id || sidebarEl.className);

        const fileName = path.split('/').filter(Boolean).pop() || 'Properties';

        if (!win) {
            win = buildWindow(fileName);
        } else {
            win.querySelector('.dp-window-title').textContent = fileName;
        }

        const body = win.querySelector('.dp-window-body');
        if (sidebarEl.parentElement !== body) {
            // remember original location so we can restore the node on close
            if (!placeholder) {
                placeholder = document.createComment('dp-sidebar-placeholder');
                sidebarEl.parentNode.insertBefore(placeholder, sidebarEl);
            }
            body.appendChild(sidebarEl);
            sidebarEl.classList.add('dp-sidebar-detached');
        }
    }

    function close() {
        const api = sidebarApi();
        try { if (api && typeof api.close === 'function') api.close(); } catch (e) { /* ignore */ }
        // put the sidebar element back where it came from
        if (sidebarEl && placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(sidebarEl, placeholder);
            placeholder.remove();
            placeholder = null;
            sidebarEl.classList.remove('dp-sidebar-detached');
        }
        sidebarEl = null;
        if (win) { win.remove(); win = null; }
    }

    // allow a Desktop Files iframe (or any code) to request the properties window
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (data.type === 'nextcloud-desktop:open-properties' && data.path) open(data.path);
        if (data.type === 'nextcloud-desktop:close-properties') close();
    });

    window.DesktopProperties = { open, close };
})();
