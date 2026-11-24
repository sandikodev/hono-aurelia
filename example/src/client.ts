import { createClientHydrator } from '@hono/aurelia/client';

async function hydrate(): Promise<void> {
  const dataEl = document.getElementById('__AURELIA_SSR_DATA__');
  if (!dataEl) return;
  let componentName = '';
  try {
    const parsed = JSON.parse(dataEl.textContent || '{}');
    componentName = parsed.component;
  } catch {}

  if (componentName === 'dashboard-page') {
    const { DashboardPage } = await import('./pages/dashboard');
    await createClientHydrator({ components: [DashboardPage] });
  } else if (componentName === 'post-detail-page') {
    const { PostDetailPage } = await import('./pages/post-detail');
    await createClientHydrator({ components: [PostDetailPage] });
  } else if (componentName === 'home-page') {
    const { HomePage } = await import('./pages/home');
    await createClientHydrator({ components: [HomePage] });
  }
}

if (typeof window !== 'undefined') {
  const schedule = () => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(hydrate);
    } else {
      setTimeout(hydrate, 10);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
}
