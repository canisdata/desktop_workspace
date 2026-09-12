"""Production-script browser fixtures, not authenticated Nextcloud GUI tests.
Run with Python Playwright installed; set DW_CHROMIUM to a Chromium executable.
Network responses and native Vue row metadata below are explicit test fixtures.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    options = dict(headless=True, args=['--no-sandbox'])
    browser_type = os.environ.get('DW_BROWSER', 'chromium')
    if browser_type == 'chromium' and os.environ.get('DW_CHROMIUM'):
        options['executable_path'] = os.environ['DW_CHROMIUM']
    browser = getattr(p, browser_type).launch(**options)
    page = browser.new_page(viewport={'width': 1200, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('PAGE ERROR:', e.stack)))
    page.route('https://drag-fixture.test/**', lambda route: route.fulfill(status=200, content_type='text/html', body='<main id="app-content-vue"><table><tbody></tbody></table></main>'))
    page.goto('https://drag-fixture.test/')
    page.evaluate("document.body.innerHTML='<main id=desktop-stage></main><iframe id=source src=/apps/files/files?dir=/Source></iframe><iframe id=dest src=/apps/files/files?dir=/Destination></iframe><iframe id=owned src=/owned?dir=/Owned></iframe>'")
    page.wait_for_function("Array.from(document.querySelectorAll('iframe')).every(f=>f.contentDocument?.querySelector('#app-content-vue'))")
    page.add_style_tag(content=(APP/'css/desktop.css').read_text())
    page.add_script_tag(content=(APP/'js/desktop-drag-rules.js').read_text())
    page.add_script_tag(content=(APP/'js/native-files-drag.js').read_text())
    page.evaluate("""() => {
        window.OC={getCurrentUser:()=>({uid:'qa'}),requestToken:'fixture-token'};
        window.requests=[]; window.pending=[]; window.completions=0;
        window.fetch=(url,opts)=>new Promise(resolve=>{requests.push({url,...opts});pending.push(resolve)});
        window.alert=(text)=>{window.lastAlert=text};
        window.node=(path,type='folder',permissions=31)=>({path,type,permissions,basename:path.split('/').pop(),source:location.origin+'/remote.php/dav/files/qa'+path});
        for(const [id,path] of [['source','/Source'],['dest','/Destination']]){
            const f=document.getElementById(id), doc=f.contentDocument;
            const row=doc.createElement('tr'); row.setAttribute('data-cy-files-list-row-fileid',id==='source'?'11':'12');row.draggable=true;
            row.innerHTML='<td>test row</td>';doc.querySelector('tbody').append(row);
            const source=node(path+(id==='source'?'/a.txt':'/Folder'), id==='source'?'file':'folder');
            row.__vue__={source,activeFolder:node(path),canDrag:true,selectedFiles:[]};
            doc.querySelector('main').__vue__={activeFolder:node(path)};
            if(!DesktopWorkspaceNativeFilesDrag.install(f,{onComplete:()=>{completions++}}))throw Error('adapter not installed');
        }
        window.start=()=>{
            window.dt=new DataTransfer();const f=document.getElementById('source');
            f.contentDocument.querySelector('tr').dispatchEvent(new f.contentWindow.DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
            if(!DesktopWorkspaceDragRules.readDrag(dt))throw Error('native source not bound');
        };
        window.hover=(ctrl=false)=>{const f=document.getElementById('dest');f.contentDocument.querySelector('tr').dispatchEvent(new f.contentWindow.DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,ctrlKey:ctrl,clientX:20,clientY:20}))};
        window.drop=(ctrl=false)=>{const f=document.getElementById('dest');f.contentDocument.querySelector('tr').dispatchEvent(new f.contentWindow.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,ctrlKey:ctrl}))};
    }""")
    page.evaluate('start();hover()')
    assert page.locator('.desktop-drag-feedback').get_attribute('data-operation') == 'MOVE'
    page.evaluate("document.getElementById('source').contentDocument.dispatchEvent(new KeyboardEvent('keydown',{key:'Control',bubbles:true}))")
    assert page.locator('.desktop-drag-feedback').inner_text() == '+'
    page.evaluate("document.getElementById('source').contentDocument.dispatchEvent(new KeyboardEvent('keyup',{key:'Control',bubbles:true}))")
    assert page.locator('.desktop-drag-feedback').inner_text() == '↳'
    page.evaluate('drop()')
    assert page.locator('.desktop-operation-overlay').count() == 1
    assert page.evaluate('requests[0].method') == 'MOVE'
    assert page.evaluate('requests[0].headers.Overwrite') == 'F'
    assert page.evaluate('requests[0].headers.Destination.endsWith("/Destination/Folder/a.txt")')
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_function('completions===1')
    assert page.locator('.desktop-operation-overlay').count() == 0
    page.evaluate('start();hover(true);drop(true)')
    assert page.evaluate('requests[1].method') == 'COPY'
    page.evaluate('pending.shift()({ok:false,status:412})')
    page.locator('dialog.desktop-transfer-conflict').wait_for(state='visible')
    assert page.locator('.desktop-operation-overlay').count() == 1
    page.locator('[data-choice="abort"]').click()
    page.wait_for_function('completions===2')
    assert page.locator('.desktop-operation-overlay').count() == 0
    page.evaluate("document.getElementById('dest').contentDocument.querySelector('tr').__vue__.source.permissions=1;start();hover()")
    assert page.locator('.desktop-drag-feedback').count() == 0
    page.evaluate('drop()')
    assert page.evaluate('requests.length') == 2
    # Load the actual app-owned Files script in a third same-origin iframe.
    owned = page.frame(url='https://drag-fixture.test/owned?dir=/Owned')
    owned.evaluate("""() => {
        document.body.innerHTML='<main id="desktop-files-root" data-desktop-files-root data-desktop-launch="true" data-user-id="qa"><span id="desktop-files-path"></span><ul id="desktop-files-tree"></ul><div class="desktop-files-main"><table><tbody id="desktop-files-rows"></tbody></table></div><aside id="desktop-files-detail-sidebar"></aside><div id="desktop-files-context-menu"></div></main>';
        window.OC={getCurrentUser:()=>({uid:'qa'})};window.alert=(s)=>parent.lastAlert=s;
        window.fetch=async(url,opts)=>{
            if(opts.method!=='PROPFIND')return parent.fetch(url,opts);
            const path=decodeURIComponent(new URL(url,location.origin).pathname.split('/qa')[1]);
            const entry=(path,folder)=>'<d:response><d:href>/remote.php/dav/files/qa'+path+'</d:href><d:propstat><d:prop><d:resourcetype>'+(folder?'<d:collection/>':'')+'</d:resourcetype><oc:permissions>RGDNVCK</oc:permissions><oc:fileid>23</oc:fileid></d:prop></d:propstat></d:response>';
            const content=entry(path,true)+(path==='/Owned' && opts.headers.Depth==='1'?entry('/Owned/local.txt',false):'');
            return {ok:true,text:async()=>'<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">'+content+'</d:multistatus>'};
        };
    }""")
    owned.add_script_tag(content=(APP/'js/desktop-drag-rules.js').read_text())
    owned.add_style_tag(content=(APP/'css/files/files.css').read_text())
    owned.add_script_tag(content=(APP/'js/files/files.js').read_text())
    owned.wait_for_selector('tr[data-path="/Owned/local.txt"]')
    page.evaluate('start()')
    owned.evaluate("""() => {const pane=document.querySelector('.desktop-files-main');pane.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:parent.dt,ctrlKey:true}));pane.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:parent.dt,ctrlKey:true}))}""")
    assert owned.locator('.desktop-files-operation-progress').count() == 1
    assert page.evaluate('requests[2].method') == 'COPY'
    assert page.evaluate('requests[2].headers.Destination.endsWith("/Owned/a.txt")')
    page.evaluate('pending.shift()({ok:true,status:201})')
    owned.wait_for_selector('.desktop-files-operation-progress',state='detached')
    # Start in app-owned Files and finish in native Files.
    page.evaluate("document.getElementById('dest').contentDocument.querySelector('tr').__vue__.source.permissions=31;window.dt=new DataTransfer()")
    owned.evaluate("document.querySelector('tr[data-path]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:parent.dt}))")
    page.evaluate('hover();drop()')
    assert page.evaluate('requests[3].method') == 'MOVE'
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_function('completions===3')
    # Execute the complete production shell, with only its surrounding DOM/API fixtures.
    import re
    shell = (APP/'js/desktop-shell.js').read_text()
    ids = sorted(set(re.findall(r"getElementById\('([^']+)'\)", shell)))
    page.evaluate("""(ids) => {
        const root=document.createElement('div');root.id='desktop-root';root.dataset.desktopAppRoot='';root.dataset.desktopFolder='/Desktop';root.dataset.showFavorites='false';root.dataset.showHome='false';root.dataset.showTrash='false';root.dataset.desktopfilesEnabled='false';document.body.append(root);
        root.append(document.getElementById('desktop-stage'));
        for(const id of ids)if(!document.getElementById(id)){const el=document.createElement(id==='desktop-unified-search'?'input':'div');el.id=id;root.append(el)}
        document.getElementById('desktop-stage').append(document.getElementById('desktop-favorites'));
        const taskbar=document.createElement('div');taskbar.className='desktop-taskbar';root.append(taskbar);
        for(const id of ['desktop-start','desktop-pinned-apps','desktop-task-list'])taskbar.append(document.getElementById(id));
        document.getElementById('desktop-topbar').append(document.getElementById('desktop-shell-utilities'));
        for(const id of ['desktop-fullscreen','desktop-header-end-slot','desktop-clock','desktop-nextcloud-logo'])document.getElementById('desktop-shell-utilities').append(document.getElementById(id));
        document.getElementById('desktop-clock').innerHTML='<span class="desktop-clock-time"></span><span class="desktop-clock-date"></span>';
        const previousFetch=window.fetch;
        const xml='<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>/remote.php/dav/files/qa/Desktop/</d:href><d:propstat><d:prop><oc:permissions>RGDNVCK</oc:permissions><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'+['on-desktop.txt','Folder'].map((name,i)=>'<d:response><d:href>/remote.php/dav/files/qa/Desktop/'+name+'</d:href><d:propstat><d:prop><oc:fileid>'+(90+i)+'</oc:fileid><oc:permissions>RGDNVCK</oc:permissions><d:resourcetype>'+(i?'<d:collection/>':'')+'</d:resourcetype></d:prop></d:propstat></d:response>').join('')+'</d:multistatus>';
        window.fetch=(url,opts={})=>['MOVE','COPY'].includes(opts.method)?previousFetch(url,opts):Promise.resolve({ok:true,status:207,text:async()=>xml,json:async()=>({})});
        OC.imagePath=()=>'';OC.generateUrl=(path)=>path;
    }""", ids)
    page.add_script_tag(content=shell)
    page.wait_for_function('!!DesktopWorkspaceDragRules.executeDrop')
    page.evaluate("""() => {
        start();const stage=document.getElementById('desktop-stage');
        stage.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,ctrlKey:true}));
        if(document.querySelector('.desktop-drag-feedback')?.dataset.operation!=='COPY')throw Error('Desktop COPY feedback missing');
        stage.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,ctrlKey:true}));
    }""")
    assert page.locator('.desktop-operation-overlay').count() == 1
    assert page.evaluate('requests[4].method') == 'COPY'
    assert page.evaluate('requests[4].headers.Destination.endsWith("/Desktop/a.txt")')
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_selector('.desktop-operation-overlay',state='detached')
    # Real pointer capture gesture: Desktop icons do not emit HTML drag events.
    page.evaluate("""() => {
        document.getElementById('desktop-stage').className='desktop-stage';
        document.getElementById('desktop-favorites').className='desktop-favorites';
        const f=document.getElementById('dest');f.className='desktop-window-iframe';
        f.style.cssText='position:fixed;left:500px;top:220px;width:500px;height:300px;z-index:999';
        f.contentDocument.querySelector('tr').style.height='90px';
    }""")
    icon = page.locator('.desktop-fav[data-path="Desktop/on-desktop.txt"], .desktop-fav[data-path="/Desktop/on-desktop.txt"]')
    icon.wait_for(state='visible')
    box = icon.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down()
    page.mouse.move(560, 255, steps=10)
    assert page.locator('.desktop-drag-feedback').count() == 1, 'Desktop pointer → native target has no feedback'
    assert page.locator('.desktop-drag-feedback').inner_text() == '↳'
    page.keyboard.down('Control')
    assert page.locator('.desktop-drag-feedback').inner_text() == '+'
    page.keyboard.up('Control')
    page.mouse.up()
    page.wait_for_function('requests.length === 6')
    assert page.evaluate('requests[5].method') == 'MOVE'
    assert page.evaluate('requests[5].headers.Destination.endsWith("/Destination/Folder/on-desktop.txt")')
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_selector('.desktop-operation-overlay',state='detached')
    # Actual pointer COPY release, including Ctrl held before starting the drag.
    box = icon.bounding_box()
    page.keyboard.down('Control')
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(); page.mouse.move(560, 255, steps=10); page.mouse.up()
    page.keyboard.up('Control')
    page.wait_for_function('requests.length === 7')
    assert page.evaluate('requests[6].method') == 'COPY'
    page.evaluate('pending.shift()({ok:false,status:412})')
    page.locator('dialog[open]').wait_for()
    page.locator('dialog input').fill('../escape')
    page.locator('[data-choice=rename]').click()
    assert page.evaluate('requests.length') == 7
    page.locator('dialog input').fill('renamed.txt'); page.locator('[data-choice=rename]').click()
    page.wait_for_function('requests.length === 8')
    assert page.evaluate('requests[7].headers.Destination.endsWith("/renamed.txt") && requests[7].headers.Overwrite === "F"')
    # Repeated collision: overwrite consent belongs to only the chosen name.
    page.evaluate('pending.shift()({ok:false,status:412})')
    page.locator('[data-choice=overwrite]').click()
    page.wait_for_function('requests.length === 9')
    assert page.evaluate('requests[8].headers.Overwrite') == 'T'
    page.evaluate('pending.shift()({ok:false,status:412})')
    page.locator('dialog input').fill('another.txt'); page.locator('[data-choice=rename]').click()
    page.wait_for_function('requests.length === 10')
    assert page.evaluate('requests[9].headers.Destination.endsWith("/another.txt") && requests[9].headers.Overwrite === "F"')
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_selector('.desktop-operation-overlay',state='detached')
    # Multi-item abort must not submit later items; already completed items remain.
    page.evaluate("""() => {window.batch='pending';DesktopWorkspaceNativeFilesDrag.execute({method:'MOVE',targetPath:'/Destination',sources:[{path:'/Desktop/a',name:'a'},{path:'/Desktop/b',name:'b'}]},()=>{}).then(r=>batch=r)}""")
    page.wait_for_function('requests.length === 11')
    page.evaluate('pending.shift()({ok:false,status:412})')
    page.locator('[data-choice=abort]').click()
    page.wait_for_function("batch !== 'pending'")
    assert page.evaluate('batch.aborted && requests.length === 11')
    assert page.locator('.desktop-operation-overlay').count() == 0
    # No conflict dialog for permission or network failure, and cleanup still runs.
    page.evaluate("""() => {window.batch='pending';DesktopWorkspaceNativeFilesDrag.execute({method:'COPY',targetPath:'/Destination',sources:[{path:'/Desktop/a',name:'a'}]},()=>{}).then(r=>batch=r)}""")
    page.wait_for_function('requests.length === 12')
    page.evaluate('pending.shift()({ok:false,status:403})')
    page.wait_for_function("batch !== 'pending'")
    assert page.evaluate('batch.failed.length === 1')
    assert page.locator('dialog, .desktop-operation-overlay').count() == 0
    page.evaluate("""async () => {const saved=window.fetch;window.fetch=()=>Promise.reject(new Error('fixture network failure'));try {window.networkResult=await DesktopWorkspaceNativeFilesDrag.execute({method:'MOVE',targetPath:'/Destination',sources:[{path:'/Desktop/a',name:'a'}]},()=>{})} finally {window.fetch=saved}}""")
    assert page.evaluate('networkResult.failed.length === 1')
    assert page.locator('dialog, .desktop-operation-overlay').count() == 0
    # Renaming to an ancestor of the source is rejected before any second request.
    page.evaluate("""() => {window.ancestorCalls=[];window.ancestorResult='pending';DesktopWorkspaceDragRules.transferWithConflicts({path:'/Desktop/a',name:'a'},'/',async(destination,overwrite)=>{ancestorCalls.push({destination,overwrite});return {ok:false,status:412}}).then(()=>ancestorResult='unexpected',error=>ancestorResult=error.message)}""")
    page.locator('dialog input').fill('Desktop'); page.locator('[data-choice=rename]').click()
    page.wait_for_function("ancestorResult !== 'pending'")
    assert page.evaluate('ancestorCalls.length === 1 && ancestorResult === "Invalid transfer destination"')
    # Pointer cancellation removes feedback/highlights without a transfer.
    box = icon.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(); page.mouse.move(560,255,steps=10)
    before = page.evaluate('requests.length')
    icon.dispatch_event('pointercancel', {'pointerId':1})
    page.mouse.up()
    assert page.evaluate('requests.length') == before
    assert page.locator('.desktop-drag-feedback').count() == 0
    # A read-only native target is never an eligible pointer destination.
    page.evaluate("document.getElementById('dest').contentDocument.querySelector('tr').__vue__.source.permissions=1")
    box = icon.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(); page.mouse.move(560,255,steps=10)
    assert page.locator('.desktop-drag-feedback').count() == 0
    page.mouse.up()
    assert page.evaluate('requests.length') == before
    # Folder COPY into a native blank pane uses current-folder metadata and Depth.
    page.evaluate("document.getElementById('dest').contentDocument.querySelector('main').style.height='280px'")
    folder_icon = page.locator('.desktop-fav[data-path="Desktop/Folder"]')
    folder_icon.click()
    box = folder_icon.bounding_box()
    page.keyboard.down('Control')
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down(); page.mouse.move(750,430,steps=10)
    assert page.locator('.desktop-drag-feedback').inner_text() == '+'
    page.mouse.up(); page.keyboard.up('Control')
    page.wait_for_function('(before)=>requests.length===before+1',arg=before)
    assert page.evaluate('requests.at(-1).method === "COPY" && requests.at(-1).headers.Depth === "infinity" && requests.at(-1).headers.Destination.endsWith("/Destination/Folder")')
    page.evaluate('pending.shift()({ok:true,status:201})')
    page.wait_for_selector('.desktop-operation-overlay',state='detached')
    # A source folder cannot be dropped into its own descendant.
    page.evaluate("document.getElementById('dest').contentDocument.querySelector('main').__vue__.activeFolder=node('/Desktop/Folder/Child')")
    box = folder_icon.bounding_box(); before=page.evaluate('requests.length')
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down(); page.mouse.move(750,430,steps=10)
    assert page.locator('.desktop-drag-feedback').count() == 0
    page.mouse.up()
    assert page.evaluate('requests.length') == before
    assert not errors, errors
    print('PASS',browser_type,'native↔native, native↔Desktop Files, native→Desktop; actual Desktop pointer→native MOVE/COPY with experimental Files disabled; file/folder and blank-pane targets; live Ctrl; rename/repeated collision/explicit overwrite/consent reset; batch abort; ancestor/descendant rejection; cancellation/read-only targets; error cleanup; no page errors')
    browser.close()
