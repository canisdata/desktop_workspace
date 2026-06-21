<?php
namespace OCA\DesktopWorkspace\Controller;

use OCA\DesktopWorkspace\Service\FilesAvailability;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;

class SettingsController extends Controller {
    public const APP_ID = 'desktop_workspace';
    public const DEBUG_KEY = 'debug_enabled';
    public const LOG_FILE = 'desktop-debug.log';
    public const SHOW_FAVORITES_KEY = 'show_favorites';
    public const FAV_NO_CONFIRM_KEY = 'favorites_no_confirm';
    public const SHOW_TRASH_KEY = 'show_trash';
    public const SHOW_HOME_KEY = 'show_home';
    public const MULTI_WINDOW_KEY = 'multi_window_apps';
    public const ICON_POSITIONS_KEY = 'icon_positions';
    public const WINDOW_STATES_KEY = 'window_states';
    public const VISITED_KEY = 'visited';
    public const DESKTOP_FOLDER_KEY = 'desktop_folder';
    public const TRASH_NO_CONFIRM_KEY = 'trash_no_confirm';

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private IUserSession $userSession,
        private \OCA\DesktopWorkspace\Service\StatsService $statsService,
        private IRootFolder $rootFolder,
        private IUserManager $userManager,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @AdminRequired
     */
    public function saveAdminSettings(
        string $debug_enabled = 'no',
        string $experimental_disabled = 'no',
        string $experimental_groups = '[]',
        string $multi_window_apps = '[]',
    ): JSONResponse {
        $debug = $debug_enabled === 'yes' || $debug_enabled === 'true' || $debug_enabled === '1';
        $this->config->setAppValue(self::APP_ID, self::DEBUG_KEY, $debug ? 'yes' : 'no');

        $disabled = $experimental_disabled === 'yes' || $experimental_disabled === 'true' || $experimental_disabled === '1';
        $this->config->setAppValue(self::APP_ID, FilesAvailability::DISABLED_KEY, $disabled ? 'yes' : 'no');

        $groups = json_decode($experimental_groups, true);
        if (!is_array($groups)) {
            $groups = [];
        }
        $groups = array_values(array_filter($groups, 'is_string'));
        $this->config->setAppValue(self::APP_ID, FilesAvailability::GROUPS_KEY, json_encode($groups));

        $multi = json_decode($multi_window_apps, true);
        if (!is_array($multi)) {
            $multi = [];
        }
        $multi = array_values(array_filter($multi, 'is_string'));
        $this->config->setAppValue(self::APP_ID, self::MULTI_WINDOW_KEY, json_encode($multi));

        $this->writeLog('admin_setting_changed', [
            'debugEnabled' => $debug,
            'experimentalDisabled' => $disabled,
            'experimentalGroups' => $groups,
            'multiWindowApps' => $multi,
        ]);
        return new JSONResponse([
            'status' => 'ok',
            'debugEnabled' => $debug,
            'experimentalDisabled' => $disabled,
            'experimentalGroups' => $groups,
            'multiWindowApps' => $multi,
            'logFile' => $this->getLogPath(),
        ]);
    }

