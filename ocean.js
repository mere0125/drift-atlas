import * as THREE from "./vendor/three.min.js";
import { Water } from "./vendor/Water.js";
import { Sky } from "./vendor/Sky.js";
import { createAtlas, geoToWorld } from "./atlas-scene.js";

const canvas = document.querySelector("#ocean-scene");
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

try {
  const mobile = window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcde6ec, 0.00048);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 18000);
  camera.position.set(0, 4, 24);
  const target = new THREE.Vector3(0, 1, -70);
  camera.lookAt(target);

  const sky = new Sky();
  sky.scale.setScalar(12000);
  sky.material.uniforms.turbidity.value = 2.6;
  sky.material.uniforms.rayleigh.value = 2.6;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.83;
  const sun = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(61),
    THREE.MathUtils.degToRad(151),
  );
  sky.material.uniforms.sunPosition.value.copy(sun);

  // Slowly advected procedural cloud banks also appear in the water's reflected sky.
  sky.material.uniforms.cloudTime = { value: 0 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace(
      "void main() {",
      `
    uniform float cloudTime;
    float hashCloud(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noiseCloud(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hashCloud(i),hashCloud(i+vec2(1.,0.)),f.x),mix(hashCloud(i+vec2(0.,1.)),hashCloud(i+vec2(1.,1.)),f.x),f.y);
    }
    float fbmCloud(vec2 p) {
      float value=0.0, amplitude=0.5;
      for(int i=0;i<5;i++) { value+=amplitude*noiseCloud(p);p=mat2(1.6,-1.2,1.2,1.6)*p;amplitude*=0.5; }
      return value;
    }
    void main() {
  `,
    )
    .replace(
      "gl_FragColor = vec4( retColor, 1.0 );",
      `
    vec3 clearSky = mix(vec3(0.45,0.75,0.87),vec3(0.01,0.10,0.42),pow(max(direction.y,0.0),0.46));
    float sunGlow = pow(max(dot(direction,vSunDirection),0.0),18.0);
    clearSky += vec3(0.20,0.23,0.20)*sunGlow;
    retColor = mix(clearSky,retColor,sundisk*0.96);
    vec2 cp = direction.xz / max(direction.y + 0.23, 0.06) * 1.8;
    cp.x += cloudTime * 0.003;
    float cloud = fbmCloud(cp + vec2(9.4, 2.7));
    float detail = fbmCloud(cp * 3.0 + 4.0);
    float coverage = smoothstep(0.63, 0.87, cloud + detail * 0.13);
    coverage *= smoothstep(0.01, 0.2, direction.y) * 0.87;
    vec3 cloudColor = mix(vec3(0.65,0.76,0.84), vec3(1.36,1.45,1.44), smoothstep(0.48,0.78,cloud));
    retColor = mix(retColor, cloudColor, coverage);
    gl_FragColor = vec4(retColor, 1.0);
  `,
    );
  scene.add(sky);

  const normals = new THREE.TextureLoader().load("assets/waternormals.jpg");
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  function seaGeometry() {
    const rings = mobile ? 110 : 170,
      sectors = mobile ? 112 : 176;
    const positions = [],
      indices = [];
    for (let r = 0; r <= rings; r++) {
      const radius = Math.max(0.001, Math.pow(r / rings, 2.5) * 6000);
      for (let s = 0; s <= sectors; s++) {
        const angle = (s / sectors) * Math.PI * 2;
        positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < sectors; s++) {
        const a = r * (sectors + 1) + s,
          b = a + sectors + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const water = new Water(seaGeometry(), {
    textureWidth: mobile ? 256 : 512,
    textureHeight: mobile ? 256 : 512,
    waterNormals: normals,
    sunDirection: sun,
    sunColor: 0xeafaff,
    waterColor: 0x118f9a,
    distortionScale: 2.7,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 5.1;
  water.material.fragmentShader = water.material.fragmentShader
    .replace("float rf0 = 0.3;", "float rf0 = 0.07;")
    .replace(
      "sunColor * diffuseLight * 0.3",
      "sunColor * diffuseLight * 0.055",
    );

  const waveGLSL = `
    vec3 seaPosition = position;
    vec2 seaXZ = vec2(position.x, -position.y);
    float q1=seaXZ.x*0.15+seaXZ.y*0.06-time*0.8;
    float q2=seaXZ.x*-0.09+seaXZ.y*0.17+time*1.1;
    float q3=seaXZ.x*0.28+seaXZ.y*0.2-time*1.4;
    vWaveHeight=sin(q1)*0.7+sin(q2)*0.38+(sin(q3)+sin(q3*2.0)*0.18)*0.16;
    seaPosition.z+=vWaveHeight;
    vWaveSlope=vec2(cos(q1)*0.105-cos(q2)*0.0342+(cos(q3)+cos(q3*2.0)*0.36)*0.0448,
                    cos(q1)*0.042+cos(q2)*0.0646+(cos(q3)+cos(q3*2.0)*0.36)*0.032);
  `;
  water.material.vertexShader = water.material.vertexShader
    .replace(
      "uniform float time;",
      "uniform float time;\nvarying float vWaveHeight;\nvarying vec2 vWaveSlope;",
    )
    .replace(
      "mirrorCoord = modelMatrix * vec4( position, 1.0 );",
      `${waveGLSL}\n mirrorCoord = modelMatrix * vec4( seaPosition, 1.0 );`,
    )
    .replace(
      "modelViewMatrix * vec4( position, 1.0 )",
      "modelViewMatrix * vec4( seaPosition, 1.0 )",
    );
  water.material.fragmentShader = water.material.fragmentShader
    .replace(
      "varying vec4 worldPosition;",
      "varying vec4 worldPosition;\nvarying float vWaveHeight;\nvarying vec2 vWaveSlope;",
    )
    .replace(
      "vec4 noise = getNoise( worldPosition.xz * size );",
      "vec4 noise = getNoise( worldPosition.xz * size );\nvec4 capillary=getNoise(worldPosition.xz*size*3.1+vec2(time*0.4,0.0));",
    )
    .replace(
      "normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) )",
      "normalize(noise.xzy*vec3(0.82,1.0,0.82)+capillary.xzy*vec3(0.16,0.0,0.16)+vec3(-vWaveSlope.x,0.0,-vWaveSlope.y)*1.1)",
    )
    .replace(
      "vec3 outgoingLight = albedo;",
      "float crest=smoothstep(0.72,1.18,vWaveHeight)*smoothstep(0.12,0.72,noise.y);\nvec3 outgoingLight=mix(albedo,vec3(0.48,0.75,0.76),crest*0.06);",
    );
  scene.add(water);

  scene.add(new THREE.HemisphereLight(0xcde9f1, 0x123d45, 2.3));
  const sunlight = new THREE.DirectionalLight(0xe6f7ff, 3.8);
  sunlight.position.copy(sun).multiplyScalar(100);
  scene.add(sunlight);

  // Simplified instrument: surface sphere, protective frame, electronics and antenna.
  const drifter = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({
    color: 0xe79532,
    roughness: 0.48,
    metalness: 0.08,
  });
  const pale = new THREE.MeshStandardMaterial({
    color: 0xd6dfd8,
    roughness: 0.38,
    metalness: 0.28,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x45545b,
    roughness: 0.32,
    metalness: 0.7,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x153047,
    roughness: 0.2,
    metalness: 0.5,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.63, 32, 24), orange);
  body.scale.y = 0.8;
  drifter.add(body);
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.5, 0.15, 32),
    pale,
  );
  lid.position.y = 0.45;
  drifter.add(lid);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 1.48, 10),
    metal,
  );
  mast.position.y = 1.22;
  drifter.add(mast);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), pale);
  cap.position.y = 1.96;
  drifter.add(cap);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.022, 8, 40),
    metal,
  );
  ring.rotation.x = Math.PI / 2;
  drifter.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.75, 8),
      metal,
    );
    strut.position.set(Math.cos(a) * 0.42, 0.33, Math.sin(a) * 0.42);
    strut.rotation.z = Math.cos(a) * 0.4;
    strut.rotation.x = Math.sin(a) * 0.4;
    drifter.add(strut);
  }
  const electronics = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.21, 0.27),
    blue,
  );
  electronics.position.set(0.2, 0.61, 0);
  drifter.add(electronics);
  drifter.position.set(mobile ? 4.5 : 7, 0, -1);
  scene.add(drifter);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xdce5d9,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.74, 0.78, 80),
    haloMaterial,
  );
  halo.rotation.x = -Math.PI / 2;
  scene.add(halo);

  const pathGroup = new THREE.Group();
  const trackTime = { value: 0 };
  const recordedTime = { value: 0 },
    surfaceTrail = { value: 1 };
  const yearStart = Date.UTC(2024, 0, 1) / 1000;
  scene.add(pathGroup);
  const atlas = createAtlas({ scene, camera, canvas });
  let searching = false,
    atlasYaw = 0,
    atlasPitch = mobile ? 1.36 : 0.78,
    atlasZoom = 1;
  let drag = null;
  let surfaceOrbit = false,
    surfaceYaw = 0,
    surfacePitch = 0.12,
    surfaceDistance = 24;
  const touches = new Map();
  let pinchDistance = null;
  let rows = [],
    points = [],
    selectedIndex = 0,
    view = "surface",
    paused = reducedMotion,
    following = false;
  let pointer = { x: 0, y: 0 },
    elapsed = 0,
    last = 0,
    routeId = null;
  const wantedPosition = new THREE.Vector3();
  const wantedTarget = new THREE.Vector3();
  const tag = document.querySelector("#scene-tag");

  function oceanHeight(x, z, t) {
    return (
      Math.sin(x * 0.15 + z * 0.06 - t * 0.8) * 0.7 +
      Math.sin(x * -0.09 + z * 0.17 + t * 1.1) * 0.38 +
      (Math.sin(x * 0.28 + z * 0.2 - t * 1.4) +
        Math.sin((x * 0.28 + z * 0.2 - t * 1.4) * 2) * 0.18) *
        0.16
    );
  }

  function disposePaths() {
    while (pathGroup.children.length) {
      const child = pathGroup.children[0];
      child.geometry.dispose();
      child.material.dispose();
      pathGroup.remove(child);
    }
  }

  function setRoute(detail) {
    const previousPoint = points[selectedIndex]?.clone();
    const newRoute = routeId !== detail.id;
    if (newRoute) {
      surfaceOrbit = false;
      routeId = detail.id;
      rows = detail.rows;
      points = rows.map((row) => {
        const point = geoToWorld(row.longitude, row.latitude, 2.1);
        point.recordedTime = row.time.getTime() / 1000 - yearStart;
        return point;
      });
      disposePaths();
      let segment = [];
      function addSegment() {
        if (segment.length > 1) {
          const surfacePoints = [segment[0]];
          const observationTimes = [segment[0].recordedTime];
          for (let i = 1; i < segment.length; i++) {
            const a = segment[i - 1],
              b = segment[i],
              steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.8));
            for (let j = 1; j <= steps; j++) {
              surfacePoints.push(a.clone().lerp(b, j / steps));
              observationTimes.push(
                a.recordedTime +
                  ((b.recordedTime - a.recordedTime) * j) / steps,
              );
            }
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(
            surfacePoints,
          );
          geometry.setAttribute(
            "recordedTime",
            new THREE.Float32BufferAttribute(observationTimes, 1),
          );
          const material = new THREE.LineBasicMaterial({
            color: 0xffe2a6,
            transparent: true,
            opacity: 0.94,
          });
          material.onBeforeCompile = (shader) => {
            shader.uniforms.trackTime = trackTime;
            shader.uniforms.activeRecordedTime = recordedTime;
            shader.uniforms.surfaceTrail = surfaceTrail;
            shader.vertexShader = shader.vertexShader
              .replace(
                "#include <common>",
                "#include <common>\nuniform float trackTime;\nattribute float recordedTime;\nvarying float vRecordedTime;",
              )
              .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
              vRecordedTime=recordedTime;
              float q1=position.x*.15+position.z*.06-trackTime*.8;
              float q2=position.x*-.09+position.z*.17+trackTime*1.1;
              float q3=position.x*.28+position.z*.2-trackTime*1.4;
              transformed.y=sin(q1)*.7+sin(q2)*.38+(sin(q3)+sin(q3*2.)*.18)*.16+.14;`,
              );
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "void main() {",
                `uniform float activeRecordedTime;
              uniform float surfaceTrail;
              varying float vRecordedTime;
              void main() {
                if(surfaceTrail>0.5&&(vRecordedTime>activeRecordedTime||vRecordedTime<activeRecordedTime-1209600.0))discard;`,
              )
              .replace(
                "#include <color_fragment>",
                "#include <color_fragment>\nif(vRecordedTime>activeRecordedTime)diffuseColor.a*=0.18;",
              );
          };
          pathGroup.add(new THREE.Line(geometry, material));
        }
        segment = [];
      }
      points.forEach((p, i) => {
        if (i > 0 && rows[i].time - rows[i - 1].time > 43200000) addSegment();
        segment.push(p);
      });
      addSegment();
    }
    selectedIndex = detail.index;
    recordedTime.value = points[selectedIndex]?.recordedTime || 0;
    following = true;
    if (newRoute && points.length && view === "surface") {
      const focus = points[selectedIndex] || points[0];
      camera.position.set(focus.x - 4, 4.6, focus.z + 24);
      target.set(focus.x + 1, mobile ? 0 : 0.9, focus.z - (mobile ? 8 : 40));
    } else if (
      !newRoute &&
      previousPoint &&
      points[selectedIndex] &&
      view === "surface"
    ) {
      const shift = points[selectedIndex].clone().sub(previousPoint);
      shift.y = 0;
      camera.position.add(shift);
      target.add(shift);
    }
  }

  window.addEventListener("drift:position", (event) => setRoute(event.detail));
  window.addEventListener("drift:results", (event) =>
    atlas.setResults(event.detail),
  );
  window.addEventListener("drift:search-marker", (event) =>
    atlas.setSearch(event.detail.center, event.detail.radiusKm),
  );
  window.addEventListener("drift:selection", (event) =>
    atlas.setSelected(event.detail.id),
  );
  window.addEventListener("drift:pending", () => atlas.setPending());
  window.addEventListener("drift:search-open", () => {
    searching = true;
    atlas.setSearching(true);
    setView("above");
  });
  window.addEventListener("drift:search-close", () => {
    searching = false;
    atlas.setSearching(false);
    setView("surface");
  });
  if (window.driftAtlasSnapshot) atlas.setResults(window.driftAtlasSnapshot);
  if (document.body.classList.contains("is-searching")) {
    searching = true;
    atlas.setSearching(true);
    setView("above");
  }
  canvas.addEventListener("pointerdown", (event) => {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size > 1) {
      drag = null;
      pinchDistance = null;
      return;
    }
    drag = { x: event.clientX, y: event.clientY, moved: 0 };
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (touches.has(event.pointerId))
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance && distance > 0) {
        if (view === "above")
          atlasZoom = THREE.MathUtils.clamp(
            (atlasZoom * pinchDistance) / distance,
            0.6,
            2.2,
          );
        else {
          surfaceOrbit = true;
          surfaceDistance = THREE.MathUtils.clamp(
            (surfaceDistance * pinchDistance) / distance,
            8,
            70,
          );
        }
      }
      pinchDistance = distance;
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) {
      if (view === "above") {
        atlasYaw -= dx * 0.004;
        atlasPitch = THREE.MathUtils.clamp(atlasPitch + dy * 0.003, 0.55, 1.47);
      } else {
        surfaceOrbit = true;
        surfaceYaw -= dx * 0.005;
        surfacePitch = THREE.MathUtils.clamp(
          surfacePitch + dy * 0.003,
          0.06,
          0.78,
        );
      }
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (drag && drag.moved < 6) atlas.pick(event);
    drag = null;
    canvas.style.cursor = view === "above" ? "crosshair" : "grab";
    touches.delete(event.pointerId);
    pinchDistance = null;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", (event) => {
    drag = null;
    touches.delete(event.pointerId);
    pinchDistance = null;
  });
  document.querySelector("#atlas-zoom-in").addEventListener("click", () => {
    atlasZoom = Math.max(0.6, atlasZoom * 0.8);
  });
  document.querySelector("#atlas-zoom-out").addEventListener("click", () => {
    atlasZoom = Math.min(2.2, atlasZoom * 1.25);
  });
  document.querySelector("#atlas-reset").addEventListener("click", () => {
    atlasYaw = 0;
    atlasPitch = mobile ? 1.36 : 0.78;
    atlasZoom = 1;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (view === "above")
        atlasZoom = THREE.MathUtils.clamp(
          atlasZoom * Math.exp(event.deltaY * 0.001),
          0.6,
          2.2,
        );
      else {
        surfaceOrbit = true;
        surfaceDistance = THREE.MathUtils.clamp(
          surfaceDistance * Math.exp(event.deltaY * 0.001),
          8,
          70,
        );
      }
    },
    { passive: false },
  );
  window.addEventListener("drift:home", () => {
    following = false;
    pathGroup.visible = false;
    routeId = null;
    if (searching) setView("above");
  });
  document.querySelector("#view-surface").addEventListener("click", () => {
    setView("surface");
    if (searching) window.dispatchEvent(new CustomEvent("drift:exit-atlas"));
  });
  document.querySelector("#view-above").addEventListener("click", () => {
    setView("above");
    if (!following && !searching)
      window.dispatchEvent(new CustomEvent("drift:enter-atlas"));
  });
  function setView(next) {
    view = next;
    surfaceTrail.value = view === "surface" ? 1 : 0;
    document.querySelector("#trail-scope").textContent =
      view === "surface"
        ? "Waterline trail: previous 14 days."
        : "Full visible 2024 regional record.";
    canvas.style.cursor = view === "above" ? "crosshair" : "grab";
    document.body.classList.toggle("is-above", view === "above");
    document
      .querySelector("#view-surface")
      .classList.toggle("is-active", view === "surface");
    document
      .querySelector("#view-above")
      .classList.toggle("is-active", view === "above");
    document
      .querySelector("#view-surface")
      .setAttribute("aria-pressed", String(view === "surface"));
    document
      .querySelector("#view-above")
      .setAttribute("aria-pressed", String(view === "above"));
  }
  const pauseButton = document.querySelector("#pause-ocean");
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.textContent = paused ? "▷" : "Ⅱ";
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.setAttribute("aria-pressed", String(paused));
    pauseButton.textContent = paused ? "▷" : "Ⅱ";
    pauseButton.setAttribute(
      "aria-label",
      paused ? "Resume ocean animation" : "Pause ocean animation",
    );
  });
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (document.hidden) return;
    if (!paused) elapsed += dt;
    const t = elapsed;
    water.material.uniforms.time.value = t * 0.7 + 2.4;
    trackTime.value = t * 0.7 + 2.4;
    sky.material.uniforms.cloudTime.value = t;
    pathGroup.visible = following && !searching;
    atlas.showAbove(view === "above");
    drifter.visible = !searching;
    halo.visible = !searching;
    let focus;
    if (following && points.length) {
      focus = points[selectedIndex] || points[0];
      drifter.position.x = focus.x;
      drifter.position.z = focus.z;
    } else {
      drifter.position.x = mobile ? 4.5 : 7;
      drifter.position.z = -1;
      focus = drifter.position;
    }
    drifter.position.y =
      oceanHeight(drifter.position.x, drifter.position.z, t * 0.7 + 2.4) + 0.03;
    drifter.rotation.z = Math.sin(t * 0.67 + 1.1) * 0.075;
    drifter.rotation.x = Math.sin(t * 0.79) * 0.065;
    halo.position.set(
      drifter.position.x,
      drifter.position.y - 0.12,
      drifter.position.z,
    );
    halo.scale.setScalar(1.15 + Math.sin(t * 0.9) * 0.18);
    if (view === "above") {
      const distance = (mobile ? 680 : 285) * atlasZoom;
      wantedTarget.set(0, 0, mobile ? 75 : 0);
      wantedPosition
        .copy(wantedTarget)
        .add(
          new THREE.Vector3(
            Math.sin(atlasYaw) * Math.cos(atlasPitch) * distance,
            Math.sin(atlasPitch) * distance,
            Math.cos(atlasYaw) * Math.cos(atlasPitch) * distance,
          ),
        );
    } else if (surfaceOrbit) {
      wantedTarget.set(focus.x, 0.4, focus.z);
      wantedPosition
        .copy(wantedTarget)
        .add(
          new THREE.Vector3(
            Math.sin(surfaceYaw) * Math.cos(surfacePitch) * surfaceDistance,
            Math.sin(surfacePitch) * surfaceDistance + 1.4,
            Math.cos(surfaceYaw) * Math.cos(surfacePitch) * surfaceDistance,
          ),
        );
    } else if (following) {
      wantedPosition.set(
        focus.x - 4 + pointer.x * 0.5,
        4.6 - pointer.y * 0.2,
        focus.z + 24,
      );
      wantedTarget.set(
        focus.x + 1,
        mobile ? 0 : 0.9,
        focus.z - (mobile ? 8 : 40),
      );
    } else {
      wantedPosition.set(pointer.x * 0.6, 4 - pointer.y * 0.22, 24);
      wantedTarget.set(pointer.x * 0.8, mobile ? 0 : 1, mobile ? -12 : -70);
    }
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.0);
    camera.position.lerp(wantedPosition, smoothing);
    target.lerp(wantedTarget, smoothing);
    camera.lookAt(target);
    if (following && view === "above") drifter.scale.setScalar(2.2);
    else drifter.scale.setScalar(1);
    renderer.render(scene, camera);
    const screenPosition = drifter.position
      .clone()
      .add(new THREE.Vector3(0.7, 1.2, 0))
      .project(camera);
    if (tag) {
      tag.style.left = `${(screenPosition.x * 0.5 + 0.5) * window.innerWidth + 12}px`;
      tag.style.top = `${(-screenPosition.y * 0.5 + 0.5) * window.innerHeight}px`;
      tag.style.opacity = !searching && screenPosition.z < 1 ? "1" : "0";
    }
  }
  requestAnimationFrame(animate);
} catch (error) {
  console.warn(
    "The animated ocean is unavailable; archive search still works.",
    error,
  );
  document.querySelector(".scene-controls").hidden = true;
  document.body.classList.add("no-webgl");
  document.querySelector(".flat-chart").open = true;
}
