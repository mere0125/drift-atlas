import * as THREE from "./vendor/three.min.js";

const radians = Math.PI / 180;
const mercatorY = (latitude) =>
  Math.log(
    Math.tan(
      Math.PI / 4 + (Math.max(-85, Math.min(85, latitude)) * radians) / 2,
    ),
  );
const scale = 240 / (35 * radians);
const middleY = (mercatorY(30) + mercatorY(50)) / 2;
export const mapHeight = (mercatorY(50) - mercatorY(30)) * scale;

export function geoToWorld(longitude, latitude, height = 1.8) {
  return new THREE.Vector3(
    (longitude + 57.5) * radians * scale,
    height,
    -(mercatorY(latitude) - middleY) * scale,
  );
}

export function worldToGeo(point) {
  return [
    point.x / scale / radians - 57.5,
    (2 * Math.atan(Math.exp(-point.z / scale + middleY)) - Math.PI / 2) /
      radians,
  ];
}

function clipRing(ring) {
  let result = ring.map(([lon, lat]) => {
    const p = geoToWorld(lon, lat);
    return [p.x, -p.z];
  });
  const boundaries = [
    { axis: 0, value: -120, sign: 1 },
    { axis: 0, value: 120, sign: -1 },
    { axis: 1, value: -mapHeight / 2, sign: 1 },
    { axis: 1, value: mapHeight / 2, sign: -1 },
  ];
  for (const { axis, value, sign } of boundaries) {
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const insideA = (a[axis] - value) * sign >= 0,
        insideB = (b[axis] - value) * sign >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
  }
  return result;
}

function textSprite(text, width = 15, color = "#e7ead6", italic = false) {
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  measure.font = `${italic ? "italic " : ""}56px Georgia`;
  canvas.width = Math.ceil(measure.measureText(text).width) + 30;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.font = `${italic ? "italic " : ""}56px Georgia`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }),
  );
  sprite.scale.set(width, (width * canvas.height) / canvas.width, 1);
  return sprite;
}

function clearGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        material.map?.dispose();
        material.dispose();
      }
    }
  });
  group.clear();
}

