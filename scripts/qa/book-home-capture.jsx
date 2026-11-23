import React from 'react';
import { createRoot } from 'react-dom/client';
import ApprovedHome from '../../src/home/ApprovedHome.jsx';
import '../../src/index.css';

// The production BOOK home component with fabricated presentation props.
// No project ID, auth token, customer, API or database is provided.
createRoot(document.getElementById('root')).render(<ApprovedHome
  bookPhase="editing"
  questionSet={[{ id:'demo-question', status:'unanswered' }]}
  themeProgress={{ currentTheme: { order:1, label:'子どもの頃' } }}
  currentIndex={0}
  skyOverride={{ id:'fixture', src:'/site/approved-skies/sky-053-people-removed-2e586901b46f.webp' }}
  onStartTalking={() => { document.documentElement.dataset.qaAction = 'next-question'; }}
  onStartPhotoStory={() => { document.documentElement.dataset.qaAction = 'photo-story'; }}
  onOpenQuestionLibrary={() => { document.documentElement.dataset.qaAction = 'questions'; }}
  onOpenStoryPages={() => { document.documentElement.dataset.qaAction = 'stories'; }}
  onOpenBookBuilder={() => { document.documentElement.dataset.qaAction = 'book-builder'; }}
  onOpenShelf={() => { document.documentElement.dataset.qaAction = 'shelf'; }}
/>);