    /**
     * @NoAdminRequired
     */
    public function heartbeat(string $instanceId = ''): JSONResponse {
        $this->statsService->heartbeat($instanceId);
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     */
    public function saveIconPositions(string $positions = '{}'): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $decoded = json_decode($positions, true);
        $clean = [];
        if (is_array($decoded)) {
            foreach ($decoded as $key => $value) {
                if (is_array($value) && isset($value['col'], $value['row']) && is_numeric($value['col']) && is_numeric($value['row'])) {
                    $clean[(string)$key] = ['col' => (int)$value['col'], 'row' => (int)$value['row']];
                }
            }
        }
        $this->config->setUserValue($user->getUID(), self::APP_ID, self::ICON_POSITIONS_KEY, json_encode($clean));
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     */
    public function resetIconPositions(): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $this->config->deleteUserValue($user->getUID(), self::APP_ID, self::ICON_POSITIONS_KEY);
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     */
    public function saveWindowStates(string $windows = '{"windows":[]}'): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        // Store as-is after a round-trip through json_decode/encode to guarantee valid JSON
        // and to cap the payload. The client controls the schema; we only sanity-check it.
        $decoded = json_decode($windows, true);
        if (!is_array($decoded) || !isset($decoded['windows']) || !is_array($decoded['windows'])) {
            $decoded = ['windows' => []];
        }
        // Hard cap: never store more than 40 windows.
        $decoded['windows'] = array_slice($decoded['windows'], 0, 40);
        $this->config->setUserValue($user->getUID(), self::APP_ID, self::WINDOW_STATES_KEY, json_encode($decoded));
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     */
    public function resetWindowStates(): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $this->config->deleteUserValue($user->getUID(), self::APP_ID, self::WINDOW_STATES_KEY);
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * Remove every desktop setting for a user, so the next visit is like the first one.
     */
    private function clearAllUserValues(string $uid): void {
        foreach ($this->config->getUserKeys($uid, self::APP_ID) as $key) {
            $this->config->deleteUserValue($uid, self::APP_ID, $key);
        }
    }

    /**
     * @NoAdminRequired
     */
    public function resetAllPersonal(): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $this->clearAllUserValues($user->getUID());
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * Admin only (no @NoAdminRequired): wipe one user's desktop settings completely.
     */
    public function resetUserSettings(string $userId = ''): JSONResponse {
        $target = trim($userId);
        if ($target === '' || $this->userManager->get($target) === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'unknown_user'], 404);
        }
        $this->clearAllUserValues($target);
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * Admin only: truncate the shared desktop debug log.
     */
    public function resetDebugLog(): JSONResponse {
        $path = $this->getLogPath();
        $dir = dirname($path);
        if (!is_dir($dir) || !is_writable($dir)) {
            return new JSONResponse(['status' => 'error', 'message' => 'log_directory_not_writable'], 500);
        }
        if (@file_put_contents($path, '') === false) {
            return new JSONResponse(['status' => 'error', 'message' => 'log_file_not_writable'], 500);
        }
        return new JSONResponse(['status' => 'ok', 'logFile' => $path]);
    }

