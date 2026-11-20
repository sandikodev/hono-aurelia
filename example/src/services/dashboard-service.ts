/**
 * Dashboard Service — Enterprise Telemetry Service
 */

import {
  dashboardStats,
  activityStream,
  type DashboardStats,
  type ActivityItem,
} from '../data';

export interface DashboardData {
  stats: DashboardStats;
  activity: ActivityItem[];
}

export class DashboardService {
  async getMetrics(): Promise<DashboardData> {
    if (typeof window === 'undefined') {
      return { stats: dashboardStats, activity: activityStream };
    }
    const res = await fetch('/api/dashboard/stats', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()) as DashboardData;
  }
}
