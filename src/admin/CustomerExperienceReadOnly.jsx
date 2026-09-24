import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Scene_ConnectionsHome, Scene_SupportProjectHome, Scene_SupportedStoryPages } from '../App.jsx';

const label = value => value || '名称未登録';

// The live customer home/story components are reused with mutation callbacks
// absent and readOnly=true. Actor remains the administrator throughout.
export default function CustomerExperienceReadOnly({ client, targetAccountId, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [selected, setSelected] = useState(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [stories, setStories] = useState({ loading: false, data: null, error: '' });

  useEffect(() => {
    let active = true;
    client.rpc('get_admin_readonly_customer', { input_account_id: targetAccountId }).then(({ data, error }) => {
      if (active) setState({ loading: false, data: error ? null : data, error: error?.message || '' });
    });
    return () => { active = false; };
  }, [client, targetAccountId]);

  const openStories = async () => {
    if (!selected) return;
    setStories({ loading: true, data: null, error: '' });
    const { data, error } = await client.functions.invoke('admin-web-book-preview', {
      body: { action: 'stories', targetAccountId, projectId: selected.project.id },
    });
    if (error || !data?.success || !data?.stories) {
      setStories({ loading: false, data: null, error: 'このアカウントから語りを閲覧できません。' });
      return;
    }
    const answers = (data.stories.answers || []).map(answer => ({
      ...answer, transcript_edited: answer.transcript_edited || answer.transcript || '',
      transcript_readable: answer.transcript_readable || answer.transcript || '',
    }));
    setStories({ loading: false, data: {
      project: { ...selected.project, subject_name: selected.project.subject_name || selected.project.title },
      storyRows: answers,
      questionSet: data.stories.questions || [],
      mediaByAnswerId: Object.fromEntries(answers.map(answer => [answer.id,
        (answer.media || []).map(item => ({ ...item, url: item.signed_url || null }))])),
    }, error: '' });
  };

  if (selected && stories.data) return <Scene_SupportedStoryPages {...stories.data} mode="admin"
    onBack={() => setStories({ loading: false, data: null, error: '' })} />;

  const back = () => {
    if (selected) { setSelected(null); setStories({ loading: false, data: null, error: '' }); }
    else if (shelfOpen) setShelfOpen(false);
    else onClose();
  };
  const header = <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 text-white/70">
    <button type="button" onClick={back} aria-label="前の画面へ戻る"><ArrowLeft size={20}/></button>
    <span className="text-xs">顧客体験を見る · 閲覧専用</span><span className="w-5"/>
  </header>;

  return <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f172a] text-white">
    {header}
    {state.loading ? <p className="m-auto">読み込んでいます…</p>
      : state.error ? <p role="alert" className="m-auto px-6 text-center">{state.error}</p>
      : selected ? <div className="mx-auto min-h-0 w-full max-w-[600px] flex-1">
          <Scene_SupportProjectHome
            project={{ ...selected.project, can_edit_book_text: true }}
            isOwner={selected.role === 'owner'} readOnly
            onOpenStories={openStories} onBack={back}
          />
          {(stories.loading || stories.error) && <div className="absolute inset-x-6 bottom-8 rounded-xl bg-slate-800 p-4 text-center text-sm">
            {stories.loading ? '語りを読み込んでいます…' : stories.error}
          </div>}
        </div>
      : shelfOpen ? <div className="mx-auto w-full max-w-[600px] flex-1 overflow-y-auto px-5 py-10">
          <h1 className="text-center text-xl">本棚</h1>
          {state.data?.bookshelf?.length ? state.data.bookshelf.map(work =>
            <div key={work.id} className="glass-card mt-5 p-5">{label(work.title || work.subject_name)}</div>)
          : <p className="glass-card mt-10 p-6 text-center text-white/60">完成した作品は、まだありません。</p>}
        </div>
      : <div className="mx-auto min-h-0 w-full max-w-[600px] flex-1">
          <Scene_ConnectionsHome userName={state.data?.display_name}
            ownedProjects={state.data?.owned_projects || []}
            supportedProjects={(state.data?.supported_projects || []).map(project => ({
              ...project, supporter_id: project.id,
            }))}
            readOnly
            onOpenOwnedProject={project => setSelected({ project, role: 'owner' })}
            onOpenSupportedProject={project => setSelected({ project, role: 'supporter' })}
            onOpenBookshelf={() => setShelfOpen(true)}
          />
        </div>}
  </div>;
}
