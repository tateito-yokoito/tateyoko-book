export function formatBookMonth(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' }).format(date);
}

export function chronologicalBooks(books) {
  return [...books].sort((a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0) || a.id.localeCompare(b.id));
}

// Presentation only. This function never grants access or fetches extra publications.
export function libraryFromPublications(rows) {
  const people = new Map(), books = new Map();
  for (const row of rows) {
    if (!row.publication_id || books.has(row.publication_id)) continue;
    // Never merge people by display name. Old RPC results remain isolated by project.
    const personId = row.subject_person_id || `legacy-project:${row.book_project_id || row.publication_id}`;
    const isSelf = row.is_self === true;
    const book = {
      id: row.publication_id, personId, title: row.title || '残された声', subtitle: row.subtitle || '',
      publishedAt: row.published_at, publicId: row.public_id, color: '#d6dcc5',
      relationship: row.relationship, accessMode: row.access_mode,
      canManageAccess: row.relationship === 'owner' || row.relationship === 'managed',
    };
    books.set(book.id, book);
    if (!people.has(personId)) people.set(personId, { id: personId, name: row.subject_name || '名前未設定', isSelf, note: '', books: [] });
    people.get(personId).books.push(book);
  }
  const all = [...people.values()].map(person => ({ ...person, books: chronologicalBooks(person.books) }));
  return { ownBooks: chronologicalBooks(all.filter(person => person.isSelf).flatMap(person => person.books)), familyPeople: all.filter(person => !person.isSelf) };
}
