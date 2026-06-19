<?php
namespace OCA\Desktop\Controller;

use OCA\Desktop\Service\FilesAvailability;
use OCP\AppFramework\Controller;
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
        private \OCA\Desktop\Service\StatsService $statsService,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): TemplateResponse {
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
                'multiInstance' => in_array($entry['id'], $multiWindow, true),
            ];
        }

        $dataDir = rtrim($this->config->getSystemValueString('datadirectory', '/var/www/html/data'), '/');

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

        return new TemplateResponse('desktop_workspace', 'main', [
            'apps' => $apps,
            'firstVisit' => $firstVisit,
            'heartbeatUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.heartbeat'),
            'desktopfilesEnabled' => $this->filesAvailability->enabledForUser($user),
            'settingsUrl' => $this->urlGenerator->getAbsoluteURL('/index.php/settings/user/desktop_workspace'),
            'personalSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.savePersonalSettings'),
            'iconPositions' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::ICON_POSITIONS_KEY, '{}') : '{}',
            'iconSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveIconPositions'),
            'windowStates' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::WINDOW_STATES_KEY, '{"windows":[]}') : '{"windows":[]}',
            'windowSaveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.saveWindowStates'),
            'showFavorites' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_FAVORITES_KEY, 'no') === 'yes',
            'favoritesNoConfirm' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::FAV_NO_CONFIRM_KEY, 'no') === 'yes',
            'showTrash' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_TRASH_KEY, 'no') === 'yes',
            'showHome' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::SHOW_HOME_KEY, 'no') === 'yes',
            'desktopFolder' => $uid !== null ? $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DESKTOP_FOLDER_KEY, '') : '',
            'trashNoConfirm' => $uid !== null && $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::TRASH_NO_CONFIRM_KEY, 'no') === 'yes',
            'debugEnabled' => $this->config->getAppValue(SettingsController::APP_ID, SettingsController::DEBUG_KEY, 'yes') !== 'no',
            'debugUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.debug'),
            'debugLogPath' => $dataDir . '/' . SettingsController::LOG_FILE,
        ]);
    }
}
