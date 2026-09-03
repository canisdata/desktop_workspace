<?php
namespace OCA\DesktopWorkspace\Controller;

use OC\DB\Exceptions\DbalException;
use OCA\DesktopWorkspace\Service\DecorationService;
use OCA\DesktopWorkspace\Service\FilesAvailability;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;

class SettingsController extends Controller {
    public const APP_ID = 'desktop_workspace';
    public const SHOW_FAVORITES_KEY = 'show_favorites';
    public const FAV_NO_CONFIRM_KEY = 'favorites_no_confirm';
    public const SHOW_TRASH_KEY = 'show_trash';
    public const SHOW_HOME_KEY = 'show_home';
    public const MULTI_WINDOW_KEY = 'multi_window_apps';
    public const ICON_POSITIONS_KEY = 'icon_positions';
    public const WINDOW_STATES_KEY = 'window_states';
    public const APP_PINS_KEY = 'app_pins';
    public const TASKBAR_PINS_KEY = 'taskbar_pins';
    public const DESKTOP_PINS_KEY = 'desktop_pins';
    public const APPS_MENU_SIZE_KEY = 'apps_menu_size';
    public const BROWSER_STATE_MIGRATION_KEY = 'browser_state_migration';
    public const VISITED_KEY = 'visited';
    public const DESKTOP_FOLDER_KEY = 'desktop_folder';
    public const TRASH_NO_CONFIRM_KEY = 'trash_no_confirm';
    public const USER_DECORATIONS_ENABLED_KEY = 'user_decorations_enabled';
    public const DECORATION_KEY = 'decoration';
    public const DECORATION_COLOR_KEY = 'decoration_color';
    public const ICON_DECORATION_LINKED_KEY = 'icon_decoration_linked';
    public const ICON_DECORATION_KEY = 'icon_decoration';
    public const ICON_COLOR_KEY = 'icon_color';
    public const WINDOW_CONTROLS_SIDE_KEY = 'window_controls_side';
    public const SHELL_MODE_KEY = 'shell_mode';
    public const DOCK_ALWAYS_VISIBLE_KEY = 'dock_always_visible';
    public const CLOCK_HOUR_CYCLE_KEY = 'clock_hour_cycle';
    public const SHOW_FILES_NEW_TAB_KEY = 'show_files_new_tab';

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private IDBConnection $db,
        private IUserSession $userSession,
        private \OCA\DesktopWorkspace\Service\StatsService $statsService,
        private IRootFolder $rootFolder,
        private IUserManager $userManager,
        private DecorationService $decorationService,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @AdminRequired
     */
    public function saveAdminSettings(
        string $experimental_disabled = 'no',
        string $experimental_groups = '[]',
        string $multi_window_apps = '[]',
        string $user_decorations_enabled = 'yes',
    ): JSONResponse {
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

        $userDecorationsEnabled = $user_decorations_enabled === 'yes' || $user_decorations_enabled === 'true' || $user_decorations_enabled === '1';
        $this->config->setAppValue(self::APP_ID, self::USER_DECORATIONS_ENABLED_KEY, $userDecorationsEnabled ? 'yes' : 'no');

        return new JSONResponse([
            'status' => 'ok',
            'experimentalDisabled' => $disabled,
            'experimentalGroups' => $groups,
            'multiWindowApps' => $multi,
            'userDecorationsEnabled' => $userDecorationsEnabled,
            'logFile' => $this->getLogPath(),
        ]);
    }


    /** @AdminRequired */
    public function saveDecorationPolicy(string $enabled = 'no'): JSONResponse {
        $value = $enabled === 'yes' || $enabled === 'true' || $enabled === '1';
        $this->config->setAppValue(self::APP_ID, self::USER_DECORATIONS_ENABLED_KEY, $value ? 'yes' : 'no');
        return new JSONResponse(['status' => 'ok', 'userDecorationsEnabled' => $value]);
    }

