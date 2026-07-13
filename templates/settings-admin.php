<?php
\OCP\Util::addTranslations('desktop_workspace');
script('desktop_workspace', 'admin-settings');
style('desktop_workspace', 'admin-0160c');
/** @var array $_ */
$l = \OC::$server->getL10N('desktop_workspace');
?>
<div id="desktop-admin-settings" class="section" data-save-url="<?= p($_['saveUrl']) ?>" data-decoration-policy-url="<?= p($_['decorationPolicyUrl']) ?>">
    <h2><?= p($l->t('Desktop Workspace')) ?></h2>
    <p class="settings-hint"><?= p($l->t('Configure the browser-contained desktop shell.')) ?></p>

    <h3><?= p($l->t('Appearance choices')) ?></h3>
    <p>
        <input type="checkbox" id="desktop-user-decorations-enabled" class="checkbox" <?= $_['userDecorationsEnabled'] ? 'checked' : '' ?> />
        <label for="desktop-user-decorations-enabled"><?= p($l->t('Allow users to customize Desktop appearance')) ?></label>
    </p>
    <p class="settings-hint"><?= p($l->t('When disabled, Desktop uses the Standard style and follows each user’s Nextcloud appearance.')) ?></p>

    <h3><?= p($l->t('Window behavior')) ?></h3>
    <p class="settings-hint"><?= p($l->t('Usually only one window per app can be opened from the Apps menu. Here you can allow your users to open several windows of the same app. (The file managers can always be opened in multiple windows.)')) ?></p>
    <?php if (empty($_['apps'])): ?>
        <p class="settings-hint"><?= p($l->t('No apps available.')) ?></p>
    <?php else: ?>
        <div class="desktop-multiwin-grid">
            <?php foreach ($_['apps'] as $app): ?>
                <label class="desktop-multiwin-card">
                    <input type="checkbox" class="desktop-multiwin-app" value="<?= p($app['id']) ?>" <?= $app['selected'] ? 'checked' : '' ?> />
                    <?php if (!empty($app['icon'])): ?><img class="desktop-multiwin-icon" src="<?= p($app['icon']) ?>" alt="" /><?php endif; ?>
                    <span class="desktop-multiwin-name"><?= p($app['name']) ?></span>
                </label>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>


    <h3><?= p($l->t('Experimental Desktop File Manager')) ?></h3>
    <p>
        <input type="checkbox" id="desktop-exp-disabled" class="checkbox" <?= $_['experimentalDisabled'] ? 'checked' : '' ?> />
        <label for="desktop-exp-disabled"><?= p($l->t('Disable experimental Desktop File Manager for everyone')) ?></label>
    </p>
    <p>
        <label for="desktop-exp-groups"><?= p($l->t('Allow these Groups to test it:')) ?></label>
        <span class="desktop-group-select" data-group-select>
            <select id="desktop-exp-groups" multiple size="6" <?= $_['experimentalDisabled'] ? '' : 'disabled' ?>>
                <?php foreach ($_['groups'] as $group): ?>
                    <option value="<?= p($group['id']) ?>" <?= $group['selected'] ? 'selected' : '' ?>><?= p($group['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </span>
    </p>
    <p class="settings-hint"><?= p($l->t('When disabled for everyone, only these groups can still test it. When enabled for everyone, this list is ignored. Users still have to enable it in their personal settings.')) ?></p>


    <button id="desktop-save-admin-settings" type="button" class="primary"><?= p($l->t('Save')) ?></button>
    <span id="desktop-admin-settings-status" class="desktop-admin-status" aria-live="polite"></span>

    <h3 style="margin-top:24px;"><?= p($l->t('Maintenance')) ?></h3>
    <h4><?= p($l->t('Reset a user')) ?></h4>
    <p class="settings-hint"><?= p($l->t('Completely clear one user’s desktop settings, as if they had never opened the desktop. Their next visit starts fresh and shows the desktop settings.')) ?></p>
    <p>
        <input type="text" id="desktop-reset-user-id" list="desktop-user-list" placeholder="<?= p($l->t('User ID')) ?>" style="min-width:240px;" />
        <datalist id="desktop-user-list">
            <?php foreach (($_['users'] ?? []) as $u): ?>
                <option value="<?= p($u) ?>"></option>
            <?php endforeach; ?>
        </datalist>
        <button id="desktop-reset-user" type="button" class="error" data-reset-url="<?= p($_['resetUserUrl']) ?>"><?= p($l->t('Reset this user')) ?></button>
        <span id="desktop-reset-user-status" class="desktop-admin-status" aria-live="polite"></span>
    </p>
</div>

<div id="desktop-usage-stats" class="section">
    <h2><?= p($l->t('Desktop usage')) ?></h2>
    <p class="settings-hint"><?= p($l->t('These numbers show how many users use Desktop, not how often. A user who opens Desktop several times in a day is counted once for that day. No information about which users used it is collected.')) ?></p>

    <p>
        <strong><?= p($l->t('Instances in use right now:')) ?></strong>
        <?= $_['activeCount'] >= 0 ? p((string)$_['activeCount']) : p($l->t('unknown (no memory cache configured)')) ?>
    </p>

    <h3><?= p($l->t('Unique users per day (last 7 days)')) ?></h3>
    <table class="desktop-stats-table">
        <?php foreach ($_['dailyStats'] as $day => $count): ?>
            <tr><td><?= p($day) ?></td><td><?= p((string)$count) ?></td></tr>
        <?php endforeach; ?>
    </table>

    <h3><?= p($l->t('Unique users per week (last 4 weeks)')) ?></h3>
    <table class="desktop-stats-table">
        <?php foreach ($_['weeklyStats'] as $week => $count): ?>
            <tr><td><?= p($week) ?></td><td><?= p((string)$count) ?></td></tr>
        <?php endforeach; ?>
    </table>
</div>
