"""Reproducible native/Web exports from the owner's approved first illustration.

The original PNG is preserved. Rasterisation uses resvg; Pillow is used only
to encode ICO and to inspect or display the exported files. Run from either
repository: python tools/generate_brand_assets.py or scripts/generate_brand_assets.py.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import subprocess
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'branding/source'
SIZES = {'mdpi': (1,48), 'hdpi': (1.5,72), 'xhdpi': (2,96), 'xxhdpi': (3,144), 'xxxhdpi': (4,192)}
IVORY = '#F5F1E8'

def root_svg(body, viewbox='0 0 1024 1024'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="{viewbox}">{body}</svg>'

def art_svg(scale=1, background=None, circle=False, crop=False):
    data=base64.b64encode((SOURCE/'approved-icon.png').read_bytes()).decode()
    # Approved image: 1254x1254; the existing circular composition is centred
    # at (627,616) with radius 525. No additional squircle is baked into it.
    defs='<defs><clipPath id="brand-circle"><circle cx="512" cy="503" r="426"/></clipPath></defs>'
    image=f'<image href="data:image/png;base64,{data}" x="0" y="0" width="1024" height="1024"/>'
    if circle: image=f'{defs}<g clip-path="url(#brand-circle)">{image}</g>'
    offset=512*(1-scale)
    # Centre the circle optically when using a native transparent layer.
    if circle and not crop:
        image=f'<g transform="translate({offset} {offset+9*scale}) scale({scale})">{image}</g>'
    elif scale!=1:
        image=f'<g transform="translate({offset} {offset}) scale({scale})">{image}</g>'
    bg=f'<rect width="1024" height="1024" fill="{background}"/>' if background else ''
    return root_svg(bg+image, '84 75 856 856' if crop else '0 0 1024 1024')

def mono_svg(scale=.78, background=None, dark=False):
    # Source artwork is native SVG, so the themed derivative remains editable.
    svg=(SOURCE/'monochrome.svg').read_text(encoding='utf-8')
    body=svg[svg.index('>')+1:svg.rindex('</svg>')]
    if dark: body=body.replace('fill="white" mask=', 'fill="#6B4A32" mask=')
    offset=512*(1-scale)
    bg=f'<rect width="1024" height="1024" fill="{background}"/>' if background else ''
    return root_svg(bg+f'<g transform="translate({offset} {offset}) scale({scale})">{body}</g>')

def queue(tasks, path, svg, size):
    tasks.append({'output':str(ROOT/path), 'svg':svg, 'size':size})

def native(tasks):
    res=Path('android/app/src/main/res')
    catalog=Path('ios/Runner/Assets.xcassets')
    contents=json.loads((ROOT/catalog/'AppIcon.appiconset/Contents.json').read_text())
    for item in contents['images']:
        size=round(float(item['size'].split('x')[0])*float(item['scale'].rstrip('x')))
        queue(tasks,catalog/'AppIcon.appiconset'/item['filename'],art_svg(background=IVORY,circle=True),size)
    for density,(factor,size) in SIZES.items():
        queue(tasks,res/f'mipmap-{density}/ic_launcher.png',art_svg(background=IVORY,circle=True),size)
        queue(tasks,res/f'drawable-{density}/brand_splash.png',art_svg(circle=True,crop=True),round(160*factor))
    # Adaptive foreground sits inside the central 66/108 dp safe zone:
    # circle diameter is .72 * 852 / 1024 * 108 = 64.70 dp.
    queue(tasks,res/'drawable-nodpi/ic_launcher_foreground.png',art_svg(scale=.72,circle=True),432)
    queue(tasks,res/'drawable-nodpi/ic_launcher_monochrome.png',mono_svg(scale=.75),432)
    # Android 12+: bitmap canvas 288 dp; approved badge diameter 179.72 dp
    # fits inside the required 192 dp circle without a second icon background.
    queue(tasks,res/'drawable-nodpi/brand_splash_icon.png',art_svg(scale=.75,circle=True),864)
    for scale in (1,2,3):
        queue(tasks,catalog/'LaunchImage.imageset'/f'brand-launch@{scale}x.png',art_svg(circle=True,crop=True),168*scale)
    queue(tasks,'branding/exports/app-icon-1024.png',art_svg(background=IVORY,circle=True),1024)
    queue(tasks,'branding/exports/launcher-monochrome.png',mono_svg(),512)
    # Flutter's optional Web runner has its own install surfaces.
    for size in (192,512):
        queue(tasks,f'web/icons/Icon-{size}.png',art_svg(background=IVORY,circle=True),size)
        queue(tasks,f'web/icons/Icon-maskable-{size}.png',art_svg(scale=.92,background=IVORY,circle=True),size)
    queue(tasks,'web/favicon.png',mono_svg(scale=1,background='#6B4A32'),32)

def web(tasks):
    queue(tasks,'public/app-icon-master.png',art_svg(background=IVORY,circle=True),1024)
    for size in (192,512):
        queue(tasks,f'public/web-app-manifest-{size}x{size}.png',art_svg(background=IVORY,circle=True),size)
        queue(tasks,f'public/web-app-manifest-maskable-{size}x{size}.png',art_svg(scale=.92,background=IVORY,circle=True),size)
    queue(tasks,'public/apple-touch-icon.png',art_svg(background=IVORY,circle=True),180)
    # Micro favicons retain the core silhouette, with clear cutout cross;
    # they do not claim to preserve every feather of a shaded illustration.
    for size in (16,32,48,96):
        image=mono_svg(scale=1,background='#6B4A32') if size<=32 else art_svg(background=IVORY,circle=True)
        queue(tasks,f'public/favicon-{size}x{size}.png',image,size)
    queue(tasks,'public/app-brand-96.png',art_svg(circle=True,crop=True),96)

def validate(tasks):
    for task in tasks:
        with Image.open(task['output']) as im:
            assert im.size==(task['size'],task['size']),task['output']
    # Full-bleed store and PWA files are opaque; alpha is reserved for layers.
    for task in tasks:
        if any(x in task['output'] for x in ('AppIcon.appiconset','web-app-manifest','app-icon-master','apple-touch','app-icon-1024')):
            with Image.open(task['output']) as im:
                if im.mode=='RGBA': assert im.getchannel('A').getextrema()==(255,255),task['output']
    print(f'Validated {len(tasks)} PNG dimensions and opaque install surfaces.')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--target',choices=['native','web'],default='native' if (ROOT/'pubspec.yaml').exists() else 'web')
    args=parser.parse_args()
    tasks=[]
    (native if args.target=='native' else web)(tasks)
    tasks=list({task['output']:task for task in tasks}.values())
    subprocess.run(['node',str(Path(__file__).with_name('render_brand_assets.cjs'))],input=json.dumps(tasks),text=True,encoding='utf-8',check=True)
    for task in tasks:
        # App Store icons must not have an alpha channel. Normalise all fully
        # opaque install exports to lossless RGB, preserving every colour.
        with Image.open(task['output']) as im:
            if im.mode=='RGBA' and im.getchannel('A').getextrema()==(255,255):
                rgb=im.convert('RGB')
                rgb.save(task['output'],compress_level=9)
    if args.target=='web':
        # ICO is an encoding/container step using the already rendered favicon.
        with Image.open(ROOT/'public/favicon-96x96.png') as im:
            im.save(ROOT/'public/favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(96,96)],append_images=[Image.open(ROOT/'public/favicon-16x16.png'),Image.open(ROOT/'public/favicon-32x32.png'),Image.open(ROOT/'public/favicon-48x48.png')])
    validate(tasks)
    files=[Path(t['output']) for t in tasks]
    if args.target=='web': files.append(ROOT/'public/favicon.ico')
    inventory={'approved_source_sha256':hashlib.sha256((SOURCE/'approved-icon.png').read_bytes()).hexdigest(),'files':[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
    (ROOT/'branding/asset-manifest.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': main()
