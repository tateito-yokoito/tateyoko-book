import { familyPlacePublishedBooks } from './familyPlaceData.js';

export const validPublicBookId = value => /^[a-f0-9]{48}$/i.test(value || '');

// Resolve a published BOOK to a person only through the current user's
// authorized family rows and the existing authenticated library RPC.
export async function bookFamilyAccess(client, publicId) {
  if (!validPublicBookId(publicId)) return { status:'unavailable' };
  const { data:{ user }, error:userError } = await client.auth.getUser();
  if (userError || !user) return { status:'signed-out' };
  const { data:allowed, error:accessError } = await client.rpc('family_place_access_allowed');
  if (accessError || !allowed) return { status:'other-family' };
  const { data:families, error:familiesError } = await client.from('families')
    .select('id').eq('owner_user_id', user.id);
  if (familiesError) return { status:'other-family' };
  for (const family of families || []) {
    const { data:people, error:peopleError } = await client.from('persons')
      .select('id').eq('family_id', family.id);
    if (peopleError) return { status:'other-family' };
    for (const person of people || []) {
      let books;
      try { books = await familyPlacePublishedBooks(client, person.id); }
      catch { return { status:'other-family' }; }
      if (books.some(book => book.public_id === publicId))
        return { status:'allowed' };
    }
  }
  return { status:'other-family' };
}
