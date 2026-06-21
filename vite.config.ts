import { defineConfig } from 'vite';

// Deployed as a GitHub Pages USER SITE at https://neelaychakravarthy.github.io/
// (served from the domain root), so base stays '/'. Pinned explicitly to guard
// against an accidental future change that would break absolute /assets paths.
export default defineConfig({
  base: '/',
});
