"""Paragraph-based review layout. v1 remains readable for previously issued files."""
import copy,re
from zipfile import ZipFile
from docx import Document
from docx.shared import Cm,Pt,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

FIELDS=['title','tag','tags','source','decision','text','chord','notes']
LABELS={'title':'Назва','tag':'Катэгорыі','tags':'Дадатковыя тэгі','source':'Крыніца','decision':'Рашэнне камісіі','text':'Тэкст','chord':'Акорды / дадатковы тэкст','notes':'Заўвагі камісіі'}
TARGETS={'ПАНЕ, ЗМІЛУЙСЯ НАД НАМІ':8,'СВЯТЫ':15,'БАРАНКУ БОЖЫ':7,'Аллелюя':4}

def candidates(song,r):
    if song['title'] not in TARGETS or 10 not in [int(x) for x in r.category_values(song.get('tag')) if str(x).isdigit()]:return []
    text=r.lf(song['text']); starts=list(re.finditer(r'(?m)^(\d+)\. ',text)); result=[]
    if [int(m[1]) for m in starts]!=list(range(1,TARGETS[song['title']]+1)):return []
    for i,m in enumerate(starts):
        end=starts[i+1].start() if i+1<len(starts) else len(text)
        result.append({'parentSongId':song['id'],'key':r.digest([song['id'],m.start(),end,text[m.start():end]])[:24],
                       'number':i+1,'start':m.start(),'end':end,'hash':r.digest(text[m.start():end]),
                       'boundaryConfirmed':False,'chordAssignment':'manual-review'})
    return result

