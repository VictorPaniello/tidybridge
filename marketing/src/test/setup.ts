// Extends Vitest's expect() with jest-dom matchers (toBeInTheDocument(),
// etc.) - imported for its side effect (the module augmentation), used
// by every test file that asserts against rendered DOM output.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library normally unmounts and cleans up the DOM after
// each test automatically, but only when it detects a global afterEach
// (Jest's default, or Vitest's `globals: true`) - this project runs
// with `globals: false` (see vite.config.ts) so every test file imports
// its own test functions explicitly, which means that auto-detection
// never fires and stale DOM from one test leaks into the next unless
// this runs explicitly.
afterEach(() => {
  cleanup();
});

// jsdom has no IntersectionObserver, which motion's whileInView needs (every
// real browser has it). A no-op stand-in: nothing is ever "in view" in tests,
// so assertions see the DOM as rendered.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
} as unknown as typeof IntersectionObserver;
