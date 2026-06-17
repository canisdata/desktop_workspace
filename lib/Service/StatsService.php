<?php

declare(strict_types=1);

namespace OCA\Desktop\Service;

use OCP\ICacheFactory;
use OCP\IConfig;

/**
 * Records how many *unique users* use Desktop, never who.
 *
 * Per-user we only keep a "last counted day/week" marker (a date) so a user who
 * opens Desktop many times in a day is counted once. The admin-facing numbers are
 * plain counts; there is no stored list of which users used the app.
 */
class StatsService {
    public const APP_ID = 'desktop';
    private const ACTIVE_KEY = 'active_instances';
    private const ACTIVE_TTL = 120; // seconds an instance counts as "active"

    public function __construct(
        private IConfig $config,
        private ICacheFactory $cacheFactory,
    ) {
    }

    public function recordUsage(string $uid): void {
        $today = date('Y-m-d');
        $week = date('o-\WW'); // ISO year + week, e.g. 2026-W25
        if ($this->config->getUserValue($uid, self::APP_ID, 'stats_seen_day', '') !== $today) {
            $this->config->setUserValue($uid, self::APP_ID, 'stats_seen_day', $today);
            $this->bump('d:' . $today);
        }
        if ($this->config->getUserValue($uid, self::APP_ID, 'stats_seen_week', '') !== $week) {
            $this->config->setUserValue($uid, self::APP_ID, 'stats_seen_week', $week);
            $this->bump('w:' . $week);
        }
    }

    private function bump(string $key): void {
        $cur = (int)$this->config->getAppValue(self::APP_ID, 'stats:' . $key, '0');
        $this->config->setAppValue(self::APP_ID, 'stats:' . $key, (string)($cur + 1));
    }

    /** @return array<string,int> date => unique users, oldest first */
    public function dailyCounts(int $days): array {
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} days"));
            $out[$d] = (int)$this->config->getAppValue(self::APP_ID, 'stats:d:' . $d, '0');
        }
        return $out;
    }

    /** @return array<string,int> iso-week => unique users, oldest first */
    public function weeklyCounts(int $weeks): array {
        $out = [];
        for ($i = $weeks - 1; $i >= 0; $i--) {
            $w = date('o-\WW', strtotime("-{$i} weeks"));
            $out[$w] = (int)$this->config->getAppValue(self::APP_ID, 'stats:w:' . $w, '0');
        }
        return $out;
    }

    public function heartbeat(string $instanceId): void {
        if ($instanceId === '' || !$this->cacheFactory->isAvailable()) {
            return;
        }
        $cache = $this->cacheFactory->createDistributed(self::APP_ID);
        $now = time();
        $active = json_decode((string)$cache->get(self::ACTIVE_KEY), true);
        $active = is_array($active) ? $active : [];
        $active[$instanceId] = $now;
        foreach ($active as $id => $ts) {
            if (!is_int($ts) || $ts < $now - self::ACTIVE_TTL) {
                unset($active[$id]);
            }
        }
        $cache->set(self::ACTIVE_KEY, json_encode($active), self::ACTIVE_TTL + 60);
    }

    public function activeCount(): int {
        if (!$this->cacheFactory->isAvailable()) {
            return -1; // unknown (no distributed cache configured)
        }
        $cache = $this->cacheFactory->createDistributed(self::APP_ID);
        $active = json_decode((string)$cache->get(self::ACTIVE_KEY), true);
        if (!is_array($active)) {
            return 0;
        }
        $now = time();
        $n = 0;
        foreach ($active as $ts) {
            if (is_int($ts) && $ts >= $now - self::ACTIVE_TTL) {
                $n++;
            }
        }
        return $n;
    }
}
