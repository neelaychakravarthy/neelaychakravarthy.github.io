import { defineConfig } from 'vite';

// Deployed as a GitHub Pages USER SITE at https://neelaychakravarthy.github.io/
// (served from the domain root), so base stays '/'. Pinned explicitly to guard
// against an accidental future change that would break absolute /assets paths.
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      // Two entry pages: the explorable 3D world (index) and the document-style
      // portfolio (portfolio.html). Both are served from the domain root.
      input: {
        main: 'index.html',
        portfolio: 'portfolio.html',
      },
    },
  },
});
