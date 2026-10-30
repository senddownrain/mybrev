/**
 * R05: the dashboard page (one HTML document, inline CSS + JS under a per-response nonce, NO external resource).
 * Look and structure follow dashboard-demo/ui.template.html (P08); the data comes from the private same-origin API
 * (`/reports/api/summary`), nothing is embedded, no secret lives in the page. CSP (set by the Worker, not a <meta>):
 *   default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
 * Inline `style=""` attributes are blocked by that CSP, so widths and colours are set through classes / CSSOM only.
 */
export const csp = (nonce) => `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const CSS = `
:root{--bg:#fafaf7;--fg:#1c1c1c;--mut:#5b5b5b;--card:#fff;--line:#d9d9d2;--web:#2a6fdb;--android:#c77700;--ios:#1f9d8a;--bar:#4a5d8f;--warn:#b00020;--ok:#1b7a3a;--qa:#b00020;--live:#1b4f9c}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#a8a8a8;--card:#202020;--line:#3a3a3a;--web:#6aa3ff;--android:#f0a840;--ios:#4fd1bb;--bar:#8ea2d8;--warn:#ff6b81;--ok:#5fd08a;--qa:#8a1230;--live:#2d6cc4}}
*{box-sizing:border-box}body{font:15px/1.45 system-ui,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
.banner{position:sticky;top:0;z-index:5;color:#fff;text-align:center;font-weight:700;padding:8px 12px;letter-spacing:.03em}
.banner.qa{background:var(--qa)}.banner.live{background:var(--live)}.banner span{display:inline-block;margin:0 10px}
main{max-width:1060px;margin:0 auto;padding:0 16px 48px}
h1{font-size:22px;margin:18px 0 4px}h2{font-size:17px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 10px;font-size:13.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
@media (max-width:480px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:hidden}
.ctrl{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:10px 0;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:8px}
label{font-size:13px;color:var(--mut)}select{font:inherit;padding:4px 6px;margin-left:4px;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:4px}
a.btn{margin-left:auto;font-size:13px;color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:4px 10px;text-decoration:none}
.status{padding:10px 12px;border-radius:8px;border:1px solid var(--warn);margin:10px 0;display:none}.status.info{border-color:var(--line)}
.kpi{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0}.kpi b{font-size:26px;display:block;font-variant-numeric:tabular-nums}.kpi small{color:var(--mut)}
.row{display:grid;grid-template-columns:minmax(90px,170px) 1fr 54px;gap:8px;align-items:center;font-size:13px;margin:3px 0}
.row .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .n{text-align:right;font-variant-numeric:tabular-nums}
.track{background:color-mix(in srgb,var(--line) 50%,transparent);height:14px;border-radius:3px;overflow:hidden}.fill{display:block;height:100%;background:var(--bar)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:4px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}td.num{text-align:right;font-variant-numeric:tabular-nums}
svg text{fill:var(--mut);font-size:10px}.p-web{fill:var(--web)}.p-android{fill:var(--android)}.p-ios{fill:var(--ios)}
.legend{font-size:12px;color:var(--mut)}.legend i{display:inline-block;width:10px;height:10px;margin:0 4px 0 10px;border-radius:2px}
.i-web{background:var(--web)}.i-android{background:var(--android)}.i-ios{background:var(--ios)}
.empty{color:var(--mut);font-style:italic;padding:8px 0}.mt{margin-top:14px}code{font-size:12px}footer{margin-top:20px;color:var(--mut);font-size:12.5px}
`;

const SCRIPT = `
(function(){
var $=function(i){return document.getElementById(i)},R=null;
var PL=['web','android','ios'];
var TB=['lt5s','5_15s','15_60s','60_180s','180_600s','gte600s'],TBL={lt5s:'<5 с','5_15s':'5–15 с','15_60s':'15–60 с','60_180s':'1–3 мин','180_600s':'3–10 мин',gte600s:'≥10 мин'};
var SB=['fit','p0_25','p25_50','p50_75','p75_99','p100'],SBL={fit:'fit',p0_25:'0–25 %',p25_50:'25–50 %',p50_75:'50–75 %',p75_99:'75–99 %',p100:'100 %'};
var SN={today:'Сегодня',hours:'Часы',readings:'Чтения',ordo:'Ordo',prayers:'Молитвы',mass:'Месса',songs:'Песни',compendium:'Компендиум',bible:'Библия',picker:'Выбор даты',settings:'Настройки',about:'О приложении'};
var CN={hours_list:'Выбор гадзіны (список часов)',prayers_home:'Молитвы: главная',prayers_all:'Молитвы: все',favorites:'Избранное',songs:'Песни',bible_books:'Библия: книги',compendium_home:'Компендиум'};
var FN={text_scale_change:'Размер текста',text_settings_open:'Настройки текста',theme_change:'Тема',font_family_change:'Шрифт',keep_screen_on_toggle:'Экран не гаснет',favorite_add:'В избранное',favorite_remove:'Из избранного',share_use:'Поделиться',copy_use:'Копировать',search_open:'Открыт поиск',search_submit:'Поиск выполнен',date_pick:'Выбор даты',picker_open:'Открыт выбор даты',hour_switch:'Смена часа',hour_option_select:'Вариант часа',psalmody_layout_change:'Раскладка псалмов',chords_toggle:'Аккорды',chord_transpose:'Транспонирование',chord_layout_change:'Раскладка аккордов',mass_language_change:'Язык Мессы',mass_section_nav:'Навигация по Мессе',ordo_diocese_change:'Епархия Ordo',bible_language_change:'Язык Библии',bible_chapter_nav:'Глава Библии',back_to_top:'Наверх',offline_update_apply:'Обновление офлайн',install_prompt_open:'Установка'};
var EN={clock_anomaly:'Аномалия часов',storage_unavailable:'Хранилище недоступно',queue_overflow:'Переполнение очереди',visibility_unsupported:'Нет visibility API',scroll_unmeasurable:'Прокрутка не измерена'};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function bars(el,items,lab,fmt){
  items=items.filter(function(i){return i.n>0});
  if(!items.length){$(el).innerHTML='<div class="empty">нет ячеек с n ≥ '+R.k+' для этого фильтра</div>';return}
  var mx=Math.max.apply(null,items.map(function(i){return i.n}));
  $(el).innerHTML=items.map(function(i,ix){var l=lab(i);return'<div class="row"><span class="name" title="'+esc(l)+'">'+esc(l)+'</span><span class="track"><span class="fill" data-w="'+Math.max(1,i.n/mx*100).toFixed(1)+'"></span></span><span class="n">≥ '+i.n+'</span></div>'}).join('');
  [].forEach.call($(el).querySelectorAll('.fill'),function(f){f.style.width=f.getAttribute('data-w')+'%'})}
function status(kind,title,text){var b=$('status');b.className='status'+(kind==='info'?' info':'');b.style.display='block';b.innerHTML='<b>'+esc(title)+'</b><br>'+esc(text)}
function qs(){try{history.replaceState(null,'','?days='+$('days').value+'&platform='+$('platform').value+'&section='+$('section').value)}catch(e){}return 'days='+$('days').value+'&platform='+$('platform').value+'&section='+$('section').value}
async function load(){
  $('csv').setAttribute('href','/reports/api/summary.csv?'+qs());
  var res;try{res=await fetch('/reports/api/summary?'+qs(),{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'})}catch(e){return fail('Нет связи','Запрос к API не выполнен.')}
  if(res.status===401||res.status===403)return fail('Нет доступа ('+res.status+')','Откройте панель через Cloudflare Access владельцем проекта. Данные без авторизации не отдаются.');
  if(!res.ok){var c='';try{c=(await res.json()).code}catch(e){}return fail('Ошибка чтения данных (HTTP '+res.status+')','Код: '+(c||'нет')+'. Данные не показываются; нули не выдаются за факт.')}
  R=await res.json();render()}
function fail(t,x){R=null;$('view').style.display='none';status('error',t,x)}
function render(){
  var b=$('banner');b.className='banner '+(R.mode==='qa'?'qa':'live');
  b.innerHTML=(R.banner?'<span>'+esc(R.banner)+'</span>':'<span>LIVE (по release-card)</span>')+'<span>'+esc(R.banner_sub)+'</span>';
  var st=$('status');st.style.display='none';
  if(R.intake==='switched_off')status('info','Приём выключен (kill switch)','Новые данные не поступают; ниже — то, что накоплено до выключения.');
  if(R.state==='empty'){fail2('Нет данных','В выбранном периоде пакетов нет (приём не включался или всё удалено по сроку хранения 90 дней).');return}
  if(R.state==='no_published_cells'){fail2('Нечего показать','В этом окне нет ячеек с n ≥ '+R.k+'. Малые ячейки не публикуются.');return}
  $('view').style.display='';
  if(R.truncated)status('info','Прочитана только часть ячеек','Лимит чтения: все числа — нижняя граница.');
  var D=R.daily;
  $('kpi').innerHTML='<div><b>≥ '+R.kpi.opens_shown+'</b><small>открытий экранов (сумма показанных ячеек)</small></div><div><b>'+R.window.days+'</b><small>дней в окне ('+esc(R.window.from)+' … '+esc(R.window.to)+')</small></div><div><b>k = '+R.k+'</b><small>ячейки с n &lt; k не показываются</small></div>';
  var W=Math.max(320,Math.min(1000,document.body.clientWidth-60)),H=190,pad=26,bw=(W-pad)/D.length,mx=1;
  D.forEach(function(o){mx=Math.max(mx,o.total)});
  var svg='<svg viewBox="0 0 '+W+' '+(H+20)+'" width="100%" role="img" aria-label="Открытия по дням и платформам">';
  var step=D.length>30?Math.ceil(D.length/15):2;
  D.forEach(function(o,i){var y=H,x=pad+i*bw+bw*0.15;PL.forEach(function(p){var h=o[p]/mx*(H-10);y-=h;if(h>0)svg+='<rect class="p-'+p+'" x="'+x+'" y="'+y+'" width="'+bw*0.7+'" height="'+h+'"><title>'+esc(o.day)+' '+p+' ≥ '+o[p]+'</title></rect>'});
    if(i%step===0)svg+='<text x="'+(x+bw*0.35)+'" y="'+(H+12)+'" text-anchor="middle">'+o.day.slice(5)+'</text>'});
  svg+='<text x="0" y="12">'+mx+'</text></svg><div class="legend"><i class="i-web"></i>web<i class="i-android"></i>android<i class="i-ios"></i>ios</div>';
  $('daily').innerHTML=svg;
  bars('sections',R.sections,function(i){return SN[i.section]||i.section});
  bars('catalog',R.catalog,function(i){return CN[i.catalog_id]||i.catalog_id});
  [['fv',TB,TBL],['er',TB,TBL],['sd',SB,SBL]].forEach(function(m){var by={};R.text[m[0]].forEach(function(c){by[c.bucket]=c.n});bars(m[0],m[1].map(function(b){return{b:b,n:by[b]||0}}),function(i){return m[2][i.b]})});
  bars('features',R.features,function(i){return FN[i.feature_id]||i.feature_id});
  var html='';R.materials.forEach(function(m){if(!m.top.length)return;html+='<div><b>'+esc(SN[m.section]||m.section)+'</b><table>'+m.top.map(function(c,i){return'<tr><td>'+(i+1)+'</td><td>'+(c.title?esc(c.title)+'<br>':'')+'<code>'+esc(c.content_id)+'</code></td><td class="num">≥ '+c.n+'</td></tr>'}).join('')+'</table></div>'});
  $('materials').innerHTML=html||'<div class="empty">нет материалов с n ≥ '+R.k+'</div>';
  $('errors').innerHTML=R.errors.length?'<table>'+R.errors.map(function(c){return'<tr><td>'+esc(EN[c.error_id]||c.error_id)+'</td><td class="num">≥ '+c.n+'</td></tr>'}).join('')+'</table>':'<div class="empty">нет ячеек с n ≥ '+R.k+'</div>';
  $('foot').textContent=R.schema+' · k='+R.k+' · режим '+R.mode+' · срок хранения staging '+R.window.retention_days+' дн. · панель читает только подавленные агрегаты (без cell_counts).';
}
function fail2(t,x){$('view').style.display='none';status('info',t,x);$('foot').textContent=R.schema+' · режим '+R.mode}
$('section').innerHTML='<option value="all">все</option>'+Object.keys(SN).map(function(k){return'<option value="'+k+'">'+SN[k]+'</option>'}).join('');
['days','platform','section'].forEach(function(i){$(i).addEventListener('change',load)});
try{var q=new URLSearchParams(location.search);['days','platform','section'].forEach(function(i){var v=q.get(i);if(v&&[].some.call($(i).options,function(o){return o.value===v}))$(i).value=v})}catch(e){}
window.addEventListener('resize',function(){if(R&&R.state==='ok')render()});
load();
})();
`;

export function renderPage(nonce) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>MyBrev: приватная панель аналитики</title>
<style nonce="${nonce}">${CSS}</style></head><body>
<div class="banner qa" id="banner"><span>ЗАГРУЗКА…</span><span>ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ</span></div>
<main>
<h1>Приватная панель аналитики</h1>
<p class="sub">Все числа — <b>открытия экранов</b> и срабатывания функций из агрегатов без идентификаторов. Людей, устройств и сессий в данных нет, поэтому «сколько пользователей» вычислить нельзя. Ячейки с n &lt; k не показываются, все суммы — «не менее».</p>
<div class="ctrl">
<label>Период <select id="days"><option value="7">7 дней</option><option value="28">28 дней (4 недели)</option><option value="91">всё хранение (до 90 дн.)</option></select></label>
<label>Платформа <select id="platform"><option value="all">все</option><option>web</option><option>android</option><option>ios</option></select></label>
<label>Раздел <select id="section"></select></label>
<a class="btn" id="csv" href="/reports/api/summary.csv?days=7&amp;platform=all&amp;section=all">CSV (подавленные агрегаты)</a>
</div>
<div class="status" id="status"></div>
<div id="view">
<div class="card"><h2>Открытия экранов по дням</h2><p class="sub">screen_view; показываются только ячейки «день × платформа × раздел» с n ≥ k.</p><div class="kpi" id="kpi"></div><div id="daily"></div></div>
<div class="grid mt">
<div class="card"><h2>Открытия по разделам</h2><p class="sub">screen_view, выбранный период</p><div id="sections"></div></div>
<div class="card"><h2>Каталоги и списки (<code>catalog_open</code>)</h2><p class="sub">Открытия экранов-списков («Выбор гадзіны», «Избранное» и др.). Недели × платформа × каталог.</p><div id="catalog"></div></div>
<div class="card"><h2>Время на экране (<code>fv</code>)</h2><p class="sub">Видимое (foreground) время визита, в корзинах.</p><div id="fv"></div></div>
<div class="card"><h2>Приблизительное время чтения (<code>er</code>)</h2><p class="sub">Верхняя оценка по тексту до достигнутой позиции (120 слов/мин, не откалибровано). Не доказательство чтения.</p><div id="er"></div></div>
<div class="card"><h2>Глубина прокрутки (<code>sd</code>)</h2><p class="sub"><code>fit</code> = текст поместился без прокрутки.</p><div id="sd"></div></div>
<div class="card"><h2>Использование функций (<code>feature_use</code>)</h2><p class="sub">Сколько раз сработала функция. Низкое использование ≠ ненужность. Без текста поиска и без пути пользователя.</p><div id="features"></div></div>
</div>
<div class="card mt"><h2>Топ публичных материалов</h2><p class="sub">Молитвы, песни, компендиум, Библия: топ-10 из опубликованного перечня, все платформы вместе (фильтр платформы к этому блоку не применяется), недели × материал с n ≥ k. «Хвост», остаток и доли не публикуются. Открытие текста не раскрывает мотив чтения.</p><div class="grid" id="materials"></div></div>
<div class="card mt"><h2>Ошибки измерения</h2><p class="sub">Это про качество измерения, не про ошибки пользователей.</p><div id="errors"></div></div>
</div>
<footer id="foot"></footer>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body></html>`;
}
