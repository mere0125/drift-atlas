(() => {
  "use strict";
  const search = document.querySelector("#search-dialog");
  const about = document.querySelector("#about-dialog");
  const welcome = document.querySelector("#welcome");
  const journey = document.querySelector("#journey");
  const tag = document.querySelector("#scene-tag");

  function openSearch() {
    if (about.open) about.close();
    search.showModal();
    window.dispatchEvent(new CustomEvent("drift:search-open"));
  }
  [
    "#open-search",
    "#begin-button",
    "#change-drifter",
    "#about-explore",
  ].forEach((selector) => {
    document.querySelector(selector).addEventListener("click", openSearch);
  });
  document
    .querySelector("#open-about")
    .addEventListener("click", () => about.showModal());
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () =>
      document.getElementById(button.dataset.close).close(),
    );
  });
  [search, about].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    });
  });
  window.addEventListener("drift:opened", () => {
    if (search.open) search.close();
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
    if (search.open) search.close();
    if (about.open) about.close();
    welcome.hidden = false;
    journey.hidden = true;
    document.body.classList.remove("is-following");
    tag.textContent = "Surface drifter";
    window.dispatchEvent(new CustomEvent("drift:home"));
  });
})();
