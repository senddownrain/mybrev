import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [mode,...args]=process.argv.slice(2);
const candidates=process.platform==='win32'?[['py',['-3']],['python',[]],['python3',[]]]:[['python3',[]],['python',[]]];
for(const [command,prefix] of candidates){
 const check=spawnSync(command,[...prefix,'-c','import sys; assert sys.version_info >= (3,9)'],{stdio:'ignore'});
 if(check.status!==0)continue;
 const script=mode==='test'?['-m','unittest','discover','-s','tests','-p','song*_test.py','-v']:['scripts/song-review/review.py',mode,...args];
 const result=spawnSync(command,[...prefix,...script],{cwd:root,stdio:'inherit'});process.exit(result.status??2);
}
console.error('Python 3.9+ required; install scripts/song-review/requirements.txt');process.exit(2);
