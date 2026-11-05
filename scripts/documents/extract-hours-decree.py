#!/usr/bin/env python3
"""Extract this supplied Word 97 DOC using its CFB FAT and Word CLX piece table.
Preserves text across fragmented sectors; not a strings/UTF-16 byte scan.
Only normal (non-mini) streams used by this known document are needed.
"""
from pathlib import Path
import struct
p=Path(__file__).resolve().parents[2] / 'docs/sources/primary/decret-hours-IV.doc';d=p.read_bytes()
u16=lambda b,o:struct.unpack_from('<H',b,o)[0]
u32=lambda b,o:struct.unpack_from('<I',b,o)[0]
ss=1<<u16(d,30); fat=[]
for i in range(109):
 sid=u32(d,76+4*i)
 if sid<0xfffffffa:fat+=list(struct.unpack('<'+'I'*(ss//4),d[(sid+1)*ss:(sid+2)*ss]))
def chain(sid):
 out=b'';seen=set()
 while sid<0xfffffffa:
  assert sid not in seen;seen.add(sid);out+=d[(sid+1)*ss:(sid+2)*ss];sid=fat[sid]
 return out
directory=chain(u32(d,48)); entries={}
for off in range(0,len(directory),128):
 e=directory[off:off+128];n=u16(e,64)
 if n>=2:entries[e[:n-2].decode('utf-16le')]=(u32(e,116),u32(e,120))

word=chain(entries['WordDocument'][0])[:entries['WordDocument'][1]]
table=chain(entries['1Table'][0])[:entries['1Table'][1]]
clx=table[u32(word,0x1a2):u32(word,0x1a2)+u32(word,0x1a6)]
while clx[0]==1:clx=clx[3+u16(clx,1):]
assert clx[0]==2
pcd=clx[5:5+u32(clx,1)];n=(len(pcd)-4)//12
cps=[u32(pcd,4*i) for i in range(n+1)];text=''
for i in range(n):
 fc=u32(pcd,4*(n+1)+8*i+2);compressed=bool(fc&0x40000000);fc&=0x3fffffff
 if compressed:fc//=2
 size=(cps[i+1]-cps[i])*(1 if compressed else 2)
 text+=word[fc:fc+size].decode('cp1251' if compressed else 'utf-16le')

output=p.with_suffix('.txt')
normalized='\n'.join(line.rstrip() for line in text.replace('\r','\n').split('\n'))
if '--check' in __import__('sys').argv:
 assert output.read_text()==normalized, 'DOC transcription differs'
else: output.write_text(normalized)
print('IV decree: Word piece table extracted; complete text verified')
