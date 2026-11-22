import React from 'react';
import CoverPhotoFrame from './CoverPhotoFrame.jsx';
import './web-book.css';

export const publicationCoverImageUrl = publicId =>
  publicId === '0ae7500b3ee6507721663b40c02ea7dc3c5de4f7be949288'
    ? '/site/webbook-sample-cover-sage.jpg' : '';

// The reader and the bookshelf render the same fixed publication cover.
export default function WebBookCover({ publication, coverUrl = '', nameAudioButton = null }) {
  if (publication.coverImageUrl) return <section className="wb-cover wb-cover-reference" aria-label="ブックの表紙">
    <img src={publication.coverImageUrl} alt={`${publication.subjectName || publication.title}のブック表紙`}/>
  </section>;
  return <section className="wb-cover wb-cover-print" style={{'--wb-cover-color':publication.coverColor || '#a9bcb6'}}>
    <div className="wb-name"><h1>{publication.subjectName || publication.title}</h1>{nameAudioButton}</div>
    {publication.title && publication.title !== publication.subjectName && <p className="wb-book-title">{publication.title}</p>}
    {publication.subtitle && <p className="wb-subtitle">{publication.subtitle}</p>}
    {coverUrl && <div className="wb-cover-photo" role="img" aria-label="BOOKの表紙写真">
      <CoverPhotoFrame photo={{url:coverUrl,transform:publication.coverTransform}}
        backgroundColor="transparent" className="wb-cover-photo-frame"/>
    </div>}
    {publication.footerText && <p className="wb-date">{publication.footerText}</p>}
    <p className="wb-cover-brand">縦糸横糸</p>
  </section>;
}
