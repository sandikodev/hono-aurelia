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
});
