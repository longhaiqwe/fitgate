import { defineConfig, build } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        workout: resolve(__dirname, 'src/workout/workout.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/index.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  plugins: [
    {
      name: 'build-content-script',
      apply: 'build',
      enforce: 'post',
      async closeBundle() {
        await build({
          configFile: false,
          build: {
            outDir: 'dist',
            emptyOutDir: false,
            rollupOptions: {
              input: {
                content: resolve(__dirname, 'src/content/index.js')
              },
              output: {
                format: 'iife',
                entryFileNames: 'content.js',
                name: 'FitGateContentScript',
                extend: true
              }
            }
          }
        });
      }
    }
  ]
});
