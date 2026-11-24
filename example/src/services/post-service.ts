/**
 * Post Service — Aurelia 2 Domain Service
 *
 * The database is the only source of truth. An empty D1 database means an
 * empty blog, never a silently substituted fixture.
 */

import type { Post, Comment } from '../data';

export class PostService {
  constructor(private readonly db?: any) {}

  /**
   * Fetch all posts.
   * On server (SSR): reads directly from D1 (0 network overhead).
   * On client: calls the Hono REST endpoint.
   */
  async getPosts(): Promise<Post[]> {
    if (typeof window === 'undefined') {
      if (!this.db) return [];
      const { results } = await this.db.prepare('SELECT * FROM posts ORDER BY id ASC').all();
      return (results ?? []).map((r: any) => ({
        ...r,
        readTime: r.read_time ?? r.readTime,
        comments: [],
      }));
    }
    const res = await fetch('/api/posts', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()) as Post[];
  }

  /** Retrieve a single post by slug. */
  async getBySlug(slug: string): Promise<Post | null> {
    if (typeof window === 'undefined') {
      if (!this.db) return null;
      const post = await this.db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
      if (!post) return null;
      const { results: comments } = await this.db
        .prepare('SELECT * FROM comments WHERE post_slug = ? ORDER BY id ASC')
        .bind(slug)
        .all();
      return {
        ...post,
        readTime: post.read_time ?? post.readTime,
        comments: comments ?? [],
      };
    }
    const posts = await this.getPosts();
    return posts.find((post) => post.slug === slug) ?? null;
  }

  /** Server-side action: increment claps directly in the data store. */
  async clap(slug: string): Promise<Post | null> {
    if (!this.db) return null;
    await this.db.prepare('UPDATE posts SET claps = claps + 1 WHERE slug = ?').bind(slug).run();
    const post = await this.db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
    if (!post) return null;
    return {
      ...post,
      readTime: post.read_time ?? post.readTime,
      comments: [],
    };
  }

  /** Server-side action: append a new comment. */
  async addComment(slug: string, author: string, text: string): Promise<Comment | null> {
    if (!this.db) return null;
    const trimmedAuthor = author.trim() || 'Anonymous Engineer';
    const trimmedText = text.trim();
    const comment: Comment = {
      id: Date.now(),
      author: trimmedAuthor,
      text: trimmedText,
      date: 'Just now',
    };

    const post = await this.db.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).first();
    if (!post) return null;
    await this.db
      .prepare('INSERT INTO comments (post_slug, author, text, date) VALUES (?, ?, ?, ?)')
      .bind(slug, comment.author, comment.text, comment.date)
      .run();
    return comment;
  }

  /** Client-side RPC: trigger `like` server action on the Hono route. */
  async clapRemote(slug: string): Promise<number | null> {
    const res = await fetch(`/posts/${slug}?_action=like`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { claps?: number };
    return typeof body.claps === 'number' ? body.claps : null;
  }

  /** Client-side RPC: trigger `comment` server action on the Hono route. */
  async addCommentRemote(slug: string, author: string, text: string): Promise<Comment | null> {
    const res = await fetch(`/posts/${slug}?_action=comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ author, text }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { comment?: Comment };
    return body.comment ?? null;
  }
}
