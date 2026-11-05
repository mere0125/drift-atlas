(() => {
  "use strict";
  const search = document.querySelector("#search-dialog");
  const about = document.querySelector("#about-dialog");
  const welcome = document.querySelector("#welcome");
  const journey = document.querySelector("#journey");
  const tag = document.querySelector("#scene-tag");
  const help = document.querySelector("#scene-help");

  function openSearch() {
    if (about.open) about.close();
    search.hidden = false;
    help.hidden = false;
    document.body.classList.add("is-searching");
    window.dispatchEvent(new CustomEvent("drift:search-open"));
  }
  function closeSearch() {
    search.hidden = true;
    help.hidden = true;
    document.body.classList.remove("is-searching");
    window.dispatchEvent(new CustomEvent("drift:search-close"));
  }
  [
    "#open-search",
    "#begin-button",
    "#change-drifter",
    "#about-explore",
  ].forEach((selector) =>
    document.querySelector(selector).addEventListener("click", openSearch),
  );
  window.addEventListener("drift:enter-atlas", openSearch);
  window.addEventListener("drift:exit-atlas", closeSearch);
  document
    .querySelector("#open-about")
    .addEventListener("click", () => about.showModal());
  document
    .querySelector('[data-close="search-dialog"]')
    .addEventListener("click", closeSearch);
  document
    .querySelector('[data-close="about-dialog"]')
    .addEventListener("click", () => about.close());
  about.addEventListener("click", (event) => {
    if (event.target !== about) return;
    const r = about.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      about.close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !search.hidden && !about.open) closeSearch();
  });
  window.addEventListener("drift:opened", () => {
    closeSearch();
    welcome.hidden = true;
    document.body.classList.add("is-following");
    tag.textContent = "Recorded position";
  });
  window.addEventListener("drift:reset", () => {
    welcome.hidden = false;
    journey.hidden = true;
    document.body.classList.remove("is-following");
    tag.textContent = "Surface drifter";
    window.dispatchEvent(new CustomEvent("drift:home"));
  });
  document.querySelector("#home-button").addEventListener("click", () => {
    if (about.open) about.close();
    closeSearch();
    welcome.hidden = false;
    journey.hidden = true;
    document.body.classList.remove("is-following");
    tag.textContent = "Surface drifter";
    window.dispatchEvent(new CustomEvent("drift:home"));
  });
})();
