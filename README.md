# Parts Scanner

A phone app for finding which aisle a job is in.

- **📷 Add photos**: take photos of the box labels. The app reads every `JOB: 12345678` and matches it to the shelf number printed above it. Shelf numbers always start with **B**, like `B12-E` or `B12`; other labels are ignored. Scratched-out labels are skipped, and any the app can only partly read show up **unticked** with "unclear – scratched?" so they aren't saved by accident. You check and fix the results, then save them.
- **🔍 Find**: type a job number to see its aisle. If a job is in more than one aisle, every aisle is shown.
- **📊 Excel**: export the database as an `.xlsx` file, or import one (columns `Job Number` and `Aisle`). The export has two sheets:
  - **Jobs**: one row per job and aisle
  - **Lookup**: one row per job, with all of its aisles and how many there are

It runs in the phone's web browser and can be added to the home screen like a normal app. Nothing needs to be installed from an app store.

## Where the data is stored

Saved entries stay **on the phone that saved them** (in the browser's storage). Nothing is uploaded anywhere.
- Use **Export to Excel** often as a backup, or to send the data to someone else.
- To move the data to another phone, export it on the first phone and **Import Excel** on the other one.
- Clearing the browser's site data deletes the saved entries, so export first.

## Putting it on your phone (no computer or git needed)

1. On github.com, merge this branch into `main` (open the pull request and tap **Merge**).
2. GitHub Pages only works on **public** repos on a free account. In the repo, go to **Settings → General → Danger Zone → Change visibility → Public**. Your job data is not in the repo, only the app's code is.
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two the app is live at `https://xtotodilex.github.io/Parts-Scanner/`.
5. Open that link on your phone:
   - **Android (Chrome)**: menu ⋮ → **Add to Home screen** / **Install app**
   - **iPhone (Safari)**: Share → **Add to Home Screen**

The first photo scan needs internet so the app can download its text reader (about 10 MB). After that it also works offline.

## Tips for good scans

- Hold the phone straight on to the labels, fill the screen with them, and avoid glare.
- One or two boxes per photo works better than a whole shelf.
- If the shelf number isn't in the photo, type it in **Shelf for these photos** before scanning.
- Always check the green job boxes and blue shelf boxes on the preview before saving.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | The screens |
| `app.js` | Camera/photo handling, text reading (Tesseract.js), storage, search, Excel import/export (SheetJS) |
| `parser.js` | Finds job numbers and B shelf numbers in the text and matches each job to the shelf above it |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install and offline support |
| `tests/parser.test.js` | Tests for `parser.js`: `node tests/parser.test.js` |
