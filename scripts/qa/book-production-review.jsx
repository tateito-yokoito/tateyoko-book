import React from 'react';
import {createRoot} from 'react-dom/client';
import ApprovedHome from '../../src/home/ApprovedHome.jsx';
import {Scene_OnboardingOverview,Scene_OnboardingPace,Scene1_MyPage,Scene3_5_VoiceCheck,Scene6_Completion,Scene_BookBuilder} from '../../src/App.jsx';
import SupporterContextFrame from '../../src/SupporterContextFrame.jsx';
import '../../src/index.css';

// Capture the production React components with entirely fictional, local data.
// This never creates an order, signs in, reads a customer, or calls Supabase.
const scene = new URLSearchParams(location.search).get('scene') || 'home';
const noop = () => {};
const question = {id:'fiction-question',content:'子どものころ、夢中になった遊びは何ですか？',text:'子どものころ、夢中になった遊びは何ですか？',onboarding_group:'starting_conversation',group:'starting_conversation',sequence_order:1};
const story = {id:'fiction-answer',question_id:question.id,sequence_order:1,transcript_edited:'架空のデモ用の語りです。子どものころ、庭で家族と遊んだことを覚えています。',snippet:'架空のデモ用の語りです。'};
const common = {bookPhase:'editing',questionSet:[{...question,status:'answered'}],currentIndex:0,skyOverride:{id:'fixture',src:'/site/approved-skies/sky-053-people-removed-2e586901b46f.webp'},themeProgress:{currentTheme:{order:1,label:'子どもの頃'}},onStartTalking:noop,onStartPhotoStory:noop,onOpenQuestionLibrary:noop,onOpenStoryPages:noop,onOpenBookBuilder:noop,onOpenShelf:noop};
const reviewData = {transcript:'架空のデモ用の語りです。',transcriptRaw:'架空のデモ用の語りです。',transcriptClean:'架空のデモ用の語りです。',transcriptReadable:'架空のデモ用の語りです。',transcriptEssay:'架空のデモ用の語りです。',editedText:'架空のデモ用の語りです。',selectedStyle:'readable',transcriptionStatus:'done',polishStatus:'done',audioUrl:'',audioSegments:[]};
let view;
if(scene==='home') view=<ApprovedHome {...common}/>;
else if(scene==='proxy-home') view=<SupporterContextFrame name="架空 あおい" onReturn={noop}><ApprovedHome {...common} supportedActions={{record:true,photo:true,questionList:true,stories:true,book:true}}/></SupporterContextFrame>;
else if(scene==='opening') view=<Scene_OnboardingOverview onNext={noop}/>;
else if(scene==='pace') view=<Scene_OnboardingPace onNext={noop}/>;
else if(scene==='question') view=<Scene1_MyPage question={question} progress={{currentIndex:0,total:3}} userName="架空 あおい" onNext={noop} onSkip={noop} onEndToday={noop}/>;
else if(scene==='review') view=<Scene3_5_VoiceCheck data={reviewData} onRetry={noop} onAddMore={noop} onRetryTranscription={noop} onSelectStyle={noop} onUpdateText={noop} onProceed={noop}/>;
else if(scene==='saved') view=<Scene6_Completion onTalkMore={noop} onHome={noop} onEndToday={noop}/>;
else if(scene.startsWith('book-')) view=<Scene_BookBuilder user={{id:'fiction-user',display_name:'架空 あおい'}} project={{subject_name:'架空 あおい',access_status:'legacy'}} questionSet={[question]} initialBookStories={[story]} initialBookMediaByAnswerId={{}} initialStepIndex={Number(scene.slice(5))} onBack={noop} mayFinalize={false}/>;
else view=<p>Unknown review screen</p>;
createRoot(document.getElementById('root')).render(<div className="min-h-dvh bg-[#0f172a] text-white">{view}</div>);