    /** @AdminRequired */
    public function saveFilesButtonPolicy(string $enabled = 'no'): JSONResponse {
        $value = $enabled === 'yes' || $enabled === 'true' || $enabled === '1';
        $this->config->setAppValue(self::APP_ID, self::SHOW_FILES_NEW_TAB_KEY, $value ? 'yes' : 'no');
        return new JSONResponse(['status' => 'ok', 'showFilesNewTab' => $value]);
    }

    #[NoAdminRequired]
    public function heartbeat(string $instanceId = ''): JSONResponse {
        $this->statsService->heartbeat($instanceId);
        return new JSONResponse(['status' => 'ok']);
    }

    #[NoAdminRequired]
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

    private function cleanPinList(mixed $values): ?array {
        if (!is_array($values) || !array_is_list($values)) {
            return null;
        }
        $clean = [];
        foreach ($values as $value) {
            if (!is_string($value) || $value === '' || strlen($value) > 255 || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
                return null;
            }
            $clean[] = $value;
        }
        return array_slice(array_values(array_unique($clean)), 0, 100);
    }

    private function storedAppPins(string $uid): array {
        $decoded = json_decode($this->config->getUserValue($uid, self::APP_ID, self::APP_PINS_KEY, ''), true);
        $fallback = is_array($decoded) ? $decoded : [];
        $taskbar = json_decode($this->config->getUserValue($uid, self::APP_ID, self::TASKBAR_PINS_KEY, 'null'), true);
        $desktop = json_decode($this->config->getUserValue($uid, self::APP_ID, self::DESKTOP_PINS_KEY, 'null'), true);
        return [
            'taskbar' => $this->cleanPinList($taskbar) ?? $this->cleanPinList($fallback['taskbar'] ?? []) ?? [],
            'desktop' => $this->cleanPinList($desktop) ?? $this->cleanPinList($fallback['desktop'] ?? []) ?? [],
        ];
    }

