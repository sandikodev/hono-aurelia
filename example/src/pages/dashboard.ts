import { customElement, resolve, type ICustomElementViewModel } from 'aurelia';
import type { Context } from 'hono';
import template from './dashboard.html';
import { DashboardService } from '../services/dashboard-service';
import type { DashboardStats, ActivityItem } from '../data';

@customElement({ name: 'dashboard-page', template })
export class DashboardPage implements ICustomElementViewModel {
  public static readonly title = 'Telemetry Dashboard - Aurelia 2 SSR';

  public static async loader(c: Context) {
    const dashboardService = new DashboardService(c.env?.DB);
    const data = await dashboardService.getMetrics();
    return {
      stats: data.stats,
      activity: data.activity,
      user: c.get('user') ?? null,
      role: c.get('role') ?? null,
    };
  }

  private readonly dashboardService = resolve(DashboardService);
  public stats: DashboardStats = {
    title: 'Production Metrics',
    views: 0,
    posts: 0,
    engagement: 0,
  };
  public activity: ActivityItem[] = [];
  public user: { name?: string; email?: string } | null = null;
  public role: string | null = null;
  public loading = false;
  public error = '';

  public async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const data = await this.dashboardService.getMetrics();
      if (data.stats) this.stats = data.stats;
      if (data.activity) this.activity = data.activity;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  public getPillClass(type?: string): string {
    if (type === 'post') return 'pill-post';
    if (type === 'like') return 'pill-like';
    return 'pill-comment';
  }
}
