# SciRun 5K

Aplicație PWA pentru un program adaptiv de alergare pe bandă, cu obiectivul de a alerga 5 km continuu.

[Deschide aplicația](https://adytzazzz7.github.io/scirun5k-prototype/)

## Cum funcționează

- Configurare în doi pași: întrebare de siguranță, nivelul actual, 2–4 sesiuni pe săptămână și zile disponibile.
- Calibrare a vitezelor de mers și alergare înaintea primei sesiuni, urmată de feedback separat despre fiecare viteză.
- Timer cu încălzire, alergare, mers și revenire; pauză, salt imediat peste interval și oprire confirmată cu salvare parțială.
- Raportare manuală a distanței reale afișate de bandă și a efortului resimțit după sesiune.
- Panou și istoric cu sesiuni complete/parțiale, kilometri reali și cea mai lungă alergare realizată.
- Estimarea datei pentru 5 km se recalculează după nivel, viteza calibrată, feedback, frecvență și perioade indisponibile. Este orientativă.
- Obiectivul este confirmat separat: minimum 5 km raportați și confirmarea alergării continue, fără mers sau oprire.

Sărirea intervalelor este imediată, fără confirmare, și modifică timerul. Dacă timerul ajunge la final, sesiunea se salvează completă. Oprirea cere confirmare. Oprirea înainte de final salvează o sesiune parțială și păstrează nivelul planului.

## Program și preferințe

Din Cont → Program se pot schimba frecvența și zilele disponibile, marca o zi sau o perioadă indisponibilă și elimina perioadele marcate. Programul continuă de unde a rămas.

Tema întunecată Aurora Teal este implicită; există și varianta luminoasă, paleta Energetic, contrast înalt, română/engleză și comenzi pentru sunet și vibrații. Navigarea este în partea de jos pe telefon și se ascunde în timpul antrenamentului.

## Date și funcționare offline

Datele se păstrează local pe dispozitiv. Exportul și importul JSON sunt disponibile în Cont → Date și copii de siguranță; un backup poate fi restaurat și de pe ecranul inițial. În APK, exportul folosește meniul Android de partajare pentru a salva fișierul JSON. Resetarea șterge profilul, planul și istoricul local după confirmare.

PWA-ul poate fi instalat din browser și funcționează offline după prima încărcare prin HTTPS sau localhost. Nu măsoară automat distanța, pulsul sau GPS-ul.

APK-ul Android conține resursele web local și pornește offline. Stocarea APK-ului este separată de cea a PWA-ului: dacă ai istoric în browser, exportă backupul JSON acolo și importă-l în APK înainte de a începe sesiuni noi. Copiile de siguranță Android sunt doar manuale, prin export și import JSON; backupul automat al sistemului și transferul datelor aplicației între dispozitive sunt dezactivate. Instalarea unei versiuni noi cu același ID de aplicație și aceeași cheie de semnare păstrează datele. Dezinstalarea șterge datele locale, așa că păstrează un backup JSON exportat într-un loc sigur.

Sincronizarea prin cont și mementourile când aplicația este închisă necesită un serviciu de server și nu sunt implementate încă.

## Dezvoltare și verificare

Cu Node.js instalat:

```sh
npm install
npx playwright install chromium
npm test
npm run test:e2e
```

Pentru previzualizare locală, rulează `node tests/e2e/server.cjs` și deschide `http://127.0.0.1:4173`.

GitHub Actions rulează testele de logică și fluxurile Chromium. Regulile de adaptare rămân ipoteze de produs pentru acest prototip.

Cercul timerului se umple cu lichid de jos în sus, iar arcul exterior indică progresul. Alergarea, mersul, încălzirea și revenirea au culori distincte adaptate paletei. Sugestia pentru intervalul și viteza următoare apare cu 10 secunde înainte; cercul pulsează în ultimele 5 secunde. Mișcarea se oprește la pauză și respectă preferința sistemului pentru mișcare redusă.

## APK Android personal

Sunt necesare JDK 21 și Android SDK 36. Pe Windows, din rădăcina proiectului:

```powershell
npm install
npm run android:apk
```

Comanda construiește resursele web, sincronizează Capacitor, semnează APK-ul release și verifică semnătura. Rezultatul pentru versiunea curentă este `dist/SciRun-5K-0.1.1-android.apk` (ID `com.scirun.personal5k`); numele fișierului este preluat din metadatele buildului. Cheia personală și parola sunt create la prima compilare în `.android-toolchain/scirun-personal.jks` și `.android-toolchain/signing.properties`, ignorate de Git. Păstrează o copie sigură a ambelor fișiere: fără ele nu poți instala o actualizare peste aceeași aplicație păstrând istoricul. Pentru testare locală există și `npm run android:apk:debug`.
