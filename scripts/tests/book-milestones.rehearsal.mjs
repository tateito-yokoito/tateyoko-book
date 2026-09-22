// Recreate current remote metadata locally; apply only the milestone migration.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.env.QA_PGLITE_PATH;assert.ok(runtime);
const {PGlite}=await import(runtime),{pgcrypto}=await import(new URL('./contrib/pgcrypto.js',pathToFileURL(runtime)));
const dir=process.env.QA_PREFLIGHT_DIR || 'output/book-milestones-preflight',quote=s=>'"'+s.replaceAll('"','""')+'"';
assert.ok(/^output\/[a-z0-9-]+$/.test(dir));
const file='supabase/migrations/202609220002_book_milestones.sql',source=await readFile(file,'utf8');
const report={at:new Date().toISOString(),migration:file,sha256:createHash('sha256').update(source).digest('hex'),remoteWrites:false,results:[]};
for(const label of process.argv.includes('--production-only')?['production']:['test','production']){
 const schema=JSON.parse(await readFile(`${dir}/${label}-schema.json`)),db=new PGlite({extensions:{pgcrypto}});
 try{
  assert.ok(!schema.migrations.some(m=>m.version==='202609220002'),'Already applied');
  await db.exec(`create schema auth;create schema storage;create schema extensions;create schema family_private;
   create extension pgcrypto with schema extensions;create role authenticated;create role anon;create role service_role bypassrls;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
   create function auth.role() returns text language sql as $$select current_user::text$$;
   create table auth.users(id uuid primary key,email text,phone text,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz,updated_at timestamptz);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz default now());
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;set check_function_bodies=off;`);
  for(const s of schema.sequences||[])await db.exec(`create sequence ${quote(s.schema)}.${quote(s.name)}`);
  for(const [key,values] of Map.groupBy(schema.enums||[],x=>x.schema+'.'+x.name))await db.exec(`create type ${key} as enum (${values.sort((a,b)=>a.order-b.order).map(x=>"'"+x.label.replaceAll("'","''")+"'").join(',')})`);
  for(const [table,cols] of Map.groupBy(schema.columns,c=>`${quote(c.table_schema)}.${quote(c.table_name)}`))await db.exec(`create table ${table} (${cols.sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>`${quote(c.column_name)} ${c.udt_name.startsWith('_')?c.udt_name.slice(1)+'[]':c.udt_name}${c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'?' not null':''}`).join(',')})`);
  for(const c of [...schema.constraints].sort((a,b)=>Number(a.def.startsWith('FOREIGN KEY'))-Number(b.def.startsWith('FOREIGN KEY'))))await db.exec(`alter table ${c.table} add constraint ${quote(c.name)} ${c.def}`);
  for(const i of schema.indexes)await db.exec(i.definition);
  for(const f of schema.functions)await db.exec(f.definition);
  for(const t of schema.triggers)await db.exec(t.definition);
  for(const t of schema.tables)if(t.rls)await db.exec(`alter table ${quote(t.schema)}.${quote(t.name)} enable row level security`);
  for(const p of schema.policies)await db.exec(`create policy ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`);
  await db.exec('set check_function_bodies=on;');
  await db.exec(source);
  report.results.push({label,sourceCapturedAt:schema.at,pass:true});
 }catch(e){report.results.push({label,pass:false,error:e.message});process.exitCode=1;}
 finally{await db.close();}
}
await writeFile(`${dir}/rehearsal.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
