import { createClientHydrator } from '@aureliajs/ssr/client';
import { HomePage } from './pages/home';
import { PostDetailPage } from './pages/post-detail';
import { DashboardPage } from './pages/dashboard';

createClientHydrator({
  components: [HomePage, PostDetailPage, DashboardPage],
});
