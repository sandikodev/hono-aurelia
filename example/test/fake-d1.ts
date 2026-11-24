/**
 * Minimal in-memory D1 twin for the example app's unit tests.
 *
 * Production uses the real D1 binding. The fake exists only so tests can inject
 * explicit fixture rows instead of the service silently falling back to them.
 */
import { initialPosts, dashboardStats, activityStream } from './fixtures';

type Row = Record<string, unknown>;

export function createFakeD1() {
  const posts: Row[] = initialPosts.map(({ comments: _comments, readTime, ...post }) => ({
    ...post,
    read_time: readTime,
  }));
  const comments: Row[] = initialPosts.flatMap((post) =>
    post.comments.map((comment) => ({ ...comment, post_slug: post.slug })),
  );
  const telemetry: Row[] = [{ id: 1, ...dashboardStats }];
  const activity: Row[] = [...activityStream];

  function execute(sql: string, params: unknown[]): Row[] {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT * FROM posts ORDER BY id ASC') return posts;
    if (normalized === 'SELECT * FROM posts WHERE slug = ?') {
      return posts.filter((row) => row.slug === params[0]);
    }
    if (normalized === 'SELECT id FROM posts WHERE slug = ?') {
      return posts.filter((row) => row.slug === params[0]).map((row) => ({ id: row.id }));
    }
    if (normalized === 'SELECT * FROM comments WHERE post_slug = ? ORDER BY id ASC') {
      return comments.filter((row) => row.post_slug === params[0]);
    }
    if (normalized === 'UPDATE posts SET claps = claps + 1 WHERE slug = ?') {
      const row = posts.find((candidate) => candidate.slug === params[0]);
      if (row) row.claps = Number(row.claps) + 1;
      return row ? [row] : [];
    }
    if (normalized.startsWith('INSERT INTO comments')) {
      comments.push({
        id: Date.now(),
        post_slug: params[0],
        author: params[1],
        text: params[2],
        date: params[3],
      });
      return [];
    }
    if (normalized === 'SELECT * FROM telemetry_stats WHERE id = 1') return telemetry;
    if (normalized === 'SELECT COUNT(*) as total FROM posts') {
      return [{ total: posts.length }];
    }
    if (normalized === 'SELECT * FROM telemetry_activity ORDER BY id ASC') return activity;
    throw new Error(`Unsupported fake D1 query: ${sql}`);
  }

  return {
    prepare(sql: string) {
      const params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params.push(...values);
          return this;
        },
        async all() {
          return { results: execute(sql, params) };
        },
        async first() {
          return execute(sql, params)[0] ?? null;
        },
        async run() {
          execute(sql, params);
          return { success: true };
        },
      };
    },
  };
}