def export(b,path,r):
    doc=Document(); sec=doc.sections[0];sec.page_width=Cm(21);sec.page_height=Cm(29.7)
    sec.left_margin=sec.right_margin=sec.top_margin=sec.bottom_margin=Cm(1.9)
    for name,size in [('Normal',12),('Title',24),('Heading 1',17),('Heading 2',15),('Heading 3',13)]:
        style=doc.styles[name];style.font.name='Times New Roman';style.font.size=Pt(size);style.font.color.rgb=RGBColor(0,0,0)
        fonts=style.element.find('.//'+qn('w:rFonts'))
        for attr in list(fonts.attrib):
            if 'theme' in attr.lower():del fonts.attrib[attr]
        fonts.set(qn('w:eastAsia'),'Times New Roman');fonts.set(qn('w:cs'),'Times New Roman')
        for border in list(style.element.iter(qn('w:pBdr'))):border.getparent().remove(border)
        style.paragraph_format.line_spacing=1.1;style.paragraph_format.space_after=Pt(2)
    doc.core_properties.identifier='song-review-v1:'+b['corpusHash'];doc.core_properties.subject='song-review-book-v2'
    doc.add_heading('СПЕЎНІК',0);doc.add_paragraph('Працоўная рэдакцыя для разгляду камісіяй')
    doc.add_paragraph(f"{b['exportedAt']} · {len(b['songs'])} спеваў\nВерсія: {b['corpusHash']}")
    doc.add_paragraph(b['report']['warning']).runs[0].bold=True
    rules='''Рашэнні: НЕ ПРАВЕРАНА / ПАКІНУЦЬ / ВЫКЛЮЧЫЦЬ / ВЫПРАВІЦЬ / АБМЕРКАВАЦЬ.
Рэдагуйце назвы, катэгорыі, тэгі, крыніцы, тэкст і акорды пад адпаведнымі подпісамі. Адзін тэг або катэгорыя — адзін абзац.
Дадавайце строфы звычайнай клавішай Enter унутры блока тэксту. Не выдаляйце подпісы блокаў, SONG_ID і закладкі. Не выдаляйце песню цалкам: пазначце ВЫКЛЮЧЫЦЬ.
Тэкст і акорды — незалежныя палі. Пустыя радкі захоўваюцца. Не пераносьце словы паміж палямі.
Кандыдаты на варыянты патрабуюць асобнай ручной праверкі межаў і акордаў. Рашэнне па кандыдаце не змяняе зыходны тэкст.
Каментарыі — толькі абмеркаванне. Для фінальнай копіі прыміце або адхіліце ўсе адсочваныя змены. НЕ ПРАВЕРАНА не з'яўляецца зацвярджэннем.
Абнавіце змест у Word: Ctrl+A → F9. Гэта папярэдняя, не зацверджаная рэдакцыя.'''
    for line in rules.splitlines():doc.add_paragraph(line)
    doc.add_page_break();doc.add_heading('Змест раздзелаў',1)
    cats={c['id']:c['title'] for c in b['categories']}; songs=r.ordered(b['songs'],cats)
    groups={}
    for s in songs:
        group=next((x for x in r.category_names(s,cats) if x in cats.values()),'Без катэгорыі');groups.setdefault(group,[]).append(s)
    for index,(group,ss) in enumerate(groups.items(),1):
        p=doc.add_paragraph();h=OxmlElement('w:hyperlink');h.set(qn('w:anchor'),f'section_{index}');rr=OxmlElement('w:r');t=OxmlElement('w:t');t.text=f'{group} — {len(ss)}';rr.append(t);h.append(rr);p._p.append(h)
    r.field(doc.add_paragraph(),'TOC \\o "1-1" \\h \\z')
    doc.add_heading('Алфавітны паказальнік',1)
    numbers={s['id']:i+1 for i,s in enumerate(songs)}
    for s in sorted(songs,key=lambda s:(r.title_key(s['title']),s['id'])):
        p=doc.add_paragraph();h=OxmlElement('w:hyperlink');h.set(qn('w:anchor'),'sr_'+r.digest(s['id'])[:24]);run=OxmlElement('w:r');t=OxmlElement('w:t');t.text=f"{s['title']} — № {numbers[s['id']]}";run.append(t);h.append(run);p._p.append(h)
    doc.add_page_break();counter=0
    def mark(p,name):
        nonlocal counter
        counter+=1;r.add_bookmark(p,name,counter)
    for group_index,(group,ss) in enumerate(groups.items(),1):
        mark(doc.add_heading(group,1),f'section_{group_index}')
        for s in ss:
            token=r.digest(s['id'])[:24];p=doc.add_paragraph('SONG_ID: '+s['id']);p.paragraph_format.keep_with_next=True
            for run in p.runs:run.font.size=Pt(7);run.font.color.rgb=RGBColor(100,100,100)
            mark(p,'sr_'+token);v=r.view(s,cats)
            values={**v,'decision':'НЕ ПРАВЕРАНА','notes':''}
            for key in FIELDS:
                label=doc.add_paragraph((LABELS[key]+f' № {numbers[s["id"]]}' if key=='title' else LABELS[key])+':');mark(label,'f_'+token+'_'+key);label.paragraph_format.keep_with_next=True
                for run in label.runs:run.font.size=Pt(9);run.italic=True
                val=values[key];items=val if isinstance(val,list) else val.split('\n')
                if not items:items=['']
                for line in items:
                    p=doc.add_paragraph(line,style='Heading 2' if key=='title' else 'Normal')
                    if key in ['title','tag','tags','source','decision']:p.paragraph_format.keep_with_next=True
                    if key in ['source','tag','tags','decision','notes']:
                        for run in p.runs:run.font.size=Pt(10)
                    if key=='chord':
                        p.paragraph_format.left_indent=Cm(.5)
                        for run in p.runs:run.font.size=Pt(10)
            for c in candidates(s,r):
                for suffix,label in [('decision',f"Кандыдат на варыянт {c['number']} — рашэнне (межы/акорды патрабуюць праверкі)"),('notes','Заўвагі да кандыдата')]:
                    p=doc.add_paragraph(label+':');mark(p,'v_'+c['key']+'_'+suffix);p.paragraph_format.keep_with_next=True
                    doc.add_paragraph('НЕ ПРАВЕРАНА' if suffix=='decision' else '')
            p=doc.add_paragraph('·');mark(p,'end_'+token)
    p=sec.footer.paragraphs[0];p.alignment=1;p.add_run('Працоўная рэдакцыя · ');r.field(p,'PAGE');doc.save(path)

