# SciRun 5K Pro — prototip v0.1

Prototip web instalabil (PWA) pentru testarea fluxului de bază: profil inițial, dashboard, calendar estimativ pe 12 săptămâni, timer de alergare/mers, feedback după sesiune, reguli adaptive simple și stocare locală.

## Testare rapidă pe calculator

1. Dezarhivează `SciRun_5K_Pro_Prototip_v0.1.zip`.
2. Deschide `index.html` într-un browser modern.
3. Apasă „Completează exemplu” dacă vrei să sari peste completarea manuală, apoi „Creează-mi programul”.
4. Testează dashboardul, programul, timerul și feedbackul după sesiune.

`localStorage` funcționează în browserul local. Service worker/PWA offline necesită servire prin HTTPS sau `localhost`.

## Testare pe telefon / PWA

Pentru instalare pe telefon, servește folderul prin HTTPS, de exemplu cu GitHub Pages. Deschide URL-ul pe telefon și folosește opțiunea browserului „Add to Home Screen / Adaugă la ecranul principal”. PWA-ul nu a fost publicat automat.

## Limitări cunoscute ale v0.1

- Nu există GPS, măsurare a distanței sau integrare cu smartwatch/HR.
- Obiectivul de 5 km se confirmă manual, după măsurarea distanței printr-o metodă separată.
- Predicția de timp este doar orientativă; nu este un model de machine learning antrenat pe o populație.
- Treptele și pragurile de adaptare sunt ipoteze de produs pentru testare, nu prescripții validate clinic.
- Datele rămân în browserul dispozitivului. Ștergerea datelor browserului poate șterge istoricul.
