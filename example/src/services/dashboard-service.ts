/**
 * Dashboard Service — Enterprise Telemetry Service
 */

import { dashboardStats, activityStream, type DashboardStats, type ActivityItem } from '../data';

export interface DashboardData {
  stats: DashboardStats;
  activity: ActivityItem[];
}

export class DashboardService {
  constructor(private readonly db?: any) {}

  async getMetrics(): Promise<DashboardData> {
    if (typeof window === 'undefined') {
      if (this.db) {
        try {
          const stats = await this.db.prepare('SELECT * FROM telemetry_stats WHERE id = 1').first();
          const postCount = await this.db.prepare('SELECT COUNT(*) as total FROM posts').first();
          const { results: activity } = await this.db
            .prepare('SELECT * FROM telemetry_activity ORDER BY id ASC')
            .all();
          return {
            stats: {
              title: (stats?.title as string) ?? dashboardStats.title,
              views: (stats?.views as number) ?? dashboardStats.views,
              posts: (postCount?.total as number) ?? dashboardStats.posts,
              engagement: (stats?.engagement as number) ?? dashboardStats.engagement,
            },
            activity:
              activity && activity.length > 0 ? (activity as ActivityItem[]) : activityStream,
          };
        } catch {}
      }
      return { stats: dashboardStats, activity: activityStream };
    }
    const res = await fetch('/api/dashboard/stats', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()) as DashboardData;
  }
}
