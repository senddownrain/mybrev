import { canonicalJson } from '../../content/lib/app-content.mjs';
import { editorialHash } from './editorial-responsories.mjs';
/** Actual current-manifest check. No flag can bypass the published hashes. */
export function verifyCompatibleSubset(plan,collections){
 const evidence=plan.compatibility;
 if(evidence?.policy!=='proper-only-keep-manifest')throw Error('Missing reviewed compatible-subset policy');
 if(!plan.documents.length||plan.documents.some(d=>!d.document.startsWith('liturgicalProperTexts/')))throw Error('Subset would touch a published collection');
 if(collections?.liturgicalProperTexts||collections?.days?.version!==evidence.daysVersion||editorialHash(canonicalJson(collections))!==evidence.manifestCollectionsSha256)throw Error('Published manifest changed; re-evaluate compatibility before writes');
 return {policy:evidence.policy,manifestCollectionsSha256:evidence.manifestCollectionsSha256,daysVersion:collections.days.version,properInManifest:false,manifestWrites:0};
}
