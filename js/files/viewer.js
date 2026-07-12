(() => {
    'use strict';

    const root = document.querySelector('[data-desktop-file-viewer]');
    if (!root) return;

    const launcher = root.querySelector('.desktop-file-viewer-launching');
    const fileId = root.dataset.fileId || '';
    const name = root.dataset.name || 'File';
    const path = root.dataset.path || '/';
    const mime = root.dataset.mime || 'application/octet-stream';
    const uid = root.dataset.userId || window.OC?.getCurrentUser?.()?.uid || '';
    const appId = `file-${fileId || btoa(path).replace(/=+$/g, '')}`;
    const mimeIcon = () => (window.OC?.MimeType?.getIconUrl ? OC.MimeType.getIconUrl(mime || 'application/octet-stream') : '');

    function post(message) {
        window.parent?.postMessage(message, window.location.origin);
    }

    let nativeViewerClosing = false;

    function closeNativeViewer() {
        if (nativeViewerClosing) return;
        nativeViewerClosing = true;
        try {
            if (window.OCA?.Viewer && typeof OCA.Viewer.close === 'function') {
                OCA.Viewer.close();
            }
        } catch (error) {
            // If the native viewer cleanup fails, still let the shell remove the window.
            console.warn('Failed to close native viewer before desktop window removal', error);
        }
    }

    function closeWindow() {
        closeNativeViewer();
        post({ type: 'nextcloud-desktop:close-window', appId });
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'nextcloud-desktop:prepare-close') {
            closeNativeViewer();
        }
    });

    function hideLauncher() {
        root.classList.add('is-native-open');
        if (launcher) {
            launcher.hidden = true;
            launcher.style.setProperty('display', 'none', 'important');
        }
    }

    function showError(message) {
        root.classList.remove('is-native-open');
        if (launcher) {
            launcher.hidden = false;
            launcher.style.removeProperty('display');
            const text = launcher.querySelector('p');
            if (text) text.textContent = message;
        }
    }

    function normalizeNativeLayout() {
        const viewer = document.getElementById('viewer');
        if (!viewer) return;
        viewer.style.setProperty('position', 'absolute', 'important');
        viewer.style.setProperty('inset', '0', 'important');
        viewer.style.setProperty('width', '100%', 'important');
        viewer.style.setProperty('height', '100%', 'important');

        const hasVideoPlayer = document.querySelector('#viewer .plyr, #viewer video, .plyr, video');
        if (hasVideoPlayer) {
            document.querySelectorAll('#viewer .viewer__file, #viewer .viewer__file--active').forEach((element) => {
                element.style.setProperty('width', '100%', 'important');
                element.style.setProperty('height', '100%', 'important');
                element.style.setProperty('min-height', '0', 'important');
                element.style.setProperty('display', 'flex', 'important');
                element.style.setProperty('align-items', 'center', 'important');
                element.style.setProperty('justify-content', 'center', 'important');
            });
        }

        document.querySelectorAll('#viewer .plyr, #viewer .plyr__video-wrapper, .plyr, .plyr__video-wrapper').forEach((element) => {
            element.style.setProperty('width', '100%', 'important');
            element.style.setProperty('height', '100%', 'important');
            element.style.setProperty('max-width', '100%', 'important');
            element.style.setProperty('max-height', '100%', 'important');
        });

        document.querySelectorAll('#viewer video, video').forEach((video) => {
            video.style.setProperty('width', '100%', 'important');
            video.style.setProperty('height', '100%', 'important');
            video.style.setProperty('max-width', '100%', 'important');
            video.style.setProperty('max-height', '100%', 'important');
            video.style.setProperty('object-fit', 'contain', 'important');
        });
    }

    function nativeContentMounted() {
        const viewer = document.getElementById('viewer');
        const viewerHasContent = !!viewer && viewer.children.length > 0 && viewer.textContent.trim() !== '' || !!viewer?.querySelector('img,video,audio,iframe,canvas,.viewer__file,.image_container,.video_container,.audio_container');
        const textMounted = !!document.querySelector('.ProseMirror, [contenteditable="true"], .text-editor, .document-content, [aria-label="Editor actions"]');
        const pdfMounted = !!document.querySelector('iframe[src*="files_pdfviewer"], iframe[src*="pdf"], .pdfViewer, #viewerContainer');
        return viewerHasContent || textMounted || pdfMounted;
    }

    function watchNativeMount() {
        let ticks = 0;
        const timer = window.setInterval(() => {
            ticks += 1;
            if (nativeContentMounted()) {
                normalizeNativeLayout();
                hideLauncher();
                window.clearInterval(timer);
            } else if (ticks > 80) {
                window.clearInterval(timer);
            }
        }, 100);

        const observer = new MutationObserver(() => {
            if (nativeContentMounted()) {
                normalizeNativeLayout();
                hideLauncher();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 10000);
    }

    root.querySelector('[data-close]')?.addEventListener('click', closeWindow);

    post({
        type: 'nextcloud-desktop:window-meta',
        appId,
        title: name,
        subtitle: path,
        icon: mimeIcon(),
    });

    function imageDavUrl(filePath) {
        const clean = `/${String(filePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
        return `/remote.php/dav/files/${encodeURIComponent(uid)}${clean}`;
    }

    function parentPath(filePath) {
        const parts = String(filePath || '/').split('/').filter(Boolean);
        parts.pop();
        return `/${parts.join('/')}` || '/';
    }

    async function supportedFolderImages() {
        const folder = parentPath(path);
        const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontenttype/><d:resourcetype/></d:prop></d:propfind>';
        const response = await fetch(imageDavUrl(folder), {
            method: 'PROPFIND',
            credentials: 'same-origin',
            headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', ...(window.OC?.requestToken ? { requesttoken: OC.requestToken } : {}) },
            body,
        });
        if (!response.ok) throw new Error(`Could not list image folder: HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        const candidates = Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).map((node) => {
            const fileName = node.getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent || '';
            const type = node.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
            return { name: fileName, path: `${folder === '/' ? '' : folder}/${fileName}`, type };
        }).filter((item) => item.name && item.type.startsWith('image/') && !item.path.endsWith('/'));
        candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const checks = await Promise.all(candidates.map((item) => new Promise((resolve) => {
            const probe = new Image();
            probe.onload = () => resolve(item);
            probe.onerror = () => resolve(null);
            probe.src = imageDavUrl(item.path);
        })));
        return checks.filter(Boolean);
    }

    async function openImageViewer() {
        const viewer = root.querySelector('[data-image-viewer]');
        const stage = root.querySelector('[data-image-stage]');
        const image = root.querySelector('[data-image]');
        const previous = root.querySelector('[data-image-previous]');
        const next = root.querySelector('[data-image-next]');
        const fullscreen = root.querySelector('[data-image-fullscreen]');
        let images = [{ name, path, type: mime }];
        let index = 0;
        let zoom = 1;
        let fitScale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let drag = null;

        function renderTransform() {
            const scale = fitScale * zoom;
            image.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
            const pannable = image.naturalWidth * scale > stage.clientWidth || image.naturalHeight * scale > stage.clientHeight;
            stage.classList.toggle('is-pannable', pannable);
        }
        function fit() {
            fitScale = Math.min(1, stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
            zoom = 1;
            offsetX = 0;
            offsetY = 0;
            renderTransform();
        }
        function originalSize() {
            fitScale = 1;
            zoom = 1;
            offsetX = 0;
            offsetY = 0;
            renderTransform();
        }
        function show(newIndex) {
            index = newIndex;
            const item = images[index];
            image.onload = fit;
            image.src = imageDavUrl(item.path);
            image.alt = item.name;
            previous.disabled = index === 0;
            next.disabled = index === images.length - 1;
            post({ type: 'nextcloud-desktop:window-meta', appId, title: item.name, subtitle: item.path, icon: mimeIcon() });
        }

        hideLauncher();
        viewer.hidden = false;
        try {
            images = await supportedFolderImages();
            index = Math.max(0, images.findIndex((item) => item.path === path));
            if (!images.length) images = [{ name, path, type: mime }];
        } catch (error) {
            console.warn(error);
        }
        show(index);
        previous.addEventListener('click', () => index > 0 && show(index - 1));
        next.addEventListener('click', () => index < images.length - 1 && show(index + 1));
        fullscreen.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : viewer.requestFullscreen());
        stage.addEventListener('wheel', (event) => {
            event.preventDefault();
            zoom = Math.min(12, Math.max(.1, zoom * (event.deltaY < 0 ? 1.12 : .89)));
            renderTransform();
        }, { passive: false });
        stage.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !stage.classList.contains('is-pannable')) return;
            drag = { x: event.clientX, y: event.clientY, offsetX, offsetY };
            stage.setPointerCapture(event.pointerId);
            stage.classList.add('is-panning');
        });
        stage.addEventListener('pointermove', (event) => {
            if (!drag) return;
            offsetX = drag.offsetX + event.clientX - drag.x;
            offsetY = drag.offsetY + event.clientY - drag.y;
            renderTransform();
        });
        const stopDrag = () => { drag = null; stage.classList.remove('is-panning'); };
        stage.addEventListener('pointerup', stopDrag);
        stage.addEventListener('pointercancel', stopDrag);
        window.addEventListener('keydown', (event) => {
            if (event.key === '1') originalSize();
            else if (event.key.toLowerCase() === 'f') fit();
            else if (event.key === 'ArrowLeft' && index > 0) show(index - 1);
            else if (event.key === 'ArrowRight' && index < images.length - 1) show(index + 1);
        });
        window.addEventListener('resize', fit);
    }

    function openNativeViewer() {
        if (!window.OCA?.Viewer?.open) {
            showError('The native Nextcloud viewer did not load on this route.');
            return;
        }

        if (typeof OCA.Viewer.setRootElement === 'function') {
            OCA.Viewer.setRootElement(document.body);
        }

        watchNativeMount();

        OCA.Viewer.open({
            path,
            list: [path],
            enableSidebar: true,
            canLoop: false,
            onClose: closeWindow,
        });

        // Some handlers mount synchronously, and some mount on the next tick.
        requestAnimationFrame(() => {
            if (nativeContentMounted()) {
                normalizeNativeLayout();
                hideLauncher();
            }
        });
        [250, 750, 1500, 3000, 5000].forEach((delay) => {
            window.setTimeout(normalizeNativeLayout, delay);
        });
    }

    const isImage = mime.startsWith('image/') || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name);
    requestAnimationFrame(() => setTimeout(isImage ? openImageViewer : openNativeViewer, 0));
})();
