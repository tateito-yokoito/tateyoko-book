import React from 'react';

// Keep the previous wordmark's layout footprint; replace only its visible artwork.
// The SVG is the supplied, outlined brand master, not a substituted system font.
export default function BrandLogo({ children = '縦糸横糸', align = 'left', onDark = false }) {
  return <span style={{ position: 'relative', display: 'inline-block', verticalAlign: 'bottom', fontSize: 'inherit', lineHeight: 'inherit', margin: 0 }}>
    <span aria-hidden="true" style={{ visibility: 'hidden', display: 'inline-block', fontSize: 'inherit', lineHeight: 'inherit', margin: 0 }}>{children}</span>
    <img src={onDark ? '/brand-logo-lockup-kyokasho-on-dark.svg' : '/brand-logo-lockup-kyokasho.svg'} alt="縦糸横糸" style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: `${align} center` }} />
  </span>;
}
