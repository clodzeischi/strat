import { defineConfig } from 'vite';

// In development (npm run dev), multiplayer talks to the game server (npm run serve, port 8080) through Vite.
// Static files (the voice lines in audio/) are served from src/public as they are.
export default defineConfig({
  publicDir: 'src/public',
  // main.ts waits for the models with a top-level await.
  build: { target: 'es2022' },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
