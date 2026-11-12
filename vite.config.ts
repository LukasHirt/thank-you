import { defineConfig } from 'vite-plus'

// The site uses relative URLs, so it works under any sub-path (GitHub Pages project
// site, owncloud.dev/thank-you/, ...). SITE_URL only makes the social preview image absolute.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [
    {
      name: 'absolute-og-image',
      transformIndexHtml(html: string) {
        const site = process.env.SITE_URL
        return site
          ? html.replace('content="og.png"', `content="${site.replace(/\/?$/, '/')}og.png"`)
          : html
      }
    }
  ],
  // same style as the other ownCloud projects (@ownclouders/prettier-config)
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    sortPackageJson: true,
    ignorePatterns: ['dist/**', 'raw/**', 'public/data/**', 'pnpm-lock.yaml']
  },
  lint: {
    ignorePatterns: ['dist/**', 'raw/**', 'public/**'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'no-console': 'off'
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  },
  staged: {
    '*': 'vp check --fix'
  }
})
