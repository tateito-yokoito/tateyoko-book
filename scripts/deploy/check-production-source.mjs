import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The emergency 2026-10-29 deployment was built from a branch ahead of main.
// Its source must be in the ancestry of every later production candidate.
const record = JSON.parse(readFileSync(new URL('./production-source.json', import.meta.url), 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const candidate = git('rev-parse', '--verify', process.argv[2] || 'HEAD');
const deployed = git('rev-parse', '--verify', record.sourceCommit);
const result = spawnSync('git', ['merge-base', '--is-ancestor', deployed, candidate], { encoding: 'utf8' });
assert.equal(result.status, 0,
  `Production-only source ${deployed} is missing from candidate ${candidate}. Stop deployment and integrate the released answer UI first.`);
const changed = git('diff', '--name-status', `${deployed}...${candidate}`).split('\n').filter(Boolean);
console.log(JSON.stringify({ productionDeployment: record.vercelDeploymentId, deployedSource: deployed,
  candidate, changedFilesSinceDeployedSource: changed.length, productionOnlyCommits: 0 }));
