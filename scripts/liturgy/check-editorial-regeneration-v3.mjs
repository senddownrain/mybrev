#!/usr/bin/env node
/** Deterministic offline replay of v3 only; no refresh/audit/live clients. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { editorialHash } from './lib/editorial-responsories.mjs';
const a=process.argv.slice(2);if(a.length!==2||a[0]!=='--snapshot')throw Error('Usage: --snapshot <existing-local-snapshot>');
const dir='docs/audits/liturgical-common-texts-2026-11',out=dir+'/v3';
const walk=file=>fs.statSync(file).isDirectory()?fs.readdirSync(file).sort().flatMap(f=>walk(path.join(file,f))):[file];
const targets=['patchs/feasts','patchs/db-feasts','patchs/db-templates','patchs/sources/common-seasons/provenance.json','reports/liturgy/common-seasons-flutter-fixture.json',dir+'/manual-review.json','scripts/liturgy/sources/editorial-response-scopes-v3.json',...['editorial-source-proofs.json.gz','exceptions.json','exceptions.html','EXCEPTIONS.md','summary.json','runtime-verification.json','publication-plan.json.gz','publication-summary.json','release-classification.json','rollback-blueprint.json.gz','ready-fields.tsv','derived-generation-proof.json.gz'].map(f=>out+'/'+f)];
const digest=()=>Object.fromEntries(targets.flatMap(walk).sort().map(file=>[file,editorialHash(fs.readFileSync(file))]));
const before=digest(),commands=[['scripts/liturgy/editorial-responsories-v3.mjs','--check'],['scripts/liturgy/common-seasons.mjs','--write','--report'],['patchs/generate-db-feasts.mjs','--offline'],['scripts/liturgy/common-seasons-fixture.mjs'],['scripts/liturgy/build-editorial-exceptions-v3.mjs'],['scripts/liturgy/prepare-editorial-publication-v3.mjs','--snapshot',a[1]]];
for(const args of commands)execFileSync(process.execPath,args,{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const after=digest(),changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(f=>before[f]!==after[f]);
fs.writeFileSync(out+'/regeneration-check.json',JSON.stringify({schema:3,network:false,checkedFiles:Object.keys(after).length,beforeDigest:editorialHash(JSON.stringify(before)),afterDigest:editorialHash(JSON.stringify(after)),changedFiles:changed,passed:changed.length===0,commands:commands.map(a=>'node '+a.join(' '))},null,2)+'\n');
if(changed.length)throw Error('Regeneration changed '+changed.join(', '));console.log('PASS: '+Object.keys(after).length+' files, zero regeneration diff.');
