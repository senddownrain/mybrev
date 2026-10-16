"""Offline regression checks for the PWA ribbon and reproducible exports."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from PIL import Image, ImageChops
import generate_brand_assets as brand

ROOT = brand.ROOT
SOURCE_SHA = 'fa8ac6990b67f4a48e5907d00c86aa7306fb44921f079dd5bc92c7bba682a294'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    manifest_path=ROOT/'branding/asset-manifest.json'
    manifest_bytes=manifest_path.read_bytes()
    manifest=json.loads(manifest_bytes)
    assert sha(brand.SOURCE/'approved-icon.png')==SOURCE_SHA
    assert manifest['approved_source_sha256']==SOURCE_SHA
    assert manifest['pwa_overlay_sha256']==sha(brand.SOURCE/'pwa-bookmark.svg')
    for item in manifest['files']:
        assert sha(ROOT/item['path'])==item['sha256'],item['path']

    tasks=[]
    brand.web(tasks)
    brand.validate(tasks)
    with Image.open(ROOT/'public/app-brand-96.png') as im:
        assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255)
        assert im.getpixel((0,0))[3]==0
    with Image.open(ROOT/'public/favicon.ico') as ico:
        assert ico.ico.sizes()=={(s,s) for s in (16,32,48,96)}
        for size in (16,32,48,96):
            with Image.open(ROOT/f'public/favicon-{size}x{size}.png') as png:
                assert ico.ico.getimage((size,size)).convert('RGBA').tobytes()==png.convert('RGBA').tobytes()
    for size in (192,512):
        with Image.open(ROOT/f'public/web-app-manifest-maskable-{size}x{size}.png') as im:
            im=im.convert('RGB')
            for y in range(size):
                for x in range(size):
                    if (x+.5-size/2)**2+(y+.5-size/2)**2 >= (.4*size)**2:
                        assert im.getpixel((x,y))==(245,241,232),(size,x,y)

    with tempfile.TemporaryDirectory() as tmp:
        baseline=Path(tmp)/'baseline.png'
        micro_tasks=[{'output':str(baseline),'svg':brand.art_svg(background=brand.IVORY,circle=True),'size':1024}]
        for size in (16,32):
            micro_tasks.append({'output':str(Path(tmp)/f'{size}.png'),'svg':brand.mono_svg(scale=1,background='#6B4A32'),'size':size})
        brand.render(micro_tasks)
        with Image.open(baseline) as before, Image.open(ROOT/'public/app-icon-master.png') as after:
            diff=ImageChops.difference(before.convert('RGB'),after.convert('RGB'))
            box=diff.getbbox()
            assert box and box[0]>=748 and box[1]>=735 and box[2]<=799 and box[3]<=822,box
            changed=sum(pixel!=(0,0,0) for pixel in diff.getdata())
            assert 0<changed<1024*1024*.005,changed
            print(f'PASS: only {changed} master pixels changed; ribbon bounds {box}; dove/cross/text untouched.')
        for size in (16,32):
            with Image.open(Path(tmp)/f'{size}.png') as before, Image.open(ROOT/f'public/favicon-{size}x{size}.png') as after:
                assert before.convert('RGB').tobytes()==after.convert('RGB').tobytes()

    # Verify the complete public exports, ICO, preview and inventory on a second run.
    subprocess.run([sys.executable,str(Path(__file__).with_name('generate_brand_assets.py')),'--target','web'],check=True)
    assert manifest_path.read_bytes()==manifest_bytes,'Regeneration changed inventory'
    for item in manifest['files']:
        assert sha(ROOT/item['path'])==item['sha256'],f"Non-deterministic: {item['path']}"
    print('PASS: source SHA, overlay SHA, checksums, dimensions, opacity, alpha, ICO frames, maskable safe zone, micro favicons and byte-identical regeneration.')

if __name__=='__main__':
    main()
