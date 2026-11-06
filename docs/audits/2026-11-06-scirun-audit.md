# SciRun 5K — audit și remediere

Data: 6 noiembrie 2026
Scop: aplicație mobilă personală, cu istoric păstrat local și funcționare offline.

## Arhitectură și fluxuri auditate

SciRun este o aplicație JavaScript fără framework. `index.html` definește etapele de antrenament, starea și navigarea. `experience.js` gestionează programul, feedbackul, preferințele, semnalele sonore și vibrațiile. `workout-view.js` afișează sesiunea, iar `timer-core.js` calculează trecerile dintre intervale. Datele se salvează în `localStorage`; exportul și importul trec prin `state-backup.js`. Varianta Android împachetează aceleași resurse cu Capacitor și nu depinde de rețea la lansare.

Au fost verificate ecranele de început, panou, istoric, setări, cont și antrenament, plus calendarul, intervalele, pauza, saltul, feedbackul, restaurarea după redeschidere, exportul, importul și resetarea. Codul păstrează paletele Standard (Aurora Teal) și Energetic și comenzile existente ale timerului.

## Constatări și remedieri

| Prioritate | Constatare | Rezolvare în această ramură |
| --- | --- | --- |
| P1 | Datele principale invalide puteau fi normalizate și suprascrise la pornire; un istoric parțial valid era afișat incomplet. | Conținutul original rămâne intact, salvarea se oprește, datele nevalidate nu se afișează, iar utilizatorul poate exporta un fișier brut cu starea, timerul, feedbackul și preferințele. |
| P1 | Un interval de alergare sărit putea fi creditat ca progres. | Sesiunea terminată rămâne `done` în istoric, fără avansare de nivel, serie de progres, capacitate confirmată, calibrare inițială a vitezei sau confirmare de 5 km continuu. |
| P1 | Un import valid înlocuia istoricul fără cale de revenire; exportul omitea setările și sesiunea în curs. | Backup JSON v2 include preferințele și timerul pus pe pauză sau feedbackul nesalvat. Importul acceptă și JSON vechi, verifică limita de 5 MB înainte de citire, salvează copia originală și revine la ea la eșec. Acțiunea de restaurare a datelor anterioare apare în Cont și pe ecranul de început. |
| P1 | Android Auto Backup putea copia date prin sistemul telefonului, deși transferul dorit este manual. | Auto Backup și transferul automat între dispozitive sunt dezactivate; transferul rămâne prin JSON exportat de utilizator. |
| P2 | Versiunile vechi de Android WebView puteau încărca aplicația deși nu susțin stilurile folosite. | WebView minim 111; proiectul Android este versionat pentru actualizarea `0.1.0` → `0.1.1`, cu același ID și aceeași semnătură personală. |
| P2 | Podul nativ era încărcat prea târziu pentru verificarea service worker; resetarea lăsa fișiere JSON temporare în cache. | Podul nativ se încarcă înainte de verificare; resetarea elimină fișierele SciRun din cache fără a șterge alte fișiere. |
| P2 | Dialogurile și comenzile reconstruite ale timerului pierdeau focusul; anunțurile pentru cititorul de ecran erau insuficiente. | Focusul este gestionat în dialoguri și după pauză/salt; fazele sunt anunțate la schimbare, iar butoanele înguste au ținte de minimum 48 px. |
| P2 | Unele etichete rămâneau în română în modul englez; editarea profilului elimina câmpuri vechi. | Etichetele identificate au traduceri, butoanele de limbă comunică starea selectată, iar câmpurile vechi ale profilului sunt păstrate. |

## Decizii de produs

- Timpul scurs cât Android suspendă aplicația este recuperat automat la revenire, conform alegerii utilizatorului.
- O sesiune cu alergare sărită rămâne finalizată în istoric, dar nu aduce credit pentru progresia antrenamentului.
- Transferul datelor se face prin backup JSON manual; nu se activează backupul Android prin Google.
- Această livrare merge în GitHub. APK-ul compilat pentru verificare nu este inclus în commit și nu este livrat.

## Verificare și limite

Suita Node include teste pentru backupul vechi și nou, importul cu rollback, restaurarea copiei anterioare, izolarea datelor corupte, progresul după salt, focus și configurarea Android. Buildul Android `0.1.1` a reușit local; semnătura sa corespunde versiunii `0.1.0`, iar pachetul are același ID `com.scirun.personal5k` și `versionCode 2`.

Browserul conectat nu a putut accesa serverul local și a blocat `file://`, astfel că nu există o verificare vizuală live completă pentru acest checkout. Testele mobile Playwright sunt selectate în CI, însă rezultatul lor trebuie verificat după publicarea ramurii. Nu a fost testat un telefon fizic sau un build iOS. Cheia de semnare rămâne doar locală, în afara repositoryului.

## Pași următori recomandați

1. Verificarea fluxurilor mobile în GitHub Actions și corectarea oricărei regresii observate acolo.
2. Test pe telefon Android cu istoric real: actualizare peste versiunea curentă, închidere/redeschidere în antrenament, export/import și restaurarea copiei dinaintea importului.
3. După validarea Android, pregătirea proiectului iOS și testarea separată a semnalelor tactile, stocării și funcționării offline pe iPhone.
