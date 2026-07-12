<?php

declare(strict_types=1);

namespace OCA\DesktopWorkspace\Service;

use OCA\DesktopWorkspace\Controller\SettingsController;
use OCP\IConfig;

class DecorationService {
    public const STANDARD = 'standard';
    public const REDMOND = 'redmond';
    public const RETRO = 'retro';

    public function __construct(private IConfig $config) {
    }

    public function userSelectionEnabled(): bool {
        return $this->config->getAppValue(
            SettingsController::APP_ID,
            SettingsController::USER_DECORATIONS_ENABLED_KEY,
            'yes',
        ) !== 'no';
    }

    public function savedForUser(string $uid): string {
        $saved = $this->config->getUserValue(
            $uid,
            SettingsController::APP_ID,
            SettingsController::DECORATION_KEY,
            self::STANDARD,
        );
        return in_array($saved, [self::STANDARD, self::REDMOND, self::RETRO], true) ? $saved : self::STANDARD;
    }

    public function effectiveForUser(?string $uid): string {
        if ($uid === null || !$this->userSelectionEnabled()) {
            return self::STANDARD;
        }
        return $this->savedForUser($uid);
    }
}
