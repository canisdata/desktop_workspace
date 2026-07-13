<?php
\OCP\Util::addTranslations('desktop_workspace');
script('desktop_workspace', 'files/files-0160');
style('desktop_workspace', 'files/files');
/** @var array $_ */
$l = \OC::$server->getL10N('desktop_workspace');
?>
<div id="desktop-files-root"
     data-desktop-files-root
     data-user-id="<?= p($_['userId']) ?>"
     data-desktop-launch="<?= $_['isDesktopLaunch'] ? 'true' : 'false' ?>">
    <?php if (!$_['isDesktopLaunch']): ?>
        <section class="desktop-files-standalone-block">
            <h1><?= p($l->t('Desktop Files')) ?></h1>
            <p><?= p($l->t('This file manager is part of the desktop environment and is intended to be opened from the apps menu.')) ?></p>
            <p><a class="button primary" href="<?= p($_['desktopUrl']) ?>"><?= p($l->t('Open Desktop Workspace')) ?></a></p>
        </section>
    <?php else: ?>
        <!-- Toolbar grid mirrors the main columns: "Tree View" over the tree, the rest over the folder content. -->
        <header class="desktop-files-toolbar">
            <span class="desktop-files-col-label desktop-files-col-tree"><?= p($l->t('Tree View')) ?></span>
            <div class="desktop-files-toolbar-main">
                <span class="desktop-files-col-label"><?= p($l->t('Folder content')) ?></span>
                <div class="desktop-files-new" data-new-wrap>
                    <button type="button" data-action="new-menu" class="desktop-files-clip-button desktop-files-new-button" aria-haspopup="true" aria-expanded="false">&#xFF0B; <?= p($l->t('New')) ?></button>
                    <div class="desktop-files-new-menu" data-new-menu hidden role="menu">
                        <button type="button" role="menuitem" data-new="folder"><?= p($l->t('New folder')) ?></button>
                        <button type="button" role="menuitem" data-new="textfile"><?= p($l->t('New text file')) ?></button>
                        <button type="button" role="menuitem" data-new="upload"><?= p($l->t('Upload files')) ?></button>
                    </div>
                    <input type="file" data-upload-input multiple hidden>
                </div>
                <div class="desktop-files-clipboard-bar" role="toolbar" aria-label="<?= p($l->t('Clipboard')) ?>">
                    <button type="button" data-action="copy" class="desktop-files-clip-button" title="<?= p($l->t('Copy')) ?>" disabled><?= p($l->t('Copy')) ?></button>
                    <button type="button" data-action="cut" class="desktop-files-clip-button" title="<?= p($l->t('Cut')) ?>" disabled><?= p($l->t('Cut')) ?></button>
                    <button type="button" data-action="paste" class="desktop-files-clip-button" title="<?= p($l->t('Paste')) ?>" disabled><?= p($l->t('Paste')) ?></button>
                </div>
                <div class="desktop-files-actions">
                    <button type="button" data-action="up" class="desktop-files-icon-button" title="<?= p($l->t('Up')) ?>" aria-label="<?= p($l->t('Up')) ?>">&#x2B06;&#xFE0E;</button>
                    <button type="button" data-action="refresh" class="desktop-files-icon-button" title="<?= p($l->t('Refresh')) ?>" aria-label="<?= p($l->t('Refresh')) ?>">&#x21BA;</button>
                    <button type="button" data-action="open-full" class="desktop-files-icon-button" title="<?= p($l->t('Open in Files')) ?>" aria-label="<?= p($l->t('Open in Files')) ?>"><span class="desktop-files-native-icon" aria-hidden="true"></span></button>
                </div>
            </div>
        </header>

        <main class="desktop-files-main">
            <aside class="desktop-files-sidebar" aria-label="<?= p($l->t('Folders')) ?>">
                <ul id="desktop-files-tree" class="desktop-files-tree"></ul>
            </aside>
            <div class="desktop-files-resizer" data-resizer aria-hidden="true"></div>
            <section class="desktop-files-list" aria-label="<?= p($l->t('Current folder')) ?>">
                <table class="desktop-files-table" aria-label="<?= p($l->t('Files')) ?>">
                    <thead><tr><th><?= p($l->t('Name')) ?></th><th><?= p($l->t('Type')) ?></th><th><?= p($l->t('Size')) ?></th><th><?= p($l->t('Modified')) ?></th></tr></thead>
                    <tbody id="desktop-files-rows"><tr><td colspan="4"><?= p($l->t('Loading…')) ?></td></tr></tbody>
                </table>
            </section>
            <aside id="desktop-files-detail-sidebar" class="desktop-files-detail-panel" aria-label="<?= p($l->t('Details')) ?>" hidden>
            </aside>
            <nav id="desktop-files-context-menu" class="desktop-files-context-menu" hidden aria-label="<?= p($l->t('File actions')) ?>"></nav>
        </main>
    <?php endif; ?>
</div>
