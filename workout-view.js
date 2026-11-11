function workoutText(ro,en){return lang==='ro'?ro:en;}
function workoutPosition(){const scheduled=nextScheduledDate();const week=Math.min(12,getWeekNumber(scheduled));const session=state.history.filter(item=>Number(item.week)===week).length+1;return {week,session};}
function workoutIntervalName(segment){if(!segment)return workoutText('Sesiune încheiată','Session complete');if(segment.type==='run')return workoutText('Alergare','Run');if(segment.type==='walk')return workoutText('Mers','Walk');if(segment.type==='warmup')return workoutText('Încălzire','Warm-up');return workoutText('Revenire','Cool-down');}
function workoutSpeedLabel(speed){return Number(speed).toFixed(1).replace('.',lang==='ro'?',':'.')+' km/h';}
function workoutCompactTime(seconds){return formatSeconds(seconds).replace(/^0(?=\d:)/,'');}

// Visual state is derived from the real timer; decorative motion never changes elapsed time.
function workoutPhaseRgb(type){
 const colors={run:[244,116,130],walk:[88,214,161],warmup:[111,169,255],cooldown:[137,194,238],rest:[86,220,196]};
 const phase=Object.prototype.hasOwnProperty.call(colors,type)?type:'rest';
 if(typeof document!=='undefined'&&typeof getComputedStyle==='function'){
   const value=getComputedStyle(document.documentElement).getPropertyValue('--phase-'+phase+'-rgb');
   const rgb=value.split(',').map(channel=>Number(channel.trim()));
   if(rgb.length===3&&rgb.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255))return rgb;
 }
 return colors[phase];
}
function workoutRgbToHsl(rgb){
 const [r,g,b]=rgb.map(value=>value/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 const light=(max+min)/2;
 if(!delta)return [0,0,light];
 const saturation=delta/(1-Math.abs(2*light-1));
 let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
 return [((hue*60)%360+360)%360,saturation,light];
}
function workoutHslToRgb(hsl){
 const [h,s,l]=hsl,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
 const channels=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return channels.map(value=>Math.round((value+m)*255));
}
function workoutVisualState(segment,next,remaining,paused){
 const phase=paused?'rest':segment.type;
 const current=workoutPhaseRgb(phase);
 const seconds=Number.isFinite(remaining)?Math.max(0,remaining):Infinity;
 const mix=!paused&&next?Math.min(1,Math.max(0,(10-seconds)/10)):0;
 let rgb=current;
 if(mix>0){
   const from=workoutRgbToHsl(current),to=workoutRgbToHsl(workoutPhaseRgb(next.type));
   const hueDelta=((to[0]-from[0]+540)%360)-180;
   rgb=workoutHslToRgb([(from[0]+hueDelta*mix+360)%360,from[1]+(to[1]-from[1])*mix,from[2]+(to[2]-from[2])*mix]);
 }
 return {phase,rgb,mix,anticipating:!!next&&!paused&&seconds<=10,imminent:!!next&&!paused&&seconds<=5};
}

function workoutSessionProgress(segments,index,remaining){
 const total=segments.length;
 if(!total)return {total:0,current:0,completed:0,within:0,value:0,percent:0};
 const safeIndex=Math.max(0,Math.min(total-1,Number.isInteger(index)?index:0));
 const duration=Math.max(1,Number(segments[safeIndex].seconds)||1);
 const within=Math.min(1,Math.max(0,1-(Number.isFinite(remaining)?remaining:duration)/duration));
 const value=safeIndex+within;
 return {total,current:safeIndex+1,completed:safeIndex,within,value,percent:value/total*100};
}
function workoutProgressSteps(segments){
 return segments.map(function(segment,index){
   const color=workoutPhaseRgb(segment.type).join(', ');
   const label=workoutIntervalName(segment)+' · '+formatSeconds(segment.seconds);
   return '<span class="session-progress-step" data-stage-index="'+index+'" data-phase="'+segment.type+'" title="'+(index+1)+'. '+label+'" aria-hidden="true" style="--stage-color:rgb('+color+')"><i class="session-progress-fill"></i></span>';
 }).join('');
}
function workoutProgressLegend(segments){
 return '<span>'+workoutText('Încălzire','Warm-up')+'</span><strong id="stagePosition">1 '+workoutText('din','of')+' '+segments.length+'</strong><span>'+workoutText('Revenire','Cool-down')+'</span>';
}

function workoutLiquidMarkup(){
 const surface='<svg class="liquid-surface" viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 C20 4 40 4 60 10 S100 16 120 10 S160 4 180 10 S220 16 240 10 V24 H0 Z"></path></svg>';
 return '<div class="workout-liquid" aria-hidden="true"><span class="liquid-wave liquid-wave-back">'+surface+'</span><span class="liquid-wave liquid-wave-front">'+surface+'</span></div>';
}

function restoreWorkoutFocus(id){
 if(!id)return;
 const target=$(id)||$('workoutViewTitle');
 if(target)target.focus({preventScroll:true});
}

function renderWorkoutPage(){
 const page=$('workout');if(!page)return;
 const focusedId=page.contains(document.activeElement)?document.activeElement.id:null;
 const previousAnnouncement=$('workoutAnnouncement');
 showView('workout');
 if(workoutMode!=='timer'||pendingSession||!currentTimer){delete page.dataset.announcedPhase;delete page.dataset.announcedCountdown;delete document.documentElement.dataset.workoutPhase;}
 if(workoutMode==='abandon-confirm'){renderAbandonConfirmation(page);return;}
 if(workoutMode==='feedback-discard-confirm'){renderFeedbackDiscardConfirmation(page);return;}
 if(pendingSession){renderWorkoutFeedbackPage(page);restoreWorkoutFocus(focusedId);return;}
 if(!currentTimer){page.innerHTML='<div class=\"workout-page\"><section class=\"workout-empty glass-panel\"><h1 id=\"workoutViewTitle\">'+workoutText('Niciun antrenament activ','No active workout')+'</h1><button class=\"btn ghost\" id=\"workoutReturn\">'+workoutText('Înapoi','Back')+'</button></section></div>';$('workoutReturn').onclick=function(){showView(workoutReturnView||'dashboard');};return;}
 const position=workoutPosition();const paused=currentTimer.paused;
 page.innerHTML='<div class=\"workout-page workout-timer-page\">'+
  '<header class=\"workout-top\"><button type=\"button\" class=\"workout-back glass-control\" id=\"workoutBack\"><span aria-hidden=\"true\">←</span> '+workoutText('Panou','Dashboard')+'</button>'+
  '<div class=\"workout-heading workout-session-heading\"><h1 id=\"workoutViewTitle\" tabindex=\"-1\">'+workoutText('Săptămâna ','Week ')+position.week+' · '+workoutText('Sesiunea ','Session ')+position.session+'</h1><p class=\"workout-timer-state\" id=\"timerState\"></p></div></header>'+
  '<div class=\"workout-content\"><div class=\"workout-phase\"><strong class=\"workout-current\" id=\"currentInterval\"></strong><span id=\"roundCount\"></span></div><div class=\"workout-ring\" id=\"workoutRing\" role=\"img\" aria-label=\"'+workoutText('Progresul intervalului','Interval progress')+'\"><svg class=\"workout-ring-svg\" viewBox=\"0 0 260 260\" aria-hidden=\"true\"><circle class=\"workout-ring-track\" cx=\"130\" cy=\"130\" r=\"108\"></circle><circle class=\"workout-ring-fill\" id=\"ringFill\" cx=\"130\" cy=\"130\" r=\"108\"></circle></svg><div class=\"workout-ring-center\">'+workoutLiquidMarkup()+'<span class=\"workout-remaining\">'+workoutText('Rămân','Remaining')+'</span><output class=\"workout-time\" id=\"timerBig\" aria-live=\"off\">00:00</output><span class=\"workout-recommended-speed\" id=\"recommendedSpeed\"></span></div></div><p class=\"workout-announcement\" id=\"workoutAnnouncement\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></p>'+
  '<div class=\"workout-rounds\"><div class=\"workout-round-label workout-visually-hidden\"><span>'+workoutText('Progresul sesiunii','Session progress')+'</span><strong id=\"elapsedTotal\">00:00 / 00:00</strong></div><div class=\"session-progress\" id=\"roundBar\" role=\"progressbar\" aria-label=\"'+workoutText('Progresul tuturor etapelor','Progress through all session stages')+'\" aria-valuemin=\"0\" aria-valuemax=\"'+currentTimer.segments.length+'\" style=\"--stage-count:'+currentTimer.segments.length+'\">'+workoutProgressSteps(currentTimer.segments)+'</div><div class=\"session-progress-legend\">'+workoutProgressLegend(currentTimer.segments)+'</div></div>'+
  '<div class=\"workout-next glass-panel\"><div><span class=\"workout-next-label\">'+workoutText('Urmează','Up next')+'</span><strong id=\"nextInterval\">—</strong></div><div class=\"workout-total\"><strong id=\"nextDuration\"></strong></div></div>'+
  '<span class=\"phase-countdown hidden\" id=\"phaseCountdown\"></span></div>'+
  '<div class=\"workout-controls\"><button type=\"button\" class=\"btn workout-primary\" id=\"workoutPause\">'+(paused?workoutText('Reia','Resume'):workoutText('Pauză','Pause'))+'</button><button type=\"button\" class=\"btn ghost workout-skip\" id=\"workoutSkip\">'+workoutText('Sari intervalul','Skip interval')+'</button><button type=\"button\" class=\"btn workout-finish\" id=\"workoutFinish\">'+workoutText('Oprește','Stop')+'</button><button type=\"button\" class=\"workout-abandon\" id=\"workoutAbandon\">'+workoutText('Abandonează sesiunea','Abandon workout')+'</button></div></div>';
 if(previousAnnouncement)$('workoutAnnouncement').replaceWith(previousAnnouncement);
 $('workoutBack').onclick=function(){showView(workoutReturnView||'dashboard');};
 $('workoutPause').onclick=togglePause;$('workoutSkip').onclick=skipCurrentSegment;$('workoutFinish').onclick=function(){if(confirm(workoutText('Oprești acum și salvezi sesiunea ca parțială?','Stop now and save this workout as partial?')))endTimer(true);};$('workoutAbandon').onclick=function(){workoutMode='abandon-confirm';renderWorkoutPage();};
 updateWorkoutPage();
 restoreWorkoutFocus(focusedId);
}
function updateWorkoutPage(){
 if(!currentTimer)return;
 const ring=$('workoutRing');if(!ring)return;
 const seg=currentTimer.segments[currentTimer.index];if(!seg)return;
 if(document.body.classList.contains('workout-active'))document.documentElement.dataset.workoutPhase=seg.type;
 const remaining=currentTimer.paused?currentTimer.remaining:Math.max(0,(currentTimer.segmentEnd-Date.now())/1000);
 const elapsedInSegment=Math.max(0,seg.seconds-remaining);
 const segmentPercent=Math.min(100,elapsedInSegment/Math.max(1,seg.seconds)*100);
 const sessionProgress=workoutSessionProgress(currentTimer.segments,currentTimer.index,remaining);
 const next=currentTimer.segments[currentTimer.index+1];
 const visual=workoutVisualState(seg,next,remaining,currentTimer.paused);
 ring.dataset.phase=visual.phase;
 ring.dataset.anticipating=String(visual.anticipating);
 ring.dataset.imminent=String(visual.imminent);
 ring.dataset.paused=String(currentTimer.paused);
 ring.style.setProperty('--phase-rgb',visual.rgb.join(', '));
 ring.style.setProperty('--phase-color','rgb('+visual.rgb.join(', ')+')');
 ring.style.setProperty('--phase-ink','rgb('+visual.rgb.map(channel=>Math.round(channel*.5)).join(', ')+')');
 const phaseHeader=$('currentInterval').parentElement;
 phaseHeader.style.setProperty('--phase-color','rgb('+visual.rgb.join(', ')+')');
 phaseHeader.style.setProperty('--phase-ink','rgb('+visual.rgb.map(channel=>Math.round(channel*.5)).join(', ')+')');
 ring.style.setProperty('--timer-progress',segmentPercent+'%');
 ring.style.setProperty('--liquid-level',segmentPercent+'%');
 const ringFill=$('ringFill');
 if(ringFill){ringFill.style.strokeDasharray=(Math.PI*216*segmentPercent/100).toFixed(2)+' '+(Math.PI*216).toFixed(2);ringFill.style.opacity=segmentPercent>0?'1':'0';}
 ring.setAttribute('aria-label',workoutText('Intervalul curent: ','Current interval: ')+workoutIntervalName(seg)+', '+formatSeconds(remaining)+', '+workoutText('etapa ','stage ')+sessionProgress.current+' '+workoutText('din ','of ')+sessionProgress.total);
 $('timerBig').textContent=formatSeconds(remaining);
 $('currentInterval').textContent=workoutIntervalName(seg);
 const status=currentTimer.paused?workoutText('ÎN PAUZĂ','PAUSED'):workoutText('ÎN DESFĂȘURARE','IN PROGRESS');
 if($('timerState').textContent!==status)$('timerState').textContent=status;
 $('timerState').dataset.paused=String(currentTimer.paused);
 const page=$('workout'),announcement=$('workoutAnnouncement');
 const phaseKey=currentTimer.index+':'+String(currentTimer.paused);
 if(announcement&&page.dataset.announcedPhase!==phaseKey){
   announcement.textContent=currentTimer.paused?workoutText('În pauză','Paused'):workoutText('Intervalul curent: ','Current interval: ')+workoutIntervalName(seg);
   page.dataset.announcedPhase=phaseKey;
   page.dataset.announcedCountdown='';
 }
 const speed=Number.isFinite(Number(seg.speed))?Number(seg.speed):(seg.type==='run'?Number(state.profile?.runSpeed):Number(state.profile?.walkSpeed));
 const speedOutput=$('recommendedSpeed');
 if(speedOutput)speedOutput.textContent=speed>0?workoutSpeedLabel(speed)+' '+workoutText('sugerat','suggested'):'';
 const countdown=$('phaseCountdown');
 if(countdown){
   const seconds=Math.ceil(remaining);
   countdown.classList.toggle('hidden',!next||currentTimer.paused||seconds>10);
   if(next&&seconds<=10&&!currentTimer.paused){
     const nextSpeed=Number(next.speed)||Number(next.type==='run'?state.profile?.runSpeed:state.profile?.walkSpeed);
     const direction=nextSpeed>speed?workoutText('crește viteza la ','increase speed to '):nextSpeed<speed?workoutText('redu viteza la ','reduce speed to '):workoutText('menține viteza la ','keep speed at ');
     const message=nextSpeed>0?workoutText('În ','In ')+Math.max(1,seconds)+workoutText(' secunde: ',' seconds: ')+direction+workoutSpeedLabel(nextSpeed)+'.':workoutText('În ','In ')+Math.max(1,seconds)+workoutText(' secunde: ',' seconds: ')+workoutIntervalName(next);
     if(countdown.textContent!==message)countdown.textContent=message;
     if(announcement&&page.dataset.announcedCountdown!==phaseKey){announcement.textContent=message;page.dataset.announcedCountdown=phaseKey;}
   }
 }
 $('roundCount').textContent=workoutText('Intervalul ','Interval ')+sessionProgress.current+' '+workoutText('din','of')+' '+sessionProgress.total;
 $('stagePosition').textContent=sessionProgress.current+' '+workoutText('din','of')+' '+sessionProgress.total;
 const progressBar=$('roundBar');
 progressBar.setAttribute('aria-valuenow',String(Number(sessionProgress.value.toFixed(3))));
 progressBar.setAttribute('aria-valuetext',workoutText('Etapa ','Stage ')+sessionProgress.current+' '+workoutText('din ','of ')+sessionProgress.total+': '+workoutIntervalName(seg));
 progressBar.querySelectorAll('[data-stage-index]').forEach(function(step){
   const index=Number(step.dataset.stageIndex);
   step.dataset.status=index<currentTimer.index?'complete':index===currentTimer.index?'current':'upcoming';
   step.querySelector('.session-progress-fill').style.width=(index<currentTimer.index?100:index===currentTimer.index?sessionProgress.within*100:0)+'%';
 });
 $('nextInterval').textContent=next?workoutIntervalName(next):workoutText('Ultimul interval','Final interval');
 $('nextInterval').title=next?.label||'';
 $('nextDuration').textContent=next?workoutCompactTime(next.seconds):'';
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
 const firstSession=state.profile.firstSessionFeedbackDone!==true&&Number(state.profile.runSpeed)>0&&Number(state.profile.walkSpeed)>0&&!(Number(pendingSession.skippedRunSeconds)>0);
 const complete=pendingSession.completedNaturally===true;
 const options=[['veryEasy',t('effortVeryEasy')],['easy',t('effortEasy')],['moderate',t('effortModerate')],['hard',t('effortHard')],['exhausted',t('effortExhausted')]];
 const efforts=options.map(function(item){return '<button type="button" class="effort-choice '+(selectedEffort===item[0]?'selected':'')+'" data-effort="'+item[0]+'" aria-pressed="'+String(selectedEffort===item[0])+'">'+item[1]+'</button>';}).join('');
 const note=complete
   ?workoutText('Sesiunea s-a încheiat. Introdu distanța afișată de banda de alergare și efortul resimțit.','Workout complete. Enter the distance shown by your treadmill and how the effort felt.')
   :workoutText('Sesiunea va fi salvată ca parțială. Planul va continua de unde a rămas.','This workout will be saved as partial. Your plan will resume where it left off.');
 const paceOptions='<option value="">'+workoutText('Alege','Choose')+'</option><option value="tooSlow">'+workoutText('Prea lent','Too slow')+'</option><option value="right">'+workoutText('Potrivit','About right')+'</option><option value="tooFast">'+workoutText('Prea rapid','Too fast')+'</option>';
 page.innerHTML='<div class="workout-page workout-feedback-page"><header class="workout-top"><button type="button" class="workout-back glass-control" id="workoutBack">← '+workoutText('Panou','Dashboard')+'</button><div class="workout-heading"><p class="eyebrow">'+stage.code+' · '+workoutText('Săptămâna ','Week ')+position.week+' · '+workoutText('Sesiunea ','Workout ')+position.session+'</p><h1 id="workoutViewTitle" tabindex="-1">'+workoutText('Felicitări!','Well done!')+'</h1><p class="muted">'+stage.name[lang]+'</p></div></header><div class="workout-feedback-summary glass-panel"><span class="workout-feedback-mark" aria-hidden="true">'+(complete?'🏅':'◐')+'</span><div><strong>'+workoutText(complete?'Sesiune încheiată':'Sesiune parțială',complete?'Workout complete':'Partial workout')+'</strong><p>'+formatSeconds(pendingSession.elapsed)+' '+workoutText('de timp activ','active time')+'</p></div></div><p class="workout-feedback-note">'+note+'</p><div class="workout-feedback-form"><label class="field"><span>'+workoutText('Distanța reală de pe bandă (km)','Actual treadmill distance (km)')+'</span><input id="actualDistance" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="ex. 2,40"></label><fieldset class="feedbackgroup"><legend>'+t('effortLabel')+'</legend><div class="effortchoices">'+efforts+'</div></fieldset>'+
 (firstSession?'<fieldset class="feedbackgroup first-speed-feedback"><legend>'+workoutText('Cum s-au simțit vitezele benzii?','How did the treadmill speeds feel?')+'</legend><label class="field">'+workoutText('Viteza de alergare','Running speed')+'<select id="runPaceFeel">'+paceOptions+'</select></label><label class="field">'+workoutText('Viteza de mers','Walking speed')+'<select id="walkPaceFeel">'+paceOptions+'</select></label><small>'+workoutText('Răspunsurile ajustează vitezele sugerate pentru sesiunile viitoare.','Your answers adjust the suggested speeds for future workouts.')+'</small></fieldset>':'')+
 '<label class="checkline goal-check hidden" id="goalCheckLine"><input type="checkbox" id="goalContinuous"><span>'+workoutText('Am alergat cel puțin 5 km continuu, fără mers sau oprire.','I ran at least 5 km continuously, without walking or stopping.')+'</span></label><p class="small" id="feedbackError" role="alert" aria-live="polite"></p><div class="workout-feedback-actions"><button type="button" class="btn workout-primary" id="saveFeedback">'+workoutText('Salvează sesiunea','Save workout')+' →</button><button type="button" class="workout-abandon" id="discardFeedback">'+workoutText('Renunță fără salvare','Discard without saving')+'</button></div></div></div>';
 $('workoutBack').onclick=function(){showView('dashboard');};
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
