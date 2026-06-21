<?php

declare(strict_types=1);

namespace OCA\DesktopWorkspace\Settings;

use OCA\DesktopWorkspace\Controller\SettingsController;
use OCA\DesktopWorkspace\Service\FilesAvailability;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Settings\ISettings;

class Personal implements ISettings {
    public function __construct(
        private IConfig $config,
        private IURLGenerator $urlGenerator,
        private IUserSession $userSession,
        private FilesAvailability $filesAvailability,
    ) {
    }

    public function getForm(): TemplateResponse {
        $user = $this->userSession->getUser();
        $available = $user !== null && $this->filesAvailability->allowedForUser($user);
        $optedIn = $user !== null
            && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, FilesAvailability::USER_OPT_IN_KEY, 'no') === 'yes';

        return new TemplateResponse('desktop_workspace', 'settings-personal', [
            'available' => $available,
            'globallyDisabled' => $this->filesAvailability->globallyDisabled(),
            'tryExperimentalFiles' => $optedIn,
            'showFavorites' => $user !== null
                && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::SHOW_FAVORITES_KEY, 'no') === 'yes',
            'favoritesNoConfirm' => $user !== null
                && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::FAV_NO_CONFIRM_KEY, 'no') === 'yes',
            'showTrash' => $user !== null
                && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::SHOW_TRASH_KEY, 'no') === 'yes',
            'showHome' => $user !== null
                && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::SHOW_HOME_KEY, 'no') === 'yes',
            'desktopFolder' => $user !== null
                ? $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::DESKTOP_FOLDER_KEY, '')
                : '',
            'trashNoConfirm' => $user !== null
                && $this->config->getUserValue($user->getUID(), SettingsController::APP_ID, SettingsController::TRASH_NO_CONFIRM_KEY, 'no') === 'yes',
            'saveUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.savePersonalSettings'),
            'resetIconsUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.resetIconPositions'),
            'resetWindowsUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.resetWindowStates'),
            'resetAllUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.settings.resetAllPersonal'),
            'themingUrl' => $this->urlGenerator->getAbsoluteURL('/index.php/settings/user/theming'),
        ]);
    }

    public function getSection(): string {
        return 'desktop_workspace';
    }

    public function getPriority(): int {
        return 50;
    }
}
