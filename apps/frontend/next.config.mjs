/**
 * Next.js 설정.
 *
 * 운영 빌드는 S3 + CloudFront 에 올릴 정적 export(`output: 'export'`) 다.
 * dev (`next dev`) 에서는 `output: 'export'` 를 켜지 않는다:
 *   - export 모드는 dynamic route 마다 `generateStaticParams` 의 entry 외 path 진입 시
 *     "missing param ..." 으로 throw 한다. 운영에선 CloudFront `/404 → /index.html`
 *     fallback 으로 SPA 라우팅이 받지만, dev 에는 그 fallback 이 없어 회의 코드가
 *     포함된 URL(`/meetings/{code}`) 진입이 모두 깨진다.
 *   - dev 는 일반 Next dev server(SSR/CSR 혼합) 로 두고, 빌드 시점에만 export 한다.
 *
 * @type {import('next').NextConfig}
 */
const isProdBuild = process.env.NODE_ENV === 'production';

const nextConfig = {
  ...(isProdBuild ? { output: 'export' } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
