import { customElement, resolve, type ICustomElementViewModel } from 'aurelia';
import type { Context } from 'hono';
import template from './post-detail.html';
import { PostService } from '../services/post-service';
import type { Post, Comment } from '../data';

@customElement({ name: 'post-detail-page', template })
export class PostDetailPage implements ICustomElementViewModel {
  public static readonly title = ({ post }: { post?: Post | null }) =>
    post ? `${post.title} — Aurelia 2 SSR` : 'Article Not Found';

  public static readonly status = ({ post }: { post?: Post | null }) => (post ? 200 : 404);

  public static async loader(c: Context) {
    const postService = new PostService();
    const slug = c.req.param('slug') ?? '';
    return { post: await postService.getBySlug(slug) };
  }

  public static readonly actions = {
    like: async (c: Context) => {
      const postService = new PostService();
      const slug = c.req.param('slug') ?? '';
      const updated = await postService.clap(slug);
      if (!updated) return c.json({ error: 'Post not found' }, 404);
      return { success: true, claps: updated.claps };
    },
    comment: async (c: Context) => {
      const postService = new PostService();
      const slug = c.req.param('slug') ?? '';
      const body = await c.req.json().catch(() => ({}));
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return c.json({ error: 'Comment text is required' }, 400);

      const author =
        typeof body.author === 'string' && body.author.trim()
          ? body.author.trim()
          : 'Anonymous Engineer';

      const comment = await postService.addComment(slug, author, text);
      if (!comment) return c.json({ error: 'Post not found' }, 404);
      return { success: true, comment };
    },
  };

  private readonly postService = resolve(PostService);
  public post: Post | null = null;
  public clapping = false;
  public submitting = false;
  public newAuthor = '';
  public newComment = '';

  public getCategoryClass(category?: string): string {
    if (category === 'Architecture') return 'is-arch';
    if (category === 'Frontend Engineering') return 'is-fe';
    return 'is-data';
  }

  public async clap(): Promise<void> {
    if (!this.post || this.clapping) return;
    this.clapping = true;
    try {
      const claps = await this.postService.clapRemote(this.post.slug);
      if (claps !== null) {
        this.post.claps = claps;
      }
    } catch (err) {
      console.error('Failed to register clap:', err);
    } finally {
      this.clapping = false;
    }
  }

  public async addComment(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.post || this.submitting || !this.newComment.trim()) return;

    this.submitting = true;
    const author = this.newAuthor.trim() || 'Anonymous Engineer';
    const text = this.newComment.trim();

    try {
      const comment: Comment | null = await this.postService.addCommentRemote(
        this.post.slug,
        author,
        text
      );
      if (comment) {
        this.post.comments.push(comment);
        this.newComment = '';
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      this.submitting = false;
    }
  }
}
