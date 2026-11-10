// The demo stage: a browser window drawn in a page of the extension, with the real popup and the real sites in frames.
// e2e/demo/record.mjs drives it through these functions.

const $ = (id) => document.getElementById(id);

window.stage = {
  caption(step, text) {
    $("captionStep").textContent = step;
    $("captionText").textContent = text;
    $("caption").classList.toggle("hidden", !text);
  },
  open(url) {
    $("intro").classList.add("hidden");
    $("url").textContent = url.replace(/^https?:\/\//, "");
    const frame = $("site");
    frame.classList.remove("shown");
    frame.onload = () => frame.classList.add("shown");
    frame.src = url;
  },
  showUrl(url) {
    $("url").textContent = url.replace(/^https?:\/\//, "");
  },
  openPopup() {
    $("extension").classList.add("active");
    $("popup").classList.add("open");
    this.fitPopup();
  },
  fitPopup() {
    const frame = $("popupFrame");
    frame.contentWindow?.scrollTo(0, 0);
    const height = frame.contentDocument?.body?.scrollHeight ?? 0;
    $("popup").style.height = `${Math.min(height || 380, 600)}px`;
  },
  closePopup() {
    $("extension").classList.remove("active");
    $("popup").classList.remove("open");
  },
  moveCursor(x, y) {
    const cursor = $("cursor");
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  },
  clickCursor() {
    const cursor = $("cursor");
    cursor.classList.remove("click");
    void cursor.offsetWidth;
    cursor.classList.add("click");
  },
};

// the popup is loaded in advance, so that it opens at its full height like the real one
$("popupFrame").src = "../popup/index.html";
setInterval(() => window.stage.fitPopup(), 200);
// keep the address bar on the page the site moved to
setInterval(() => {
  try {
    const frame = $("site");
    if (frame.src) {
      window.stage.showUrl(frame.contentWindow.location.href);
    }
  } catch {
    // another origin: record.mjs tells the address
  }
}, 300);
