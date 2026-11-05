import * as THREE from "./vendor/three.min.js";

(() => {
  "use strict";

  const canvas = document.querySelector("#ocean-scene");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x061c25);
    scene.fog = new THREE.FogExp2(0x092b36, 0.018);

    const camera = new THREE.PerspectiveCamera(41, 1, 0.1, 170);
    camera.position.set(0, 3.2, 14.5);
    camera.lookAt(0, 0.2, -8);

    const segments = window.innerWidth < 760 ? 100 : 170;
    const geometry = new THREE.PlaneGeometry(110, 110, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uDeep: { value: new THREE.Color(0x06242d) },
        uMid: { value: new THREE.Color(0x0f5360) },
        uLight: { value: new THREE.Color(0x81c5c2) },
        uSun: { value: new THREE.Color(0xe5b27a) },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vPosition;
        varying float vHeight;
        varying vec3 vNormalApprox;

        float wave(vec2 p, vec2 d, float frequency, float speed, float amplitude) {
          return sin(dot(p, normalize(d)) * frequency + uTime * speed) * amplitude;
        }

        float elevation(vec2 p) {
          float e = 0.0;
          e += wave(p, vec2(1.0, 0.24), 0.55, 0.72, 0.42);
          e += wave(p, vec2(-0.42, 1.0), 0.91, 1.05, 0.19);
          e += wave(p, vec2(0.72, 1.0), 1.78, 1.42, 0.075);
          e += wave(p, vec2(-1.0, 0.12), 3.25, 2.05, 0.026);
          return e;
        }

        void main() {
          vec3 p = position;
          float h = elevation(p.xz);
          p.y += h;
          float eps = 0.12;
          float hx = elevation(p.xz + vec2(eps, 0.0));
          float hz = elevation(p.xz + vec2(0.0, eps));
          vNormalApprox = normalize(vec3(h - hx, eps, h - hz));
          vHeight = h;
          vPosition = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uLight;
        uniform vec3 uSun;
        uniform vec2 uPointer;
        varying vec3 vPosition;
        varying float vHeight;
        varying vec3 vNormalApprox;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - max(dot(viewDir, vNormalApprox), 0.0), 3.0);
          vec3 lightDir = normalize(vec3(-0.45, 1.0, 0.2));
          float specular = pow(max(dot(reflect(-lightDir, vNormalApprox), viewDir), 0.0), 72.0);
          float broadLight = pow(max(dot(reflect(-lightDir, vNormalApprox), viewDir), 0.0), 9.0);
          float depthFade = smoothstep(-0.5, 0.52, vHeight);
          vec3 color = mix(uDeep, uMid, depthFade * 0.68 + fresnel * 0.28);
          color = mix(color, uLight, fresnel * 0.38);
          color += uSun * (specular * 0.8 + broadLight * 0.09);
          float distanceShade = smoothstep(72.0, 5.0, length(vPosition.xz));
          color *= 0.72 + distanceShade * 0.32;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const water = new THREE.Mesh(geometry, material);
    water.position.y = -0.35;
    scene.add(water);

    // A restrained surface-drifter silhouette gives scale without turning the archive into a game.
    const drifter = new THREE.Group();
    const floatMaterial = new THREE.MeshStandardMaterial({ color: 0xf1b34c, roughness: 0.62, metalness: 0.08 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x14282c, roughness: 0.8 });
    const floatBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.34, 18), floatMaterial);
    floatBody.position.y = 0.05;
    drifter.add(floatBody);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 8), darkMaterial);
    mast.position.y = 0.69;
    drifter.add(mast);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), floatMaterial);
    top.position.y = 1.23;
    drifter.add(top);
    drifter.position.set(6.4, -0.02, -10.5);
    drifter.scale.setScalar(0.8);
    scene.add(drifter);

    scene.add(new THREE.HemisphereLight(0xbfd7d6, 0x071a20, 1.4));
    const warmLight = new THREE.DirectionalLight(0xffc88e, 2.2);
    warmLight.position.set(-4, 9, 3);
    scene.add(warmLight);

    const pointer = { x: 0, y: 0 };
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX / window.innerWidth * 2 - 1;
      pointer.y = event.clientY / window.innerHeight * 2 - 1;
    }, { passive: true });

    function resize() {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    function draw() {
      const time = reducedMotion ? 1.8 : clock.getElapsedTime();
      material.uniforms.uTime.value = time;
      material.uniforms.uPointer.value.set(pointer.x, pointer.y);
      camera.position.x += ((pointer.x * 0.65) - camera.position.x) * 0.012;
      camera.position.y += ((3.2 - pointer.y * 0.22) - camera.position.y) * 0.012;
      camera.lookAt(pointer.x * 0.45, 0.1, -8);
      drifter.position.y = 0.16 + Math.sin(time * 0.72 + 3.7) * 0.24 + Math.sin(time * 1.41) * 0.07;
      drifter.rotation.z = Math.sin(time * 0.72 + 2.4) * 0.11;
      drifter.rotation.x = Math.sin(time * 0.94) * 0.055;
      renderer.render(scene, camera);
      if (!reducedMotion) requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    draw();
  } catch (error) {
    console.warn("The ocean scene could not start; the static hero remains available.", error);
    canvas.hidden = true;
  }
})();
