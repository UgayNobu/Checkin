// Next.js settings for the CheckIn frontend.
// BACKEND_URL = where the Express API runs (default http://localhost:5001, as in backend/.env.example).
// With NEXT_PUBLIC_API=/api the browser only talks to Next, and Next forwards /api and /uploads
// to the backend — the same trick the Vite proxy did for the phone demo through one tunnel.
const backend = process.env.BACKEND_URL || 'http://localhost:5001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // the app was written for Vite without StrictMode double effects
  // Teammates' existing frontend/.env files still say VITE_API=... (the Vite name).
  // Next.js only passes NEXT_PUBLIC_* to the browser, so copy the old name across;
  // without this every API call would go to the wrong port and nothing (login, attendance) would work.
  env: {
    NEXT_PUBLIC_API: process.env.NEXT_PUBLIC_API || process.env.VITE_API || '',
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
