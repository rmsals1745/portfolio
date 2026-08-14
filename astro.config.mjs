// @ts-check
import { defineConfig } from 'astro/config';

// 정적 빌드 → Cloudflare Pages 로 그대로 업로드.
// 어댑터를 붙이지 않는다: 서버 런타임이 필요한 기능을 쓰지 않으므로
// 순수 정적이 가장 빠르고 가장 덜 깨진다.
export default defineConfig({
  site: 'https://parkgeunmin.pages.dev',
  output: 'static',
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      theme: 'vitesse-dark',
      wrap: true,
    },
  },
});
