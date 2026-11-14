import { describe, it, expect } from 'vitest';
import {
  createHtmlDocument,
  createFallbackHtml,
  createErrorHtml,
  escapeHtml,
  escapeAttr,
  validateHtmlStructure,
} from '../src/html.js';
import { serializeState } from '../src/serialize.js';
import type { RenderContext } from '../src/types.js';

describe('createHtmlDocument()', () => {
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

  it('should create a valid HTML document', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<head');
    expect(html).toContain('<body');
    expect(html).toContain('<script');
  });

  it('should include hydration payload', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload);

    expect(html).toContain('window.__HYDRATION__');
    expect(html).toContain('window.__HYDRATION_TIME__');
  });

  it('should include body content', async () => {
    const payload = await serializeState(mockContext);
    const bodyContent = '<div class="dashboard">Content</div>';
    const html = createHtmlDocument(bodyContent, payload);

    expect(html).toContain('Content');
  });

  it('should use custom title', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload, {
      title: 'Dashboard',
    });

    expect(html).toContain('<title>Dashboard</title>');
  });

  it('should use custom language', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload, {
      lang: 'id',
    });

    expect(html).toContain('lang="id"');
  });

  it('should use custom CSS bundle path', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload, {
      cssBundle: '/dist/styles.css',
    });

    expect(html).toContain('/dist/styles.css');
  });

  it('should use custom JS bundle path', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload, {
      jsBundle: '/dist/app.js',
    });

    expect(html).toContain('/dist/app.js');
  });

  it('should set base path', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload, {
      basePath: '/app/',
    });

    expect(html).toContain('href="/app/"');
  });

  it('should pass validation', async () => {
    const payload = await serializeState(mockContext);
    const html = createHtmlDocument('<div>Test</div>', payload);

    expect(validateHtmlStructure(html)).toBe(true);
  });
});

describe('createFallbackHtml()', () => {
  it('should create minimal HTML shell', () => {
    const html = createFallbackHtml();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<app-root></app-root>');
    expect(html).toContain('Loading');
  });

  it('should use custom title', () => {
    const html = createFallbackHtml('Dashboard');

    expect(html).toContain('<title>Dashboard</title>');
  });
});

describe('createErrorHtml()', () => {
  it('should create error page', () => {
    const html = createErrorHtml(500, 'Internal Server Error');

    expect(html).toContain('500');
    expect(html).toContain('Internal Server Error');
  });

  it('should include details if provided', () => {
    const html = createErrorHtml(
      404,
      'Page Not Found',
      'The requested page does not exist'
    );

    expect(html).toContain('The requested page does not exist');
  });

  it('should include home link', () => {
    const html = createErrorHtml(500, 'Error');

    expect(html).toContain('href="/"');
  });
});

describe('escapeHtml()', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's safe")).toBe('It&#39;s safe');
  });
});

describe('escapeAttr()', () => {
  it('should escape attribute values', () => {
    expect(escapeAttr('value"with"quotes')).toBe('value&quot;with&quot;quotes');
  });

  it('should escape ampersands', () => {
    expect(escapeAttr('A&B')).toBe('A&amp;B');
  });

  it('should keep normal text unchanged', () => {
    expect(escapeAttr('/path/to/resource')).toBe('/path/to/resource');
  });
});

describe('validateHtmlStructure()', () => {
  it('should validate correct HTML', () => {
    const html = `<!DOCTYPE html>
      <html>
        <head><base href="/" /></head>
        <body><script src="app.js"></script></body>
      </html>`;

    expect(validateHtmlStructure(html)).toBe(true);
  });

  it('should fail on missing DOCTYPE', () => {
    const html = '<html><head><base/></head><body><script></script></body></html>';

    expect(validateHtmlStructure(html)).toBe(false);
  });

  it('should fail on missing base tag', () => {
    const html = `<!DOCTYPE html>
      <html><head></head><body><script></script></body></html>`;

    expect(validateHtmlStructure(html)).toBe(false);
  });
});