    /**
     * @NoAdminRequired
     */
    public function savePersonalSettings(
        ?string $try_experimental_files = null,
        ?string $show_favorites = null,
        ?string $favorites_no_confirm = null,
        ?string $show_trash = null,
        ?string $show_home = null,
        ?string $desktop_folder = null,
        ?string $trash_no_confirm = null,
    ): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $uid = $user->getUID();
        $truthy = static fn (string $v): bool => $v === 'yes' || $v === 'true' || $v === '1';
        $result = ['status' => 'ok'];
        if ($try_experimental_files !== null) {
            $b = $truthy($try_experimental_files);
            $this->config->setUserValue($uid, self::APP_ID, FilesAvailability::USER_OPT_IN_KEY, $b ? 'yes' : 'no');
            $result['tryExperimentalFiles'] = $b;
        }
        if ($show_favorites !== null) {
            $b = $truthy($show_favorites);
            $this->config->setUserValue($uid, self::APP_ID, self::SHOW_FAVORITES_KEY, $b ? 'yes' : 'no');
            $result['showFavorites'] = $b;
        }
        if ($favorites_no_confirm !== null) {
            $b = $truthy($favorites_no_confirm);
            $this->config->setUserValue($uid, self::APP_ID, self::FAV_NO_CONFIRM_KEY, $b ? 'yes' : 'no');
            $result['favoritesNoConfirm'] = $b;
        }
        if ($show_trash !== null) {
            $b = $truthy($show_trash);
            $this->config->setUserValue($uid, self::APP_ID, self::SHOW_TRASH_KEY, $b ? 'yes' : 'no');
            $result['showTrash'] = $b;
        }
        if ($show_home !== null) {
            $b = $truthy($show_home);
            $this->config->setUserValue($uid, self::APP_ID, self::SHOW_HOME_KEY, $b ? 'yes' : 'no');
            $result['showHome'] = $b;
        }
        if ($trash_no_confirm !== null) {
            $b = $truthy($trash_no_confirm);
            $this->config->setUserValue($uid, self::APP_ID, self::TRASH_NO_CONFIRM_KEY, $b ? 'yes' : 'no');
            $result['trashNoConfirm'] = $b;
        }
        if ($desktop_folder !== null) {
            $path = trim($desktop_folder);
            if ($path === '') {
                $this->config->deleteUserValue($uid, self::APP_ID, self::DESKTOP_FOLDER_KEY);
                $result['desktopFolder'] = '';
            } else {
                try {
                    $userFolder = $this->rootFolder->getUserFolder($uid);
                    $node = $path === '/' ? $userFolder : $userFolder->get($path);
                    if (!($node instanceof Folder)) {
                        return new JSONResponse(['status' => 'error', 'message' => 'not_a_folder'], 400);
                    }
                    // Personally owned only: reject anything shared with the user.
                    $storage = $node->getStorage();
                    if ($storage->instanceOfStorage('OCA\\Files_Sharing\\SharedStorage')) {
                        return new JSONResponse(['status' => 'error', 'message' => 'shared_not_allowed'], 400);
                    }
                    // The user's own files live on their home storage. This also rejects
                    // group folders, external storage and any other mounted storage.
                    if (!$storage->instanceOfStorage(\OCP\Files\IHomeStorage::class)) {
                        return new JSONResponse(['status' => 'error', 'message' => 'not_personal'], 400);
                    }
                    $owner = $node->getOwner();
                    if ($owner !== null && $owner->getUID() !== $uid) {
                        return new JSONResponse(['status' => 'error', 'message' => 'not_owned'], 400);
                    }
                    $clean = '/' . ltrim($userFolder->getRelativePath($node->getPath()) ?? '', '/');
                    $this->config->setUserValue($uid, self::APP_ID, self::DESKTOP_FOLDER_KEY, $clean);
                    $result['desktopFolder'] = $clean;
                } catch (NotFoundException $e) {
                    return new JSONResponse(['status' => 'error', 'message' => 'not_found'], 404);
                }
            }
        }
        return new JSONResponse($result);
    }

    /**
     * @NoAdminRequired
     */
    public function debug(string $event = 'client_event', string $payload = '{}'): JSONResponse {
        if (!$this->isDebugEnabled()) {
            return new JSONResponse(['status' => 'disabled']);
        }

        $decodedPayload = json_decode($payload, true);
        if (!is_array($decodedPayload)) {
            $decodedPayload = ['raw' => $payload];
        }

        $this->writeLog($event, $decodedPayload);
        return new JSONResponse(['status' => 'ok']);
    }

    public function isDebugEnabled(): bool {
        return $this->config->getAppValue(self::APP_ID, self::DEBUG_KEY, 'yes') !== 'no';
    }

    public function getLogPath(): string {
        $dataDir = rtrim($this->config->getSystemValueString('datadirectory', '/var/www/html/data'), '/');
        return $dataDir . '/' . self::LOG_FILE;
    }

    private function writeLog(string $event, array $payload = []): void {
        $user = $this->userSession->getUser();
        $line = json_encode([
            'time' => gmdate('c'),
            'user' => $user ? $user->getUID() : null,
            'event' => $event,
            'payload' => $payload,
            'requestId' => $this->request->getId(),
            'remoteAddress' => $this->request->getRemoteAddress(),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;

        @file_put_contents($this->getLogPath(), $line, FILE_APPEND | LOCK_EX);
    }
}
