import { describe, it, expect } from 'vitest';
import { CustomElement } from 'aurelia';
import { renderAurelia } from '../src/render.js';

describe('Multiple requests to renderAurelia', () => {
  it('renders a component multiple times in separate requests without AUR0757', async () => {
    const template = `
      <div class="test">
        <h1>\${title}</h1>
        <ul>
          <li repeat.for="p of posts">\${p.title}</li>
        </ul>
      </div>
    `;

    const MyComp = CustomElement.define({
      name: 'multi-test-comp',
      template,
    }, class {
      title = 'Hello';
      posts = [{ title: 'P1' }, { title: 'P2' }];
    });

    // Request 1
    const html1 = await renderAurelia({
      component: MyComp,
      props: { title: 'First Run', posts: [{ title: 'R1' }] },
    });
    expect(html1).toContain('First Run');
    expect(html1).toContain('R1');
    expect(html1).not.toContain('class="ssr-container"');

    // Request 2 (previously triggered AUR0757 due to cross-document template caching)
    const html2 = await renderAurelia({
      component: MyComp,
      props: { title: 'Second Run', posts: [{ title: 'R2' }] },
    });
    expect(html2).toContain('Second Run');
    expect(html2).toContain('R2');
    expect(html2).not.toContain('class="ssr-container"');

    // Request 3
    const html3 = await renderAurelia({
      component: MyComp,
      props: { title: 'Third Run', posts: [{ title: 'R3' }] },
    });
    expect(html3).toContain('Third Run');
    expect(html3).toContain('R3');
    expect(html3).not.toContain('class="ssr-container"');
  });
});
