import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFamilyAccess } from '../../src/lib/bookFamilyAccess.js';

const publicId = 'a'.repeat(48);
const clientFor = ({ user = { id:'user-1' }, allowed = true, bookIds = [] } = {}) => {
  const calls = [];
  return { calls,
    auth:{ getUser:async () => ({ data:{ user }, error:null }) },
    rpc:async (name, args) => {
      calls.push([name,args]);
      if (name === 'family_place_access_allowed') return { data:allowed, error:null };
      if (name === 'list_family_place_person_books') return { data:bookIds.map(id => ({ public_id:id })), error:null };
      throw Error('unexpected RPC');
    },
    from:name => ({ select:() => ({ eq:async () => {
      calls.push(['select',name]);
      return { data:name === 'families' ? [{ id:'family-1' }] : [{ id:'person-1' }], error:null };
    } }) }),
  };
};

test('QR alone and an unapproved account never query family records', async () => {
  const signedOut = clientFor({ user:null });
  assert.deepEqual(await bookFamilyAccess(signedOut,publicId), { status:'signed-out' });
  assert.deepEqual(signedOut.calls, []);
  const denied = clientFor({ allowed:false });
  assert.deepEqual(await bookFamilyAccess(denied,publicId), { status:'other-family' });
  assert.equal(denied.calls.filter(([kind]) => kind === 'select').length, 0);
});

test('only a published book listed for a person in the signed-in family can redirect', async () => {
  assert.deepEqual(await bookFamilyAccess(clientFor({ bookIds:[publicId] }),publicId), { status:'allowed' });
  assert.deepEqual(await bookFamilyAccess(clientFor({ bookIds:['b'.repeat(48)] }),publicId),
    { status:'other-family' });
  const invalid = clientFor();
  assert.deepEqual(await bookFamilyAccess(invalid,'not-a-book'), { status:'unavailable' });
  assert.equal(invalid.calls.length,0);
});
