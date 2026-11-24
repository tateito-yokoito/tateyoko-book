// Local data source for the public, unauthenticated family-tree experience.
// It implements only the Supabase operations used by the shared family UI.
// Nothing in this module sends demo input to a server.
const KEY = 'tateyoko.public-family-demo.v2';
const FAMILY_ID = 'demo-family';
const USER_ID = 'demo-user';
const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);

function seed() {
  const people = [
    ['self','紡木','誠','male',1981],
    ['father','紡木','健一','male',1958],
    ['mother','紡木','和子','female',1960],
    ['spouse','紡木','由美','female',1983],
    ['child','紡木','悠','',2016],
  ].map(([id,family_name,given_name,gender,birth_year], index) => ({
    id, family_id:FAMILY_ID, family_name, given_name,
    display_name:`${family_name} ${given_name}`, gender:gender || null, birth_year,
    birth_month:id === 'self' ? 4 : null,
    birth_day:id === 'self' ? 28 : null, death_year:null, notes:null,
    family_name_kana:null, given_name_kana:null, maiden_name:null,
    maiden_name_kana:null, portrait_storage_path:null,
    portrait_source_storage_path:null, created_at:new Date(2020,0,index+1).toISOString(),
  }));
  const relation = (id,person_a_id,person_b_id,relation_type) =>
    ({ id, family_id:FAMILY_ID, person_a_id, person_b_id, relation_type, created_at:id });
  return { people, relations:[
    relation('r1','father','self','parent_child'),
    relation('r2','mother','self','parent_child'),
    relation('r3','father','mother','spouse'),
    relation('r4','self','spouse','spouse'),
    relation('r5','self','child','parent_child'),
    relation('r6','spouse','child','parent_child'),
  ], decisions:[], facts:[], stories:[], mediaRows:[], memories:[], media:{}, sessionId:uid() };
}

let memory = null;
function read() {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    memory = raw ? JSON.parse(raw) : seed();
    memory.stories ||= [];
    memory.mediaRows ||= [];
    memory.memories ||= [];
  } catch { memory = seed(); }
  return memory;
}
function write() {
  try { sessionStorage.setItem(KEY, JSON.stringify(memory)); }
  catch { throw new Error('ブラウザの一時保存領域がいっぱいです。写真を小さくしてお試しください。'); }
}
function rows(table) {
  const state = read();
  const name = { persons:'people', family_person_relations:'relations',
    family_relation_suggestions:'decisions', family_person_profile_facts:'facts',
    family_free_stories:'stories', family_free_story_media:'mediaRows' }[table];
  if (name) return state[name];
  if (['user_person_links','book_projects','profiles'].includes(table))
    return table === 'user_person_links' ? [{ user_id:USER_ID, person_id:'self', role:'self' }] : [];
  throw new Error(`公開デモでは ${table} を利用できません`);
}
function validateRelation(candidate, oldId = null) {
  const state = read();
  const { person_a_id:a, person_b_id:b, relation_type:type } = candidate;
  if (!state.people.some(p => p.id === a) || !state.people.some(p => p.id === b) || a === b)
    throw new Error('異なる登録済み人物を選んでください');
  const others = state.relations.filter(r => r.id !== oldId);
  if (others.some(r => r.relation_type === type
    && r.person_a_id === a && r.person_b_id === b)) throw new Error('同じ関係は登録済みです');
  if (type === 'parent_child') {
    const visited = new Set(); const queue = [b];
    for (const id of queue) {
      if (id === a) throw new Error('親子関係が循環します');
      for (const row of others.filter(r => r.relation_type === type && r.person_a_id === id)) {
        if (!visited.has(row.person_b_id)) { visited.add(row.person_b_id); queue.push(row.person_b_id); }
      }
    }
  }
}
function relationFromRole(anchorId, otherId, role) {
  let a = anchorId; let b = otherId; let type = 'parent_child';
  if (['father','mother','parent'].includes(role)) { a = otherId; b = anchorId; }
  else if (role === 'spouse') { type = 'spouse'; [a,b] = [anchorId,otherId].sort(); }
  else if (role !== 'child') throw new Error('関係を選んでください');
  return { family_id:FAMILY_ID, person_a_id:a, person_b_id:b, relation_type:type };
}

