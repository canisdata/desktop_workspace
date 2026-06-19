<?php

declare(strict_types=1);

namespace OCA\Desktop\Service;

use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IUser;

/**
 * Resolves whether a user should get the experimental Desktop file manager.
 *
 * Rules:
 *  - Not disabled for everyone -> available to everyone (they still opt in personally).
 *  - Disabled for everyone -> only users in the admin's test-group allow-list may use it
 *    (empty allow-list while disabled = nobody).
 *  - The user must additionally have opted in (personal setting).
 */
class FilesAvailability {
    public const APP_ID = 'desktop_workspace';
    public const DISABLED_KEY = 'experimental_files_disabled';
    public const GROUPS_KEY = 'experimental_files_groups';
    public const USER_OPT_IN_KEY = 'try_experimental_files';

    public function __construct(
        private IConfig $config,
        private IGroupManager $groupManager,
    ) {
    }

    public function globallyDisabled(): bool {
        return $this->config->getAppValue(self::APP_ID, self::DISABLED_KEY, 'no') === 'yes';
    }

    /** @return string[] group ids allowed to test (empty = everyone) */
    public function allowedGroups(): array {
        $decoded = json_decode($this->config->getAppValue(self::APP_ID, self::GROUPS_KEY, '[]'), true);
        return is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
    }

    /**
     * Is the experimental file manager offered to this user at all?
     *  - Not disabled for everyone -> available to everyone.
     *  - Disabled for everyone -> only users in the allow-listed test groups
     *    (empty allow-list while disabled = nobody).
     */
    public function allowedForUser(IUser $user): bool {
        if (!$this->globallyDisabled()) {
            return true;
        }
        $groups = $this->allowedGroups();
        if (count($groups) === 0) {
            return false;
        }
        return count(array_intersect($groups, $this->groupManager->getUserGroupIds($user))) > 0;
    }

    /** Has the user opted in AND is it available to them? */
    public function enabledForUser(?IUser $user): bool {
        if ($user === null || !$this->allowedForUser($user)) {
            return false;
        }
        return $this->config->getUserValue($user->getUID(), self::APP_ID, self::USER_OPT_IN_KEY, 'no') === 'yes';
    }
}
