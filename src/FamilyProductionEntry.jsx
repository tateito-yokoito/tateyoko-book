import React from 'react';
import FamilyConnectionTest from './FamilyConnectionTest.jsx';
import FamilyBookFlow from './FamilyBookFlow.jsx';
import FamilyRecordingFlow from './FamilyRecordingFlow.jsx';
import FamilySharedStories from './FamilySharedStories.jsx';
import FamilySubjectStories from './FamilySubjectStories.jsx';
import FamilyPhotoUpload from './FamilyPhotoUpload.jsx';
import FamilyPrivacySettings from './FamilyPrivacySettings.jsx';
import FamilyStartingFlow from './FamilyStartingFlow.jsx';
import FamilyPhotoStoryFlow from './FamilyPhotoStoryFlow.jsx';
import FamilyThemeFlow from './FamilyThemeFlow.jsx';
import FamilyDeliverySettings from './FamilyDeliverySettings.jsx';

// Mounted only after the family app allowlist gate. Every workspace operation
// still uses the existing BOOK RPC and RLS checks for its selected project.
export default function FamilyProductionEntry({ client, projectId }) {
  if (!projectId) return <p>作品を確認できませんでした。</p>;
  return <FamilyConnectionTest client={client} allowProduction
    onOwnStory={() => location.assign('/?app=family_place')}
    renderBook={props => <FamilyBookFlow {...props} client={client}/>}
    renderRecording={({key,...props}) => <FamilyRecordingFlow key={key} {...props}/>}
    renderSharedStories={({workspace,api,onBack}) => <FamilySharedStories
      key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderSubjectStories={props => <FamilySubjectStories
      key={`${props.session.user.id}:${props.workspace.project_id}`} {...props}/>}
    renderSupporterPhoto={({workspace,api,onBack}) => <FamilyPhotoUpload
      key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderPrivacy={props => <FamilyPrivacySettings {...props}/>}
    renderStarting={props => <FamilyStartingFlow key={props.workspace.project_id} {...props}/>}
    renderSubjectPhoto={props => <FamilyPhotoStoryFlow key={props.workspace.project_id} {...props}/>}
    renderTheme={props => <FamilyThemeFlow key={props.workspace.project_id} {...props}/>}
    renderDelivery={props => <FamilyDeliverySettings key={props.workspace.project_id} {...props}/>}
  />;
}
