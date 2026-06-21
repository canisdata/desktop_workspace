<?php

declare(strict_types=1);

namespace OCA\DesktopWorkspace\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class AdminSection implements IIconSection {
    public function __construct(
        private IL10N $l,
        private IURLGenerator $urlGenerator,
    ) {
    }

    public function getID(): string {
        return 'desktop_workspace';
    }

    public function getName(): string {
        return $this->l->t('Desktop Workspace');
    }

    public function getPriority(): int {
        return 80;
    }

    public function getIcon(): string {
        return $this->urlGenerator->imagePath('desktop_workspace', 'app.svg');
    }
}
