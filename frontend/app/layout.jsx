// Next.js root layout. The whole CheckIn interface is the React app in src/App.jsx,
// rendered by app/[[...slug]]/page.jsx for every address (/, /login, /records/123 …).
export const metadata = {
  title: 'CheckIn',
  description: 'Student attendance system — College of Science and Technology',
  icons: { icon: '/logo.jpg' },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Inter (400, 600, 700) — the only font the theme uses */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
