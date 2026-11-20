import { plugin } from 'bun';

// Native Bun loader for HTML templates (returns template string directly)
plugin({
  name: 'bun-html-plugin',
  setup(builder) {
    builder.onLoad({ filter: /\.html$/ }, async (args) => {
      const contents = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(contents)};`,
        loader: 'js',
      };
    });
  },
});
