<?php

declare(strict_types=1);

namespace OCA\DesktopWorkspace\Service;

use OCA\DesktopWorkspace\Controller\SettingsController;
use OCP\IConfig;

class DecorationService {
    public const STANDARD = 'standard';
    public const REDMOND = 'redmond';
    public const RETRO = 'retro';
    public const FOLLOW_NEXTCLOUD = 'nextcloud';
    public const LIGHT = 'light';
    public const DARK = 'dark';

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
        return $this->validatedDecoration($saved);
    }

    public function validatedDecoration(string $value): string {
        return in_array($value, [self::STANDARD, self::REDMOND, self::RETRO], true) ? $value : self::STANDARD;
    }

    public function validatedColorMode(string $value, string $fallback): string {
        return in_array($value, [self::FOLLOW_NEXTCLOUD, self::LIGHT, self::DARK], true) ? $value : $fallback;
    }

    public function validatedIconColorMode(string $value): string {
        return $this->validatedColorMode($value, self::FOLLOW_NEXTCLOUD);
    }

    public function appearanceForUser(?string $uid): array {
        if ($uid === null || !$this->userSelectionEnabled()) {
            return ['decoration' => self::STANDARD, 'decorationColor' => self::FOLLOW_NEXTCLOUD, 'iconDecorationLinked' => true, 'iconDecoration' => self::STANDARD, 'iconColor' => self::FOLLOW_NEXTCLOUD];
        }
        $decoration = $this->effectiveForUser($uid);
        $linked = $this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::ICON_DECORATION_LINKED_KEY, 'yes') !== 'no';
        return [
            'decoration' => $decoration,
            'decorationColor' => $this->validatedColorMode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DECORATION_COLOR_KEY, self::FOLLOW_NEXTCLOUD), self::FOLLOW_NEXTCLOUD),
            'iconDecorationLinked' => $linked,
            'iconDecoration' => $linked ? $decoration : $this->validatedDecoration($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::ICON_DECORATION_KEY, self::STANDARD)),
            'iconColor' => $linked ? $this->validatedColorMode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::DECORATION_COLOR_KEY, self::FOLLOW_NEXTCLOUD), self::FOLLOW_NEXTCLOUD) : $this->validatedIconColorMode($this->config->getUserValue($uid, SettingsController::APP_ID, SettingsController::ICON_COLOR_KEY, self::FOLLOW_NEXTCLOUD)),
        ];
    }

    public function effectiveForUser(?string $uid): string {
        if ($uid === null || !$this->userSelectionEnabled()) {
            return self::STANDARD;
        }
        return $this->savedForUser($uid);
    }
}
