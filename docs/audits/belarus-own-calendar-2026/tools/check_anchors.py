"""Independent dateutil computus + datetime check of every BY anchor, writes work only."""
import argparse,json,datetime
from pathlib import Path
from dateutil.easter import easter
p=argparse.ArgumentParser();p.add_argument('--work',required=True);a=p.parse_args();w=Path(a.work)
s=json.load(open(w/'sweep.json'));checks=[]
for x in s['anchors']:
 y=x['year'];e=easter(y);p=e+datetime.timedelta(days=49);n=datetime.date(y,11,27);ad=n+datetime.timedelta(days=(6-n.weekday())%7)
 j=datetime.date(y,1,6);b=j+datetime.timedelta(days=(6-j.weekday())%7 or 7);c=datetime.date(y,12,25)
 h=datetime.date(y,12,30) if c.weekday()==6 else c+datetime.timedelta(days=(6-c.weekday())%7)
 exp={'easterSunday':e,'pentecost':p,'baptismOfLord':b,'maryMotherChurch':p+datetime.timedelta(days=1),'christTheHighPriest':p+datetime.timedelta(days=4),'trinity':p+datetime.timedelta(days=7),'corpusChristi':p+datetime.timedelta(days=11),'sacredHeart':p+datetime.timedelta(days=19),'immaculateHeart':p+datetime.timedelta(days=20),'christKing':ad-datetime.timedelta(days=7),'holyFamily':h,'firstAdventSunday':ad,'ascension':e+datetime.timedelta(days=39)}
 for k,v in exp.items():
  assert x['anchors'][k]==str(v),(x['diocese'],y,k)
  checks.append({'diocese':x['diocese'],'year':y,'anchor':k,'expected':str(v),'actual':x['anchors'][k],'status':'PASS'})
(w/'anchor-checks.json').write_text(json.dumps(checks,indent=2)+'\n');print(len(checks),'anchor checks PASS')
