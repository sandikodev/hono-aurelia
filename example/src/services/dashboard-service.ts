/**
 * Dashboard Service — Telemetry Service
 *
 * Metrics come from D1 or nothing at all. No demo numbers are invented when a
 * database row is missing.
 */

import type { DashboardStats, ActivityItem } from '../data';

export interface DashboardData {
  stats: DashboardStats;
  activity: ActivityItem[];
}

const EMPTY_STATS: DashboardStats = {
  title: 'No telemetry yet',
  views: 0,
  posts: 0,
  engagement: 0,
};

export class DashboardService {
  constructor(private readonly db?: any) {}

  async getMetrics(): Promise<DashboardData> {
    if (typeof window === 'undefined') {
      if (!this.db) return { stats: EMPTY_STATS, activity: [] };
      const stats = await this.db.prepare('SELECT * FROM telemetry_stats WHERE id = 1').first();
      const postCount = await this.db.prepare('SELECT COUNT(*) as total FROM posts').first();
      const { results: activity } = await this.db
        .prepare('SELECT * FROM telemetry_activity ORDER BY id ASC')
        .all();
      return {
        stats: {
          title: (stats?.title as string) ?? EMPTY_STATS.title,
          views: Number(stats?.views ?? 0),
          posts: Number(postCount?.total ?? 0),
          engagement: Number(stats?.engagement ?? 0),
        },
        activity: (activity as ActivityItem[]) ?? [],
      };
    }
    const token =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('token')
        : null;
    const url = token
      ? `/api/dashboard/stats?token=${encodeURIComponent(token)}`
      : '/api/dashboard/stats';
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()) as DashboardData;
  }
}
