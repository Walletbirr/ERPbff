/**
 * Turns a PDF into PNG pictures, one per page, so the mobile app can show a
 * PDF payment slip inside its own viewer (same as an image) instead of
 * opening it in a browser. Uses `mupdf` (WebAssembly: no system tools, no
 * native build, works the same on Windows / Linux / Docker).
 *
 * `mupdf` is an ES module while this project is CommonJS, so it is loaded
 * with a dynamic import the first time it is needed.
 */
const MAX_PAGES = 20; // slips are 1-2 pages; protects the server
const MAX_WIDTH_PX = 1400; // sharp enough to read amounts, light enough for mobile data
const MAX_SCALE = 2;

let mupdfPromise = null;
function loadMupdf() {
  if (!mupdfPromise) mupdfPromise = import("mupdf");
  return mupdfPromise;
}

async function openDoc(buffer) {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  return { mupdf, doc };
}

/** Number of pages (capped at MAX_PAGES). */
async function countPages(buffer) {
  const { doc } = await openDoc(buffer);
  try {
    return Math.min(doc.countPages(), MAX_PAGES);
  } finally {
    doc.destroy();
  }
}

/** PNG buffer of page `index` (0-based), or null if the page does not exist. */
async function renderPage(buffer, index) {
  const { mupdf, doc } = await openDoc(buffer);
  try {
    const total = Math.min(doc.countPages(), MAX_PAGES);
    if (!Number.isInteger(index) || index < 0 || index >= total) return null;
    const page = doc.loadPage(index);
    try {
      const [x0, , x1] = page.getBounds();
      const width = Math.max(x1 - x0, 1);
      const scale = Math.min(MAX_SCALE, MAX_WIDTH_PX / width);
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false, // no alpha
        true, // white background
      );
      try {
        return Buffer.from(pixmap.asPNG());
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

module.exports = { countPages, renderPage, MAX_PAGES };
