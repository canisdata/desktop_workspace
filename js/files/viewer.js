(() => {
    'use strict';

    const root = document.querySelector('[data-desktop-file-viewer]');
    if (!root) return;

    const launcher = root.querySelector('.desktop-file-viewer-launching');
    const fileId = root.dataset.fileId || '';
    const name = root.dataset.name || 'File';
    const path = root.dataset.path || '/';
    const mime = root.dataset.mime || 'application/octet-stream';
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

    requestAnimationFrame(() => setTimeout(openNativeViewer, 0));
})();
