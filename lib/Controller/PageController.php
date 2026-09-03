<?php
namespace OCA\DesktopWorkspace\Controller;

use OCA\DesktopWorkspace\Service\DecorationService;
use OCA\DesktopWorkspace\Service\FilesAvailability;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\INavigationManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;

class PageController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private INavigationManager $navigationManager,
        private IConfig $config,
        private IURLGenerator $urlGenerator,
        private IUserSession $userSession,
        private FilesAvailability $filesAvailability,
        private \OCA\DesktopWorkspace\Service\StatsService $statsService,
        private DecorationService $decorationService,
    ) {
        parent::__construct($appName, $request);
    }

    private function navigationApps(): array {
        $multiWindow = json_decode($this->config->getAppValue(SettingsController::APP_ID, SettingsController::MULTI_WINDOW_KEY, '[]'), true);
        $multiWindow = is_array($multiWindow) ? $multiWindow : [];
        $apps = [];
        foreach ($this->navigationManager->getAll() as $entry) {
            if (!isset($entry['id'], $entry['name'], $entry['href']) || $entry['id'] === 'desktop_workspace') {
                continue;
            }
            $apps[] = [
                'id' => $entry['id'],
                'name' => $entry['name'],
                'href' => $entry['href'],
                'icon' => $entry['icon'] ?? '',
                // External sites uses the navigation entry's target flag for sites that
                // must leave the Nextcloud frame (redirect/new-tab sites). Preserve it so
                // Desktop Workspace can match the standard app overview behaviour instead
                // of forcing those URLs into an iframe window.
                'target' => !empty($entry['target']),
                'multiInstance' => in_array($entry['id'], $multiWindow, true),
            ];
        }
        return $apps;
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function dynamicData(): JSONResponse {
        $l = \OC::$server->getL10N('desktop_workspace');
        $user = $this->userSession->getUser();
        $uid = $user?->getUID();
        return new JSONResponse([
            'apps' => $this->navigationApps(),
            'labels' => [
                'Apps' => $l->t('Apps'),
                'Search' => $l->t('Search'),
                'Desktop Settings' => $l->t('Desktop Settings'),
                'Desktop Admin Settings' => $l->t('Desktop Admin Settings'),
                'Desktop Files' => $l->t('Desktop Files'),
            ],
            ...$this->decorationService->appearanceForUser($user?->getUID()),
            'windowControlsSide' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::WINDOW_CONTROLS_SIDE_KEY, 'right') : 'right',
            'shellMode' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHELL_MODE_KEY, 'taskbar') : 'taskbar',
            'dockAlwaysVisible' => $uid === null || $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DOCK_ALWAYS_VISIBLE_KEY, 'yes') !== 'no',
            'clockHourCycle' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::CLOCK_HOUR_CYCLE_KEY, '24') : '24',
        ]);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        $apps = $this->navigationApps();

        $user = $this->userSession->getUser();
        $uid = $user !== null ? $user->getUID() : null;
        if ($uid !== null) {
            $this->statsService->recordUsage($uid);
        }
        // First visit (also true again after a full reset): open the settings for the user.
        $firstVisit = false;
        if ($uid !== null) {
            $firstVisit = $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::VISITED_KEY, 'no') !== 'yes';
            if ($firstVisit) {
                $this->config->setUserValue($uid, SettingsController::APP_ID, SettingsController::VISITED_KEY, 'yes');
            }
        }

        $appPins = '';
        if ($uid !== null) {
            $fallbackPins = json_decode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::APP_PINS_KEY, ''), true);
            $taskbarPins = json_decode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::TASKBAR_PINS_KEY, 'null'), true);
            $desktopPins = json_decode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DESKTOP_PINS_KEY, 'null'), true);
            if (is_array($taskbarPins) || is_array($desktopPins) || is_array($fallbackPins)) {
                $appPins = json_encode([
                    'taskbar' => is_array($taskbarPins) ? $taskbarPins : ($fallbackPins['taskbar'] ?? []),
                    'desktop' => is_array($desktopPins) ? $desktopPins : ($fallbackPins['desktop'] ?? []),
                ]);
            }
        }

        $response = new TemplateResponse('desktop_workspace', 'main', [
            'apps' => $apps,
            'firstVisit' => $firstVisit,
            'heartbeatUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.heartbeat'),
            'dynamicDataUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.page.dynamicData'),
            'desktopfilesEnabled' => $this->filesAvailability->enabledForUser($user),
            'settingsUrl' => $this->urlGenerator->getAbsoluteURL('/index.php/settings/user/desktop_workspace'),
            'filesUrl' => $this->urlGenerator->linkToRoute('files.view.index'),
            'showFilesNewTab' => $this->config->getAppValue(SettingsController::APP_ID, SettingsController::SHOW_FILES_NEW_TAB_KEY, 'yes') !== 'no',
            'personalSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.savePersonalSettings'),
            'iconPositions' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::ICON_POSITIONS_KEY, '{}') : '{}',
            'iconSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveIconPositions'),
            'appPins' => $appPins,
            'appPinsSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveAppPins'),
            'appsMenuSize' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::APPS_MENU_SIZE_KEY, '') : '',
            'appsMenuSizeSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveAppsMenuSize'),
            'browserStateMigrated' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::BROWSER_STATE_MIGRATION_KEY, '') === '1',
            'browserStateMigrationUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.migrateBrowserState'),
            'windowStates' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::WINDOW_STATES_KEY, '{"windows":[]}') : '{"windows":[]}',
            'windowSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveWindowStates'),
            'showFavorites' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_FAVORITES_KEY, 'no') === 'yes',
            'favoritesNoConfirm' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::FAV_NO_CONFIRM_KEY, 'no') === 'yes',
            'showTrash' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_TRASH_KEY, 'no') === 'yes',
            'showHome' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_HOME_KEY, 'no') === 'yes',
            'desktopFolder' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DESKTOP_FOLDER_KEY, '') : '',
            'trashNoConfirm' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::TRASH_NO_CONFIRM_KEY, 'no') === 'yes',
            'windowControlsSide' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::WINDOW_CONTROLS_SIDE_KEY, 'right') : 'right',
            'shellMode' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHELL_MODE_KEY, 'taskbar') : 'taskbar',
            'dockAlwaysVisible' => $uid === null || $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DOCK_ALWAYS_VISIBLE_KEY, 'yes') !== 'no',
            'clockHourCycle' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::CLOCK_HOUR_CYCLE_KEY, '24') : '24',
            ...$this->decorationService->appearanceForUser($uid),
        ]);
        $csp = new ContentSecurityPolicy();
        $csp->addAllowedFrameDomain("'self'");
        $csp->addAllowedFrameDomain('https:');
        $csp->addAllowedFrameDomain('http:');
        $response->setContentSecurityPolicy($csp);
        // Chromium requires the top-level document to delegate fullscreen through every
        // iframe in the chain (Desktop -> External Sites -> Jellyfin). Nextcloud still emits
        // both the legacy and current policy headers, so both must permit that delegation.
        $response->addHeader('Feature-Policy', "autoplay 'self';camera 'none';fullscreen *;geolocation 'none';microphone 'none';payment 'none'");
        $response->addHeader('Permissions-Policy', 'fullscreen=*');
        return $response;
    }
}
