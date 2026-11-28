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

const productDesigns = { band: '淡い深緑の帯', line: '細い横罫線' };

function ProductDesignOptions({ params, design }) {
  return <nav className="hp-product-design-options" aria-label="商品名の区切り方">
    {Object.entries(productDesigns).map(([value, label]) => {
      const next = new URLSearchParams(params);
      next.set('product-design', value);
      return <a key={value} href={`?${next}`} aria-current={value === design ? 'true' : undefined}>{label}</a>;
    })}
  </nav>;
}

function LandingPreview() {
  const params = new URLSearchParams(window.location.search);
  const requestedDesign = params.get('product-design');
  const design = Object.hasOwn(productDesigns, requestedDesign) ? requestedDesign : undefined;
  const previewFrame = params.get('frame') === '1';
  const mobileViewport = useSyncExternalStore(subscribe, getMobileViewport);
  const options = design && !previewFrame && <ProductDesignOptions params={params} design={design} />;
  if (!previewFrame && !mobileViewport && params.get('device') === 'mobile') {
    const frameParams = new URLSearchParams({ frame: '1' });
    if (design) frameParams.set('product-design', design);
    return <main className="landing-site hp-mobile-preview">
      {options}
      <p>スマートフォン表示・幅390px</p>
      <iframe title="スマートフォン表示" src={`?${frameParams}`} />
    </main>;
  }
  return <>{options}<LandingPage reviewOnly productDesign={design} /></>;
}

createRoot(document.getElementById('root')).render(<LandingPreview />);
