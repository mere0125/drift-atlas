(() => {
  "use strict";
  const search = document.querySelector("#search-dialog");
  const about = document.querySelector("#about-dialog");
  const welcome = document.querySelector("#welcome");
  const journey = document.querySelector("#journey");
  const tag = document.querySelector("#scene-tag");
  const help = document.querySelector("#scene-help");
  const filterButton = document.querySelector("#toggle-filters");
  const resultButton = document.querySelector("#toggle-results");
  function showResults(open) {
    document.body.classList.toggle("results-open", open);
    resultButton.setAttribute("aria-expanded", String(open));
    if (open) {
      document.body.classList.remove("filters-open");
      filterButton.setAttribute("aria-expanded", "false");
    }
  }
  filterButton.addEventListener("click", () => {
    const open = !document.body.classList.contains("filters-open");
    if (open) showResults(false);
    document.body.classList.toggle("filters-open", open);
    filterButton.setAttribute("aria-expanded", String(open));
  });
  resultButton.addEventListener("click", () =>
    showResults(!document.body.classList.contains("results-open")),
  );
  document
    .querySelector("#close-results")
    .addEventListener("click", () => showResults(false));
  window.addEventListener("drift:selection", (event) => {
    if (event.detail.id) showResults(true);
  });
  const quietButton = document.querySelector("#hide-interface");
  quietButton.addEventListener("click", () => {
    const quiet = !document.body.classList.contains("quiet-mode");
    document.body.classList.toggle("quiet-mode", quiet);
    quietButton.textContent = quiet ? "Show controls" : "Hide controls";
    quietButton.setAttribute("aria-pressed", String(quiet));
  });
  let noticeTimer;
  window.addEventListener("drift:notice", (event) => {
    const notice = document.querySelector("#scene-notice");
    window.clearTimeout(noticeTimer);
    notice.textContent = event.detail.text;
    notice.hidden = false;
    noticeTimer = window.setTimeout(() => {
      notice.hidden = true;
    }, 3200);
  });

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
    showResults(false);
    document.body.classList.remove("filters-open");
    filterButton.setAttribute("aria-expanded", "false");
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
    if (
      event.key === "Escape" &&
      document.body.classList.contains("quiet-mode")
    ) {
      quietButton.click();
      return;
    }
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
  // The sea chart is the main workspace; the waterline remains one click away.
  openSearch();
})();
