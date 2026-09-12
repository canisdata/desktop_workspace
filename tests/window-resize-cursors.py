"""Verify production iframe-window corner cursors in Chromium and Firefox.
Requires Python Playwright; optionally set DW_CHROMIUM to a Chromium executable.
OS cursor glyphs are not captured by screenshots: test CSS/hotspots and decode the
explicit cursor artwork, rather than claiming a headless screenshot contains it.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    for name in ('chromium', 'firefox'):
        options: dict = {'headless': True}
        if name == 'chromium':
            options['args'] = ['--no-sandbox']
            if os.environ.get('DW_CHROMIUM'):
                options['executable_path'] = os.environ['DW_CHROMIUM']
        browser = getattr(p, name).launch(**options)
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        def route(request):
            rel = request.request.url.split('https://cursor-fixture.test/', 1)[1]
            if rel.startswith(('css/', 'img/')):
                file = APP / rel
                request.fulfill(status=200, body=file.read_bytes(), content_type='text/css' if rel.endswith('.css') else 'image/svg+xml')
            else:
                request.fulfill(status=200, content_type='text/html', body='<link rel="stylesheet" href="/css/desktop.css"><link rel="stylesheet" href="/css/window-shell-fixes.css"><div class="desktop-window" style="left:100px;top:100px;width:600px;height:400px"><iframe class="desktop-window-iframe" src="about:blank"></iframe>'+''.join('<div class="desktop-resize desktop-resize-'+d+'"></div>' for d in ('ne','nw','se','sw'))+'</div>')
        page.route('https://cursor-fixture.test/**', route)
        page.goto('https://cursor-fixture.test/')
        assert page.locator('.desktop-window').evaluate('(e)=>getComputedStyle(e).resize') == 'none'
        for corner, diagonal in [('ne','nesw'),('sw','nesw'),('nw','nwse'),('se','nwse')]:
            handle = page.locator('.desktop-resize-'+corner)
            cursor = handle.evaluate('(e)=>getComputedStyle(e).cursor')
            assert 'cursor-resize-'+diagonal+'.svg' in cursor and '12 12' in cursor and cursor.endswith(diagonal+'-resize'), cursor
            box=handle.bounding_box(); assert box and box['width']==16 and box['height']==16
            page.mouse.move(box['x']+8, box['y']+8)
            assert page.evaluate('([x,y])=>document.elementFromPoint(x,y).className',[box['x']+8,box['y']+8]).endswith('desktop-resize-'+corner)
        # Decode both SVGs in the real browser, inspect main diagonal pixels.
        for diagonal in ('nwse','nesw'):
            pixels=page.evaluate('''async (diagonal)=>{const i=new Image();i.src='/img/cursor-resize-'+diagonal+'.svg';await i.decode();const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d');x.drawImage(i,0,0);return {width:i.naturalWidth,height:i.naturalHeight,a:x.getImageData(8,8,1,1).data[3],b:x.getImageData(15,8,1,1).data[3]}}''',diagonal)
            assert pixels['width']==pixels['height']==24
            assert (pixels['a']>0 and pixels['b']==0) if diagonal=='nwse' else (pixels['b']>0 and pixels['a']==0), pixels
        print('PASS',name,'all four iframe-window corner cursors: geometry, explicit diagonal artwork, center hotspots and native fallback')
        browser.close()
