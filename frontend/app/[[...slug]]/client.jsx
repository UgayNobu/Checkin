'use client';
// The app uses the browser (localStorage, geolocation, window), so it is rendered on the client only.
import dynamic from 'next/dynamic';

const App = dynamic(() => import('../../src/App.jsx'), { ssr: false });

export default function ClientApp() {
  return <App />;
}
