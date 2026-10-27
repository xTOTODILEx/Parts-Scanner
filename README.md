# Bad Part Finder

A phone app for finding the troublesome parts. Scan a part's QR code and the app tells you straight away if it's one of the bad serial numbers.

## How to use it

1. **Front page:** the 4 POs that contain bad parts are listed: **166690**, **167742**, **161945** and **167923**. Use them to spot the boxes. Each PO shows how many bad parts it has, how many you've found, and (under *Bad serial numbers*) the list of serials.
2. **Tap the PO** of the box you are checking. Every part you scan is saved under that PO.
3. Scan the parts:
   - **▦ Scan part QR codes:** point the camera at a part's QR code (for example `https://mydmg.dmg.it/it/qr/?mat=16080625$$GA2604429`). As soon as it's read, the camera closes and the app shows the result for the GA/NA code after `$$`. (**Close**, bottom right, closes the camera without scanning.) The result is
     - **🚩 BAD PART** (red, with a buzz and alarm sound) if it is one of the bad serials, or
     - **✓ Not a problematic part** (green, short beep) if not.
   - **📷 Photo of many parts:** take one photo of several labels. Every QR code in it is checked, and bad parts get a red box on the photo. Tap **Scan harder** if some were missed.
   - **Type a serial** if a QR code can't be read.
4. **📊 Excel:** **Export to Excel** downloads the scans with the columns **PO**, **GA/NA code** and **result**. A second sheet lists all bad serials and whether each one has been found.

Each part is saved once; scanning it again shows its result with "already scanned".

## The bad serial numbers

| Serial number | DMG Order | PO MAD |
| --- | --- | --- |
| GA260844J | 1236-2026 | FCSTPO166690 |
| GA260846J | 1236-2026 | FCSTPO166690 |
| GA260846L | 1397-2026 | FCSTPO167742 |
| GA260846M | 1236-2026 | FCSTPO166690 |
| GA260847X | 1236-2026 | FCSTPO166690 |
| GA260848E | 1236-2026 | FCSTPO166690 |
| GA260848J | 1236-2026 | FCSTPO166690 |
| GA260849J | 3654-2026 | 161945_AUGUST |
| GA260849R | 3656-2026 | 161945_SEPTEMBER |
| GA260850M | 3654-2026 | 161945_AUGUST |
| GA261276Z | 1443-2026 | FCSTPO167923 |
| GA261277A | 1443-2026 | FCSTPO167923 |
| GA261277G | 1443-2026 | FCSTPO167923 |

To change the list, edit the rows at the top of `parts.js` (on github.com: open the file, tap the pencil, edit, then **Commit changes**). The POs on the front page are worked out from this list.

## Where the data is stored

Scans stay **on the phone that made them** (in the browser's storage). Export to Excel to keep or share them. Clearing the browser's site data deletes the scans.

## Opening the app

https://xtotodilex.github.io/Parts-Scanner/

Open it in Chrome (Android) or Safari (iPhone) and add it to the home screen:
- **Android (Chrome):** menu ⋮ → **Add to Home screen** / **Install app**
- **iPhone (Safari):** Share → **Add to Home Screen**

The first scan needs internet to download the QR reader. After that it also works offline.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | The screens |
| `parts.js` | The bad serial list, and reading the GA/NA code from a QR code |
| `app.js` | Camera and photo QR scanning (zxing-wasm), results, storage, Excel export (SheetJS) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install and offline support |
| `tests/parts.test.js` | Tests for `parts.js`: `node tests/parts.test.js` |
