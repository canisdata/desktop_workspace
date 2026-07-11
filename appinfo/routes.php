<?php
return [
    'routes' => [
        // Shell
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'page#dynamicData', 'url' => '/dynamic', 'verb' => 'GET'],
        ['name' => 'settings#saveAdminSettings', 'url' => '/settings/admin', 'verb' => 'POST'],
        ['name' => 'settings#saveDecorationPolicy', 'url' => '/settings/admin/decorations', 'verb' => 'POST'],
        ['name' => 'settings#savePersonalSettings', 'url' => '/settings/personal', 'verb' => 'POST'],
        ['name' => 'settings#heartbeat', 'url' => '/settings/heartbeat', 'verb' => 'POST'],
        ['name' => 'settings#saveIconPositions', 'url' => '/settings/iconpositions', 'verb' => 'POST'],
        ['name' => 'settings#resetIconPositions', 'url' => '/settings/iconpositions/reset', 'verb' => 'POST'],
        ['name' => 'settings#saveWindowStates', 'url' => '/settings/windowstates', 'verb' => 'POST'],
        ['name' => 'settings#resetWindowStates', 'url' => '/settings/windowstates/reset', 'verb' => 'POST'],
        ['name' => 'settings#resetAllPersonal', 'url' => '/settings/personal/reset', 'verb' => 'POST'],
        ['name' => 'settings#resetUserSettings', 'url' => '/settings/admin/resetuser', 'verb' => 'POST'],

        // Files module (formerly the standalone "desktopfiles" app)
        ['name' => 'files#index', 'url' => '/files', 'verb' => 'GET'],
        ['name' => 'files#viewer', 'url' => '/files/viewer', 'verb' => 'GET'],
        ['name' => 'files#details', 'url' => '/files/details', 'verb' => 'GET'],
    ],
];
