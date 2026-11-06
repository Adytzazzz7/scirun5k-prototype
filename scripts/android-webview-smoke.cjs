// Run against a debug Android WebView forwarded to localhost:9222 with adb.
const assert = require('node:assert/strict');

async function connect() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('https://localhost'));
  assert.ok(target, 'SciRun Android WebView is not running');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (!response.id || !pending.has(response.id)) return;
    const item = pending.get(response.id);
    pending.delete(response.id);
    if (response.error) item.reject(new Error(response.error.message));
    else item.resolve(response.result);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15_000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await call('Runtime.enable');
  return {
    async evaluate(expression) {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    close() { socket.close(); },
  };
}

(async () => {
  const page = await connect();
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await page.evaluate('window.SciRunNative?.isNative===true')) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const boot = await page.evaluate(`({title:document.title,origin:location.origin,native:window.SciRunNative?.isNative===true,fonts:document.fonts.check('700 16px Barlow'),view:document.querySelector('.view.active')?.id,history:JSON.parse(localStorage.getItem('scirun.state')||'{}').history?.length||0})`);
    assert.equal(boot.title, 'SciRun 5K');
    assert.equal(boot.origin, 'https://localhost');
    assert.equal(boot.native, true);
    assert.equal(boot.fonts, true);
    console.log(JSON.stringify({ boot }));
    if (process.argv.includes('--haptics')) {
      await page.evaluate('window.SciRunNative.vibrate(55).then(()=>true)');
      console.log('Native haptics completed');
    }
    if (process.argv.includes('--flow')) {
      assert.equal(boot.view, 'onboarding');
      const fields = await page.evaluate(`(() => {
        const set = (id, value) => { const control = document.getElementById(id); control.value = value; control.dispatchEvent(new Event('input', {bubbles:true})); control.dispatchEvent(new Event('change', {bubbles:true})); };
        set('safetyAnswer','no'); set('runStatus','known'); set('runMinutes','3');
        return {safety:document.getElementById('safetyAnswer').value,run:document.getElementById('runMinutes').value};
      })()`);
      console.log(JSON.stringify({ fields }));
      const nextStep = await page.evaluate(`(() => {document.getElementById('setupContinue').click();return {visible:!document.getElementById('setupStepTwo').classList.contains('hidden')};})()`);
      console.log(JSON.stringify({ nextStep }));
      const setup = await page.evaluate(`(() => {
        document.getElementById('sessionsPerWeek').value='3'; document.getElementById('createPlan').click();
        return {view:document.querySelector('.view.active')?.id,profile:!!JSON.parse(localStorage.getItem('scirun.state')||'{}').profile};
      })()`);
      assert.deepEqual(setup, { view: 'dashboard', profile: true });
      const workout = await page.evaluate(`(() => {
        document.getElementById('heroStart').click();
        if (document.getElementById('saveCalibration')) {
          document.getElementById('calibrationWalk').value='4.5';
          document.getElementById('calibrationRun').value='6.5';
          document.getElementById('saveCalibration').click();
        }
        return {view:document.querySelector('.view.active')?.id,timer:!!localStorage.getItem('scirun.activeTimer')};
      })()`);
      assert.deepEqual(workout, { view: 'workout', timer: true });
      const cues = await page.evaluate(`(() => {
        currentTimer.segmentEnd=Date.now()+11_000; updateWorkoutPage();
        const eleven={hidden:document.getElementById('phaseCountdown').classList.contains('hidden')};
        currentTimer.segmentEnd=Date.now()+10_000; updateWorkoutPage();
        const ten={text:document.getElementById('phaseCountdown').textContent,imminent:document.getElementById('workoutRing').dataset.imminent};
        currentTimer.segmentEnd=Date.now()+5_000; updateWorkoutPage();
        const five={imminent:document.getElementById('workoutRing').dataset.imminent,outline:getComputedStyle(document.getElementById('workoutRing')).outlineStyle};
        document.getElementById('workoutPause').click();
        return {eleven,ten,five,paused:JSON.parse(localStorage.getItem('scirun.activeTimer')).paused};
      })()`);
      assert.equal(cues.eleven.hidden, true);
      assert.match(cues.ten.text, /10 secunde.*km\/h/);
      assert.equal(cues.ten.imminent, 'false');
      assert.equal(cues.five.imminent, 'true');
      assert.equal(cues.five.outline, 'none');
      assert.equal(cues.paused, true);
      console.log(JSON.stringify({ setup, workout, cues }));
      if (process.argv.includes('--reload')) {
        await page.evaluate('location.reload(); true');
        await new Promise(resolve => setTimeout(resolve, 1500));
        const restored = await page.evaluate(`(() => {const t=JSON.parse(localStorage.getItem('scirun.activeTimer')||'null');return {native:window.SciRunNative?.isNative===true,paused:t?.paused,view:document.querySelector('.view.active')?.id,profile:!!JSON.parse(localStorage.getItem('scirun.state')||'{}').profile};})()`);
        assert.deepEqual(restored, { native: true, paused: true, view: 'workout', profile: true });
        console.log(JSON.stringify({ restoredAfterReload: restored }));
      }
    }
    if (process.argv.includes('--restart')) {
      const timer = await page.evaluate(`(() => {const t=JSON.parse(localStorage.getItem('scirun.activeTimer')||'null');return {paused:t?.paused,view:document.querySelector('.view.active')?.id,history:JSON.parse(localStorage.getItem('scirun.state')||'{}').history?.length||0};})()`);
      assert.equal(timer.paused, true);
      assert.equal(timer.view, 'workout');
      console.log(JSON.stringify({ restored: timer }));
    }
    if (process.argv.includes('--backup')) {
      const result = await page.evaluate(`(() => {document.getElementById('exportData').click();return {view:document.querySelector('.view.active')?.id,history:JSON.parse(localStorage.getItem('scirun.state')||'{}').history?.length||0};})()`);
      await new Promise(resolve => setTimeout(resolve, 750));
      console.log(JSON.stringify({ backupStarted: result }));
    }
  } finally {
    page.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
