import * as THREE from "./vendor/three.min.js";
import { Water } from "./vendor/Water.js";
import { Sky } from "./vendor/Sky.js";

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
  renderer.toneMappingExposure = 0.64;

  const scene = new THREE.Scene();
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
    THREE.MathUtils.degToRad(78),
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
    vec3 clearSky = mix(vec3(0.76,0.73,0.66),vec3(0.12,0.34,0.59),pow(max(direction.y,0.0),0.46));
    float sunGlow = pow(max(dot(direction,vSunDirection),0.0),18.0);
    clearSky += vec3(0.32,0.15,0.025)*sunGlow;
    retColor = mix(clearSky,retColor,sundisk*0.96);
    vec2 cp = direction.xz / max(direction.y + 0.23, 0.06) * 1.8;
    cp.x += cloudTime * 0.003;
    float cloud = fbmCloud(cp + vec2(9.4, 2.7));
    float detail = fbmCloud(cp * 3.0 + 4.0);
    float coverage = smoothstep(0.58, 0.83, cloud + detail * 0.13);
    coverage *= smoothstep(0.01, 0.2, direction.y) * 0.87;
    vec3 cloudColor = mix(vec3(0.87,0.78,0.74), vec3(1.65,1.52,1.32), smoothstep(0.48,0.78,cloud));
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
    sunColor: 0xffe8cf,
    waterColor: 0x087c83,
    distortionScale: 3.4,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 3.4;
  water.material.fragmentShader = water.material.fragmentShader
    .replace("float rf0 = 0.3;", "float rf0 = 0.085;")
    .replace("sunColor * diffuseLight * 0.3", "sunColor * diffuseLight * 0.07");

  const waveGLSL = `
    vec3 seaPosition = position;
    vec2 seaXZ = vec2(position.x, -position.y);
    seaPosition.z += sin(seaXZ.x*0.12+seaXZ.y*0.065+time*0.72)*0.42;
    seaPosition.z += sin(seaXZ.x*-0.075+seaXZ.y*0.16+time*0.91)*0.25;
    seaPosition.z += sin(seaXZ.x*0.27+seaXZ.y*0.19-time*1.2)*0.12;
  `;
  water.material.vertexShader = water.material.vertexShader
    .replace(
      "mirrorCoord = modelMatrix * vec4( position, 1.0 );",
      `${waveGLSL}\n mirrorCoord = modelMatrix * vec4( seaPosition, 1.0 );`,
    )
    .replace(
      "modelViewMatrix * vec4( position, 1.0 )",
      "modelViewMatrix * vec4( seaPosition, 1.0 )",
    );
  scene.add(water);

  scene.add(new THREE.HemisphereLight(0xcde9f1, 0x123d45, 2.3));
  const sunlight = new THREE.DirectionalLight(0xffddad, 3.8);
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
  scene.add(pathGroup);
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
      Math.sin(x * 0.12 + z * 0.065 + t * 0.72) * 0.42 +
      Math.sin(x * -0.075 + z * 0.16 + t * 0.91) * 0.25 +
      Math.sin(x * 0.27 + z * 0.19 - t * 1.2) * 0.12
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
      routeId = detail.id;
      rows = detail.rows;
      const mercator = (row) => [
        (row.longitude * Math.PI) / 180,
        Math.log(Math.tan(Math.PI / 4 + (row.latitude * Math.PI) / 360)),
      ];
      const coords = rows.map(mercator);
      const xs = coords.map((p) => p[0]),
        ys = coords.map((p) => p[1]);
      const xmin = Math.min(...xs),
        xmax = Math.max(...xs),
        ymin = Math.min(...ys),
        ymax = Math.max(...ys);
      const scale = 115 / Math.max(xmax - xmin, ymax - ymin, 0.004);
      const cx = (xmin + xmax) / 2,
        cy = (ymin + ymax) / 2;
      points = coords.map(
        (p) =>
          new THREE.Vector3((p[0] - cx) * scale, 1.25, -(p[1] - cy) * scale),
      );
      disposePaths();
      let segment = [];
      function addSegment() {
        if (segment.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(segment);
          const material = new THREE.LineBasicMaterial({
            color: 0xffe2a6,
            transparent: true,
            opacity: 0.94,
          });
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
  window.addEventListener("drift:home", () => {
    following = false;
    pathGroup.visible = false;
    routeId = null;
  });
  document
    .querySelector("#view-surface")
    .addEventListener("click", () => setView("surface"));
  document
    .querySelector("#view-above")
    .addEventListener("click", () => setView("above"));
  function setView(next) {
    view = next;
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
    sky.material.uniforms.cloudTime.value = t;
    pathGroup.visible = following;
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
      if (following) {
        wantedPosition.set(0, mobile ? 270 : 140, mobile ? 150 : 92);
        wantedTarget.set(0, 0, 0);
      } else {
        wantedPosition.set(2, 40, 36);
        wantedTarget.set(4, 0, -10);
      }
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
      tag.style.opacity = screenPosition.z < 1 ? "1" : "0";
    }
  }
  requestAnimationFrame(animate);
} catch (error) {
  console.warn(
    "The animated ocean is unavailable; archive search still works.",
    error,
  );
  document.querySelector(".scene-controls").hidden = true;
}
