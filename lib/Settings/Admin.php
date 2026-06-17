<?php

declare(strict_types=1);

namespace OCA\Desktop\Settings;

use OCA\Desktop\Controller\SettingsController;
use OCA\Desktop\Service\FilesAvailability;
use OCA\Desktop\Service\StatsService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\INavigationManager;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\Settings\ISettings;

class Admin implements ISettings {
    public function __construct(
        private IConfig $config,
        private IURLGenerator $urlGenerator,
        private IGroupManager $groupManager,
        private INavigationManager $navigationManager,
        private FilesAvailability $filesAvailability,
        private StatsService $statsService,
        private IUserManager $userManager,
    ) {
    }

    public function getForm(): TemplateResponse {
        $dataDir = rtrim($this->config->getSystemValueString('datadirectory', '/var/www/html/data'), '/');

        $allowed = $this->filesAvailability->allowedGroups();
        $groups = [];
        foreach ($this->groupManager->search('') as $group) {
            $groups[] = [
                'id' => $group->getGID(),
                'name' => $group->getDisplayName(),
                'selected' => in_array($group->getGID(), $allowed, true),
            ];
        }

        $multiWindow = json_decode($this->config->getAppValue(SettingsController::APP_ID, SettingsController::MULTI_WINDOW_KEY, '[]'), true);
        $multiWindow = is_array($multiWindow) ? $multiWindow : [];
        $apps = [];
        foreach ($this->navigationManager->getAll() as $entry) {
            if (!isset($entry['id'], $entry['name']) || $entry['id'] === 'desktop' || $entry['id'] === 'files') {
                continue; // file managers always allow multiple windows
            }
            $apps[] = [
                'id' => $entry['id'],
                'name' => $entry['name'],
                'icon' => $entry['icon'] ?? '',
                'selected' => in_array($entry['id'], $multiWindow, true),
            ];
        }

        // User list for the "reset a user" picker. Capped so very large instances stay responsive;
        // the input still accepts any typed user id beyond the list.
        $userIds = [];
        foreach ($this->userManager->search('', 500) as $u) {
            $userIds[] = $u->getUID();
        }

        return new TemplateResponse('desktop', 'settings-admin', [
            'debugEnabled' => $this->config->getAppValue(SettingsController::APP_ID, SettingsController::DEBUG_KEY, 'yes') !== 'no',
            'experimentalDisabled' => $this->filesAvailability->globallyDisabled(),
            'groups' => $groups,
            'apps' => $apps,
            'users' => $userIds,
            'activeCount' => $this->statsService->activeCount(),
            'dailyStats' => $this->statsService->dailyCounts(7),
            'weeklyStats' => $this->statsService->weeklyCounts(4),
            'saveUrl' => $this->urlGenerator->linkToRoute('desktop.settings.saveAdminSettings'),
            'resetUserUrl' => $this->urlGenerator->linkToRoute('desktop.settings.resetUserSettings'),
            'logPath' => $dataDir . '/' . SettingsController::LOG_FILE,
        ]);
    }

    public function getSection(): string {
        return 'desktop';
    }

    public function getPriority(): int {
        return 50;
    }
}
