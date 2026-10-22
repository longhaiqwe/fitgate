import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: { input: {
      dashboard: resolve('index.html'),
      workout: resolve('src/workout/workout.html'),
      reminder: resolve('reminder.html')
    } }
  }
});
