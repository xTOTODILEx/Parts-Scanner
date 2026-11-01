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

## Inventory counter

A separate page (**🔢 Inventory** tab), not connected to the bad part finder. It has three views, picked at the top:

- **Overstock**: counts of the overstock parts (the counts made before Stockroom was added are here).
- **Stockroom**: the same parts, counted separately.
- **Total**: a table with Overstock + Stockroom for every part, with subtotals per category and a grand total.

On Overstock and Stockroom, every part number is a button, all on one screen, grouped in categories with subtotals:

- **GIOTTOS**: parts starting with PGIOT
- **RAFFAELLOS**: parts starting with PRAFF
- **MATISSES**: parts starting with PMATIS
- **ECS PARTS**: parts starting with E. (for example E.PMATIS10C.501)

- **Tap a part** to add 1 to its count.
- **Qty**: type an amount (for example 60), then tap a part to add that many at once. The box goes back to 1 after that tap.
- **↶ Undo** takes back the last change (a whole Qty amount at once).
- **− Remove**: while it's on (red, "Removing"), tapping a part takes 1 (or the Qty amount) off. Tap it again to go back to adding.
- **⬇️ Excel** (on any view, or **Export inventory to Excel** on the 📊 Excel tab) downloads one sheet with Category, Part number, Overstock, Stockroom and Total, with a subtotal after each category and a Total row.
- **Reset … counts** (below the buttons) sets the counts of the view you're on back to 0.

Counts are saved on the phone, so they're still there after closing the app. To change the list of parts, edit the lines at the top of `inventory.js`; a part goes into a category by the start of its part number.

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

Updates arrive by themselves: when you switch back to the app and a new version has been published, it reloads once (saved scans and counts are kept). If an update doesn't show, close the app fully and open it again.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | The screens |
| `parts.js` | The bad serial list, and reading the GA/NA code from a QR code |
| `inventory.js` | The inventory counter's part list, and adding/removing/undoing counts |
| `app.js` | Camera and photo QR scanning (zxing-wasm), results, storage, Excel export (SheetJS) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install and offline support |
| `tests/*.test.js` | Tests: `node tests/parts.test.js` and `node tests/inventory.test.js` |
