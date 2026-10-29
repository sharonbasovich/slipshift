"""Independent CI-only browser verification. Runtime does not contain test hooks."""
import functools, http.server, json, pathlib, threading, unittest
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence'
OUT.mkdir(exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class BrowserChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT/'dist')))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
        self.page = self.context.new_page()
        self.errors=[]; self.requests=[]
        self.page.on('pageerror', lambda e:self.errors.append(str(e)))
        self.page.on('request', lambda r:self.requests.append(r.url))
        self.page.clock.install()
        self.page.goto(self.url)
        self.page.wait_for_selector('#start')
        # A test-owned observer of the production public core API, not a runtime cheat path.
        self.page.evaluate("""() => {const advance=Slipshift.advance; Slipshift.advance=(s,dt,input)=>{window.__observed=s; return advance(s,dt,input);};}""")
    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.assertTrue(all(u.startswith(self.url) for u in self.requests),self.requests)
        self.context.close()
    def start(self):
        self.page.locator('#start').click(); self.page.clock.run_for(100)
    def value(self,key):return self.page.evaluate('(key)=>window.__observed[key]',key)
    def test_01_portrait_and_desktop_layout(self):
        for w,h in [(320,568),(360,640),(390,844),(720,1280),(1080,1920),(1280,800),(844,390)]:
            self.page.set_viewport_size({'width':w,'height':h});self.page.clock.run_for(100)
            bounds=self.page.locator('#start').bounding_box()
            self.assertGreaterEqual(bounds['y'],0)
            self.assertLessEqual(bounds['y']+bounds['height'],h)
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth'))
            self.page.screenshot(path=str(OUT/f'intro-{w}x{h}.png'),full_page=True)
    def test_02_keyboard_bank_steer_pause_resume(self):
        self.start();self.page.keyboard.down('Space');self.page.clock.run_for(1900)
        self.assertGreater(self.value('charge'),80)
        self.page.keyboard.press('ArrowRight');self.page.clock.run_for(200)
        self.assertEqual(self.value('lane'),2)
        self.page.screenshot(path=str(OUT/'gameplay-390x844.png'))
        self.page.keyboard.up('Space');self.page.clock.run_for(300)
        self.assertGreater(self.value('score'),80);self.assertEqual(self.value('charge'),0)
        self.page.clock.run_for(800);self.page.screenshot(path=str(OUT/'traffic-390x844.png'))
        self.page.keyboard.down('p');self.page.keyboard.down('p')
        self.assertTrue(self.page.locator('#paused').is_visible())
        before=self.value('time');self.page.clock.run_for(3000);self.assertEqual(self.value('time'),before)
        self.page.keyboard.up('p');self.page.keyboard.press('p');self.page.clock.run_for(200)
        self.assertFalse(self.page.locator('#paused').is_visible());self.assertFalse(self.value('throttle'))
    def test_03_touch_hold_drag_release_and_cancel(self):
        self.start();cdp=self.context.new_cdp_session(self.page)
        box=self.page.locator('#throttle').bounding_box();x=box['x']+box['width']/2;y=box['y']+20
        def touch(kind,points):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
        touch('touchStart',[{'x':x,'y':y,'id':1}]);self.page.clock.run_for(1000)
        self.assertTrue(self.value('throttle'));self.assertGreater(self.value('charge'),20)
        touch('touchMove',[{'x':x+105,'y':y,'id':1}]);self.page.clock.run_for(250)
        self.assertEqual(self.value('lane'),2)
        touch('touchEnd',[]);self.page.clock.run_for(300);self.assertGreater(self.value('score'),20)
        touch('touchStart',[{'x':x,'y':y,'id':2}]);self.page.clock.run_for(100)
        touch('touchCancel',[]);self.assertTrue(self.page.locator('#paused').is_visible())
    def test_04_focus_interruption_and_clean_restart(self):
        self.start();self.page.keyboard.down('Space');self.page.clock.run_for(700)
        self.page.evaluate("window.dispatchEvent(new Event('blur'))")
        self.assertTrue(self.page.locator('#paused').is_visible());self.page.keyboard.up('Space')
        self.page.locator('#resume').click();self.page.clock.run_for(300);self.assertFalse(self.value('throttle'))
        self.page.locator('#pause').click();self.page.locator('#quit').click()
        self.assertTrue(self.page.locator('#results').is_visible())
        self.page.locator('#restart').click();self.page.clock.run_for(100)
        self.assertEqual(self.value('score'),0);self.assertEqual(self.value('hull'),3);self.assertEqual(self.value('lane'),1)
    def test_05_sound_and_calm_preferences(self):
        self.page.locator('#motion').check();self.assertIn('calm',self.page.locator('#game').get_attribute('class'))
        self.page.locator('#sound').click();self.assertEqual(self.page.locator('#sound').get_attribute('aria-pressed'),'false')
        self.page.reload();self.page.clock.run_for(100)
        self.assertTrue(self.page.locator('#motion').is_checked());self.assertEqual(self.page.locator('#soundState').inner_text(),'OFF')
    def test_06_unsteered_run_has_real_failure_and_replay(self):
        self.start();self.page.keyboard.down('Space');self.page.clock.run_for(60000);self.page.keyboard.up('Space')
        self.assertEqual(self.value('mode'),'over');self.assertTrue(self.page.locator('#results').is_visible())
        self.page.screenshot(path=str(OUT/'results-390x844.png'))
        self.page.locator('#restart').click();self.page.clock.run_for(100);self.assertEqual(self.value('hull'),3)
    def test_07_blocked_storage_is_safe(self):
        self.page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked')}})")
        self.page.reload();self.page.clock.run_for(100);self.page.locator('#start').click();self.page.clock.run_for(200)
        self.assertIn('playing',self.page.locator('#game').get_attribute('class'))
    def test_08_accessible_controls_and_heat_semantics(self):
        for name in ['Turn sound off','Pause game','Steer left','Steer right']:
            self.assertEqual(self.page.get_by_role('button',name=name,exact=True).count(),1)
        self.assertEqual(self.page.locator('#heatMeter').get_attribute('role'),'meter')
        self.assertEqual(self.page.locator('#announcer').get_attribute('aria-live'),'polite')
        self.start();self.page.keyboard.down('Space');self.page.clock.run_for(1000);self.page.keyboard.up('Space')
        self.assertGreater(int(self.page.locator('#heatMeter').get_attribute('aria-valuenow')),0)
    def test_10_native_keyboard_buttons(self):
        self.start();self.page.locator('#sound').focus();self.page.keyboard.press('Space')
        self.assertEqual(self.page.locator('#sound').get_attribute('aria-pressed'),'false')
        self.page.locator('#pause').focus();self.page.keyboard.press('Space')
        self.assertTrue(self.page.locator('#paused').is_visible())
    def test_11_short_landscape_remains_operable(self):
        self.page.set_viewport_size({'width':844,'height':390});self.page.clock.run_for(100)
        self.page.locator('#start').scroll_into_view_if_needed();self.start()
        for id in ['throttle','pause','left','right']:
            b=self.page.locator('#'+id).bounding_box();self.assertGreaterEqual(b['y'],0);self.assertLessEqual(b['y']+b['height'],390)
        self.page.locator('#pause').click();self.page.locator('#resume').click()
        self.page.clock.run_for(100);self.assertIn('playing',self.page.locator('#game').get_attribute('class'))
    def test_09_offline_file_entrypoint(self):
        # The same runtime has no fetch or module/CORS requirement.
        filepage=self.context.new_page();filepage.goto((ROOT/'dist/index.html').as_uri())
        filepage.locator('#start').click();self.assertIn('playing',filepage.locator('#game').get_attribute('class'));filepage.close()

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(BrowserChecks))
    (OUT/'browser-results.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'source_commit':__import__('os').environ.get('GITHUB_SHA','unknown')},indent=2))
    raise SystemExit(not result.wasSuccessful())