def parse(root,b,r):
    songs={s['id']:s for s in b['songs']};cats={c['id']:c['title'] for c in b['categories']};reverse={v:k for k,v in cats.items()}
    tokens={'sr_'+r.digest(sid)[:24]:sid for sid in songs};result={};errors=[];warnings=[]
    current=None;active=None;blocks={};seen=False
    def finish():
        nonlocal current,active,blocks
        if current is None:return
        sid=current;old=songs[sid];token=r.digest(sid)[:24];expected=['f_'+token+'_'+k for k in FIELDS]
        cs=candidates(old,r);expected += ['v_'+c['key']+'_'+f for c in cs for f in ['decision','notes']]
        try:
            if list(blocks)!=expected:raise ValueError('Missing, reordered or unknown field markers')
            data={}
            for k in FIELDS:
                lines=blocks['f_'+token+'_'+k]
                if not lines:raise ValueError('Missing field content: '+k)
                data[k]=lines if k in ['tag','tags'] else '\n'.join(lines)
            ov=r.view(old,cats)
            for k in ['tag','tags']:
                if data[k]==[''] and ov[k]!=['']:data[k]=[]
            if data['decision'] not in r.STATUSES:raise ValueError('Unknown decision')
            if not data['title'].strip() or not data['text'].strip():raise ValueError('Empty title/text')
            new=copy.deepcopy(old)
            for k in r.FIELDS:
                if k in ['text','chord']:
                    data[k]=r.restore_visual_whitespace(ov[k],data[k]);a=len(ov[k].split('\n'));z=len(data[k].split('\n'))
                    if a!=z:warnings.append({'id':sid,'field':k,'oldLines':a,'newLines':z})
                if data[k]!=ov[k]:
                    if k=='tag':
                        if any(x not in reverse for x in data[k]) or len(set(data[k]))!=len(data[k]):raise ValueError('Unknown/duplicate category')
                        new[k]=[reverse[x] for x in data[k]]
                    else:new[k]=data[k]
            vs=[]
            for c in cs:
                status='\n'.join(blocks['v_'+c['key']+'_decision']);notes='\n'.join(blocks['v_'+c['key']+'_notes'])
                if status not in r.STATUSES:raise ValueError('Unknown variant decision')
                vs.append({**c,'decision':status,'notes':notes,'anchorDrift':new.get('text')!=old.get('text')})
            if sid in result:raise ValueError('Duplicate SONG_ID')
            result[sid]={'song':new,'decision':data['decision'],'notes':data['notes'],'variants':vs}
        except ValueError as e:errors.append(sid+': '+str(e))
        current=None;active=None;blocks={}
    for p in root.find(qn('w:body')):
        names=[x.get(qn('w:name'),'') for x in p.iter(qn('w:bookmarkStart'))];marks=[x for x in names if x.startswith(('sr_','f_','v_','end_'))]
        if len(marks)>1:errors.append('Multiple structural markers in paragraph')
        marker=marks[0] if marks else '';text=r.xml_text_wrapper(p) if p.tag==qn('w:p') else ''
        if marker.startswith('sr_'):
            if current is not None:errors.append('Unclosed song block');finish()
            current=tokens.get(marker);seen=True;active=None;blocks={}
            if current is None or text!='SONG_ID: '+current:errors.append('Changed/unknown SONG_ID')
        elif marker.startswith('end_'):
            if current is None or marker!='end_'+r.digest(current)[:24]:errors.append('Missing/mismatched song end')
            finish()
        elif marker:
            if current is None:errors.append('Orphan field marker');continue
            if marker in blocks:errors.append('Duplicate field marker')
            active=marker;blocks[active]=[]
        elif current is not None:
            if p.tag!=qn('w:p'):errors.append('Unsupported structure in song')
            elif active is None:errors.append('Unassigned song text')
            else:blocks[active].append(text)
        elif seen and text:
            style=p.find('./'+qn('w:pPr')+'/'+qn('w:pStyle'))
            if style is None or style.get(qn('w:val'))!='Heading1' or text not in set(cats.values())|{'Без катэгорыі'}:errors.append('Unassigned text outside song')
        if current is not None:
            for node in p.iter():
                if node.tag in {qn('w:'+x) for x in ['drawing','object','sdt','fldSimple','instrText','numPr','sym','altChunk','footnoteReference','endnoteReference']}:
                    errors.append('Unsupported content in song')
    if current is not None:errors.append('Missing song end');finish()
    for sid in songs.keys()-result.keys():errors.append('Missing/incomplete song block: '+sid)
    return result,errors,warnings
