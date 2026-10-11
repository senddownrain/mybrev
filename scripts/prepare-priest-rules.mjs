// Local-only staging: retain reviewed current public read policy while adding
// protection for the new namespaces. Never fetch or deploy production rules.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2),source=args[args.indexOf('--source')+1],output=args[args.indexOf('--out')+1];
if(!args.includes('--source')||!args.includes('--out'))throw new Error('Use --source <reviewed-current.rules> --out reports/priest-access/staged.rules');
const destination=path.resolve(output);if(!destination.startsWith(path.resolve('reports')+path.sep))throw new Error('Staged output must stay under ignored reports/.');
const current=await readFile(source,'utf8');let next=await readFile('firestore.rules','utf8');
for(const name of ['prayers','prayerCategories']){
 const match=current.match(new RegExp(`match /${name}/\\{[^}]+\\}\\s*\\{\\s*allow (?:read|read,\\s*write|write,\\s*read): if ([^;]+);`));
 if(!match)throw new Error(`Cannot establish existing ${name} read policy. Merge protective rules manually; preserve all existing public read permissions.`);
 const predicate=match[1].trim();if(!['true','false','isAdmin()'].includes(predicate))throw new Error(`Custom ${name} read policy requires manual review. No staged file generated.`);
 next=next.replace(`match /${name}/{id} {\n      allow read: if true;`,`match /${name}/{id} {\n      allow read: if ${predicate};`);
}
await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,next);
console.log(`Local staging file: ${destination}. Review every changed rule against production before deployment. Public read policy preserved; private namespaces excluded from catch-all. No deployment performed.`);
