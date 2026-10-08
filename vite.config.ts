/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages serves the game at https://<user>.github.io/sketch-racer/, so production builds and their local preview need the
// repo-name base path. Dev and tests stay at '/'.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/sketch-racer/' : '/',
  server: { port: 5199 },
  preview: { port: 5199 },
}));
