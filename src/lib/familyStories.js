import {familyQuestion} from './familyVoice.js';
import {BOOK_MILESTONES_ENABLED} from './bookMilestones.js';

// The selected Person/Project, never the original recording actor, is the scope.
export function createFamilyStoryAccess(client, api, projectId) {
  const uploads = new WeakMap();
  const subject = async () => {
    const workspace = await api.workspace(projectId);
    if (workspace?.project_id !== projectId || !canProduce(workspace)) throw Error('語りを開けませんでした。');
    return workspace;
  };
  const invoke = async (name, body) => {
    const {error} = await client.rpc(name, {p:projectId,...body});
    if (error) throw Error(error.code === '40001' ? '別の操作で本文が更新されました。読み込み直してから編集してください。' : '保存できませんでした。もう一度お試しください。');
  };
  return {
    async list() {
      const workspace = await subject();
      const questionSet = workspace.questions.map((q,i) => ({...familyQuestion(q),sequence_order:i+1,chapter_label:q.chapter || ''}));
      const indices = new Map(questionSet.map(q=>[q.user_question_id,q.sequence_order]));
      const {data, error} = await client.from('answers')
        .select('id,book_project_id,user_question_id,transcript_raw,transcript_clean,transcript_readable,transcript_essay,transcript_edited,selected_style,snippet,created_at,meta_json')
        .eq('book_project_id',projectId).order('created_at');
      if (error) throw Error('語りを読み込めませんでした。');
      if ((data || []).some(a=>a.book_project_id!==projectId || !indices.has(a.user_question_id))) throw Error('語りと問いの対応を確認できませんでした。');
      const answers=(data || []).map(a=>({...a,sequence_order:indices.get(a.user_question_id)}));
      const mediaByAnswerId={};
      if(answers.length){
        const {data:media,error:mediaError}=await client.from('media_assets')
          .select('id,answer_id,book_project_id,asset_type,storage_path,meta_json,created_at')
          .eq('book_project_id',projectId).in('answer_id',answers.map(a=>a.id)).order('created_at');
        if(mediaError)throw Error('音声・写真を読み込めませんでした。');
        for(const m of media || []){
          if(m.book_project_id!==projectId || !answers.some(a=>a.id===m.answer_id))throw Error('記録の保存先を確認できませんでした。');
          const url=['photo','audio'].includes(m.asset_type)?await api.mediaUrl(m.asset_type,m.storage_path):null;
          (mediaByAnswerId[m.answer_id] ||= []).push({...m,url});
        }
      }
      let videoStories=[];
      if(BOOK_MILESTONES_ENABLED){
        const result=await client.from('video_stories').select('*').eq('book_project_id',projectId).order('slot_order');
        if(result.error)throw Error('動画を読み込めませんでした。');
        videoStories=result.data || [];
      }
      return {answers,mediaByAnswerId,questionSet,videoStories:videoStories || []};
    },
    async saveEdit(answer,style,body){
      await subject();
      await invoke('family_edit_story',{answer_id:answer.id,style,body,expected:{style:answer.selected_style ?? null,body:answer.transcript_edited ?? null}});
    },
    async addPhoto(file,answerId,replacing=null){
      await subject();
      // File identity + destination retain the same upload on a lost response.
      let targets=uploads.get(file);if(!targets){targets=new Map();uploads.set(file,targets);}
      const key=`${answerId}:${replacing || 'new'}`;
      if(!targets.has(key))targets.set(key,await api.reserve(projectId,file,'photo'));
      await invoke('family_attach_story_photo',{answer_id:answerId,upload_id:targets.get(key).id,replacing});
    },
    async removePhoto(photo){await subject();await invoke('family_remove_story_photo',{photo_id:photo.id});},
  };
}
import {canProduce} from './familyConnection.js';
