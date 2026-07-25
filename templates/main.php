<?php
\OCP\Util::addTranslations('desktop_workspace');
script('desktop_workspace', 'desktop-shell-0170f');
style('desktop_workspace', 'desktop');
style('desktop_workspace', 'decorations-release');
style('desktop_workspace', 'retro-decoration');
style('desktop_workspace', 'icon-appearance-0170');
style('desktop_workspace', 'selection-band-0170');
style('desktop_workspace', 'window-snap-0170b');
style('desktop_workspace', 'shell-layout-0170g');
style('desktop_workspace', 'window-shell-fixes-0160b');
style('desktop_workspace', 'motion-release');
/** @var array $_ */
$l = \OC::$server->getL10N('desktop_workspace');
$apps = $_['apps'] ?? [];
$desktopfilesEnabled = !empty($_['desktopfilesEnabled']);
$desktopVersion = \OCP\Server::get(\OCP\App\IAppManager::class)->getAppVersion('desktop_workspace');
try {
    $ncVersion = \OCP\Server::get(\OCP\ServerVersion::class)->getVersionString();
} catch (\Throwable $e) {
    $ncVersion = \OCP\Server::get(\OCP\IConfig::class)->getSystemValueString('version', '');
}
?>
<div id="desktop-root" data-desktop-app-root data-decoration="<?= p(in_array(($_['decoration'] ?? 'standard'), ['redmond', 'retro'], true) ? $_['decoration'] : 'standard') ?>" data-decoration-color="<?= p($_['decorationColor'] ?? 'nextcloud') ?>" data-icon-decoration="<?= p($_['iconDecoration'] ?? 'standard') ?>" data-icon-decoration-linked="<?= !empty($_['iconDecorationLinked']) ? 'true' : 'false' ?>" data-icon-color="<?= p($_['iconColor'] ?? 'nextcloud') ?>" data-window-controls-side="<?= ($_['windowControlsSide'] ?? 'right') === 'left' ? 'left' : 'right' ?>" data-shell-mode="<?= ($_['shellMode'] ?? 'taskbar') === 'dock' ? 'dock' : 'taskbar' ?>" data-desktopfiles-enabled="<?= $desktopfilesEnabled ? 'true' : 'false' ?>" data-show-favorites="<?= !empty($_['showFavorites']) ? 'true' : 'false' ?>" data-favorites-no-confirm="<?= !empty($_['favoritesNoConfirm']) ? 'true' : 'false' ?>" data-show-trash="<?= !empty($_['showTrash']) ? 'true' : 'false' ?>" data-show-home="<?= !empty($_['showHome']) ? 'true' : 'false' ?>" data-desktop-folder="<?= p($_['desktopFolder'] ?? '') ?>" data-trash-no-confirm="<?= !empty($_['trashNoConfirm']) ? 'true' : 'false' ?>" data-personal-save-url="<?= p($_['personalSaveUrl'] ?? '') ?>" data-heartbeat-url="<?= p($_['heartbeatUrl'] ?? '') ?>" data-dynamic-data-url="<?= p($_['dynamicDataUrl'] ?? '') ?>" data-icon-positions="<?= p($_['iconPositions'] ?? '{}') ?>" data-icon-save-url="<?= p($_['iconSaveUrl'] ?? '') ?>" data-window-states="<?= p($_['windowStates'] ?? '{"windows":[]}') ?>" data-window-save-url="<?= p($_['windowSaveUrl'] ?? '') ?>" data-first-visit="<?= !empty($_['firstVisit']) ? 'true' : 'false' ?>" data-apps="<?= p(json_encode($apps, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT)) ?>">
    <main id="desktop-stage" class="desktop-stage" aria-label="<?= p($l->t('Desktop workspace')) ?>">
        <div id="desktop-favorites" class="desktop-favorites" aria-label="<?= p($l->t('Desktop favorites')) ?>" hidden></div>
        <div class="desktop-wallpaper-credit" aria-hidden="true">
            <span>Desktop by canisdata.de</span>
            <span><?= p($l->t('Version %s', [$desktopVersion])) ?></span>
            <span><?= p($l->t('Nextcloud Version %s', [$ncVersion])) ?></span>
        </div>
    </main>

    <section id="desktop-start-menu" class="desktop-start-menu" aria-label="<?= p($l->t('Applications')) ?>" hidden>
        <div class="desktop-start-header">
            <div>
                <strong><?= p($l->t('Apps')) ?></strong>
            </div>
            <button id="desktop-unified-search" class="desktop-unified-search" type="button" aria-label="<?= p($l->t('Search')) ?>">
                <span aria-hidden="true">⌕</span><span><?= p($l->t('Search')) ?></span>
            </button>
            <button id="desktop-settings-button" class="desktop-settings-button" type="button" title="<?= p($l->t('Desktop Settings')) ?>" aria-label="<?= p($l->t('Desktop Settings')) ?>" data-settings-url="<?= p($_['settingsUrl']) ?>">&#x2699;&#xFE0E;</button>
        </div>
        <div id="desktop-launcher" class="desktop-launcher" role="list"></div>
    </section>

    <div id="desktop-topbar" class="desktop-topbar">
        <div id="desktop-shell-utilities" class="desktop-shell-utilities">
            <button id="desktop-fullscreen" class="taskbar-button taskbar-fullscreen" type="button" title="<?= p($l->t('Toggle fullscreen')) ?>" aria-label="<?= p($l->t('Toggle fullscreen')) ?>">&#x26F6;&#xFE0E;</button>
            <span class="desktop-shell-utility-spacer" aria-hidden="true"></span>
            <div id="desktop-header-end-slot" class="desktop-header-end-slot" aria-label="<?= p($l->t('Nextcloud controls')) ?>"></div>
            <time id="desktop-clock" class="desktop-clock"></time>
            <a id="desktop-nextcloud-logo" class="desktop-nextcloud-logo" href="<?= p($_['filesUrl']) ?>" target="_blank" rel="noopener" title="<?= p($l->t('Open Nextcloud Files in a new tab')) ?>" aria-label="<?= p($l->t('Open Nextcloud Files in a new tab')) ?>"><span class="logo logo-icon" aria-hidden="true"></span></a>
        </div>
    </div>

    <button id="desktop-dock-reveal" class="desktop-dock-reveal" type="button" aria-label="<?php p($l->t('Dock')); ?>"><span aria-hidden="true"></span></button>

    <footer class="desktop-taskbar" aria-label="<?= p($l->t('Taskbar')) ?>">
        <button id="desktop-start" class="taskbar-button taskbar-start" type="button" aria-controls="desktop-start-menu" aria-expanded="false"><span class="desktop-start-label"><?= p($l->t('Apps')) ?></span><span class="desktop-waffle" aria-hidden="true"><?php for ($i = 0; $i < 9; $i++): ?><i></i><?php endfor; ?></span></button>
        <span class="desktop-taskbar-divider" aria-hidden="true"></span>
        <div id="desktop-pinned-apps" class="desktop-pinned-apps" aria-label="<?= p($l->t('Pinned apps')) ?>"></div>
        <span class="desktop-taskbar-divider" aria-hidden="true"></span>
        <div id="desktop-task-list" class="desktop-task-list" aria-label="<?= p($l->t('Open windows')) ?>"></div>
    </footer>
</div>
