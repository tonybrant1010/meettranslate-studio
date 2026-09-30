# Hozzájárulás

Köszönjük, hogy segíteni szeretnél! Néhány egyszerű szabály:

## Hibabejelentés, ötlet

- Mielőtt új **Issue**-t nyitsz, nézd meg, nincs-e már ilyen.
- Használd a sablonokat (*Hibabejelentés* vagy *Új ötlet*).
- **Soha ne másold be az API kulcsodat**, a `backend\.env` fájl tartalmát vagy a beszélgetések szövegét.

## Kódmódosítás

1. Készíts egy saját ágat (`fork` → `git checkout -b rovid-leiras`).
2. A backend tesztjeinek át kell menniük:
   ```
   cd backend
   .venv\Scripts\python -m pytest
   ```
3. Ha a felületen változtattál, fordítsd le újra, és a `frontend/build` mappát is add hozzá a módosításhoz:
   ```
   cd frontend
   npm install
   npm run build
   ```
4. A felület szövegei magyarul legyenek: rövidek, egyszerűek, tegező hangnemben.
5. Nyiss **Pull Requestet** egy rövid leírással: mit és miért változtattál, és hogyan próbáltad ki.

## Kódstílus

- Python: PEP 8, típusjelölések, rövid docstringek.
- JavaScript/React: funkcionális komponensek, Tailwind osztályok, a színeket a `tailwind.config.js` tokenjeiből használd.
