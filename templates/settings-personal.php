<?php
\OCP\Util::addTranslations('desktop_workspace');
script('desktop_workspace', 'personal');
style('desktop_workspace', 'admin');
/** @var array $_ */
$l = \OC::$server->getL10N('desktop_workspace');
?>
<div id="desktop-personal-settings" class="section"
     data-save-url="<?= p($_['saveUrl']) ?>"
     data-reset-all-url="<?= p($_['resetAllUrl']) ?>">
    <h2><?= p($l->t('Desktop')) ?></h2>

    <h3><?= p($l->t('Desktop icons')) ?></h3>
    <p>
        <input type="checkbox" id="desktop-show-favorites" class="checkbox" <?= $_['showFavorites'] ? 'checked' : '' ?> />
        <label for="desktop-show-favorites"><?= p($l->t('Show Favorites on Desktop')) ?></label>
    </p>
    <p class="settings-hint"><?= p($l->t('Favorites are always marked with a star. When a desktop folder is set, the desktop shows both the folder’s contents and your favorites; an item that is both appears only once.')) ?></p>
    <p>
        <input type="checkbox" id="desktop-show-trash" class="checkbox" <?= $_['showTrash'] ? 'checked' : '' ?> />
        <label for="desktop-show-trash"><?= p($l->t('Show Recycling Bin')) ?></label>
    </p>
    <p>
        <input type="checkbox" id="desktop-show-home" class="checkbox" <?= $_['showHome'] ? 'checked' : '' ?> />
        <label for="desktop-show-home"><?= p($l->t('Show Home Folder')) ?></label>
    </p>
    <p>
        <input type="checkbox" id="desktop-favorites-no-confirm" class="checkbox" <?= $_['favoritesNoConfirm'] ? 'checked' : '' ?> />
        <label for="desktop-favorites-no-confirm"><?= p($l->t('Don’t ask for confirmation before removing a favorite')) ?></label>
    </p>
    <p>
        <input type="checkbox" id="desktop-trash-no-confirm" class="checkbox" <?= $_['trashNoConfirm'] ? 'checked' : '' ?> />
        <label for="desktop-trash-no-confirm"><?= p($l->t('Don’t ask for confirmation before moving an item to deleted files')) ?></label>
    </p>

    <h3><?= p($l->t('Desktop folder')) ?></h3>
    <p class="settings-hint"><?= p($l->t('Pick a folder to show its contents on the desktop. Choose the top-level Files folder to use your account root, or leave empty to show favorites instead.')) ?></p>
    <p>
        <input type="text" id="desktop-folder-path" readonly value="<?= p($_['desktopFolder'] ?? '') ?>" placeholder="<?= p($l->t('No desktop folder selected')) ?>" style="min-width:240px;max-width:420px;" />
        <button id="desktop-folder-pick" type="button"><?= p($l->t('Choose folder…')) ?></button>
        <button id="desktop-folder-clear" type="button"><?= p($l->t('Clear')) ?></button>
    </p>

    <h3><?= p($l->t('Wallpaper')) ?></h3>
    <p class="settings-hint"><?= p($l->t('The desktop wallpaper follows your Nextcloud appearance settings.')) ?></p>
    <p>
        <a class="button" href="<?= p($_['themingUrl']) ?>"><?= p($l->t('Change wallpaper')) ?></a>
    </p>

    <?php if ($_['available']): ?>
        <h3><?= p($l->t('Experimental')) ?></h3>
    <?php endif; ?>
    <?php if ($_['available']): ?>
        <p class="settings-hint"><?= p($l->t('By default, Nextcloud Files is your file manager. You can try the experimental Desktop File Manager that opens inside the desktop environment.')) ?></p>
        <p>
            <input type="checkbox" id="desktop-try-experimental" class="checkbox" <?= $_['tryExperimentalFiles'] ? 'checked' : '' ?> />
            <label for="desktop-try-experimental"><?= p($l->t('Try out Desktop File Manager - Experimental')) ?></label>
        </p>
    <?php endif; ?>


    <h3><?= p($l->t('Reset')) ?></h3>
    <p class="settings-hint"><?= p($l->t('Desktop icon positions and open windows are saved to your account and follow you to other devices.')) ?></p>
    <p>
        <button id="desktop-reset-icons" type="button" data-reset-url="<?= p($_['resetIconsUrl']) ?>"><?= p($l->t('Reset desktop icon positions')) ?></button>
        <button id="desktop-reset-windows" type="button" data-reset-url="<?= p($_['resetWindowsUrl']) ?>"><?= p($l->t('Reset open windows')) ?></button>
        <span id="desktop-reset-status" class="desktop-admin-status" aria-live="polite"></span>
    </p>
    <p class="settings-hint" style="margin-top:12px;"><?= p($l->t('A full reset clears every desktop setting, as if you had never opened the desktop.')) ?></p>
    <p>
        <button id="desktop-reset-all" type="button" class="error"><?= p($l->t('Reset all desktop settings')) ?></button>
        <span id="desktop-reset-all-status" class="desktop-admin-status" aria-live="polite"></span>
    </p>

    <p class="settings-hint" style="margin-top:16px;"><?= p($l->t('Changes are applied immediately.')) ?> <span id="desktop-save-status" class="desktop-admin-status" aria-live="polite"></span></p>
    <p class="settings-hint"><?= p($l->t('All translations are machine translations.')) ?></p>
</div>
