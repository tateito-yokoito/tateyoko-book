import React, {useEffect,useState} from 'react';
import {ArrowRight, ChevronRight, Compass, Ellipsis, EllipsisVertical, Share, SquarePlus} from 'lucide-react';
import './home-install.css';

function deviceGuide() {
  const ua=navigator.userAgent;
  if(/iPad|iPhone|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1))return 'ios';
  if(/Android/.test(ua) && /Chrome\//.test(ua) && !/SamsungBrowser|EdgA|OPR\//.test(ua))return 'android';
  return 'other';
}
function Step({number,title,children,note}) {
  return <li className="install-step"><h3><span className="install-number">{number}</span>{title}</h3>{children}{note && <p className="install-note">{note}</p>}</li>;
}
function InstallDiagram({label,children,className=''}) {
  return <div className={`install-diagram ${className}`} role="img" aria-label={label}>{children}</div>;
}
function Icon({small=false}) {return <img className={`install-logo${small?' install-logo-small':''}`} src="/pwa/icon-192.png" width={small?48:64} height={small?48:64} alt="縦糸横糸"/>;}

const key = userId => `ty-home-install-v1:${userId}`;
export function installWasShown(userId) {
  try {return localStorage.getItem(key(userId)) === 'done';} catch {return false;}
}
export default function HomeInstall({userId,onDone}) {
  const [prompt,setPrompt]=useState(null);
  const [guide,setGuide]=useState(deviceGuide);
  const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  useEffect(()=>{
    const handler=e=>{e.preventDefault();setPrompt(e);};
    window.addEventListener('beforeinstallprompt',handler);
    return ()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);
  const done=()=>{try{localStorage.setItem(key(userId),'done');}catch{/* Optional preference. */}onDone();};
  return <section className="family-install" aria-labelledby="install-title">
    <div className="install-intro"><Icon/><h2 id="install-title">次からは、<br/>このアイコンから。</h2></div>
    {standalone ? <p>ホーム画面の「縦糸横糸」から、続きを語れます。</p> : <>
      <p>スマホのホーム画面に置きましょう。</p>
      <details className="install-help" open={/Line\//i.test(navigator.userAgent) || undefined}>
        <summary><ChevronRight size={18} aria-hidden="true"/>LINEで開いている方</summary>
        <p>先に、LINE内のメニューから{guide==='ios'?'Safari':guide==='android'?'Chrome':'ブラウザ'}で開いてください。</p>
        <InstallDiagram label="外部ブラウザで開く項目の例"><span className="install-row"><Compass aria-hidden="true"/>ブラウザで開く</span></InstallDiagram>
        <p className="install-note">表示名や位置は、端末によって異なります。</p>
      </details>
      <details className="install-help" open={guide==='other' || undefined}>
        <summary><ChevronRight size={18} aria-hidden="true"/>図が画面と違うとき</summary>
        <label>案内を切り替える<select value={guide} onChange={e=>setGuide(e.target.value)}><option value="ios">iPhone・iPad ／ Safari</option><option value="android">Android ／ Chrome</option><option value="other">その他のブラウザ</option></select></label>
      </details>
      {guide==='ios' && <ol className="install-steps">
        <Step number="1" title="Safariの「共有」を押す" note="この矢印が見えていれば、直接押せます。">
          <InstallDiagram label="その他の三点メニューから、上向き矢印の共有を選ぶ図" className="install-share"><Ellipsis aria-hidden="true"/><ArrowRight size={18} aria-hidden="true"/><span className="install-target"><Share aria-hidden="true"/>共有</span></InstallDiagram>
        </Step>
        <Step number="2" title="「ホーム画面に追加」を選ぶ" note="見つからないときは、メニューを下へ。">
          <InstallDiagram label="共有メニューのホーム画面に追加を囲んだ図"><div className="install-menu-muted">ブックマークを追加</div><div className="install-target install-row">ホーム画面に追加<SquarePlus aria-hidden="true"/></div></InstallDiagram>
        </Step>
        <Step number="3" title="右上の「追加」を押す" note="「Webアプリとして開く」があれば、オンに。">
          <InstallDiagram label="追加確認画面の右上の追加と、Webアプリとして開くがオンになっている図"><div className="install-row">ホーム画面に追加<span className="install-target">追加</span></div><div className="install-app"><Icon small/>縦糸横糸</div><div className="install-row install-toggle-label">Webアプリとして開く<span className="install-switch" aria-hidden="true"/></div></InstallDiagram>
        </Step>
      </ol>}
      {guide==='android' && <ol className="install-steps">
        <Step number="1" title="右上の「︙」を押す" note="Chromeで開いているときの操作です。">
          <InstallDiagram label="Chromeのアドレスバー右の三点メニューを囲んだ図"><div className="install-row">縦糸横糸<span className="install-target"><EllipsisVertical aria-hidden="true"/></span></div></InstallDiagram>
        </Step>
        <Step number="2" title="追加・インストールを選ぶ" note="「ホーム画面に追加」と表示される場合もあります。">
          <InstallDiagram label="インストールしてショートカットを作成から、インストールを選ぶ図"><div className="install-menu-muted">ブラウザのメニュー</div><div className="install-target install-row"><span>インストールして<br/>ショートカットを作成</span><ChevronRight aria-hidden="true"/></div><div className="install-menu-muted">↓ インストール</div></InstallDiagram>
        </Step>
        <Step number="3" title="確認画面で確定する" note="「追加」と表示されたら、それを押します。">
          <InstallDiagram label="縦糸横糸のインストール確認画面でインストールを囲んだ図"><div>アプリをインストール</div><div className="install-app"><Icon small/>縦糸横糸</div><div className="install-confirm"><span className="install-target">インストール</span></div></InstallDiagram>
        </Step>
      </ol>}
      {guide==='other' && <p>ブラウザのメニューから「ホーム画面に追加」または「インストール」を探してください。見つからない場合は、上でお使いの端末に合う案内を選んでください。</p>}
      {prompt && <button onClick={async()=>{await prompt.prompt();setPrompt(null);}}>ホーム画面に追加する</button>}
      <div className="install-after"><Icon small/><p>追加したら、このアイコンを<br/>一度押してみてください。</p></div>
      <details className="install-help"><summary><ChevronRight size={18} aria-hidden="true"/>開いたときにSMS確認が出たら</summary><p>同じ携帯電話番号で確認してください。</p></details>
      {guide==='android' && <details className="install-help"><summary><ChevronRight size={18} aria-hidden="true"/>アイコンが見つからないとき</summary><p>アプリ一覧に「縦糸横糸」があれば、長押ししてホーム画面へ移動してください。機種によって操作が異なります。</p></details>}
      <p className="install-note">図は操作場所の例です。表示名や位置は、端末によって異なります。</p>
    </>}
    <button onClick={done}>{standalone?'準備できました':'案内を閉じる'}</button>
  </section>;
}
