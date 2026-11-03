function workoutText(ro,en){return lang==='ro'?ro:en;}
function workoutPosition(){const scheduled=nextScheduledDate();const week=Math.min(12,getWeekNumber(scheduled));const session=state.history.filter(item=>Number(item.week)===week).length+1;return {week,session};}
function workoutIntervalName(segment){if(!segment)return workoutText('Sesiune încheiată','Session complete');if(segment.type==='run')return workoutText('Alergare','Run');if(segment.type==='walk')return workoutText('Mers de recuperare','Walk recovery');if(segment.type==='warmup')return workoutText('Încălzire','Warm-up');return workoutText('Revenire','Cool-down');}
function renderWorkoutPage(){
 const page=$('workout');if(!page)return;showView('workout');
 if(workoutMode==='abandon-confirm'){renderAbandonConfirmation(page);return;}
 if(workoutMode==='feedback-discard-confirm'){renderFeedbackDiscardConfirmation(page);return;}
 if(pendingSession){renderWorkoutFeedbackPage(page);return;}
 if(!currentTimer){page.innerHTML='<div class=\"workout-page\"><section class=\"workout-empty glass-panel\"><h1 id=\"workoutViewTitle\">'+workoutText('Niciun antrenament activ','No active workout')+'</h1><button class=\"btn ghost\" id=\"workoutReturn\">'+workoutText('Înapoi','Back')+'</button></section></div>';$('workoutReturn').onclick=function(){showView(workoutReturnView||'dashboard');};return;}
 const stage=STAGES[currentTimer.level];const position=workoutPosition();const paused=currentTimer.paused;
 page.innerHTML='<div class=\"workout-page\">'+
  '<header class=\"workout-top\"><button type=\"button\" class=\"workout-back glass-control\" id=\"workoutBack\"><span aria-hidden=\"true\">←</span> '+workoutText('Înapoi','Back')+'</button>'+
  '<div class=\"workout-heading\"><p class=\"eyebrow\">'+stage.code+' · '+workoutText('ANTRENAMENT','WORKOUT')+'</p><h1 id=\"workoutViewTitle\" tabindex=\"-1\">'+stage.name[lang]+'</h1><p class=\"muted\">'+workoutText('Săptămâna ','Week ')+position.week+' · '+workoutText('Antrenamentul ','Workout ')+position.session+'</p></div></header>'+
  '<div class=\"workout-content\"><div class=\"workout-ring\" id=\"workoutRing\" role=\"img\" aria-label=\"'+workoutText('Progresul intervalului','Interval progress')+'\"><div class=\"workout-ring-center\"><span class=\"workout-current\" id=\"currentInterval\" aria-live=\"polite\"></span><output class=\"workout-time\" id=\"timerBig\" aria-live=\"off\">00:00</output><span class=\"workout-timer-state\" id=\"timerState\"></span><span class=\"workout-recommended-speed\" id=\"recommendedSpeed\"></span><span class=\"phase-countdown hidden\" id=\"phaseCountdown\" aria-live=\"polite\"></span></div></div>'+
  '<div class=\"workout-rounds\"><div class=\"workout-round-label\"><span>'+workoutText('Progresul rundelor','Round progress')+'</span><strong id=\"roundCount\">0 / 0</strong></div><div class=\"progressline\"><span id=\"roundBar\"></span></div></div>'+
  '<div class=\"workout-next glass-panel\"><div><span class=\"eyebrow\">'+workoutText('URMĂTORUL INTERVAL','UP NEXT')+'</span><strong id=\"nextInterval\">—</strong></div><div class=\"workout-total\"><span>'+workoutText('Timp','Time')+'</span><strong id=\"elapsedTotal\">00:00 / 00:00</strong></div></div>'+
  '<p class=\"workout-note muted\">'+t('timerNote')+'</p></div>'+
  '<div class=\"workout-controls\"><button type=\"button\" class=\"btn workout-primary\" id=\"workoutPause\">'+(paused?'▶ '+t('resume'):'Ⅱ '+t('pause'))+'</button><button type=\"button\" class=\"btn ghost workout-skip\" id=\"workoutSkip\">'+t('skipSegment')+'</button><button type=\"button\" class=\"btn workout-finish\" id=\"workoutFinish\">'+workoutText('Oprește sesiunea','Stop workout')+'</button><button type=\"button\" class=\"workout-abandon\" id=\"workoutAbandon\">'+workoutText('Abandonează fără salvare','Abandon without saving')+'</button></div></div>';
 $('workoutBack').onclick=function(){showView(workoutReturnView||'dashboard');};
 $('workoutPause').onclick=togglePause;$('workoutSkip').onclick=function(){if(confirm(workoutText('Sari peste acest interval? Timerul va continua.','Skip this interval? The timer will continue.')))skipCurrentSegment();};$('workoutFinish').onclick=function(){if(confirm(workoutText('Oprești acum și salvezi sesiunea ca parțială?','Stop now and save this workout as partial?')))endTimer(true);};$('workoutAbandon').onclick=function(){workoutMode='abandon-confirm';renderWorkoutPage();};
 updateWorkoutPage();
}
function updateWorkoutPage(){
 if(!currentTimer)return;
 const ring=$('workoutRing');if(!ring)return;
 const seg=currentTimer.segments[currentTimer.index];if(!seg)return;
 const remaining=currentTimer.paused?currentTimer.remaining:Math.max(0,(currentTimer.segmentEnd-Date.now())/1000);
 const elapsedInSegment=Math.max(0,seg.seconds-remaining);
 const segmentPercent=Math.min(100,elapsedInSegment/Math.max(1,seg.seconds)*100);
 const runs=currentTimer.segments.filter(item=>item.type==='run');
 const completedRuns=currentTimer.segments.slice(0,currentTimer.index).filter(item=>item.type==='run').length;
 const roundProgress=Math.min(runs.length,completedRuns+(seg.type==='run'?elapsedInSegment/Math.max(1,seg.seconds):0));
 const roundNumber=seg.type==='cooldown'?runs.length:seg.type==='walk'?Math.max(1,completedRuns):Math.max(1,completedRuns+1);
 ring.dataset.phase=seg.type;
 ring.style.setProperty('--timer-progress',segmentPercent+'%');
 ring.setAttribute('aria-label',workoutText('Intervalul curent: ','Current interval: ')+workoutIntervalName(seg)+', '+formatSeconds(remaining)+', '+workoutText('runda ','round ')+roundNumber+' '+workoutText('din ','of ')+runs.length);
 $('timerBig').textContent=formatSeconds(remaining);
 $('currentInterval').textContent=(seg.label||workoutIntervalName(seg)).toUpperCase();
 $('timerState').textContent=currentTimer.paused?workoutText('ÎN PAUZĂ','PAUSED'):workoutText('ÎN DESFĂȘURARE','IN PROGRESS');
 const speed=Number.isFinite(Number(seg.speed))?Number(seg.speed):(seg.type==='run'?Number(state.profile?.runSpeed):Number(state.profile?.walkSpeed));
 const speedOutput=$('recommendedSpeed');
 if(speedOutput)speedOutput.textContent=speed>0?workoutText('VITEZĂ SUGERATĂ · ','SUGGESTED SPEED · ')+speed.toFixed(1)+' km/h':'';
 const next=currentTimer.segments[currentTimer.index+1];
 const countdown=$('phaseCountdown');
 if(countdown){
   const seconds=Math.ceil(remaining);
   countdown.classList.toggle('hidden',!next||currentTimer.paused||seconds>5);
   if(next&&seconds<=5&&!currentTimer.paused){const nextSpeed=Number(next.speed)||Number(next.type==='run'?state.profile?.runSpeed:state.profile?.walkSpeed);countdown.textContent=workoutText('În '+Math.max(1,seconds)+' secunde: '+workoutIntervalName(next),'In '+Math.max(1,seconds)+' seconds: '+workoutIntervalName(next))+(nextSpeed>0?' · '+nextSpeed.toFixed(1)+' km/h':'');}
 }
 $('roundCount').textContent=Math.floor(roundProgress)+' / '+runs.length;
 $('roundBar').style.width=Math.min(100,roundProgress/Math.max(1,runs.length)*100)+'%';
 $('nextInterval').textContent=next?(next.label||workoutIntervalName(next)):workoutText('Ultimul interval','Final interval');
 const elapsed=(currentTimer.elapsed||0)+elapsedInSegment;
 $('elapsedTotal').textContent=formatSeconds(elapsed)+' / '+formatSeconds(currentTimer.total);
}
function renderAbandonConfirmation(page){
 page.innerHTML='<div class=\"workout-page\"><header class=\"workout-top\"><button type=\"button\" class=\"workout-back glass-control\" id=\"cancelAbandon\">← '+workoutText('Continuă antrenamentul','Continue workout')+'</button></header><section class=\"workout-confirm glass-panel\"><span class=\"eyebrow\">'+workoutText('CONFIRMARE','CONFIRMATION')+'</span><h1 id=\"workoutViewTitle\">'+workoutText('Abandonezi sesiunea?','Abandon this workout?')+'</h1><p class=\"muted\">'+workoutText('Sesiunea activă va fi eliminată și nu va apărea în istoric.','The active workout will be discarded and will not appear in history.')+'</p><div class=\"workout-confirm-actions\"><button type=\"button\" class=\"btn ghost\" id=\"keepWorkout\">'+workoutText('Păstrează sesiunea','Keep workout')+'</button><button type=\"button\" class=\"btn workout-danger\" id=\"confirmAbandon\">'+workoutText('Abandonează fără salvare','Abandon without saving')+'</button></div></section></div>';
 $('cancelAbandon').onclick=$('keepWorkout').onclick=function(){workoutMode='timer';renderWorkoutPage();};$('confirmAbandon').onclick=abandonWorkout;
}
function renderFeedbackDiscardConfirmation(page){
 page.innerHTML='<div class=\"workout-page\"><header class=\"workout-top\"><button type=\"button\" class=\"workout-back glass-control\" id=\"cancelFeedbackDiscard\">← '+workoutText('Înapoi la feedback','Back to feedback')+'</button></header><section class=\"workout-confirm glass-panel\"><span class=\"eyebrow\">'+workoutText('CONFIRMARE','CONFIRMATION')+'</span><h1 id=\"workoutViewTitle\">'+workoutText('Renunți la salvarea sesiunii?','Discard this session?')+'</h1><p class=\"muted\">'+workoutText('Sesiunea nu va fi adăugată în istoric și nu va modifica planul.','The session will not be added to history or change the plan.')+'</p><div class=\"workout-confirm-actions\"><button type=\"button\" class=\"btn ghost\" id=\"keepFeedback\">'+workoutText('Continuă feedbackul','Continue feedback')+'</button><button type=\"button\" class=\"btn workout-danger\" id=\"confirmDiscardFeedback\">'+workoutText('Renunță fără salvare','Discard without saving')+'</button></div></section></div>';
 $('cancelFeedbackDiscard').onclick=$('keepFeedback').onclick=function(){workoutMode='feedback';renderWorkoutPage();};$('confirmDiscardFeedback').onclick=abandonWorkout;
}
function renderWorkoutFeedbackPage(page){
 const position={week:pendingSession.week||workoutPosition().week,session:pendingSession.sessionNumber||workoutPosition().session};
 const stage=STAGES[pendingSession.level];
 const firstSession=state.profile.firstSessionFeedbackDone!==true&&Number(state.profile.runSpeed)>0&&Number(state.profile.walkSpeed)>0;
 const complete=pendingSession.completedNaturally===true;
 const options=[['veryEasy',t('effortVeryEasy')],['easy',t('effortEasy')],['moderate',t('effortModerate')],['hard',t('effortHard')],['exhausted',t('effortExhausted')]];
 const efforts=options.map(function(item){return '<button type="button" class="effort-choice '+(selectedEffort===item[0]?'selected':'')+'" data-effort="'+item[0]+'" aria-pressed="'+String(selectedEffort===item[0])+'">'+item[1]+'</button>';}).join('');
 const note=complete
   ?workoutText('Sesiunea s-a încheiat. Introdu distanța afișată de banda de alergare și efortul resimțit.','Workout complete. Enter the distance shown by your treadmill and how the effort felt.')
   :workoutText('Sesiunea va fi salvată ca parțială. Planul va continua de unde a rămas.','This workout will be saved as partial. Your plan will resume where it left off.');
 const paceOptions='<option value="">'+workoutText('Alege','Choose')+'</option><option value="tooSlow">'+workoutText('Prea lent','Too slow')+'</option><option value="right">'+workoutText('Potrivit','About right')+'</option><option value="tooFast">'+workoutText('Prea rapid','Too fast')+'</option>';
 page.innerHTML='<div class="workout-page workout-feedback-page"><header class="workout-top"><button type="button" class="workout-back glass-control" id="workoutBack">← '+workoutText('Panou','Dashboard')+'</button><div class="workout-heading"><p class="eyebrow">'+stage.code+' · '+workoutText('Săptămâna ','Week ')+position.week+' · '+workoutText('Sesiunea ','Workout ')+position.session+'</p><h1 id="workoutViewTitle">'+workoutText('Felicitări!','Well done!')+'</h1><p class="muted">'+stage.name[lang]+'</p></div></header><div class="workout-feedback-summary glass-panel"><span class="workout-feedback-mark" aria-hidden="true">'+(complete?'🏅':'◐')+'</span><div><strong>'+workoutText(complete?'Sesiune încheiată':'Sesiune parțială',complete?'Workout complete':'Partial workout')+'</strong><p>'+formatSeconds(pendingSession.elapsed)+' '+workoutText('de timp activ','active time')+'</p></div></div><p class="workout-feedback-note">'+note+'</p><div class="workout-feedback-form"><label class="field"><span>'+workoutText('Distanța reală de pe bandă (km)','Actual treadmill distance (km)')+'</span><input id="actualDistance" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="ex. 2,40"></label><fieldset class="feedbackgroup"><legend>'+t('effortLabel')+'</legend><div class="effortchoices">'+efforts+'</div></fieldset>'+
 (firstSession?'<fieldset class="feedbackgroup first-speed-feedback"><legend>'+workoutText('Cum s-au simțit vitezele benzii?','How did the treadmill speeds feel?')+'</legend><label class="field">'+workoutText('Viteza de alergare','Running speed')+'<select id="runPaceFeel">'+paceOptions+'</select></label><label class="field">'+workoutText('Viteza de mers','Walking speed')+'<select id="walkPaceFeel">'+paceOptions+'</select></label><small>'+workoutText('Răspunsurile ajustează vitezele sugerate pentru sesiunile viitoare.','Your answers adjust the suggested speeds for future workouts.')+'</small></fieldset>':'')+
 '<label class="checkline goal-check hidden" id="goalCheckLine"><input type="checkbox" id="goalContinuous"><span>'+workoutText('Am alergat cel puțin 5 km continuu, fără mers sau oprire.','I ran at least 5 km continuously, without walking or stopping.')+'</span></label><p class="small" id="feedbackError" role="alert" aria-live="polite"></p><div class="workout-feedback-actions"><button type="button" class="btn workout-primary" id="saveFeedback">'+workoutText('Salvează sesiunea','Save workout')+' →</button><button type="button" class="workout-abandon" id="discardFeedback">'+workoutText('Renunță fără salvare','Discard without saving')+'</button></div></div></div>';
 $('workoutBack').onclick=function(){workoutMode='feedback-discard-confirm';renderWorkoutPage();};
 document.querySelectorAll('#workout [data-effort]').forEach(function(button){button.onclick=function(){selectedEffort=button.dataset.effort;pendingSession.selectedEffort=selectedEffort;document.querySelectorAll('#workout [data-effort]').forEach(function(option){const selected=option.dataset.effort===selectedEffort;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));});savePendingSession();};});
 const distance=$('actualDistance'), runFeel=$('runPaceFeel'), walkFeel=$('walkPaceFeel'), goal=$('goalContinuous');
 if(distance)distance.value=pendingSession.distanceDraft??'';
 if(runFeel)runFeel.value=pendingSession.runFeelDraft||'';
 if(walkFeel)walkFeel.value=pendingSession.walkFeelDraft||'';
 if(goal)goal.checked=pendingSession.goalContinuousDraft===true;
 function persistFeedbackDraft(){
   pendingSession.distanceDraft=distance?.value||'';
   pendingSession.runFeelDraft=runFeel?.value||'';
   pendingSession.walkFeelDraft=walkFeel?.value||'';
   pendingSession.goalContinuousDraft=goal?.checked===true;
   $('goalCheckLine').classList.toggle('hidden',!complete||Number(distance?.value)<5);
   savePendingSession();
 }
 [distance,runFeel,walkFeel,goal].filter(Boolean).forEach(function(field){field.addEventListener('input',persistFeedbackDraft);field.addEventListener('change',persistFeedbackDraft);});
 $('goalCheckLine').classList.toggle('hidden',!complete||Number(distance?.value)<5);
 $('saveFeedback').onclick=saveFeedback;
 $('discardFeedback').onclick=function(){workoutMode='feedback-discard-confirm';renderWorkoutPage();};
}
