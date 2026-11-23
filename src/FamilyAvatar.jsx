import React, { createContext, useContext } from 'react';
import { avatarStage } from './lib/avatarStage.js';
import './family-avatar.css';

export { avatarStage };

const AvatarFamilyContext = createContext({ people: [], relations: [] });

export function FamilyAvatarProvider({ people, relations, children }) {
  return <AvatarFamilyContext.Provider value={{ people, relations }}>{children}</AvatarFamilyContext.Provider>;
}

const spriteColumns = { male: 441, female: 735, neutral: 1035 };
const spriteRows = { child: 255, young: 453, adult: 622, mature: 779, senior: 940,
  unknown: 1097 };
const cropSize = 180;

export default function FamilyAvatar({ person, className = '' }) {
  const { people, relations } = useContext(AvatarFamilyContext);
  if (person?.portrait_url) return <img className={`family-avatar ${className}`.trim()}
    src={person.portrait_url} width="512" height="512" alt=""/>;
  const stage = avatarStage(person, new Date(), relations, people);
  const style = person?.gender === 'female' ? 'female' : person?.gender === 'male' ? 'male' : 'neutral';
  const x = spriteColumns[style];
  const y = spriteRows[stage];
  return <span className={`family-avatar family-avatar-illustration ${className}`.trim()}
    role="img" aria-label={stage === 'unknown' ? '年齢未登録の人物のイラスト' : '人物のイラスト'}>
    <img src="/assets/family-avatar-final-20261123.png" alt="" aria-hidden="true"
      style={{ width: `${1306 / cropSize * 100}%`,
        left: `${(0.5 - x / cropSize) * 100}%`, top: `${(0.5 - y / cropSize) * 100}%` }}/>
  </span>;
}
