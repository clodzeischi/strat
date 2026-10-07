import { defineConfig } from 'vite';

// In development (npm run dev), multiplayer talks to the game server (npm run serve, port 8080) through Vite.
export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
