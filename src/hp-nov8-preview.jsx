import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './LandingPage.jsx';
import './index.css';
import './hp-nov8-hero-preview.css';
import './hp-pc-balance.css';

const viewport = window.matchMedia('(max-width: 820px)');
const subscribe = callback => {
  viewport.addEventListener('change', callback);
  return () => viewport.removeEventListener('change', callback);
};
const getMobileViewport = () => viewport.matches;

function LandingPreview() {
  const params = new URLSearchParams(window.location.search);
  const previewFrame = params.get('frame') === '1';
  const mobileViewport = useSyncExternalStore(subscribe, getMobileViewport);
  if (!previewFrame && !mobileViewport && params.get('device') === 'mobile') {
    return <main className="landing-site hp-mobile-preview">
      <p>スマートフォン表示・幅390px</p>
      <iframe title="スマートフォン表示" src="?frame=1" />
    </main>;
  }
  return <LandingPage reviewOnly />;
}

createRoot(document.getElementById('root')).render(<LandingPreview />);
