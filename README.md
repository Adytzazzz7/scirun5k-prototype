# SciRun 5K Pro

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

Din Setări se pot schimba frecvența și zilele disponibile, marca o zi sau o perioadă indisponibilă și elimina perioadele marcate. Programul continuă de unde a rămas.

Tema întunecată este implicită; sunt disponibile și tema luminoasă, română/engleză și semnale sonore. Navigarea este în partea de jos pe telefon și se ascunde în timpul antrenamentului.

## Date și funcționare offline

Datele se păstrează în browserul dispozitivului. Exportul și importul JSON sunt disponibile în Setări; un backup poate fi restaurat și de pe ecranul inițial. Resetarea șterge profilul, planul și istoricul local după confirmare.

PWA-ul poate fi instalat din browser și funcționează offline după prima încărcare prin HTTPS sau localhost. Nu măsoară automat distanța, pulsul sau GPS-ul.

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

Cercul timerului folosește straturi lichide decorative: mers verde, alergare roșie, încălzire/repaus/revenire mint. Culoarea trece spre următorul interval în ultimele 10 secunde, iar mișcarea se intensifică în ultimele 5. Mișcarea se oprește la pauză și respectă preferința sistemului pentru mișcare redusă.
