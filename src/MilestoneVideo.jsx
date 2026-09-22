import React,{useEffect,useState} from 'react';
export default function MilestoneVideo({client,story}) {
 const [url,setUrl]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let live=true;setUrl(null);setError(false);
   client.storage.from('videos').createSignedUrl(story.video_storage_path,300).then(({data,error})=>{if(live){setUrl(data?.signedUrl || null);setError(Boolean(error));}}).catch(()=>{if(live)setError(true);});
   return()=>{live=false;};
 },[client,story.id,story.video_storage_path]);
 return <div className="mb-4">{url?<video controls playsInline preload="metadata" src={url} className="w-full max-h-80 rounded-xl" aria-label={story.title || '語りの動画'}/>:<p className="text-sm text-white/50">{error?'動画を開けませんでした。一覧を開き直してください。':'動画を読み込んでいます…'}</p>}</div>;
}
