import React, {useEffect,useState} from 'react';
import QRCode from 'qrcode';

export const WEB_BOOK_QR_COPY='声に、また逢える場所。\nこの一冊に綴られた言葉を、ご本人の声とともに。';
export const qrPlacements = premium => premium ? ['after-title'] : ['after-title','back-cover'];

// A single existing publication URL for both editions; never creates/publishes a work.
export default function BookWebQR({url,placement='after-title',premium=false}) {
  const [image,setImage]=useState('');
  useEffect(()=>{let live=true;setImage('');if(url)QRCode.toDataURL(url,{width:256,margin:4,errorCorrectionLevel:'M',color:{dark:'#24392f',light:'#ffffff'}}).then(v=>{if(live)setImage(v);}).catch(()=>{});return()=>{live=false;};},[url]);
  if(!image||!qrPlacements(premium).includes(placement))return null;
  return <section aria-label={placement==='back-cover'?'裏表紙のWebブックQR':'扉の次のWebブック案内'} style={{background:'#faf9f5',color:'#24392f',padding:32,textAlign:'center',fontFamily:'serif'}}>
    {placement==='after-title'&&<><p>縦糸横糸 Webブック</p><p style={{whiteSpace:'pre-line',lineHeight:2,fontSize:14}}>{WEB_BOOK_QR_COPY}</p></>}
    <img src={image} alt="この作品のWebブックを開くQRコード" width="128" height="128" style={{display:'block',margin:'18px auto'}}/>
    <a href={url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'inherit'}}>Webブックを開く</a>
  </section>;
}
