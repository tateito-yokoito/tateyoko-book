import React from 'react';
import './family-avatar.css';

export function avatarStage(person, now = new Date()) {
  if (!person?.birth_year) return 'unknown';
  const age = now.getFullYear() - Number(person.birth_year);
  if (age < 13) return 'child';
  if (age < 25) return 'young';
  if (age < 65) return 'adult';
  return 'senior';
}

export default function FamilyAvatar({ person, className = '' }) {
  if (person?.portrait_url) return <img className={`family-avatar ${className}`.trim()}
    src={person.portrait_url} alt=""/>;
  const stage = avatarStage(person);
  const style = person?.gender === 'female' ? 'female' : person?.gender === 'male' ? 'male' : 'neutral';
  return <svg className={`family-avatar ${className}`.trim()} viewBox="0 0 96 96"
    role="img" aria-label={`${stage === 'unknown' ? '年齢未登録の' : ''}人物のイラスト`}>
    <defs><linearGradient id={`avatar-bg-${stage}-${style}`} x2="1" y2="1"><stop stopColor="#f5edda"/><stop offset="1" stopColor="#dce7d1"/></linearGradient></defs>
    <circle cx="48" cy="48" r="47" fill={`url(#avatar-bg-${stage}-${style})`}/>
    <path d="M16 91c3-19 16-28 32-28s29 9 32 28" fill={style === 'female' ? '#a9b997' : '#809a8c'}/>
    {style === 'female' && <path d="M25 49c-1-21 5-34 23-34s24 13 23 34l-5 18H30z" fill={stage === 'senior' ? '#a9a8a1' : '#554d43'}/>}
    <ellipse cx="48" cy="45" rx={stage === 'child' ? 18 : 17} ry={stage === 'child' ? 20 : 22} fill="#e8c8a7"/>
    <path d={stage === 'senior' ? 'M30 39c-1-14 8-23 19-23 11 0 19 8 18 23-7-8-16-10-24-8-6 1-10 4-13 8z' :
      stage === 'child' ? 'M31 38c0-12 7-20 17-20 11 0 17 8 17 20-9-7-22-8-34 0z' :
      'M31 38c-1-15 7-23 18-23s19 8 18 23c-10-7-24-8-36 0z'}
      fill={stage === 'senior' ? '#aaa9a0' : style === 'female' ? '#554d43' : '#4f5148'}/>
    <path d="M39 46h1m16 0h1" stroke="#615347" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M43 55q5 3 10 0" fill="none" stroke="#a77b69" strokeWidth="1.5" strokeLinecap="round"/>
    {stage === 'senior' && <path d="M33 47h12m7 0h12m-19 0h7" fill="none" stroke="#7f8079" strokeWidth="1.3"/>}
    <circle cx="48" cy="48" r="47" fill="none" stroke="#e9e3d6"/>
  </svg>;
}
