import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditFirestoreUsage,scenarioBudgets} from '../scripts/audit-firestore-usage.mjs';
test('usage audit requires local snapshots and reports only counts, never grant proofs or owner data',async()=>{
  await assert.rejects(auditFirestoreUsage(),/local --snapshot/);
  const root=await mkdtemp(path.join(os.tmpdir(),'quota-audit-'));
  try{
    await mkdir(path.join(root,'src'));await mkdir(path.join(root,'scripts'));await mkdir(path.join(root,'snapshot'));
    await writeFile(path.join(root,'src','example.js'),"import {getDoc} from 'firebase/firestore';\ngetDoc(reference);\n");
    await writeFile(path.join(root,'snapshot','manifest.json'),JSON.stringify({schemaVersion:1,projectId:'demo-quota',collections:{priestDeviceGrants:{file:'grants.json',documentCount:1}}}));
    await writeFile(path.join(root,'snapshot','grants.json'),JSON.stringify({schemaVersion:1,collectionPath:'priestDeviceGrants',documents:[{id:'private-uid',data:{activationProof:'DO_NOT_EXPORT_PROOF',label:'DO_NOT_EXPORT_OWNER'}}]}));
    const report=await auditFirestoreUsage({root,snapshots:[path.join(root,'snapshot')]});
    assert.equal(report.productionReads,0);assert.equal(report.observations[0].counts.priestDeviceGrants,1);
    assert.deepEqual(report.candidates,[{file:'src/example.js',line:2,apis:['getDoc']}]);
    assert.doesNotMatch(JSON.stringify(report),/DO_NOT_EXPORT|private-uid/);
  }finally{
    const target=path.resolve(root),parent=path.resolve(os.tmpdir());
    assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('quota-audit-'));
    await rm(target,{recursive:true,force:true});
  }
});
test('scenario budgets bound the device registry and remove unused reading warmups',()=>{
  const b=scenarioBudgets({grants:1000});assert.equal(b.priestAdminBefore.reads,1001);assert.equal(b.priestAdminAfter.reads,26);
  assert.ok(b.coldLaunchAfter.reads<b.coldLaunchBefore.reads);
  assert.equal(b.codeChange.writes,1);assert.equal(b.helpSave.reads,1);assert.equal(b.deviceActivation.writes,2);
});
