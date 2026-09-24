// Isolated real-app UI checks. All backend responses are fixtures; no live service is contacted.
// First export with EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 and a fixture anon key.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const build = path.resolve(process.env.DUDLEY_WEB_BUILD || 'dist');
const refreshOnly = !!process.env.DUDLEY_REFRESH_ONLY;
const screenshots = path.resolve(refreshOnly ? 'docs/evidence/dudley-refresh' : 'docs/evidence/dudley');
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const questId = '33333333-3333-4333-8333-333333333333';
const packId = '44444444-4444-4444-8444-444444444444';
const profile = { id: userId, display_name: 'Fixture Walker', avatar_url: null };
const quest = { id: questId, pack_id: packId, creator_id: otherId, assignee_id: userId,
  mode: 'targeted', status: 'active', description: 'Find the little blue door', photo_path: null,
  photo_full_path: null, photo_thumbnail_path: null, created_at: new Date().toISOString() };
let quests = [], delay = 0, journey = null, failUpload = false;
let questRequests = 0, failRefresh = false;
let browser;
(async () => {
  await fs.mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: process.env.BROWSER_EXECUTABLE_PATH ? ['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu','--disable-software-rasterizer'] : [] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true });
  await context.addInitScript(({ userId }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const encode = x => btoa(JSON.stringify(x)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: userId, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' }) + '.fixture';
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user }));
  }, { userId });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.origin === 'http://localhost:8081') {
      let file = path.resolve(build, '.' + url.pathname);
      if (!file.startsWith(build + '/')) file = path.join(build, 'index.html');
      let body;
      try { body = await fs.readFile(file); } catch { body = await fs.readFile(path.join(build,'index.html')); file = 'index.html'; }
      const types = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf', '.ico':'image/x-icon' };
      return route.fulfill({ body, contentType: types[path.extname(file)] || 'application/octet-stream' });
    }
    if (url.origin === 'http://localhost:3001') {
      if(url.pathname === '/stats' && delay) await new Promise(resolve=>setTimeout(resolve,delay));
      const data=url.pathname === '/stats' ? {spend_cents:0,visits:0,average_basket_cents:0,line_items:0,produce_pounds:0,review_included:0,excluded_currency:0,undated_receipts:0,months:[],products:[]} : {receipts:[],has_more:false,counts:{}};
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)});
    }
    if (url.origin !== 'http://localhost:54321') { console.error('BLOCKED',url.href); return route.abort('blockedbyclient'); }
    const headers = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,PATCH,OPTIONS' };
    if(req.method()==='OPTIONS') return route.fulfill({ status:204, headers });
    let data = [];
    const endpoint = url.pathname;
    if(endpoint.endsWith('/profiles')) data=profile;
    else if(endpoint.endsWith('/packs')) data=[{ id:packId,name:'The neighborhood pack',created_at:new Date().toISOString(),pack_members:[{ user_id:userId,pack_id:packId,status:'active',role:'owner',profile },{user_id:otherId,pack_id:packId,status:'active',role:'member',profile:{id:otherId,display_name:'A packmate'}}],pack_invites:[] }];
    else if(endpoint.endsWith('/quests')) {
      questRequests++;
      if(failRefresh) return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({message:'temporarily unavailable'})});
      if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
      data=url.searchParams.has('id') ? (url.searchParams.get('id')===`eq.${questId}` ? quest : null) : (url.searchParams.get('status')==='eq.completed' ? [] : quests);
    } else if(endpoint.endsWith('/journeys')) {
      if(req.method()==='POST') journey={id:'fixture-walk',user_id:userId,started_at:new Date().toISOString(),ended_at:null};
      if(req.method()==='PATCH') journey=null;
      data=journey;
    } else if(endpoint.includes('/storage/v1/object/')) {
      if(failUpload) return route.abort('internetdisconnected');
      data={Key:'fixture-photo'};
    } else if(endpoint.endsWith('/rpc/complete_quest')) data={success:true};
    else if(endpoint.endsWith('/auth/v1/user')) data={id:userId};
    return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(data)});
  });
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  page.setDefaultTimeout(12000);
  const shot=async name=>page.screenshot({path:path.join(screenshots,name+'.png'),fullPage:true});
  if(refreshOnly) {
    quests=Array.from({length:18},(_,i)=>({...quest,id:i?`33333333-3333-4333-8333-${String(i).padStart(12,'0')}`:questId,description:i?`Neighborhood quest ${i}`:quest.description}));
    await page.goto('http://localhost:8081/');
    await page.getByText(quest.description,{exact:true}).waitFor();
    const refreshButton=page.getByRole('button',{name:'Refresh',exact:true});
    const idle=()=>page.waitForFunction(()=>{const b=document.querySelector('[aria-label="Refresh"]');return b && b.getAttribute('aria-disabled')!=='true';});
    await idle();
    const box=await page.getByTestId('dudley-refresh').boundingBox();
    const x=box.x+190,y=box.y+160;
    const begin=async()=>{await page.mouse.move(x,y);await page.mouse.down();};
    const drag=async(dy)=>page.mouse.move(x,y+dy,{steps:12});
    const baseline=questRequests;
    await begin(); await drag(60);
    await page.getByTestId('dudley-refresh-frame-0').waitFor();
    await shot('01-peek');
    await drag(120);
    await page.getByTestId('dudley-refresh-frame-1').waitFor();
    await shot('02-curious');
    await drag(180);
    await page.getByTestId('dudley-refresh-frame-2').waitFor();
    await shot('03-wide-eyes');
    await drag(40); await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(questRequests,baseline,'Backing off should cancel');
    assert.equal(new URL(page.url()).pathname,'/','A pull must not open the quest card');
    delay=3200;
    await begin(); await drag(180); await page.mouse.up();
    await page.getByTestId('dudley-refresh-frame-3').waitFor();
    await shot('04-pop');
    await page.getByText('Dudley’s shaking things up…').waitFor();
    await page.waitForTimeout(500);
    await shot('05-shake');
    await begin(); await drag(200); await page.mouse.up();
    assert.equal(questRequests,baseline+2,'Only one pair of feed requests');
    await idle(); delay=0;
    await page.waitForTimeout(250);
    // Native browser touch events exercise the web touch adapter, too.
    const client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let dy=15;dy<=180;dy+=15) await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});
    await page.getByTestId('dudley-refresh-frame-2').waitFor();
    await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.waitForTimeout(250);
    assert.equal(questRequests,baseline+2,'Touch cancellation must not fetch');
    await refreshButton.click(); await idle();
    assert.equal(questRequests,baseline+4,'The first click after cancellation must work');
    // Scrolling a long list, then dragging downward, must remain ordinary scrolling.
    await page.mouse.move(x,y+200); await page.mouse.wheel(0,600); await page.waitForTimeout(250);
    await begin(); await drag(180); await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(questRequests,baseline+4,'A drag below the top must not fetch');
    await page.mouse.wheel(0,-2000); await page.waitForTimeout(300);
    await page.emulateMedia({reducedMotion:'reduce'});
    delay=1200; await refreshButton.click();
    await page.getByTestId('dudley-refresh-frame-0').waitFor();
    await page.waitForTimeout(500); await shot('06-reduced-motion');
    assert.equal(await page.locator('[data-testid^="dudley-refresh-frame-"]').getAttribute('data-testid'),'dudley-refresh-frame-0');
    await idle(); delay=0;
    failRefresh=true; await refreshButton.click(); await idle(); failRefresh=false;
    await page.getByText(quest.description,{exact:true}).waitFor();
    await refreshButton.click(); await idle();
    await page.emulateMedia({reducedMotion:'no-preference'});
    // Capture the actual pull/pop/shake interaction as frames for an optional preview.
    if(process.env.DUDLEY_ANIMATION_FRAMES) {
      await page.goto('http://localhost:8081/'); await idle();
      const dir=process.env.DUDLEY_ANIMATION_FRAMES; await fs.mkdir(dir,{recursive:true});
      delay=2800; let capturing=true;
      const beforePreview=questRequests;
      const capture=(async()=>{for(let i=0;capturing && i<70;i++){await page.screenshot({path:path.join(dir,String(i).padStart(3,'0')+'.png')});await page.waitForTimeout(65);}})();
      await page.waitForTimeout(250);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let dy=10;dy<=190;dy+=10){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});await page.waitForTimeout(45);}
      await page.getByTestId('dudley-refresh-frame-2').waitFor();
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.getByText('Dudley’s shaking things up…').waitFor();
      await idle(); await page.waitForTimeout(300); capturing=false; await capture; delay=0;
      assert.equal(questRequests,beforePreview+2,'Preview must capture a real touch refresh');
    }
    await page.goto('http://localhost:8081/history'); await idle(); delay=1000;
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Dudley’s shaking things up…').waitFor(); await shot('07-history'); await idle(); delay=0;
    await page.goto('http://localhost:8081/groceries');
    // The setup page should not expose a nonfunctional refresh affordance.
    await page.getByPlaceholder('https://your-server.example').waitFor();
    assert.equal(await page.getByRole('button',{name:'Refresh',exact:true}).count(),0);
    await page.getByPlaceholder('https://your-server.example').fill('http://localhost:3001');
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    await idle(); delay=1200;
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Dudley’s shaking things up…').waitFor(); await page.waitForTimeout(500);
    await shot('08-groceries'); await idle(); delay=0;
    assert.deepEqual(errors,[]);
    console.log('PASS: pull expressions, cancel/backoff, pop/shake, duplicate suppression, touch cancellation, long-list scrolling, reduced motion, failure/retry, history and groceries refresh; no page errors.');
    await browser.close(); return;
  }
  await page.goto('http://localhost:8081/');
  await page.getByText('Nothing to sniff out. Yet.').waitFor();
  await shot('empty-quests');
  await page.getByRole('button',{name:'Boop Dudley'}).click();
  await page.getByText('Boop received. Tail activated.').waitFor();
  await shot('boop');
  await page.goto('http://localhost:8081/profile');
  await page.getByRole('button',{name:'Start Walk'}).click();
  await page.getByRole('button',{name:'End Walk'}).waitFor();
  await shot('walk-start');
  await page.getByRole('button',{name:'End Walk'}).click();
  await page.getByRole('button',{name:'Start Walk'}).waitFor();
  await shot('walk-end');
  // A delayed direct link exercises both the loading screen and persistent back control.
  delay=1500;
  await page.goto(`http://localhost:8081/quest/${questId}`);
  await page.getByText('Loading quests…').waitFor();
  await page.getByRole('button',{name:'Back to quests'}).waitFor();
  await shot('quest-loading-back');
  await page.getByText('Find the little blue door',{exact:true}).waitFor();
  delay=0;
  await shot('quest-detail-back');
  const complete=async()=>{
    const chooser=page.waitForEvent('filechooser');
    await page.getByText('I Found It!',{exact:true}).click();
    await (await chooser).setFiles(path.resolve('components/dudley/assets/trot-0.png'));
    await page.getByText('Complete Quest',{exact:true}).waitFor();
    await page.getByText('Complete Quest',{exact:true}).click();
  };
  await complete();
  await page.getByText('Nice spot!',{exact:true}).waitFor();
  await shot('quest-complete');
  await page.getByRole('button',{name:'Back to quests',exact:true}).last().click();
  await page.getByText('Quests for You',{exact:true}).waitFor();
  failUpload=true;
  await page.goto(`http://localhost:8081/quest/${questId}`);
  await complete();
  await page.getByText('Saved on this device',{exact:true}).waitFor();
  await shot('quest-offline-save');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Boop Dudley'}).click();
  await shot('reduced-motion');
  assert.deepEqual(errors,[]);
  console.log('PASS: real-app empty/boop, walk start/end, quest loading/detail back, confirmed and offline completion; no page errors.');
  await browser.close();
})().catch(async error=>{ console.error(error); if(browser)await browser.close(); process.exitCode=1; });
