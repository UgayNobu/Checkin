// One catch-all route: every address is handled by the app's own router (react-router) in the browser.
// This is the migration path the Next.js docs recommend for an existing Vite single-page app;
// pages can later be moved one by one into real Next.js routes.
import ClientApp from './client';

export default function Page() {
  return <ClientApp />;
}
