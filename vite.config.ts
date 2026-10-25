import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Stable vendor chunks change rarely, so browsers keep them cached between releases.
const VENDOR_CHUNKS = [
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
  { name: 'vendor-firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 20 },
  { name: 'vendor-icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10 }
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: VENDOR_CHUNKS }
      }
    }
  }
});
