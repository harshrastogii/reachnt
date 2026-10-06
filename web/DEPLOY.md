# Deploying ReachNT to Vercel

Live now at https://reachnt.vercel.app. The Vercel project `reachnt` is connected to `github.com/harshrastogii/reachnt` with Root Directory `web`, so every push to `main` redeploys it. The steps below are for setting it up again from scratch.

The portal is a static site plus two tiny serverless functions. Everything it needs is in this `web/` folder.

## Option A: from GitHub (recommended)

1. Push the `reachnt` project to a GitHub repository.
2. In Vercel: **Add New → Project → Import** that repository.
3. Set **Root Directory** to `web`. Framework preset: **Other**. Leave the build command and output directory empty.
4. Deploy. Vercel gives you an address like `https://reachnt.vercel.app`.

## Option B: from your computer

```bash
npm i -g vercel
cd web
vercel           # first time: answer the prompts, keep the defaults
vercel --prod    # publish
```

## Map keys (all optional)

Set these in Vercel under **Project → Settings → Environment Variables**, then redeploy. The browser reads them from `/api/config`. With none set, the portal uses Esri World Imagery without a key and falls back to the bundled Digital Earth Australia tiles. Esri's photos of NT communities go down to zoom level 17, enough to see single houses. The portal stops there and enlarges one level further, so it never shows Esri's grey "Map data not yet available" tile.

| Variable | What it does | Where to get it |
|---|---|---|
| `MAPTILER_KEY` | Sharp satellite imagery (zoom to individual houses). Free tier: 100,000 map loads a month. | https://cloud.maptiler.com/account/keys |
| `ESRI_API_KEY` | Esri World Imagery under your own ArcGIS account, which Esri asks for in production use. | https://location.arcgis.com |
| `SAT_TILE_URL` | Your own tile set, for example a Google Earth Engine export (see `scripts/gee_satellite.py`). Format: `https://…/{z}/{x}/{y}` | your bucket |

Keys for map tiles are visible to the browser by design. No secret keys go to the browser.

## What works offline

- **Install it on a phone:** open the site, then use "Add to Home Screen" (iPhone) or "Install app" (Android).
- **What stays on the phone:** the service worker (`sw.js`) keeps the app, its data and the bundled satellite tiles.
- **Keep map on phone:** this button in the tradesperson view also stores sharp imagery around that week's stops.
- **Updates without signal:** "Done" and "Couldn't do it" are saved on the phone. They're sent to `/api/sync` when signal returns. In this prototype `/api/sync` only acknowledges them. In production it writes to the Postgres tables in `docs/schema.sql`, using a server-side `DATABASE_URL` set in Vercel.

## Check after deploying

- The coordinator map shows hexagon badges around Katherine, and the legend names the imagery.
- In the tradesperson view, **Save run sheet (PDF)** downloads a PDF with the map and the job list.
- Go offline (DevTools → Network → Offline), reload, and the app still opens.

All repair requests in the portal are synthetic demo data.
