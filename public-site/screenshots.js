/**
 * Renders app screenshot showcase from manifest (safeForPublic only).
 * Dev-only asset generation: npm run prepare:public-screenshots
 */
(function () {
  var MANIFEST_URL = "assets/screenshots/screenshots.manifest.json";

  /** Only sections with dedicated screenshots — no cross-category reuse. */
  var SHOWCASE = [
    {
      id: "multilingual",
      title: "Multilingual Interface",
      copy: "Built for Indian businesses with multilingual UI while keeping amounts, dates and business data in consistent en-IN format.",
      shotIds: ["new-record-en", "new-record-hi", "new-record-te", "new-record-gu"],
    },
  ];

  function pictureHtml(shot) {
    var webp1x = shot.src;
    var webp2x = shot.src2x;
    var png1x = shot.fallback;
    var png2x = shot.fallback2x;
    var w = shot.width || 430;
    return (
      '<picture class="device-screen">' +
      '<source type="image/webp" srcset="' +
      webp1x +
      " 1x, " +
      webp2x +
      ' 2x" sizes="(max-width: 640px) 88vw, 280px">' +
      '<img src="' +
      png1x +
      '" srcset="' +
      png1x +
      " 1x, " +
      png2x +
      ' 2x" sizes="(max-width: 640px) 88vw, 280px" width="' +
      w +
      '" alt="' +
      escapeAttr(shot.alt) +
      '" loading="lazy" decoding="async">' +
      "</picture>"
    );
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderSection(section, byId) {
    var shots = section.shotIds
      .map(function (id) {
        return byId[id];
      })
      .filter(Boolean);

    if (!shots.length) return "";

    var cards = shots
      .map(function (shot) {
        return (
          '<figure class="screenshot-card">' +
          '<div class="device-frame">' +
          pictureHtml(shot) +
          "</div>" +
          '<figcaption>' +
          '<span class="screenshot-lang">' +
          escapeAttr(shot.language) +
          "</span>" +
          "<strong>" +
          escapeAttr(shot.title) +
          "</strong>" +
          "<p>" +
          escapeAttr(shot.caption) +
          "</p>" +
          "</figcaption>" +
          "</figure>"
        );
      })
      .join("");

    return (
      '<article class="showcase-category" id="showcase-' +
      section.id +
      '">' +
      "<h3 class=\"section-title\">" +
      escapeAttr(section.title) +
      "</h3>" +
      '<p class="body-lg showcase-copy">' +
      escapeAttr(section.copy) +
      "</p>" +
      '<div class="screenshot-track" tabindex="0" aria-label="' +
      escapeAttr(section.title) +
      ' app screenshots">' +
      cards +
      "</div>" +
      "</article>"
    );
  }

  function init(manifest) {
    var root = document.getElementById("screenshot-showcase");
    if (!root) return;

    var byId = {};
    manifest
      .filter(function (m) {
        return m.safeForPublic === true;
      })
      .forEach(function (m) {
        byId[m.id] = m;
      });

    var html = SHOWCASE.map(function (section) {
      return renderSection(section, byId);
    }).join("");

    root.innerHTML = html || '<p class="caption">Screenshots will appear here after running <code>npm run prepare:public-screenshots</code>.</p>';
  }

  function boot() {
    if (window.__SCREENSHOT_MANIFEST__ && window.__SCREENSHOT_MANIFEST__.length) {
      init(window.__SCREENSHOT_MANIFEST__);
      return;
    }
    fetch(MANIFEST_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("manifest fetch failed");
        return res.json();
      })
      .then(init)
      .catch(function () {
        var root = document.getElementById("screenshot-showcase");
        if (root) {
          root.innerHTML =
            '<p class="caption">Screenshot data missing. Run <code>npm run prepare:public-screenshots</code> from the repo root.</p>';
        }
      });
  }

  boot();
})();
