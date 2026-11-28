import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './LandingPage.jsx';
import { FamilyPowerLayoutControls } from './landing/FamilyPowerHero.jsx';
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
  const compareFamilyPower = params.has('family-power');
  const previewFrame = params.get('frame') === '1';
  const mobileViewport = useSyncExternalStore(subscribe, getMobileViewport);
  if (compareFamilyPower && !previewFrame && !mobileViewport && params.get('device') === 'mobile') {
    const desktop = params.get('pc') === 'b' ? 'b' : 'a';
    const mobile = params.get('mobile') === 'a' ? 'a' : 'b';
    params.set('frame', '1');
    return <main className="landing-site hp-mobile-preview">
      <FamilyPowerLayoutControls desktop={desktop} mobile={mobile} mobileViewport />
      <p>スマートフォン表示・幅390px</p>
      <iframe title={`スマートフォン表示 ${mobile.toUpperCase()}案`} src={`?${params}`} />
    </main>;
  }
  return <LandingPage reviewOnly compareFamilyPower={compareFamilyPower} previewFrame={previewFrame} mobileViewport={mobileViewport} />;
}

createRoot(document.getElementById('root')).render(<LandingPreview />);
