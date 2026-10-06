// Public map keys for the browser. Set them in Vercel: Project → Settings → Environment Variables.
//   MAPTILER_KEY  (optional) sharper satellite imagery from MapTiler; restrict the key to your domain in MapTiler.
//   ESRI_API_KEY  (optional) ArcGIS Location Platform key for Esri World Imagery in production.
//   SAT_TILE_URL  (optional) your own XYZ tile URL, e.g. a Google Earth Engine export in a public bucket.
// With none set, the portal uses keyless Esri imagery and falls back to the bundled Digital Earth Australia tiles.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    maptilerKey: process.env.MAPTILER_KEY || null,
    esriKey: process.env.ESRI_API_KEY || null,
    satTileUrl: process.env.SAT_TILE_URL || null,
  });
}
