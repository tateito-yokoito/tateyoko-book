import React, {useMemo} from 'react';
import {PhotoCorrectionFlow} from './App.jsx';
import {createFamilyPhotoSaver} from './lib/familyPhoto.js';

export default function FamilyPhotoUpload({api, projectId, onBack}) {
  const save = useMemo(() => createFamilyPhotoSaver(api, projectId), [api, projectId]);
  return <PhotoCorrectionFlow open awaitCompletion onComplete={save} onClose={onBack}/>;
}
