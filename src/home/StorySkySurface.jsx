import React, { useState } from 'react';
import { useDailySky } from './useDailySky.js';
import './story-sky.css';

// A presentation boundary only. No recording, Auth, Person or navigation state.
export default function StorySkySurface({ className = '', children, skyOverride }) {
  const liveSky = useDailySky('story', Boolean(skyOverride));
  const sky = skyOverride || liveSky;
  const [failed, setFailed] = useState(false);
  return <div className="story-sky-surface" data-story-sky={sky?.id || 'fallback'} style={{'--sky-dim':sky?.questionDim ?? .85}}>
    <div className="story-sky-backdrop" aria-hidden="true">
      {sky && !failed && <img src={sky.questionSrc || sky.src} style={{objectPosition:sky.questionObjectPosition, '--sky-phone-position':sky.questionObjectPosition, '--sky-pc-position':sky.pcQuestionObjectPosition || sky.questionObjectPosition}} alt="" onError={() => setFailed(true)} />}
    </div>
    <div className={`story-sky-content ${className}`}>{children}</div>
  </div>;
}

// Mounted outside the question/recording scene switch so the photograph does
// not remount or recrop when only the recording controls change.
export function PersistentStorySkyBackdrop({ active }) {
  const sky = useDailySky('story', !active);
  const [failed, setFailed] = useState(false);
  return <div className={`story-sky-persistent${active ? ' is-active' : ''}`} data-story-sky={sky?.id || 'fallback'} style={{'--sky-dim':sky?.questionDim ?? .85}} aria-hidden="true">
    <div className="story-sky-backdrop">
      {sky && !failed && <img src={sky.questionSrc || sky.src} style={{objectPosition:sky.questionObjectPosition, '--sky-phone-position':sky.questionObjectPosition, '--sky-pc-position':sky.pcQuestionObjectPosition || sky.questionObjectPosition}} alt="" onError={() => setFailed(true)} />}
    </div>
  </div>;
}
