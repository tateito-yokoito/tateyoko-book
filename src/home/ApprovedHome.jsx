import React, { useState } from 'react';
import JourneyGuideGate from '../JourneyGuideGate.jsx';
import { ArrowRight, ChevronRight, Image, List, Files, BookOpen, Library, Users, Gift, UserRound, Mail, Settings, Video } from 'lucide-react';
import { useDailySky } from './useDailySky.js';
import { countAnsweredStories, countAnsweredStoryThemes } from '../lib/storyPages.js';
import './approved-home.css';
import { homeQuestionHeading } from './homeQuestionHeading.js';
import { supportRoleLabel } from '../lib/supportRole.js';

function Row({ icon: Icon, children, badge, attention = false, onClick, href, disabled }) {
  const Tag = href ? 'a' : 'button';
  return <Tag className="ah-row" href={href} type={href ? undefined : 'button'} onClick={onClick} disabled={disabled}>
    <Icon size={20} strokeWidth={1.4} aria-hidden="true" /><span className="ah-label">{children}</span>
    {badge && <span className={`ah-count${attention ? ' ah-count--attention' : ''}`}>{badge}</span>}{!disabled && <ChevronRight size={17} aria-hidden="true" />}
  </Tag>;
}
function Group({ title, children }) {
  return <section className="ah-group"><h2>{title}</h2><div className="ah-rows">{children}</div></section>;
}
const nameOf = name => !name ? 'ご家族' : /さん$/.test(name) ? name : `${name}さん`;

export default function ApprovedHome({guideClient, ...props}) {
  if(!guideClient)return <ApprovedHomeContent {...props}/>;
  return <JourneyGuideGate client={guideClient}>{open=><ApprovedHomeContent {...props}
    onOpenStoryPages={()=>open('stories',()=>props.onOpenStoryPages?.())}
    onOpenBookBuilder={()=>open('book',()=>props.onOpenBookBuilder?.())}
    onOpenShelf={()=>open('shelf',()=>props.onOpenShelf ? props.onOpenShelf() : window.location.assign('/?library=1'))}
  />}</JourneyGuideGate>;
}