    #[NoAdminRequired]
    public function saveAppPins(string $location = '', string $pins = '[]'): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        if (!in_array($location, ['taskbar', 'desktop'], true)) {
            return new JSONResponse(['status' => 'error', 'message' => 'invalid location'], 400);
        }
        $clean = $this->cleanPinList(json_decode($pins, true));
        if ($clean === null || json_last_error() !== JSON_ERROR_NONE) {
            return new JSONResponse(['status' => 'error', 'message' => 'invalid pins'], 400);
        }
        $key = $location === 'taskbar' ? self::TASKBAR_PINS_KEY : self::DESKTOP_PINS_KEY;
        $this->config->setUserValue($user->getUID(), self::APP_ID, $key, json_encode($clean));
        return new JSONResponse(['status' => 'ok', 'pins' => $this->storedAppPins($user->getUID())]);
    }

    private function claimBrowserStateMigration(string $uid): bool {
        $query = $this->db->getQueryBuilder();
        $query->insert('preferences')->values([
            'userid' => $query->createNamedParameter($uid),
            'appid' => $query->createNamedParameter(self::APP_ID),
            'configkey' => $query->createNamedParameter(self::BROWSER_STATE_MIGRATION_KEY),
            'configvalue' => $query->createNamedParameter('pending:' . time()),
        ]);
        try {
            $query->executeStatement();
            return true;
        } catch (DbalException $e) {
            if ((int)$e->getCode() === 1062) {
                return false;
            }
            throw $e;
        }
    }

    #[NoAdminRequired]
    public function migrateBrowserState(string $pins = '{"taskbar":[],"desktop":[]}', int $width = 0, int $height = 0): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $uid = $user->getUID();
        $decoded = json_decode($pins, true);
        $taskbar = is_array($decoded) ? $this->cleanPinList($decoded['taskbar'] ?? null) : null;
        $desktop = is_array($decoded) ? $this->cleanPinList($decoded['desktop'] ?? null) : null;
        if (json_last_error() !== JSON_ERROR_NONE || $taskbar === null || $desktop === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'invalid migration state'], 400);
        }
        $migrationState = $this->config->getUserValue($uid, self::APP_ID, self::BROWSER_STATE_MIGRATION_KEY, '');
        if ($migrationState !== '1') {
            if (str_starts_with($migrationState, 'pending:') && (int)substr($migrationState, 8) < time() - 300) {
                $this->config->deleteUserValue($uid, self::APP_ID, self::BROWSER_STATE_MIGRATION_KEY);
                $migrationState = '';
            }
            if ($migrationState !== '' || !$this->claimBrowserStateMigration($uid)) {
                return new JSONResponse(['status' => 'pending'], 409);
            }
            $hasLegacyServerPins = $this->config->getUserValue($uid, self::APP_ID, self::APP_PINS_KEY, '') !== '';
            if (!$hasLegacyServerPins && $this->config->getUserValue($uid, self::APP_ID, self::TASKBAR_PINS_KEY, '') === '') {
                $this->config->setUserValue($uid, self::APP_ID, self::TASKBAR_PINS_KEY, json_encode($taskbar));
            }
            if (!$hasLegacyServerPins && $this->config->getUserValue($uid, self::APP_ID, self::DESKTOP_PINS_KEY, '') === '') {
                $this->config->setUserValue($uid, self::APP_ID, self::DESKTOP_PINS_KEY, json_encode($desktop));
            }
            if ($this->config->getUserValue($uid, self::APP_ID, self::APPS_MENU_SIZE_KEY, '') === '') {
                $this->config->setUserValue($uid, self::APP_ID, self::APPS_MENU_SIZE_KEY, json_encode([
                    'width' => max(0, min($width, 10000)),
                    'height' => max(0, min($height, 10000)),
                ]));
            }
            $this->config->setUserValue($uid, self::APP_ID, self::BROWSER_STATE_MIGRATION_KEY, '1');
        }
        $size = json_decode($this->config->getUserValue($uid, self::APP_ID, self::APPS_MENU_SIZE_KEY, '{}'), true);
        return new JSONResponse([
            'status' => 'ok',
            'pins' => $this->storedAppPins($uid),
            'size' => is_array($size) ? $size : [],
        ]);
    }

    #[NoAdminRequired]
    public function saveAppsMenuSize(int $width = 0, int $height = 0): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        if ($width < 1 || $height < 1 || $width > 10000 || $height > 10000) {
            return new JSONResponse(['status' => 'error', 'message' => 'invalid size'], 400);
        }
        $clean = ['width' => $width, 'height' => $height];
        $this->config->setUserValue($user->getUID(), self::APP_ID, self::APPS_MENU_SIZE_KEY, json_encode($clean));
        return new JSONResponse(['status' => 'ok', 'size' => $clean]);
    }

    #[NoAdminRequired]
    public function resetIconPositions(): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $this->config->deleteUserValue($user->getUID(), self::APP_ID, self::ICON_POSITIONS_KEY);
        return new JSONResponse(['status' => 'ok']);
    }

    #[NoAdminRequired]
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

    #[NoAdminRequired]
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

    #[NoAdminRequired]
    public function resetAllPersonal(): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $this->clearAllUserValues($user->getUID());
        $this->config->setUserValue($user->getUID(), self::APP_ID, self::BROWSER_STATE_MIGRATION_KEY, '1');
        return new JSONResponse([
            'status' => 'ok',
            'settings' => [
                'tryExperimentalFiles' => false,
                'showFavorites' => false,
                'favoritesNoConfirm' => false,
                'showTrash' => false,
                'showHome' => false,
                'desktopFolder' => '',
                'trashNoConfirm' => false,
                'decoration' => DecorationService::STANDARD,
                'decorationColor' => DecorationService::FOLLOW_NEXTCLOUD,
                'iconDecorationLinked' => true,
                'iconDecoration' => DecorationService::STANDARD,
                'iconColor' => DecorationService::FOLLOW_NEXTCLOUD,
                'windowControlsSide' => 'right',
                'shellMode' => 'taskbar',
                'dockAlwaysVisible' => true,
                'clockHourCycle' => '24',
            ],
        ]);
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
        $this->config->setUserValue($target, self::APP_ID, self::BROWSER_STATE_MIGRATION_KEY, '1');
        return new JSONResponse(['status' => 'ok']);
    }

    #[NoAdminRequired]
    public function savePersonalSettings(
        ?string $try_experimental_files = null,
        ?string $show_favorites = null,
        ?string $favorites_no_confirm = null,
        ?string $show_trash = null,
        ?string $show_home = null,
        ?string $desktop_folder = null,
        ?string $trash_no_confirm = null,
        ?string $decoration = null,
        ?string $decoration_color = null,
        ?string $icon_decoration_linked = null,
        ?string $icon_decoration = null,
        ?string $icon_color = null,
        ?string $window_controls_side = null,
        ?string $shell_mode = null,
        ?string $dock_always_visible = null,
        ?string $clock_hour_cycle = null,
    ): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['status' => 'error', 'message' => 'no user'], 403);
        }
        $uid = $user->getUID();
        $truthy = static fn (string $v): bool => $v === 'yes' || $v === 'true' || $v === '1';
        $result = ['status' => 'ok'];
        if ($window_controls_side !== null) {
            $value = $window_controls_side === 'left' ? 'left' : 'right';
            $this->config->setUserValue($uid, self::APP_ID, self::WINDOW_CONTROLS_SIDE_KEY, $value);
            $result['windowControlsSide'] = $value;
        }
        if ($shell_mode !== null) {
            $value = $shell_mode === 'dock' ? 'dock' : 'taskbar';
            $this->config->setUserValue($uid, self::APP_ID, self::SHELL_MODE_KEY, $value);
            $result['shellMode'] = $value;
        }
        if ($dock_always_visible !== null) {
            $value = $truthy($dock_always_visible);
            $this->config->setUserValue($uid, self::APP_ID, self::DOCK_ALWAYS_VISIBLE_KEY, $value ? 'yes' : 'no');
            $result['dockAlwaysVisible'] = $value;
        }
        if ($clock_hour_cycle !== null) {
            $value = $clock_hour_cycle === '12' ? '12' : '24';
            $this->config->setUserValue($uid, self::APP_ID, self::CLOCK_HOUR_CYCLE_KEY, $value);
            $result['clockHourCycle'] = $value;
        }
        if ($decoration !== null) {
            $selected = in_array($decoration, [DecorationService::STANDARD, DecorationService::REDMOND, DecorationService::RETRO], true)
                ? $decoration
                : DecorationService::STANDARD;
            if (!$this->decorationService->userSelectionEnabled()) {
                $selected = DecorationService::STANDARD;
            }
            $this->config->setUserValue($uid, self::APP_ID, self::DECORATION_KEY, $selected);
            $result['decoration'] = $selected;
        }
        if ($decoration_color !== null) {
            $value = $this->decorationService->validatedColorMode($decoration_color, DecorationService::FOLLOW_NEXTCLOUD);
            $this->config->setUserValue($uid, self::APP_ID, self::DECORATION_COLOR_KEY, $value);
            $result['decorationColor'] = $value;
        }
        if ($icon_decoration_linked !== null) {
            $value = $truthy($icon_decoration_linked);
            $this->config->setUserValue($uid, self::APP_ID, self::ICON_DECORATION_LINKED_KEY, $value ? 'yes' : 'no');
            $result['iconDecorationLinked'] = $value;
        }
        if ($icon_decoration !== null) {
            $value = $this->decorationService->validatedDecoration($icon_decoration);
            $this->config->setUserValue($uid, self::APP_ID, self::ICON_DECORATION_KEY, $value);
            $result['iconDecoration'] = $value;
        }
        if ($icon_color !== null) {
            $value = $this->decorationService->validatedIconColorMode($icon_color);
            $this->config->setUserValue($uid, self::APP_ID, self::ICON_COLOR_KEY, $value);
            $result['iconColor'] = $value;
        }
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

}
