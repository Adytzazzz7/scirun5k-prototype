# SciRun: fidelitate vizuală față de conceptul Aurora Teal

## Reper și limite

Reperul aprobat este interiorul `.sp-phone` din `scirun-premium-preview.html` („Concept pe baza repo-ului · date exemplu”). Cifrele de demonstrație, rama telefonului, selectorul demonstrativ de faze și prezentarea iconului nu intră în aplicație. Toate numerele rămân derivate din profil, plan, timer și istoricul real. Nu construim APK.

## Etapa 1 — Panou, Istoric, Setări, Cont

- Aliniem ordinea, textul, dimensiunile și spațierea la concept: antetul, cardul de antrenament, sumarul, graficul, lista de istoric, preferințele și paletele.
- Graficul folosește exclusiv distanțele raportate. Când sunt insuficiente date, afișează o stare goală în același spațiu compact.
- Mutăm formularele Contului în secțiuni extensibile; programul, indisponibilitatea, nivelul și backupurile rămân funcționale.
- Istoricul păstrează toate sesiunile și detaliile de efort, accesibile într-un rând extins.

## Etapa 2 — Antrenament

- Reproducem ordinea vizuală a conceptului: antet compact, fază, cerc, etape, următorul interval, sugestie, trei controale și abandon.
- Cercul folosește un contur continuu SVG, lichid în interior și puls vizibil în ultimele cinci secunde. Sugestia rămâne la zece secunde.
- Poziția și dimensiunea elementelor sunt derivate din sesiunea reală; pornirea, pauza, saltul, oprirea, reluarea și salvarea păstrează regulile existente.

## Etapa 3 — Verificare și publicare

- Comparăm fiecare ecran la 390×844 cu valorile de dimensiune și culoare din concept; verificăm și 320×568, inclusiv controalele vizibile și fără derulare orizontală.
- Verificăm ambele teme, paletele, contrastul, navigarea, timerul, istoricul, backupul și offline prin testele afectate și suita mobilă finală.
- Publicăm în PR-ul #29 doar după verificare. Nu integrăm datele demonstrative și nu generăm APK.

## Criterii de acceptare

1. Structura și proporțiile ecranelor mobile corespund conceptului, cu date reale și stări goale clare.
2. Toate funcțiile existente rămân accesibile, inclusiv cele mutate în secțiuni extensibile.
3. Nicio sesiune din istoric nu se pierde sau se dublează; timerul și progresul de antrenament nu își schimbă regulile.
4. Testele mobile și de logică trec, iar PR-ul conține numai fișierele schimbate intenționat.
