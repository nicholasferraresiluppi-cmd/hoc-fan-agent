/** @type {import('next').NextConfig} */
// Header di sicurezza (audit set 2026): niente iframe da altri siti
// (clickjacking sulle pagine admin), niente sniffing del tipo, referrer ridotto.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Elenco ISTAT dei comuni letto con fs lato server (campi specchio del Centro HR,
// 03/10/2026): lo si porta esplicitamente nelle funzioni che rileggono ClickUp.
const COMUNI_JSON = ["./public/data/comuni-istat.json"];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/hr/clickup-webhook": COMUNI_JSON,
    "/api/cron/hr-clickup": COMUNI_JSON,
    "/api/admin/hr/**/*": COMUNI_JSON,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
}

module.exports = nextConfig
