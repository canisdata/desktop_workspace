<?php
\OCP\Util::addTranslations('desktop_workspace');
script('desktop_workspace', 'files/details');
style('desktop_workspace', 'files/files');
/** @var array $_ */
$l = \OC::$server->getL10N('desktop_workspace');
?>
<div id="desktop-files-details-root"
     class="desktop-files-details-root"
     data-desktop-files-details-root
     data-user-id="<?= p($_['userId']) ?>"
     data-file-path="<?= p($_['filePath']) ?>"
     data-name="<?= p($_['name']) ?>"
     data-file-id="<?= p($_['fileId']) ?>"
     data-folder="<?= p($_['folder']) ?>"
     data-size="<?= p($_['size']) ?>"
     data-mime="<?= p($_['mime']) ?>"
     data-modified="<?= p($_['modified']) ?>">
    <aside class="desktop-files-detail-panel is-window" aria-label="File details">
        <div class="desktop-files-detail-empty">Loading details…</div>
    </aside>
</div>
