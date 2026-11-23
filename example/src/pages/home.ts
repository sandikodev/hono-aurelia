import { customElement, resolve, type ICustomElementViewModel } from 'aurelia';
import template from './home.html';
import { PostService } from '../services/post-service';
import type { Post } from '../data';

@customElement({ name: 'home-page', template })
export class HomePage implements ICustomElementViewModel {
  public static readonly title = 'Hono + Aurelia 2 SSR - Engineering Blog';

  public static async loader(c?: any) {
    const postService = new PostService(c?.env?.DB);
    return { posts: await postService.getPosts() };
  }

  private readonly postService = resolve(PostService);
  public posts: Post[] = [];
  public loading = false;
  public error = '';

  public getCategoryClass(category?: string): string {
    if (category === 'Architecture') return 'is-arch';
    if (category === 'Frontend Engineering') return 'is-fe';
    return 'is-data';
  }

  public async refresh(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.posts = await this.postService.getPosts();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }
}
