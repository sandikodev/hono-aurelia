/**
 * Post Service — Enterprise Aurelia 2 Domain Service
 *
 * Demonstrates idiomatic, zero-boilerplate service architecture:
 * - Direct in-memory / database access during server SSR & Server Actions
 * - Typed client HTTP data fetching during client-side SPA navigation
 * - Injected cleanly via Aurelia 2 DI (`resolve(PostService)`)
 */

import { initialPosts, type Post, type Comment } from '../data';

export class PostService {
  constructor(private readonly db?: any) {}

  /**
   * Fetch all posts.
   * On server (SSR): reads directly from repository (0 network overhead).
   * On client: calls Hono REST endpoint.
   */
  async getPosts(): Promise<Post[]> {
    if (typeof window === 'undefined') {
      if (this.db) {
        try {
          const { results } = await this.db.prepare('SELECT * FROM posts ORDER BY id ASC').all();
          if (results && results.length > 0) {
            return results.map((r: any) => ({
              ...r,
              readTime: r.read_time ?? r.readTime,
              comments: [],
            }));
          }
        } catch {}
      }
      return initialPosts;
    }
    const res = await fetch('/api/posts', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()) as Post[];
  }

  /**
   * Retrieve single post by slug.
   */
  async getBySlug(slug: string): Promise<Post | null> {
    if (typeof window === 'undefined' && this.db) {
      try {
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
      } catch {}
    }
    const found = initialPosts.find((p) => p.slug === slug);
    return found ?? null;
  }

  /**
   * Server-side action: increment claps directly in the data store.
   */
  async clap(slug: string): Promise<Post | null> {
    if (this.db) {
      try {
        await this.db.prepare('UPDATE posts SET claps = claps + 1 WHERE slug = ?').bind(slug).run();
        const post = await this.db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
        if (!post) return null;
        return {
          ...post,
          readTime: post.read_time ?? post.readTime,
          comments: [],
        };
      } catch {}
    }
    const post = initialPosts.find((p) => p.slug === slug);
    if (!post) return null;
    post.claps += 1;
    return post;
  }

  /**
   * Server-side action: append new comment.
   */
  async addComment(slug: string, author: string, text: string): Promise<Comment | null> {
    const trimmedAuthor = author.trim() || 'Anonymous Engineer';
    const trimmedText = text.trim();
    const comment: Comment = {
      id: Date.now(),
      author: trimmedAuthor,
      text: trimmedText,
      date: 'Just now',
    };

    if (this.db) {
      try {
        const post = await this.db
          .prepare('SELECT id FROM posts WHERE slug = ?')
          .bind(slug)
          .first();
        if (!post) return null;
        await this.db
          .prepare('INSERT INTO comments (post_slug, author, text, date) VALUES (?, ?, ?, ?)')
          .bind(slug, comment.author, comment.text, comment.date)
          .run();
        return comment;
      } catch {}
    }

    const post = initialPosts.find((p) => p.slug === slug);
    if (!post) return null;
    post.comments.push(comment);
    return comment;
  }

  /**
   * Client-side RPC: trigger `like` server action on Hono route.
   */
  async clapRemote(slug: string): Promise<number | null> {
    const res = await fetch(`/posts/${slug}?_action=like`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { claps?: number };
    return typeof body.claps === 'number' ? body.claps : null;
  }

  /**
   * Client-side RPC: trigger `comment` server action on Hono route.
   */
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