// Presentation only: all Person-scoped reads, guards and navigation stay with the caller.
function ApprovedHomeContent({ themeProgress, questionSet = [], currentIndex = 0, supportedProjects = [], receivedProjects = [], invitationCards, skyOverride,
  onStartTalking, onStartPhotoStory, onStartVideoStory, onOpenQuestionLibrary, onOpenStoryPages, canOpenThemeMemories, onOpenThemeMemories, storyRequestSummary, onOpenBookBuilder, onOpenSettings,
  onOpenSupportedProject, onOpenReceivedProject, onAddFamilyStory, onShareWithFriend, onDevLogout, onOpenShelf, ownStoryEntry,
  onOpenLineDelivery, supportedActions = null, settingsActions = [] }) {
  const liveSky = useDailySky('home', Boolean(skyOverride)), sky = skyOverride || liveSky, [failedSrc, setFailedSrc] = useState(null);
  const count = countAnsweredStories(questionSet);
  const themeCount = countAnsweredStoryThemes(questionSet);
  const unviewedCount = storyRequestSummary?.unviewedCount || 0;
  const includedCount = storyRequestSummary?.includedCount || 0;
  const contributorCount = storyRequestSummary?.contributorCount || 0;
  const contributionBadge = unviewedCount ? `未確認${unviewedCount}件`
    : includedCount && contributorCount ? `採用${includedCount}件／${contributorCount}人` : `採用${includedCount}件`;
  const heading = homeQuestionHeading(questionSet, currentIndex, themeProgress);
  return <div className="approved-home">
    <div className="ah-sky" data-sky={sky?.id || 'fallback'}>
      {sky && sky.src !== failedSrc && <img src={sky.src} style={{objectPosition:sky.homeObjectPosition, '--sky-phone-position':sky.homeObjectPosition, '--sky-pc-position':sky.pcHomeObjectPosition || sky.homeObjectPosition}} alt="" width="960" height="640" fetchPriority="high" onError={() => setFailedSrc(sky.src)} />}
    </div>
    <div className="ah-content">
      {ownStoryEntry ? <section className="ah-journey ah-own-entry" aria-label="自分の物語を始める">
        <h1>自分の物語</h1>
        <div className="ah-own-actions">
          <button type="button" onClick={ownStoryEntry.onTryFree}>無料3問を試す</button>
          <button type="button" onClick={ownStoryEntry.onStart}>物語を始める</button>
        </div>
      </section> : <>
      {(heading || !supportedActions || supportedActions.record) && <section className="ah-journey" aria-label="現在のテーマと次の問い">
        {heading && <div className="ah-theme"><span>{heading.eyebrow}</span>{heading.progress && <span className="ah-trial-progress">{heading.progress}</span>}<h1>{heading.title}</h1></div>}
        {(!supportedActions || supportedActions.record) && <button type="button" className="ah-primary" onClick={onStartTalking}>次の問いに語る<ArrowRight size={19} aria-hidden="true" /></button>}
      </section>}
      {(!supportedActions || supportedActions.photo || supportedActions.questionList || supportedActions.video) && <div className="ah-rows">{(!supportedActions || supportedActions.photo) && <Row icon={Image} onClick={onStartPhotoStory}>写真から語る</Row>}{supportedActions?.video && <Row icon={Video} onClick={onStartVideoStory}>動画で語る</Row>}{(!supportedActions || supportedActions.questionList) && <Row icon={List} onClick={onOpenQuestionLibrary}>問いの一覧</Row>}</div>}
      {(!supportedActions || supportedActions.stories || supportedActions.book) && <Group title="これまでの語り">{(!supportedActions || supportedActions.stories) && <Row icon={Files} badge={`${count}件／${themeCount}テーマ`} onClick={onOpenStoryPages}>語りを見る</Row>}{!supportedActions && canOpenThemeMemories && <Row icon={Users} badge={contributionBadge} attention={unviewedCount > 0} onClick={onOpenThemeMemories}>大切な人からの語り</Row>}{(!supportedActions || supportedActions.book) && <Row icon={BookOpen} onClick={onOpenBookBuilder}>本に仕上げる</Row>}</Group>}
      </>}
      {!ownStoryEntry && !supportedActions && <Group title="本棚"><Row icon={Library} href={onOpenShelf ? undefined : '/?library=1'} onClick={onOpenShelf}>私の本棚・家族の本棚</Row></Group>}
      {receivedProjects.length > 0 && <Group title="家族の語り">{receivedProjects.map(p => <Row key={p.book_project_id} icon={Files} onClick={() => onOpenReceivedProject?.(p)}>{nameOf(p.subject_name)}の語り</Row>)}</Group>}
      {['制作管理中', '共同管理中', 'お手伝い中'].map(roleLabel => {
        const projects = supportedProjects.filter(p => supportRoleLabel(p.support_role) === roleLabel);
        return projects.length > 0 && <Group key={roleLabel} title={roleLabel}>{projects.map(p => <Row key={p.supporter_id || p.book_project_id} icon={Users} onClick={() => onOpenSupportedProject?.(p)}>{nameOf(p.subject_name)}の物語</Row>)}</Group>;
      })}
      {ownStoryEntry && <Group title="本棚"><Row icon={Library} href={onOpenShelf ? undefined : '/?library=1'} onClick={onOpenShelf}>私の本棚・家族の本棚</Row></Group>}
      {invitationCards}
      {onOpenLineDelivery && <Group title="問いの受け取り"><Row icon={Mail} onClick={onOpenLineDelivery}>LINEでも問いを受け取る</Row></Group>}
      {ownStoryEntry?.onAddSupportedStory && <Group title="物語を追加する"><Row icon={Users} onClick={ownStoryEntry.onAddSupportedStory}>誰かの物語を始める</Row></Group>}
      {!ownStoryEntry && !supportedActions && <Group title="物語を追加する"><Row icon={Gift} onClick={onAddFamilyStory} disabled={!onAddFamilyStory}>家族に贈る</Row><Row icon={UserRound} disabled>自分の物語を追加する</Row><Row icon={Mail} onClick={onShareWithFriend}>友人に紹介する</Row></Group>}
      {(onOpenSettings || settingsActions.length > 0) && <footer className="ah-footer">
        {settingsActions.length > 0 ? <details className="ah-settings"><summary><Settings size={30} strokeWidth={1.4} aria-hidden="true" /><span>設定</span></summary><div className="ah-rows">{settingsActions.map(action => <Row key={action.label} icon={action.icon} onClick={action.onClick}>{action.label}</Row>)}</div></details>
          : <button type="button" onClick={onOpenSettings}><Settings size={30} strokeWidth={1.4} aria-hidden="true" /><span>設定</span></button>}
      </footer>}
      {onDevLogout && <button type="button" className="ah-dev" onClick={onDevLogout}>開発用ログアウト</button>}
    </div>
  </div>;
}
