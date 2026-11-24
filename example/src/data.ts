/**
 * Shared in-memory data store for the Fullstack Aurelia 2 SSR + Hono reference app.
 */

export interface Comment {
  id: number;
  author: string;
  text: string;
  date: string;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  readTime: string;
  claps: number;
  comments: Comment[];
}

export interface DashboardStats {
  title: string;
  views: number;
  posts: number;
  engagement: number;
}

export interface ActivityItem {
  id: number;
  type: 'post' | 'like' | 'comment';
  action: string;
  timestamp: string;
}
