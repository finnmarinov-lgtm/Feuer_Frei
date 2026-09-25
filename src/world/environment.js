import * as THREE from 'three';
import { findSunDirection } from '../engine/assets.js';

// Dreht den Himmel so, dass die Sonne schräg über die Arena scheint und lange Schatten wirft.
const SKY_ROTATION = 0.9;

/** Kopie des Himmels mit weniger Farbe (amount 1 = grau), einmal auf der Grafikkarte gerechnet */
function desaturated(renderer, sky, amount) {
  const { width, height } = sky.image;
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: sky }, amount: { value: amount } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float amount; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(map, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(mix(c, vec3(l), amount), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const tmp = new THREE.Scene();
  tmp.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(tmp, new THREE.Camera());
  renderer.setRenderTarget(prev);
  quad.geometry.dispose();
  mat.dispose();
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  return rt;
}

export function setupEnvironment(renderer, scene, viewScene, sky) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(sky).texture;
  // Waffe in der Hand: gleicher Himmel, aber fast ohne Blaustich, sonst wirkt Schwarz dunkelblau
  const neutralSky = desaturated(renderer, sky, 0.7);
  const viewEnv = pmrem.fromEquirectangular(neutralSky.texture).texture;
  neutralSky.dispose();
  pmrem.dispose();

  const rot = new THREE.Euler(0, SKY_ROTATION, 0);
  scene.background = sky;
  scene.backgroundRotation.copy(rot);
  scene.environment = envMap;
  scene.environmentRotation.copy(rot);
  scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(0xb9c6cf, 60, 220);

  viewScene.environment = viewEnv;
  viewScene.environmentRotation.copy(rot);
  viewScene.environmentIntensity = 0.85;

  // Sonne aus der hellsten Stelle des Himmels, passend zur Drehung
  const sunDir = findSunDirection(sky).applyEuler(rot);
  if (sunDir.y < 0.35) {
    sunDir.y = 0.35;
    sunDir.normalize();
  }

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const s = sun.shadow;
  s.camera.left = -38;
  s.camera.right = 38;
  s.camera.top = 38;
  s.camera.bottom = -38;
  s.camera.near = 5;
  s.camera.far = 140;
  s.bias = -0.00025;
  s.normalBias = 0.035;
  s.radius = 2.5;
  scene.add(sun, sun.target);

  // Der Himmel enthält keinen Boden, also fehlt das warme Streulicht vom sonnigen Sand.
  // Das Halbkugellicht ersetzt es, vor allem für die Schattenseiten der Wände.
  const bounce = new THREE.HemisphereLight(0x9fb4cc, 0xb88a58, 1.1);
  scene.add(bounce);

  // Licht für die Waffe in der Hand: gleiche Richtung, wird im Schatten gedimmt. Das Himmelslicht ist
  // hier neutraler als in der Welt, sonst wirken schwarze Waffen dunkelblau.
  const viewSun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  viewSun.position.copy(sunDir);
  viewScene.add(viewSun, viewSun.target, new THREE.HemisphereLight(0xaeb6bf, 0xb88a58, 0.8));

  return { sun, viewSun, sunDir, envMap };
}
