import React, {useMemo} from 'react';
import {Scene_PrivateStorySettings} from './App.jsx';
import {createFamilyPrivacyAccess} from './lib/familyPrivacy.js';
import {familyQuestion} from './lib/familyVoice.js';

export default function FamilyPrivacySettings({api, workspace, session, onBack}) {
  const access = useMemo(() => createFamilyPrivacyAccess(api, workspace.project_id), [api, workspace.project_id]);
  return <div className="fixed inset-0 bg-[#0f172a] text-white">
    <Scene_PrivateStorySettings key={`${session.user.id}:${workspace.project_id}`}
      user={session.user} questionSet={workspace.questions.map(familyQuestion)}
      storyAccess={access} productionContext onBack={onBack}/>
  </div>;
}
