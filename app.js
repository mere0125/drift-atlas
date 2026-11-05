(() => {
  "use strict";

  const DATA_URL = "data/noaa_gdp_6hour_western_north_atlantic_2024.csv";
  const LAND_URL = "data/land-110m.json";
  const REGION = {
    west: -75,
    east: -40,
    south: 30,
    north: 50,
  };
  const MAX_VISIBLE_TRACKS = 16;
  const GAP_LIMIT_MS = 12 * 60 * 60 * 1000;
  const DEFAULT_STATE = {
    month: 4,
    center: [-69, 36],
    radiusKm: 180,
  };
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const COLORS = [
    "#efc58b",
    "#ef987e",
    "#a7ded1",
    "#b9b2df",
    "#d7d29b",
    "#d6a1b4",
    "#a6c2a1",
    "#eeac86",
    "#9bbfe0",
    "#7fc9c4",
    "#d79178",
    "#b6a4cc",
    "#c9b47d",
    "#8ab9ce",
    "#d6a6c0",
    "#b4cb96",
  ];

  const state = {
    ...DEFAULT_STATE,
    data: [],
    byId: new Map(),
    byMonth: Array.from({ length: 12 }, () => []),
    byMonthId: Array.from({ length: 12 }, () => new Map()),
    land: null,
    matches: [],
    visibleMatches: [],
    selectedId: null,
    hoveredId: null,
    projection: null,
    dirty: false,
    journeyId: null,
    journeyIndex: 0,
    journeyTimer: null,
    journeyCenter: null,
    journeyRadiusKm: null,
  };

  const dom = {
    heroSvg: d3.select("#hero-map"),
    mapSvg: d3.select("#atlas-map"),
    mapFrame: document.querySelector("#map-frame"),
    mapLoading: document.querySelector("#map-loading"),
    tooltip: document.querySelector("#map-tooltip"),
    month: document.querySelector("#month-select"),
    radius: document.querySelector("#radius-input"),
    radiusOutput: document.querySelector("#radius-output"),
    locationOutput: document.querySelector("#location-output"),
    form: document.querySelector("#search-form"),
    searchButton: document.querySelector("#search-button"),
    exampleButton: document.querySelector("#example-button"),
    resultSummary: document.querySelector("#result-summary"),
    routeList: document.querySelector("#route-list"),
    routeDetail: document.querySelector("#route-detail"),
    routeIndexTitle: document.querySelector("#route-index-title"),
    journey: document.querySelector("#journey"),
    journeyEmpty: document.querySelector("#journey-empty"),
    journeyPlayer: document.querySelector("#journey-player"),
    journeySvg: d3.select("#journey-map"),
    journeyIntro: document.querySelector("#journey-intro"),
    journeyPlay: document.querySelector("#journey-play"),
    journeyRange: document.querySelector("#journey-range"),
    journeyStage: document.querySelector("#journey-stage-label"),
    journeyDate: document.querySelector("#journey-date"),
    journeyId: document.querySelector("#journey-id"),
    journeyPosition: document.querySelector("#journey-position"),
    journeyDistance: document.querySelector("#journey-distance"),
    journeyDrogue: document.querySelector("#journey-drogue"),
    journeyBoundaryNote: document.querySelector("#journey-boundary-note"),
  };

  function cleanNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= -999000) return null;
    return number;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatCoordinate([longitude, latitude]) {
    const lat = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? "N" : "S"}`;
    const lon = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? "E" : "W"}`;
    return `${lat}, ${lon}`;
  }

  function shortId(id) {
    return id.slice(-6);
  }

  function formatUtc(date, withTime = false) {
    if (!date) return "Not available";
    const options = withTime
      ? {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
          hour12: false,
        }
      : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
    return (
      new Intl.DateTimeFormat("en-US", options)
        .format(date)
        .replace("24:00", "00:00") + (withTime ? " UTC" : "")
    );
  }

  function haversineKm(a, b) {
    const toRadians = Math.PI / 180;
    const [lon1, lat1] = a;
    const [lon2, lat2] = b;
    const deltaLat = (lat2 - lat1) * toRadians;
    const deltaLon = (lon2 - lon1) * toRadians;
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1 * toRadians) *
        Math.cos(lat2 * toRadians) *
        Math.sin(deltaLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  function splitAtGaps(rows) {
    if (!rows.length) return [];
    const sorted = [...rows].sort((a, b) => a.time - b.time);
    const segments = [[sorted[0]]];
    for (let index = 1; index < sorted.length; index += 1) {
      const row = sorted[index];
      const previous = sorted[index - 1];
      if (row.time - previous.time > GAP_LIMIT_MS) segments.push([]);
      segments[segments.length - 1].push(row);
    }
    return segments;
  }

  function drogueStatus(row) {
    if (!row.drogueLostRaw) {
      return { label: "Drogue attached", className: "status-attached" };
    }
    if (!row.drogueLostDate || row.drogueLostDate.getUTCFullYear() <= 1971) {
      return {
        label: "Drogue status uncertain",
        className: "status-uncertain",
      };
    }
    if (row.time >= row.drogueLostDate) {
      return { label: "Drogue already lost", className: "status-lost" };
    }
    return { label: "Drogue attached", className: "status-attached" };
  }

  function findMatches(month, center, radiusKm) {
    const nearby = new Map();
    for (const row of state.byMonth[month]) {
      const distanceKm = haversineKm(center, [row.longitude, row.latitude]);
      if (distanceKm <= radiusKm) {
        if (!nearby.has(row.id)) nearby.set(row.id, []);
        nearby.get(row.id).push({ row, distanceKm });
      }
    }

    return [...nearby.entries()]
      .map(([id, observations]) => {
        const monthRows = state.byMonthId[month].get(id) || [];
        const closest = observations.reduce((best, current) =>
          current.distanceKm < best.distanceKm ? current : best,
        );
        const validSpeeds = monthRows
          .map((row) => row.speed)
          .filter(Number.isFinite);
        const validTemperatures = monthRows
          .map((row) => row.sst)
          .filter(Number.isFinite);
        return {
          id,
          observations,
          matchedCount: observations.length,
          monthRows,
          segments: splitAtGaps(monthRows),
          closestRow: closest.row,
          closestDistanceKm: closest.distanceKm,
          first: monthRows[0]?.time || null,
          last: monthRows[monthRows.length - 1]?.time || null,
          averageSpeed: validSpeeds.length ? d3.mean(validSpeeds) : null,
          averageTemperature: validTemperatures.length
            ? d3.mean(validTemperatures)
            : null,
        };
      })
      .sort(
        (a, b) =>
          b.matchedCount - a.matchedCount ||
          a.closestDistanceKm - b.closestDistanceKm,
      );
  }

  function regionFeature() {
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [REGION.west, REGION.south],
            [REGION.west, REGION.north],
            [REGION.east, REGION.north],
            [REGION.east, REGION.south],
            [REGION.west, REGION.south],
          ],
        ],
      },
    };
  }

  function projectionFor(width, height, inset = 34) {
    return d3
      .geoMercator()
      .fitExtent(
        [
          [inset, inset],
          [width - inset, height - inset],
        ],
        regionFeature(),
      )
      .clipExtent([
        [inset, inset],
        [width - inset, height - inset],
      ]);
  }

  function renderHero() {
    const node = dom.heroSvg.node();
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = Math.max(760, Math.round(rect.width || 1100));
    const height = Math.max(520, Math.round(rect.height || 720));
    const projection = projectionFor(width, height, 24);
    const path = d3.geoPath(projection);
    const heroMatches = findMatches(
      DEFAULT_STATE.month,
      DEFAULT_STATE.center,
      DEFAULT_STATE.radiusKm,
    ).slice(0, 7);

    dom.heroSvg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .selectAll("*")
      .remove();
    dom.heroSvg
      .append("rect")
      .attr("class", "hero-ocean")
      .attr("width", width)
      .attr("height", height);

    dom.heroSvg
      .append("path")
      .datum(
        d3.geoGraticule().extent([
          [REGION.west, REGION.south],
          [REGION.east, REGION.north],
        ])(),
      )
      .attr("class", "hero-graticule")
      .attr("d", path);

    dom.heroSvg
      .append("path")
      .datum(state.land)
      .attr("class", "hero-land")
      .attr("d", path);

    const line = d3
      .line()
      .x((row) => projection([row.longitude, row.latitude])[0])
      .y((row) => projection([row.longitude, row.latitude])[1])
      .curve(d3.curveCatmullRom.alpha(0.35));

    heroMatches.forEach((match, matchIndex) => {
      match.segments
        .filter((segment) => segment.length > 1)
        .forEach((segment) => {
          dom.heroSvg
            .append("path")
            .datum(segment)
            .attr("class", "hero-track")
            .attr("stroke", COLORS[matchIndex % COLORS.length])
            .attr("d", line);
        });
    });

    dom.heroSvg
      .append("path")
      .datum(
        d3
          .geoCircle()
          .center(DEFAULT_STATE.center)
          .radius(DEFAULT_STATE.radiusKm / 111.32)
          .precision(2)(),
      )
      .attr("class", "hero-search-area")
      .attr("d", path);
  }

  function addCoordinateLabels(svg, projection, width, height) {
    const longitudeTicks = [-70, -60, -50, -40];
    const latitudeTicks = [30, 35, 40, 45, 50];

    svg
      .selectAll(".longitude-label")
      .data(longitudeTicks)
      .join("text")
      .attr("class", "coordinate-label longitude-label")
      .attr("x", (longitude) => projection([longitude, REGION.south])[0])
      .attr("y", height - 11)
      .attr("text-anchor", "middle")
      .text((longitude) => `${Math.abs(longitude)}°W`);

    svg
      .selectAll(".latitude-label")
      .data(latitudeTicks)
      .join("text")
      .attr("class", "coordinate-label latitude-label")
      .attr("x", 8)
      .attr("y", (latitude) => projection([REGION.west, latitude])[1] + 4)
      .text((latitude) => `${latitude}°N`);
  }

  function renderMap() {
    const svg = dom.mapSvg;
    const frameRect = dom.mapFrame.getBoundingClientRect();
    const width = Math.max(520, Math.round(frameRect.width));
    const height = 345;
    const projection = projectionFor(
      width,
      height,
      window.innerWidth <= 760 ? 28 : 38,
    );
    const path = d3.geoPath(projection);
    const line = d3
      .line()
      .x((row) => projection([row.longitude, row.latitude])[0])
      .y((row) => projection([row.longitude, row.latitude])[1])
      .curve(d3.curveLinear);

    state.projection = projection;
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .selectAll("g, rect.map-ocean, path.map-border")
      .remove();

    svg
      .append("rect")
      .attr("class", "map-ocean")
      .attr("width", width)
      .attr("height", height);

    const base = svg.append("g").attr("class", "base-layer");
    base
      .append("path")
      .datum(
        d3
          .geoGraticule()
          .extent([
            [REGION.west, REGION.south],
            [REGION.east, REGION.north],
          ])
          .step([5, 5])(),
      )
      .attr("class", "map-graticule")
      .attr("d", path);

    base
      .append("path")
      .datum(state.land)
      .attr("class", "map-land")
      .attr("d", path);

    base
      .append("path")
      .datum(regionFeature())
      .attr("class", "map-border")
      .attr("d", path);

    addCoordinateLabels(base, projection, width, height);

    const searchLayer = svg.append("g").attr("class", "search-layer");
    searchLayer
      .append("path")
      .datum(
        d3
          .geoCircle()
          .center(state.center)
          .radius(state.radiusKm / 111.32)
          .precision(2)(),
      )
      .attr("class", "search-area")
      .attr("d", path);

    const centerPoint = projection(state.center);
    searchLayer
      .append("circle")
      .attr("class", "search-center-outer")
      .attr("cx", centerPoint[0])
      .attr("cy", centerPoint[1])
      .attr("r", 7);
    searchLayer
      .append("circle")
      .attr("class", "search-center-inner")
      .attr("cx", centerPoint[0])
      .attr("cy", centerPoint[1])
      .attr("r", 2.7);

    const routesLayer = svg
      .append("g")
      .attr("class", `routes-layer${state.selectedId ? " has-selection" : ""}`);

    state.visibleMatches.forEach((match, index) => {
      const color = COLORS[index % COLORS.length];
      match.color = color;
      const group = routesLayer
        .append("g")
        .attr(
          "class",
          `route-group${state.selectedId === match.id ? " is-selected" : ""}`,
        )
        .attr("data-id", match.id);

      match.segments.forEach((segment, segmentIndex) => {
        if (segment.length > 1) {
          group
            .append("path")
            .datum(segment)
            .attr("class", "route-line")
            .attr("stroke", color)
            .attr("d", line);

          const hit = group
            .append("path")
            .datum(segment)
            .attr("class", "route-hit")
            .attr("d", line)
            .attr("tabindex", segmentIndex === 0 ? 0 : -1)
            .attr("role", segmentIndex === 0 ? "button" : null)
            .attr(
              "aria-label",
              segmentIndex === 0
                ? `Drifter ${match.id}, ${match.monthRows.length} positions in ${MONTHS[state.month]} 2024`
                : null,
            );
          bindRouteInteraction(hit, match);
        } else if (segment.length === 1) {
          const [x, y] = projection([
            segment[0].longitude,
            segment[0].latitude,
          ]);
          const point = group
            .append("circle")
            .attr("class", "route-point")
            .attr("cx", x)
            .attr("cy", y)
            .attr("r", 4)
            .attr("fill", color)
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr(
              "aria-label",
              `Drifter ${match.id}, one visible position in ${MONTHS[state.month]} 2024`,
            );
          bindRouteInteraction(point, match);
        }
      });

      const firstPoint = match.monthRows[0];
      const lastPoint = match.monthRows[match.monthRows.length - 1];
      if (firstPoint && lastPoint) {
        const firstXY = projection([firstPoint.longitude, firstPoint.latitude]);
        const lastXY = projection([lastPoint.longitude, lastPoint.latitude]);
        group
          .append("circle")
          .attr("cx", firstXY[0])
          .attr("cy", firstXY[1])
          .attr("r", 3.2)
          .attr("fill", "#f5f0e3")
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
          .style("pointer-events", "none");
        group
          .append("circle")
          .attr("cx", lastXY[0])
          .attr("cy", lastXY[1])
          .attr("r", 3.2)
          .attr("fill", color)
          .attr("stroke", "#f5f0e3")
          .attr("stroke-width", 1)
          .style("pointer-events", "none");
      }
    });

    const legend = svg
      .append("g")
      .attr("class", "map-legend")
      .attr("transform", `translate(${width - 205}, ${height - 22})`);
    legend
      .append("line")
      .attr("class", "map-legend-line")
      .attr("x1", 0)
      .attr("x2", 26)
      .attr("y1", 0)
      .attr("y2", 0);
    legend
      .append("text")
      .attr("x", 34)
      .attr("y", 4)
      .text("recorded monthly route");

    svg.on("click", (event) => {
      if (event.target.closest?.(".route-hit, .route-point")) return;
      const [x, y] = d3.pointer(event, svg.node());
      const coordinate = projection.invert([x, y]);
      if (!coordinate) return;
      const [longitude, latitude] = coordinate;
      if (
        longitude < REGION.west ||
        longitude > REGION.east ||
        latitude < REGION.south ||
        latitude > REGION.north
      )
        return;

      state.center = [longitude, latitude];
      dom.locationOutput.value = formatCoordinate(state.center);
      markDirty();
      renderSearchMarkerOnly();
    });
  }

  function renderSearchMarkerOnly() {
    window.dispatchEvent(
      new CustomEvent("drift:search-marker", {
        detail: { center: [...state.center], radiusKm: state.radiusKm },
      }),
    );
    if (!state.projection) return;
    const path = d3.geoPath(state.projection);
    const layer = dom.mapSvg.select(".search-layer");
    layer
      .select(".search-area")
      .datum(
        d3
          .geoCircle()
          .center(state.center)
          .radius(state.radiusKm / 111.32)
          .precision(2)(),
      )
      .attr("d", path);
    const point = state.projection(state.center);
    layer
      .select(".search-center-outer")
      .attr("cx", point[0])
      .attr("cy", point[1]);
    layer
      .select(".search-center-inner")
      .attr("cx", point[0])
      .attr("cy", point[1]);
  }

  function bindRouteInteraction(selection, match) {
    selection
      .on("pointerenter", (event) => {
        state.hoveredId = match.id;
        updateRouteClasses();
        showTooltip(event, match);
      })
      .on("pointermove", (event) => showTooltip(event, match))
      .on("pointerleave", () => {
        state.hoveredId = null;
        updateRouteClasses();
        hideTooltip();
      })
      .on("focus", (event) => {
        state.hoveredId = match.id;
        updateRouteClasses();
        showTooltip(event, match, true);
      })
      .on("blur", () => {
        state.hoveredId = null;
        updateRouteClasses();
        hideTooltip();
      })
      .on("click", (event) => {
        event.stopPropagation();
        selectRoute(match.id);
      })
      .on("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRoute(match.id);
        }
      });
  }

  function updateRouteClasses() {
    const layer = dom.mapSvg
      .select(".routes-layer")
      .classed("has-selection", Boolean(state.selectedId))
      .classed("has-hover", Boolean(state.hoveredId));
    layer
      .selectAll(".route-group")
      .classed("is-selected", function selected() {
        return this.dataset.id === state.selectedId;
      })
      .classed("is-hovered", function hovered() {
        return this.dataset.id === state.hoveredId;
      });
  }

  function showTooltip(event, match, fromKeyboard = false) {
    const frameRect = dom.mapFrame.getBoundingClientRect();
    let left;
    let top;
    if (fromKeyboard) {
      const point = state.projection([
        match.closestRow.longitude,
        match.closestRow.latitude,
      ]);
      left = point[0] + 14;
      top = point[1] - 34;
    } else {
      left = event.clientX - frameRect.left + 14;
      top = event.clientY - frameRect.top - 18;
    }
    left = Math.min(Math.max(10, left), frameRect.width - 225);
    top = Math.min(Math.max(10, top), frameRect.height - 104);
    const status = drogueStatus(match.closestRow);
    dom.tooltip.innerHTML = `
      <strong>Drifter ${shortId(match.id)}</strong>
      ${match.monthRows.length} positions in ${MONTHS[state.month]}<br>
      Closest recorded point: ${match.closestDistanceKm.toFixed(0)} km<br>
      ${status.label}
    `;
    dom.tooltip.style.left = `${left}px`;
    dom.tooltip.style.top = `${top}px`;
    dom.tooltip.hidden = false;
  }

  function hideTooltip() {
    dom.tooltip.hidden = true;
  }

  function renderRouteIndex() {
    dom.routeIndexTitle.textContent = `${MONTHS[state.month]} routes`;
    dom.routeList.replaceChildren();

    if (!state.matches.length) {
      const message = document.createElement("p");
      message.className = "no-results";
      message.textContent =
        "No drifter in this extract recorded the selected place and month. Try a wider radius, another month, or a new point on the map.";
      dom.routeList.append(message);
      dom.routeDetail.innerHTML = `
        <p class="detail-prompt">This is a gap in the archive, not evidence that the water stood still.</p>
      `;
      return;
    }

    state.visibleMatches.forEach((match) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `route-result${state.selectedId === match.id ? " is-selected" : ""}`;
      button.dataset.id = match.id;
      button.innerHTML = `
        <span class="swatch" style="background:${match.color || COLORS[state.visibleMatches.indexOf(match) % COLORS.length]}"></span>
        <strong>Drifter ${shortId(match.id)}</strong>
        <small>${match.closestDistanceKm.toFixed(0)} km</small>
      `;
      button.addEventListener("click", () => selectRoute(match.id));
      button.addEventListener("pointerenter", () => {
        state.hoveredId = match.id;
        updateRouteClasses();
      });
      button.addEventListener("pointerleave", () => {
        state.hoveredId = null;
        updateRouteClasses();
      });
      dom.routeList.append(button);
    });

    if (state.matches.length > state.visibleMatches.length) {
      const note = document.createElement("p");
      note.className = "route-limit-note";
      note.textContent = `${state.matches.length} drifters matched. The ${MAX_VISIBLE_TRACKS} with the most nearby observations are drawn to keep the map readable.`;
      dom.routeList.append(note);
    }

    if (state.selectedId) renderRouteDetail(state.selectedId);
    else
      dom.routeDetail.innerHTML = `<p class="detail-prompt">Select a route on the map or in the index.</p>`;
  }

  function renderRouteDetail(id) {
    const match = state.visibleMatches.find((item) => item.id === id);
    if (!match) return;
    const status = drogueStatus(match.closestRow);
    const speed = Number.isFinite(match.averageSpeed)
      ? `${match.averageSpeed.toFixed(2)} m/s`
      : "Not available";
    const temperature = Number.isFinite(match.averageTemperature)
      ? `${match.averageTemperature.toFixed(1)} °C`
      : "Not available";
    const segmentCount = match.segments.length;

    dom.routeDetail.innerHTML = `
      <h4 id="detail-title">Drifter ${shortId(match.id)}</h4>
      <p class="detail-subtitle">NOAA ID ${match.id}</p>
      <dl class="detail-ledger">
        <div><dt>Visible period</dt><dd>${formatUtc(match.first)} to ${formatUtc(match.last)}</dd></div>
        <div><dt>Positions in month</dt><dd>${match.monthRows.length.toLocaleString()}</dd></div>
        <div><dt>Points inside radius</dt><dd>${match.matchedCount.toLocaleString()}</dd></div>
        <div><dt>Closest point</dt><dd>${match.closestDistanceKm.toFixed(1)} km away</dd></div>
        <div><dt>Status near search point</dt><dd class="${status.className}">${status.label}</dd></div>
        <div><dt>Mean horizontal speed</dt><dd>${speed}</dd></div>
        <div><dt>Mean recorded SST</dt><dd>${temperature}</dd></div>
      </dl>
      <p class="detail-note">The visible route is split into ${segmentCount} ${segmentCount === 1 ? "segment" : "segments"} wherever this regional extract has a gap longer than 12 hours.</p>
      <button class="follow-button" type="button" data-follow-id="${match.id}">Follow this drifter through 2024</button>
    `;
    dom.routeDetail
      .querySelector("[data-follow-id]")
      ?.addEventListener("click", () => openJourney(match.id));
    dom.routeDetail.querySelector("[data-follow-id]").disabled = state.dirty;
  }

  function stopJourney() {
    if (state.journeyTimer) window.clearInterval(state.journeyTimer);
    state.journeyTimer = null;
    dom.journeyPlay.textContent = "Play route";
    dom.journeyPlay.setAttribute("aria-pressed", "false");
  }

  function journeyStage(row, encounter) {
    const distance = haversineKm(state.journeyCenter, [
      row.longitude,
      row.latitude,
    ]);
    if (distance <= state.journeyRadiusKm) return "Near your selected place";
    return row.time < encounter.time
      ? "Before the encounter"
      : "After the encounter";
  }

  function updateJourney(index) {
    const rows = state.byId.get(state.journeyId) || [];
    const match = state.matches.find((item) => item.id === state.journeyId);
    if (!rows.length || !match) return;

    state.journeyIndex = Math.max(0, Math.min(rows.length - 1, Number(index)));
    dom.journeyRange.value = String(state.journeyIndex);
    const row = rows[state.journeyIndex];
    window.dispatchEvent(
      new CustomEvent("drift:position", {
        detail: { id: state.journeyId, rows, index: state.journeyIndex },
      }),
    );
    const distance = haversineKm(state.journeyCenter, [
      row.longitude,
      row.latitude,
    ]);
    const status = drogueStatus(row);

    dom.journeyStage.textContent = journeyStage(row, match.closestRow);
    dom.journeyDate.textContent = formatUtc(row.time, true);
    dom.journeyPosition.textContent = formatCoordinate([
      row.longitude,
      row.latitude,
    ]);
    dom.journeyDistance.textContent = `${distance.toFixed(0)} km`;
    dom.journeyDrogue.textContent = status.label.replace("Drogue ", "");

    const projection = dom.journeySvg.node().__projection;
    if (!projection) return;
    const [x, y] = projection([row.longitude, row.latitude]);
    dom.journeySvg.select(".journey-current").attr("cx", x).attr("cy", y);

    const travelledRows = rows.slice(0, state.journeyIndex + 1);
    const line = d3
      .line()
      .x((point) => projection([point.longitude, point.latitude])[0])
      .y((point) => projection([point.longitude, point.latitude])[1])
      .curve(d3.curveLinear);
    const travelledLayer = dom.journeySvg.select(".journey-travelled");
    travelledLayer
      .selectAll("path")
      .data(splitAtGaps(travelledRows).filter((segment) => segment.length > 1))
      .join("path")
      .attr("d", line);
  }

  function renderJourney() {
    const rows = state.byId.get(state.journeyId) || [];
    const match = state.matches.find((item) => item.id === state.journeyId);
    if (!rows.length || !match) return;

    const width = Math.max(
      620,
      Math.round(dom.journeySvg.node().getBoundingClientRect().width || 1100),
    );
    const height = 420;
    const projection = projectionFor(
      width,
      height,
      window.innerWidth <= 760 ? 28 : 42,
    );
    dom.journeySvg.node().__projection = projection;
    const geoPath = d3.geoPath(projection);
    const line = d3
      .line()
      .x((row) => projection([row.longitude, row.latitude])[0])
      .y((row) => projection([row.longitude, row.latitude])[1])
      .curve(d3.curveLinear);

    dom.journeySvg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .selectAll("*")
      .remove();
    dom.journeySvg
      .append("rect")
      .attr("class", "journey-ocean")
      .attr("width", width)
      .attr("height", height);
    dom.journeySvg
      .append("path")
      .datum(
        d3
          .geoGraticule()
          .extent([
            [REGION.west, REGION.south],
            [REGION.east, REGION.north],
          ])
          .step([5, 5])(),
      )
      .attr("class", "journey-graticule")
      .attr("d", geoPath);
    dom.journeySvg
      .append("path")
      .datum(state.land)
      .attr("class", "journey-land")
      .attr("d", geoPath);

    const fullLayer = dom.journeySvg
      .append("g")
      .attr("class", "journey-full-route");
    fullLayer
      .selectAll("path")
      .data(splitAtGaps(rows).filter((segment) => segment.length > 1))
      .join("path")
      .attr("d", line);
    dom.journeySvg.append("g").attr("class", "journey-travelled");

    dom.journeySvg
      .append("path")
      .datum(
        d3
          .geoCircle()
          .center(state.journeyCenter)
          .radius(state.journeyRadiusKm / 111.32)
          .precision(2)(),
      )
      .attr("class", "journey-search-area")
      .attr("d", geoPath);
    const encounterXY = projection([
      match.closestRow.longitude,
      match.closestRow.latitude,
    ]);
    dom.journeySvg
      .append("circle")
      .attr("class", "journey-encounter")
      .attr("cx", encounterXY[0])
      .attr("cy", encounterXY[1])
      .attr("r", 7);
    dom.journeySvg
      .append("circle")
      .attr("class", "journey-current")
      .attr("r", 5);
    const labels = dom.journeySvg.append("g");
    addCoordinateLabels(labels, projection, width, height);
    labels.selectAll("text").classed("journey-coordinate", true);

    dom.journeyRange.max = String(rows.length - 1);
    dom.journeyRange.value = "0";
    dom.journeyId.textContent = `NOAA ${state.journeyId}`;
    document.querySelector("#journey-title").textContent =
      `Drifter ${shortId(state.journeyId)}`;
    dom.journeyIntro.textContent = `Closest pass: ${formatUtc(match.closestRow.time)} - ${match.closestDistanceKm.toFixed(0)} km from your place.`;
    dom.journeyBoundaryNote.textContent =
      "Visible 2024 regional record. Gaps and boundaries can shorten the track. Playback is accelerated; the water is illustrative.";
    document.querySelector("#journey-first").textContent = formatUtc(
      rows[0].time,
    );
    document.querySelector("#journey-last").textContent = formatUtc(
      rows[rows.length - 1].time,
    );
    updateJourney(state.journeyIndex);
  }

  function openJourney(id) {
    if (state.dirty) return;
    stopJourney();
    state.journeyId = id;
    state.journeyCenter = [...state.center];
    state.journeyRadiusKm = state.radiusKm;
    state.journeyIndex = 0;
    dom.journeyEmpty.hidden = true;
    dom.journeyPlayer.hidden = false;
    dom.journey.hidden = false;
    renderJourney();
    window.dispatchEvent(new CustomEvent("drift:opened"));
  }

  function bindJourney() {
    document.querySelector("#jump-encounter").addEventListener("click", () => {
      const match = state.matches.find((item) => item.id === state.journeyId);
      const rows = state.byId.get(state.journeyId) || [];
      if (!match) return;
      stopJourney();
      updateJourney(
        rows.findIndex(
          (row) => row.time.getTime() === match.closestRow.time.getTime(),
        ),
      );
    });
    dom.journeyRange.addEventListener("input", () => {
      stopJourney();
      updateJourney(dom.journeyRange.value);
    });
    dom.journeyPlay.addEventListener("click", () => {
      if (state.journeyTimer) {
        stopJourney();
        return;
      }
      const rows = state.byId.get(state.journeyId) || [];
      if (!rows.length) return;
      if (state.journeyIndex >= rows.length - 1) updateJourney(0);
      dom.journeyPlay.textContent = "Pause";
      dom.journeyPlay.setAttribute("aria-pressed", "true");
      const step = Math.max(1, Math.ceil(rows.length / 240));
      state.journeyTimer = window.setInterval(() => {
        const next = Math.min(rows.length - 1, state.journeyIndex + step);
        updateJourney(next);
        if (next >= rows.length - 1) stopJourney();
      }, 55);
    });
  }

  function selectRoute(id) {
    if (state.dirty) return;
    state.selectedId = state.selectedId === id ? null : id;
    window.dispatchEvent(
      new CustomEvent("drift:selection", { detail: { id: state.selectedId } }),
    );
    updateRouteClasses();
    document.querySelectorAll(".route-result").forEach((button) => {
      button.classList.toggle(
        "is-selected",
        button.dataset.id === state.selectedId,
      );
    });
    if (state.selectedId) renderRouteDetail(state.selectedId);
    else
      dom.routeDetail.innerHTML = `<p class="detail-prompt">Select a route on the map or in the index.</p>`;
  }

  function markDirty() {
    state.dirty = true;
    window.dispatchEvent(new CustomEvent("drift:pending"));
    dom.searchButton.classList.add("is-dirty");
    dom.resultSummary.textContent =
      "Select Find drifters to update the results for these search conditions.";
    document
      .querySelectorAll(".route-result, [data-follow-id]")
      .forEach((button) => {
        button.disabled = true;
      });
  }

  function runSearch({ preserveSelection = false } = {}) {
    if (!state.land) return;
    if (!preserveSelection) {
      state.selectedId = null;
      stopJourney();
      state.journeyId = null;
      dom.journeyPlayer.hidden = true;
      dom.journeyEmpty.hidden = false;
      window.dispatchEvent(new CustomEvent("drift:reset"));
      dom.journeyIntro.textContent =
        "Choose a route above, then follow its visible 2024 record before and after it came near your selected place.";
    }
    state.matches = findMatches(state.month, state.center, state.radiusKm);
    state.visibleMatches = state.matches.slice(0, MAX_VISIBLE_TRACKS);
    state.dirty = false;
    dom.searchButton.classList.remove("is-dirty");

    renderMap();
    renderRouteIndex();
    publishAtlas();

    const place = formatCoordinate(state.center);
    const month = MONTHS[state.month];
    if (state.matches.length) {
      const visibleNote =
        state.matches.length > MAX_VISIBLE_TRACKS
          ? ` ${MAX_VISIBLE_TRACKS} are drawn.`
          : "";
      dom.resultSummary.textContent = `${state.matches.length} ${state.matches.length === 1 ? "drifter passed" : "drifters passed"} within ${state.radiusKm} km of ${place} in ${month} 2024.${visibleNote}`;
    } else {
      dom.resultSummary.textContent = `No drifter in this extract passed within ${state.radiusKm} km of ${place} in ${month} 2024.`;
    }
  }

  function setDefaultSearch() {
    state.month = DEFAULT_STATE.month;
    state.center = [...DEFAULT_STATE.center];
    state.radiusKm = DEFAULT_STATE.radiusKm;
    dom.month.value = String(state.month);
    dom.radius.value = String(state.radiusKm);
    dom.radiusOutput.value = `${state.radiusKm} km`;
    dom.locationOutput.value = formatCoordinate(state.center);
    runSearch();
  }

  function publishAtlas() {
    const contextRoutes = [...state.byMonthId[state.month].entries()].map(
      ([id, rows]) => ({ id, segments: splitAtGaps(rows) }),
    );
    const detail = {
      land: state.land,
      matches: state.visibleMatches,
      contextRoutes,
      center: [...state.center],
      radiusKm: state.radiusKm,
      month: state.month,
      count: state.matches.length,
    };
    window.driftAtlasSnapshot = detail;
    window.dispatchEvent(new CustomEvent("drift:results", { detail }));
  }

  function bindControls() {
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });

    dom.month.addEventListener("change", () => {
      state.month = Number(dom.month.value);
      runSearch();
    });
    dom.radius.addEventListener("change", () => runSearch());

    dom.radius.addEventListener("input", () => {
      state.radiusKm = Number(dom.radius.value);
      dom.radiusOutput.value = `${state.radiusKm} km`;
      markDirty();
      renderSearchMarkerOnly();
    });

    dom.exampleButton.addEventListener("click", setDefaultSearch);
    document.querySelector("#quick-follow").addEventListener("click", () => {
      setDefaultSearch();
      if (state.visibleMatches[0]) openJourney(state.visibleMatches[0].id);
    });
    window.addEventListener("drift:search-open", () => {
      if (state.data.length) {
        renderMap();
        publishAtlas();
      }
    });
    window.addEventListener("drift:place", (event) => {
      state.center = [...event.detail.center];
      dom.locationOutput.value = formatCoordinate(state.center);
      runSearch();
    });
    window.addEventListener("drift:select", (event) =>
      selectRoute(event.detail.id),
    );
    window.addEventListener("drift:home", stopJourney);
  }

  async function load() {
    bindControls();
    bindJourney();

    try {
      const [csvText, topology] = await Promise.all([
        d3.text(DATA_URL),
        d3.json(LAND_URL),
      ]);

      const rows = d3.csvParse(csvText);
      state.data = rows
        .filter((row) => row.ID && row.time)
        .map((row) => {
          const time = parseDate(row.time);
          const latitude = cleanNumber(row.latitude);
          const longitude = cleanNumber(row.longitude);
          const ve = cleanNumber(row.ve);
          const vn = cleanNumber(row.vn);
          const sst = cleanNumber(row.sst);
          return {
            id: row.ID,
            time,
            month: time?.getUTCMonth(),
            latitude,
            longitude,
            ve,
            vn,
            speed:
              Number.isFinite(ve) && Number.isFinite(vn)
                ? Math.hypot(ve, vn)
                : null,
            sst,
            drogueLostRaw: row.drogue_lost_date,
            drogueLostDate: parseDate(row.drogue_lost_date),
          };
        })
        .filter(
          (row) =>
            row.time &&
            Number.isFinite(row.latitude) &&
            Number.isFinite(row.longitude) &&
            row.month >= 0 &&
            row.month <= 11,
        );

      for (const row of state.data) {
        if (!state.byId.has(row.id)) state.byId.set(row.id, []);
        state.byId.get(row.id).push(row);
        state.byMonth[row.month].push(row);
        if (!state.byMonthId[row.month].has(row.id))
          state.byMonthId[row.month].set(row.id, []);
        state.byMonthId[row.month].get(row.id).push(row);
      }

      for (const monthMap of state.byMonthId) {
        for (const monthRows of monthMap.values())
          monthRows.sort((a, b) => a.time - b.time);
      }
      for (const rowsForId of state.byId.values())
        rowsForId.sort((a, b) => a.time - b.time);

      state.land = topojson.feature(topology, topology.objects.land);
      renderHero();
      setDefaultSearch();
      dom.mapLoading.classList.add("is-hidden");
      document.querySelector("#quick-follow").disabled = false;
      document.querySelector("#quick-follow").textContent =
        "Follow a drifter first";

      let resizeTimer;
      const observer = new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          renderHero();
          renderMap();
          if (state.journeyId) renderJourney();
        }, 120);
      });
      observer.observe(dom.mapFrame);
    } catch (error) {
      console.error(error);
      dom.mapLoading.textContent =
        "The local data could not be opened. Run this project through a local web server or GitHub Pages.";
      dom.resultSummary.textContent = "Data loading failed.";
    }
  }

  load();
})();
