// Isolated real-app UI checks. All backend responses are fixtures; no live service is contacted.
// First export with EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 and a fixture anon key.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const build = path.resolve(process.env.DUDLEY_WEB_BUILD || 'dist');
const screenshots = path.resolve('docs/evidence/dudley');
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const questId = '33333333-3333-4333-8333-333333333333';
const packId = '44444444-4444-4444-8444-444444444444';
const profile = { id: userId, display_name: 'Fixture Walker', avatar_url: null };
const quest = { id: questId, pack_id: packId, creator_id: otherId, assignee_id: userId,
  mode: 'targeted', status: 'active', description: 'Find the little blue door', photo_path: null,
  photo_full_path: null, photo_thumbnail_path: null, created_at: new Date().toISOString() };
let quests = [], delay = 0, journey = null, failUpload = false;
let browser;
(async () => {
  await fs.mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: process.env.BROWSER_EXECUTABLE_PATH ? ['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu','--disable-software-rasterizer'] : [] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
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
    if (url.origin !== 'http://localhost:54321') { console.error('BLOCKED',url.href); return route.abort('blockedbyclient'); }
    const headers = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,PATCH,OPTIONS' };
    if(req.method()==='OPTIONS') return route.fulfill({ status:204, headers });
    let data = [];
    const endpoint = url.pathname;
    if(endpoint.endsWith('/profiles')) data=profile;
    else if(endpoint.endsWith('/packs')) data=[{ id:packId,name:'The neighborhood pack',created_at:new Date().toISOString(),pack_members:[{ user_id:userId,pack_id:packId,status:'active',role:'owner',profile },{user_id:otherId,pack_id:packId,status:'active',role:'member',profile:{id:otherId,display_name:'A packmate'}}],pack_invites:[] }];
    else if(endpoint.endsWith('/quests')) {
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