export function createAtlas({ scene, camera, canvas }) {
  const root = new THREE.Group();
  scene.add(root);
  root.visible = false;
  const landGroup = new THREE.Group(),
    gridGroup = new THREE.Group(),
    contextGroup = new THREE.Group(),
    routesGroup = new THREE.Group(),
    searchGroup = new THREE.Group();
  root.add(landGroup, gridGroup, contextGroup, routesGroup, searchGroup);
  let land = null,
    initialized = false,
    searching = false,
    matches = [],
    hoverId = null,
    selectedId = null,
    pending = false;
  let pickable = [];
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 2.2;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.8);
  const tooltip = document.querySelector("#ocean-tooltip");

  function line(points, color, opacity = 1, dashed = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity,
          dashSize: 1.2,
          gapSize: 1,
          toneMapped: false,
        })
      : new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          toneMapped: false,
        });
    const object = new THREE.Line(geometry, material);
    if (dashed) object.computeLineDistances();
    return object;
  }

  function buildCoast(feature) {
    if (initialized) return;
    initialized = true;
    land = feature;
    const geometries =
      feature.type === "FeatureCollection"
        ? feature.features.map((item) => item.geometry)
        : [feature.geometry || feature];
    const polygons = geometries.flatMap((geometry) =>
      geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : geometry.type === "Polygon"
          ? [geometry.coordinates]
          : [],
    );
    for (const polygon of polygons) {
      const outline = clipRing(polygon[0]);
      if (outline.length < 3) continue;
      const shape = new THREE.Shape(
        outline.map(([x, y]) => new THREE.Vector2(x, y)),
      );
      for (const hole of polygon.slice(1)) {
        const clipped = clipRing(hole);
        if (clipped.length > 2)
          shape.holes.push(
            new THREE.Path(clipped.map(([x, y]) => new THREE.Vector2(x, y))),
          );
      }
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 1.55, 0);
      const top = new THREE.MeshBasicMaterial({
        color: 0xbedace,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        toneMapped: false,
      });
      top.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec2 vPaperPosition;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvPaperPosition=position.xz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec2 vPaperPosition;",
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            float hatch=smoothstep(0.94,0.99,fract((vPaperPosition.x+vPaperPosition.y)*0.65));
            float edge=min(120.0-abs(vPaperPosition.x),${(mapHeight / 2).toFixed(6)}-abs(vPaperPosition.y));
            diffuseColor.a*=smoothstep(0.0,12.0,edge)*(0.7+hatch*0.3);`,
          );
      };
      landGroup.add(new THREE.Mesh(geometry, top));
      let coast = [];
      const addCoast = () => {
        if (coast.length > 1) {
          const stroke = line(coast, 0xd9f0df, 0.58);
          stroke.material.depthTest = false;
          landGroup.add(stroke);
        }
        coast = [];
      };
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i],
          b = outline[(i + 1) % outline.length];
        const cutEdge =
          (Math.abs(Math.abs(a[0]) - 120) < 0.0001 &&
            Math.abs(a[0] - b[0]) < 0.0001) ||
          (Math.abs(Math.abs(a[1]) - mapHeight / 2) < 0.0001 &&
            Math.abs(a[1] - b[1]) < 0.0001);
        if (cutEdge) {
          addCoast();
          continue;
        }
        if (!coast.length) coast.push(new THREE.Vector3(a[0], 1.7, -a[1]));
        coast.push(new THREE.Vector3(b[0], 1.7, -b[1]));
      }
      addCoast();
    }
    for (let lon = -75; lon <= -40; lon += 5) {
      gridGroup.add(
        line(
          [geoToWorld(lon, 30, 0.8), geoToWorld(lon, 50, 0.8)],
          0xc4e9df,
          0.11,
        ),
      );
      const label = textSprite(`${Math.abs(lon)}°W`, 9);
      label.position.copy(geoToWorld(lon, 29.2, 2));
      gridGroup.add(label);
    }
    for (let lat = 30; lat <= 50; lat += 5) {
      gridGroup.add(
        line(
          [geoToWorld(-75, lat, 0.8), geoToWorld(-40, lat, 0.8)],
          0xc4e9df,
          0.11,
        ),
      );
      const label = textSprite(`${lat}°N`, 9);
      label.position.copy(geoToWorld(-76.6, lat, 2));
      gridGroup.add(label);
    }
    const oceanTitle = textSprite("North Atlantic", 42, "#d0e7df", true);
    oceanTitle.position.copy(geoToWorld(-49, 33, 1));
    oceanTitle.material.opacity = 0.42;
    gridGroup.add(oceanTitle);
    const north = textSprite("N", 4);
    north.position.copy(geoToWorld(-39.1, 50.6, 2));
    gridGroup.add(north);
    const np = geoToWorld(-39.1, 48.6, 1.8);
    gridGroup.add(
      line([np, np.clone().add(new THREE.Vector3(0, 0, -11))], 0xe4e9d2, 0.8),
    );
  }

  function setSearch(center, radiusKm) {
    clearGroup(searchGroup);
    const points = [];
    const angular = radiusKm / 6371,
      lat1 = center[1] * radians,
      lon1 = center[0] * radians;
    for (let i = 0; i <= 128; i++) {
      const bearing = (i / 128) * Math.PI * 2;
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angular) +
          Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
      );
      const lon2 =
        lon1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
          Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
        );
      points.push(geoToWorld(lon2 / radians, lat2 / radians, 2));
    }
    searchGroup.add(line(points, 0xffdc9c, 0.9, true));
    const centerPoint = geoToWorld(...center, 2);
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdc9c }),
    );
    pin.position.copy(centerPoint);
    searchGroup.add(pin);
    searchGroup.add(
      line(
        [centerPoint, centerPoint.clone().add(new THREE.Vector3(0, 7, 0))],
        0xffdc9c,
        0.7,
      ),
    );
    const label = textSprite("your place", 14, "#ffdfae", true);
    label.position.copy(centerPoint).add(new THREE.Vector3(0, 10, 0));
    searchGroup.add(label);
  }

  function setResults(detail) {
    buildCoast(detail.land);
    matches = detail.matches;
    pending = false;
    selectedId = null;
    routesGroup.visible = true;
    clearGroup(contextGroup);
    const brightIds = new Set(matches.map((match) => match.id));
    for (const route of detail.contextRoutes || []) {
      if (brightIds.has(route.id)) continue;
      for (const segment of route.segments) {
        if (segment.length < 2) continue;
        contextGroup.add(
          line(
            segment.map((row) => geoToWorld(row.longitude, row.latitude, 1.6)),
            0xd0e4d9,
            0.2,
          ),
        );
      }
    }
    clearGroup(routesGroup);
    pickable = [];
    for (const match of matches) {
      const group = new THREE.Group();
      group.userData.id = match.id;
      routesGroup.add(group);
      const addSegment = (rows) => {
        if (!rows.length) return;
        const positions = rows.map((row) =>
          geoToWorld(row.longitude, row.latitude, 2.1),
        );
        if (positions.length > 1) {
          const vertices = [],
            indices = [];
          positions.forEach((position, i) => {
            const tangent = positions[Math.min(i + 1, positions.length - 1)]
              .clone()
              .sub(positions[Math.max(0, i - 1)])
              .normalize();
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
            for (let j = 0; j < 4; j++) {
              const angle = (j * Math.PI) / 2;
              const v = position
                .clone()
                .addScaledVector(side, Math.cos(angle) * 0.2);
              v.y += Math.sin(angle) * 0.2;
              vertices.push(v.x, v.y, v.z);
            }
            if (i > 0)
              for (let j = 0; j < 4; j++) {
                const a = (i - 1) * 4 + j,
                  b = (i - 1) * 4 + ((j + 1) % 4),
                  c = i * 4 + j,
                  d = i * 4 + ((j + 1) % 4);
                indices.push(a, c, b, b, c, d);
              }
          });
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
          );
          geometry.setIndex(indices);
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: match.color,
              transparent: true,
              opacity: 0.98,
              toneMapped: false,
              side: THREE.DoubleSide,
            }),
          );
          group.add(mesh);
          const hit = line(positions, match.color, 0);
          hit.userData.id = match.id;
          group.add(hit);
          pickable.push(hit);
        }
        const end = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 10, 8),
          new THREE.MeshBasicMaterial({ color: match.color }),
        );
        end.position.copy(positions.at(-1));
        group.add(end);
      };
      match.segments.forEach(addSegment);
    }
    setSearch(detail.center, detail.radiusKm);
  }

  function highlight(id) {
    hoverId = id;
    routesGroup.children.forEach((group) => {
      const emphasis = id || selectedId;
      const alpha = emphasis && group.userData.id !== emphasis ? 0.22 : 0.98;
      group.children.forEach((child) => {
        if (child.material && child.material.opacity !== 0)
          child.material.opacity = alpha;
      });
    });
  }
  function setSelected(id) {
    selectedId = id;
    highlight(hoverId);
  }
  function setPending() {
    pending = true;
    routesGroup.visible = false;
    if (tooltip) tooltip.hidden = true;
  }
  function setSearching(value) {
    searching = value;
    root.visible = value;
    if (!value && tooltip) tooltip.hidden = true;
  }
  function showAbove(value) {
    root.visible = value;
    routesGroup.visible = searching && !pending;
    contextGroup.visible = searching;
  }

  function hitAt(event) {
    const point = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      (-event.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(point, camera);
    const hit = !pending
      ? raycaster.intersectObjects(pickable, false)[0]
      : null;
    const world = new THREE.Vector3();
    const intersection = raycaster.ray.intersectPlane(plane, world);
    return {
      id: hit?.object.userData.id,
      coordinate: intersection ? worldToGeo(world) : null,
    };
  }

  canvas.addEventListener("pointermove", (event) => {
    if (!searching) return;
    const hit = hitAt(event);
    highlight(hit.id || null);
    canvas.style.cursor = hit.id ? "pointer" : "crosshair";
    if (tooltip) {
      tooltip.hidden = !hit.id;
      if (hit.id) {
        const match = matches.find((item) => item.id === hit.id);
        tooltip.textContent = `Drifter ${hit.id.slice(-6)} - ${match?.closestDistanceKm.toFixed(0)} km from your place`;
        tooltip.style.left = `${Math.min(window.innerWidth - 260, event.clientX + 14)}px`;
        tooltip.style.top = `${event.clientY + 15}px`;
      }
    }
  });
  canvas.addEventListener("pointerleave", () => {
    highlight(null);
    if (tooltip) tooltip.hidden = true;
  });

  function pick(event) {
    if (!searching) return;
    const { id, coordinate } = hitAt(event);
    if (id) {
      window.dispatchEvent(new CustomEvent("drift:select", { detail: { id } }));
      return;
    }
    if (!coordinate) return;
    const [lon, lat] = coordinate;
    if (lon < -75 || lon > -40 || lat < 30 || lat > 50) {
      window.dispatchEvent(
        new CustomEvent("drift:notice", {
          detail: { text: "This archive covers 30–50°N and 75–40°W." },
        }),
      );
      return;
    }
    if (land && window.d3.geoContains(land, coordinate)) {
      window.dispatchEvent(
        new CustomEvent("drift:notice", {
          detail: { text: "Choose a point in the water." },
        }),
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent("drift:place", { detail: { center: coordinate } }),
    );
  }

  return {
    root,
    setResults,
    setSearch,
    setSearching,
    showAbove,
    setSelected,
    setPending,
    pick,
    highlight,
  };
}
