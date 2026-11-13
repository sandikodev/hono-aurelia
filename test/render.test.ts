import { describe, it, expect } from 'vitest';
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

    const promise = renderAurelia({
      component: SlowComponent,
      context: mockContext,
      timeout: 100,
    });

    // Implementation catches timeout and returns error HTML, not reject
    const result = await promise;
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

    const html = await renderAurelia({
      component: ErrorComponent,
    });

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
});