class Query {
  constructor(table, action = 'select', payload = null) {
    this.table = table; this.action = action; this.payload = payload;
    this.filters = []; this.sorts = []; this.maximum = null;
  }
  select() { return this; }
  eq(key,value) { this.filters.push(row => row[key] === value); return this; }
  in(key,values) { this.filters.push(row => values.includes(row[key])); return this; }
  order(key,{ascending = true} = {}) { this.sorts.push([key,ascending]); return this; }
  limit(n) { this.maximum = n; return this; }
  single() { return this.run('single'); }
  maybeSingle() { return this.run('maybe'); }
  then(resolve,reject) { return this.run().then(resolve,reject); }
  async run(mode = 'many') {
    const before = this.action === 'select' ? null : clone(read());
    try {
      const source = rows(this.table);
      let matched = source.filter(row => this.filters.every(fn => fn(row)));
      let result;
      if (this.action === 'select') {
        result = [...matched];
        for (const [key,ascending] of this.sorts.reverse()) result.sort((a,b) =>
          (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (ascending ? 1 : -1));
        if (this.maximum != null) result = result.slice(0,this.maximum);
      } else if (this.action === 'insert' || this.action === 'upsert') {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(item => ({ ...item }));
        for (const item of incoming) {
          if (this.table === 'family_free_stories') {
            item.revision ||= 1;
            item.body ||= '';
            item.transcript_raw ||= '';
            item.transcript_readable ||= '';
            item.transcript_essay ||= '';
            item.updated_at ||= new Date().toISOString();
          }
          if (this.table === 'family_person_relations') validateRelation(item);
          if (this.table === 'family_relation_suggestions') {
            const existing = source.find(row => row.family_id === item.family_id && row.kind === item.kind
              && row.person_a_id === item.person_a_id && row.person_b_id === item.person_b_id);
            if (existing) { Object.assign(existing,item); item.id = existing.id; continue; }
          }
          item.id ||= uid(); item.created_at ||= new Date().toISOString(); source.push(item);
        }
        result = incoming;
      } else if (this.action === 'update') {
        for (const row of matched) {
          if (this.table === 'family_person_relations') validateRelation(this.payload,row.id);
          Object.assign(row,this.payload);
        }
        result = matched;
      } else if (this.action === 'delete') {
        for (const row of matched) source.splice(source.indexOf(row),1);
        result = matched;
      }
      if (this.action !== 'select') write();
      const data = mode === 'many' ? clone(result) : clone(result[0] || null);
      return { data, error:mode === 'single' && !data ? new Error('見つかりませんでした') : null };
    } catch (error) { if (before) memory = before; return { data:null, error }; }
  }
}

const fileToDataUrl = file => new Promise((resolve,reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});
const dataUrlToBlob = async url => (await fetch(url)).blob();

export const publicDemoUser = { id:USER_ID, email:null, user_metadata:{} };
export function publicDemoSessionId() {
  const key = 'tateyoko.public-family-demo.ai-browser.v1';
  try {
    let id = localStorage.getItem(key);
    if (!id) { id = uid(); localStorage.setItem(key, id); }
    return id;
  } catch { return read().sessionId; }
}
export const publicDemoClient = {
  from(table) { return {
    select:() => new Query(table), insert:payload => new Query(table,'insert',payload),
    upsert:payload => new Query(table,'upsert',payload),
    update:payload => new Query(table,'update',payload),
    delete:() => new Query(table,'delete'),
  }; },
  async rpc(name,args = {}) {
    const before = clone(read());
    try {
      const state = read();
      if (name === 'ensure_family_place_home') return { data:FAMILY_ID, error:null };
      if (name === 'list_family_place_person_books') return { data:[], error:null };
      if (name !== 'create_family_tree_person_with_name_details')
        throw new Error(`公開デモでは ${name} を利用できません`);
      if (args.input_is_self) return { data:'self', error:null };
      const family_name = args.input_family_name || null;
      const given_name = args.input_given_name || null;
      if (!family_name && !given_name) throw new Error('名前を入力してください');
      const person = { id:uid(), family_id:FAMILY_ID, family_name, given_name,
        display_name:[family_name,given_name].filter(Boolean).join(' '),
        family_name_kana:args.input_family_name_kana || null,
        given_name_kana:args.input_given_name_kana || null,
        maiden_name:args.input_maiden_name || null, maiden_name_kana:args.input_maiden_name_kana || null,
        birth_year:args.input_birth_year || null, birth_month:args.input_birth_month || null,
        birth_day:args.input_birth_day || null, gender:args.input_gender || null,
        death_year:null, notes:null, portrait_storage_path:null,
        portrait_source_storage_path:null, created_at:new Date().toISOString() };
      state.people.push(person);
      if (args.input_anchor_id && args.input_relation) {
        const relation = relationFromRole(args.input_anchor_id,person.id,args.input_relation);
        validateRelation(relation);
        state.relations.push({ ...relation, id:uid(), created_at:new Date().toISOString() });
      }
      write();
      return { data:person.id, error:null };
    } catch (error) { memory = before; return { data:null,error }; }
  },
  storage:{ from:() => ({
    async upload(path,file) { try { read().media[path] = await fileToDataUrl(file); write(); return { error:null }; }
      catch (error) { delete read().media[path]; return { error }; } },
    async download(path) { const value = read().media[path];
      return value ? { data:await dataUrlToBlob(value), error:null }
        : { data:null,error:new Error('写真がありません') }; },
    async remove(paths) { paths.forEach(path => { delete read().media[path]; }); write(); return { error:null }; },
  }) },
  functions:{ async invoke() { return { data:null,error:new Error('この機能は公開デモでは利用できません') }; } },
};

export function resetPublicDemo() { memory = seed(); write(); }

export function publicDemoMemories(personId) {
  return clone(read().memories.filter(item => item.person_id === personId));
}

export async function savePublicDemoMemory(personId, values, photoFile) {
  if (!read().people.some(person => person.id === personId)) throw new Error('人物を確認できません');
  if (!photoFile?.type?.startsWith('image/')) throw new Error('写真を選んでください');
  const photoUrl = await fileToDataUrl(photoFile);
  const item = { id:uid(), person_id:personId, title:values.title.trim().slice(0, 100),
    event_date:values.event_date || null, comment:values.comment.trim().slice(0, 1000),
    photo_url:photoUrl, created_at:new Date().toISOString() };
  read().memories.unshift(item);
  try { write(); } catch (error) { read().memories.shift(); throw error; }
  return clone(item);
}
