// In-memory Supabase replacement for screenshots of the current React app.
// This module is used only by capture-family-place.mjs's Vite alias. It never
// connects to a Supabase project and contains no credentials or customer data.
const USER = '10000000-0000-4000-8000-000000000001';
const FAMILY = '20000000-0000-4000-8000-000000000002';
const SELF = '30000000-0000-4000-8000-000000000003';
const FATHER = '40000000-0000-4000-8000-000000000004';
const PUBLIC_ID = 'f'.repeat(48);
const now = '2026-11-23T00:00:00.000Z';
if (typeof window !== 'undefined' && new URLSearchParams(location.search).get('qa') === 'completed')
  sessionStorage.setItem('family_capture_completed', '1');
const demoUser = { id: USER, email: 'demo@example.invalid',
  user_metadata: { display_name: 'デモ 太郎', family_name: 'デモ', given_name: '太郎' },
  identities: [] };
const state = {
  profiles: [{ id: USER, email: demoUser.email, display_name: 'デモ 太郎' }],
  persons: [
    { id: SELF, family_id: FAMILY, display_name: 'デモ 太郎', family_name: 'デモ',
      given_name: '太郎', gender: 'male', birth_year: 1980, created_at: now },
    { id: FATHER, family_id: FAMILY, display_name: 'デモ 父郎', family_name: 'デモ',
      given_name: '父郎', gender: 'male', birth_year: 1950, created_at: now },
  ],
  user_person_links: [{ id: '50000000-0000-4000-8000-000000000005',
    user_id: USER, person_id: SELF, role: 'self' }],
  family_person_relations: [{ id: '60000000-0000-4000-8000-000000000006',
    family_id: FAMILY, person_a_id: FATHER, person_b_id: SELF,
    relation_type: 'parent_child', created_at: now }],
  family_relation_suggestions: [],
  family_person_profile_facts: [],
  family_free_stories: [],
  family_free_story_media: [],
  book_projects: [],
};

const clone = value => value == null ? value : structuredClone(value);
const pick = (row, projection) => {
  if (!projection || projection === '*') return clone(row);
  return Object.fromEntries(projection.split(',').map(key => key.trim())
    .filter(key => key && Object.hasOwn(row, key)).map(key => [key, clone(row[key])]));
};

class Query {
  constructor(table) { this.table = table; this.action = 'read'; this.filters = [];
    this.projection = '*'; this.payload = null; this.sort = []; this.singleMode = null; }
  select(columns = '*') { this.projection = columns; return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  order(key, options = {}) { this.sort.push({ key, ascending: options.ascending !== false }); return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  upsert(payload) { this.action = 'upsert'; this.payload = payload; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }
  async result() {
    const table = state[this.table];
    if (!table) throw Error(`Unexpected table: ${this.table}`);
    let rows = table.filter(row => this.filters.every(test => test(row)));
    if (this.action === 'insert') {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = values.map(value => ({ id: crypto.randomUUID(), revision: 1,
        created_at: now, updated_at: now, body: '', transcript_raw: '',
        transcript_readable: '', transcript_essay: '', ...clone(value) }));
      table.push(...rows);
    } else if (this.action === 'update') {
      rows.forEach(row => Object.assign(row, clone(this.payload)));
    } else if (this.action === 'delete') {
      rows.forEach(row => table.splice(table.indexOf(row), 1));
    } else if (this.action === 'upsert') {
      const match = table.find(row => row.family_id === this.payload.family_id
        && row.kind === this.payload.kind && row.person_a_id === this.payload.person_a_id
        && row.person_b_id === this.payload.person_b_id);
      if (match) { Object.assign(match, clone(this.payload)); rows = [match]; }
      else { rows = [{ id: crypto.randomUUID(), ...clone(this.payload) }]; table.push(...rows); }
    }
    for (const { key, ascending } of this.sort.reverse()) rows.sort((a, b) => {
      const comparison = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
      return ascending ? comparison : -comparison;
    });
    const data = rows.map(row => pick(row, this.projection));
    if (this.singleMode === 'single') return { data: data[0] || null,
      error: data.length === 1 ? null : { message: 'Expected one row' } };
    if (this.singleMode === 'maybeSingle') return { data: data[0] || null, error: null };
    return { data, error: null };
  }
  then(resolve, reject) { return this.result().then(resolve, reject); }
}

const publication = { title: 'デモ 父郎の人生の物語', subjectName: 'デモ 父郎',
  publishedAt: now, hasCover: false, coverColor: '#adbfa9', videos: [],
  items: [{ order: 1, sourceAnswerId: 'demo-answer', chapterTitle: '子どもの頃',
    question: '子どもの頃に好きだったことは？', transcript: '架空のデモ用の語りです。',
    audio: [], photos: [] }] };

const client = {
  auth: {
    getSession: async () => ({ data: { session: { user: demoUser, access_token: 'fixture-only' } }, error: null }),
    getUser: async () => ({ data: { user: demoUser }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  from: table => new Query(table),
  rpc: async (name, args = {}) => {
    if (name === 'family_place_access_allowed') return { data: true, error: null };
    if (name === 'ensure_family_place_home') return { data: FAMILY, error: null };
    if (name === 'list_family_place_person_books') return { data:
      sessionStorage.getItem('family_capture_completed') === '1' && args.input_person_id === FATHER
        ? [{ publication_id: '70000000-0000-4000-8000-000000000007', public_id: PUBLIC_ID,
          title: publication.title, subject_name: publication.subjectName, published_at: now }]
        : [], error: null };
    throw Error(`Unexpected RPC: ${name}`);
  },
  functions: { invoke: async (name, options = {}) => {
    if (name === 'create-commerce-v2-checkout' && options.body?.action === 'public_quote') {
      // Fictional test records; catalog amounts match the read-only production
      // product list as of this capture. No network request leaves this fixture.
      const amount = (options.body.edition === 'premium' ? 65000 : 35000)
        + Number(options.body.standardExtraCount || 0) * 5000
        + Number(options.body.premiumExtraCount || 0) * 35000
        + (options.body.productionMethod === 'interview_staff' ? 20000 : 0);
      return { data: { success:true, quote: { amount_subtotal:amount,
        discount_amount:0, amount_total:amount, currency:'jpy', tax_included:true } }, error:null };
    }
    if (name === 'public-voice') return { data: options.body?.action === 'asset'
      ? { success: false } : { success: true, publication }, error: null };
    throw Error(`Unexpected function: ${name}`);
  } },
  storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'No demo media' } }) }) },
};

if (typeof window !== 'undefined') window.__familyCapture = { state, USER, FAMILY, SELF, FATHER, PUBLIC_ID };
export function createClient() { return client; }
