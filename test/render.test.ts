import { describe, it, expect, vi } from 'vitest';
import { renderAurelia } from '../src/render.js';
import type { RenderContext } from '../src/types.js';

describe('renderAurelia()', () => {
  const mockContext: RenderContext = {
    user: {
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
    },
    workspace: {
      id: 'ws_456',
      name: 'Test Workspace',
    },
    role: 'owner',
  };

  it('should render a simple component', async () => {
    const SimpleComponent = {
      template: '<div>Hello World</div>',
    };

    const html = await renderAurelia({
      component: SimpleComponent,
      context: mockContext,
    });

    expect(html).toContain('Hello World');
    expect(typeof html).toBe('string');
  });

  it('should include context in rendered output', async () => {
    const ContextComponent = {
      template: '<div>User: {{_renderContext.user.name}}</div>',
    };

    const html = await renderAurelia({
      component: ContextComponent,
      context: mockContext,
    });

    expect(html).toContain('User:');
  });

  it('should timeout after specified duration', async () => {
    const SlowComponent = {
      async attached() {
        await new Promise((r) => setTimeout(r, 1000));
      },
      template: '<div>Slow</div>',
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promise = renderAurelia({
      component: SlowComponent,
      context: mockContext,
      timeout: 100,
    });

    // Implementation catches timeout and returns error HTML, not reject
    const result = await promise;
    spy.mockRestore();
    expect(result).toContain('ssr-error');
    expect(result).toContain('timeout');
  });

  it('should handle missing component gracefully', async () => {
    const promise = renderAurelia({
      component: null as any,
    });

    await expect(promise).rejects.toThrow('component is required');
  });

  it('should return empty container on render error', async () => {
    const ErrorComponent = {
      get template() {
        throw new Error('Template error');
      },
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = await renderAurelia({
      component: ErrorComponent,
    });
    spy.mockRestore();

    expect(html).toContain('ssr-container');
  });

  it('should call attached() lifecycle method', async () => {
    let attachedCalled = false;

    const LifecycleComponent = {
      async attached() {
        attachedCalled = true;
      },
      template: '<div>Lifecycle Test</div>',
    };

    await renderAurelia({
      component: LifecycleComponent,
    });

    expect(attachedCalled).toBe(true);
  });

  it('should inject props into component', async () => {
    const PropsComponent = {
      title: '',
      template: '<h1>{{title}}</h1>',
    };

    const html = await renderAurelia({
      component: PropsComponent,
      props: { title: 'Dashboard' },
    });

    expect(html).toContain('Dashboard');
  });

  it('should render real Aurelia 2 CustomElement with repeat.for and interpolation', async () => {
    const { CustomElement } = await import('aurelia');
    const ListComponent = CustomElement.define({
      name: 'list-comp',
      template: '<ul><li repeat.for="item of items">${item.name} (${item.role})</li></ul>',
    }, class {
      items = [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'member' },
      ];
    });

    const html = await renderAurelia({
      component: ListComponent,
    });

    expect(html).toContain('Alice (admin)');
    expect(html).toContain('Bob (member)');
    expect(html).toContain('<!--au-start-->');
    expect(html).toContain('<!--au-end-->');
  });

  it('should render child components registered via registrations option', async () => {
    const { CustomElement } = await import('aurelia');
    const BadgeComp = CustomElement.define({
      name: 'status-badge',
      template: '<span class="badge"><au-slot></au-slot></span>',
    }, class {});

    const PageComp = CustomElement.define({
      name: 'page-comp',
      template: '<div class="page">Status: <status-badge>${status}</status-badge></div>',
    }, class {
      status = 'Active';
    });

    const html = await renderAurelia({
      component: PageComp,
      registrations: [BadgeComp],
    });

    expect(html).toContain('<status-badge>');
    expect(html).toContain('class="badge"');
    expect(html).toContain('Active');
  });

  it('should support if.bind conditionals', async () => {
    const { CustomElement } = await import('aurelia');
    const ConditionalComp = CustomElement.define({
      name: 'conditional-comp',
      template: '<div><span if.bind="isPremium">PRO USER</span><span if.bind="!isPremium">FREE USER</span></div>',
    }, class {
      isPremium = true;
    });

    const html = await renderAurelia({
      component: ConditionalComp,
    });

    expect(html).toContain('PRO USER');
    expect(html).not.toContain('FREE USER');
  });

  it('should handle concurrent rendering without cross-request state contamination', async () => {
    const { CustomElement } = await import('aurelia');
    const UserBadgeComp = CustomElement.define({
      name: 'user-badge-comp',
      template: '<div class="user-badge">${title}: ${username} (${role})</div>',
    }, class {
      title = '';
      username = '';
      role = '';
    });

    const requests = Array.from({ length: 10 }, (_, i) =>
      renderAurelia({
        component: UserBadgeComp,
        props: {
          title: `Request-${i}`,
          username: `User-${i}`,
          role: i % 2 === 0 ? 'Admin' : 'Member',
        },
      })
    );

    const outputs = await Promise.all(requests);

    for (let i = 0; i < 10; i++) {
      expect(outputs[i]).toContain(`Request-${i}: User-${i}`);
      expect(outputs[i]).toContain(i % 2 === 0 ? '(Admin)' : '(Member)');
    }
  });

  it('should safely provide browser shims (localStorage, matchMedia, ResizeObserver)', async () => {
    const { CustomElement } = await import('aurelia');
    const BrowserAwareComp = CustomElement.define({
      name: 'browser-aware-comp',
      template: '<div>Storage: ${storedVal}, Media: ${isMobile}</div>',
    }, class {
      storedVal = '';
      isMobile = false;

      binding() {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('theme', 'dark');
          this.storedVal = window.localStorage.getItem('theme') || '';
        }
        if (typeof window !== 'undefined' && window.matchMedia) {
          const mq = window.matchMedia('(max-width: 600px)');
          this.isMobile = mq.matches;
        }
      }
    });

    const html = await renderAurelia({
      component: BrowserAwareComp,
    });

    expect(html).toContain('Storage: dark');
    expect(html).toContain('Media: false');
  });

  it('should inject isomorphic IRequestContext into component DI', async () => {
    const { CustomElement, resolve } = await import('aurelia');
    const { IRequestContext } = await import('../src/render.js');

    const DiComp = CustomElement.define({
      name: 'di-comp',
      template: '<div>User: ${req.user.name}, URL: ${req.url}, Param: ${req.params.id}</div>',
    }, class {
      readonly req = resolve(IRequestContext);
    });

    const html = await renderAurelia({
      component: DiComp,
      context: mockContext,
      url: 'https://example.com/posts/42',
      params: { id: '42' },
      query: { filter: 'recent' },
    });

    expect(html).toContain('User: Test User');
    expect(html).toContain('URL: https://example.com/posts/42');
    expect(html).toContain('Param: 42');
  });
});
