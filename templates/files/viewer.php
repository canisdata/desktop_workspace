<?php
script('desktop_workspace', 'files/viewer');
style('desktop_workspace', 'files/viewer');
/** @var array $_ */
?>
<div id="desktop-file-viewer-root"
     data-desktop-file-viewer
     data-file-id="<?= p($_['fileId']) ?>"
     data-name="<?= p($_['name']) ?>"
     data-mime="<?= p($_['mime']) ?>"
     data-path="<?= p($_['path']) ?>"
     data-user-id="<?= p($_['userId']) ?>">
    <div class="desktop-file-viewer-launching">
        <strong><?= p($_['name']) ?></strong>
        <p>Opening with the native Nextcloud viewer…</p>
        <button type="button" data-close>Close</button>
    </div>
    <div class="desktop-image-viewer" data-image-viewer hidden>
        <div class="desktop-image-stage" data-image-stage>
            <img data-image alt="<?= p($_['name']) ?>" draggable="false">
        </div>
        <button class="desktop-image-nav desktop-image-nav--previous" type="button" data-image-previous aria-label="Previous image" title="Previous image">‹</button>
        <button class="desktop-image-nav desktop-image-nav--next" type="button" data-image-next aria-label="Next image" title="Next image">›</button>
        <button class="desktop-image-fullscreen" type="button" data-image-fullscreen aria-label="Full screen" title="Full screen">⛶</button>
    </div>
</div>
