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
     data-path="<?= p($_['path']) ?>">
    <div class="desktop-file-viewer-launching">
        <strong><?= p($_['name']) ?></strong>
        <p>Opening with the native Nextcloud viewer…</p>
        <button type="button" data-close>Close</button>
    </div>
</div>
