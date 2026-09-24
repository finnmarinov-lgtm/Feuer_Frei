import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from '../settings.js';

// Zeichnet erst die Welt, dann die Waffe in der Hand in einem eigenen Durchgang,
// damit sie nie in Wänden verschwindet.
export class Renderer {
  constructor(container) {
    // "desynchronized" gibt Bilder ohne Umweg über den Compositor aus: spürbar weniger
    // Verzögerung zwischen Maus und Bild (dafür sind vereinzelt Bildrisse möglich).
    // Achtung: Die Leinwand kann dabei schon angezeigt werden, während noch gezeichnet wird.
    // Deshalb nie mehrere Durchgänge direkt ins Bild, sondern immer über den Composer,
    // der das fertige Bild am Ende in einem Zug ausgibt (sonst flackert es).
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: true, stencil: false,
      powerPreference: 'high-performance', desynchronized: true,
    });
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    // Neutral (Khronos PBR Neutral) hält die Farben satter als ACES, passend zum Wüstenlook
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    this.canvas = r.domElement;
    this.composer = null;
    this.quality = null;
  }

  setup(scene, camera, viewScene, viewCamera) {
    this.scene = scene;
    this.camera = camera;
    this.viewScene = viewScene;
    this.viewCamera = viewCamera;
  }

  applyQuality(key, sun, renderScale = 1) {
    const q = QUALITY[key];
    this.quality = q;
    this.qualityKey = key;
    this.renderScale = renderScale;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio) * renderScale);
    if (sun) {
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // feste Schatten: nur auf Anforderung neu zeichnen (siehe bakeShadows)
    r.shadowMap.autoUpdate = !q.staticShadows;
    r.shadowMap.needsUpdate = true;
    this.needsShadowBake = q.staticShadows;
    this._buildComposer();
    this.resize();
  }

  /** Schattenkarte einmal zeichnen; bei festen Schatten bleibt sie danach so */
  bakeShadows() {
    const r = this.renderer;
    this._bakeTarget ||= new THREE.WebGLRenderTarget(1, 1);
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this._bakeTarget);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.needsShadowBake = false;
  }

  _buildComposer() {
    this.composer?.dispose();
    const q = this.quality;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = null;
    if (q.ao) {
      // Verdeckung in halber Auflösung: sieht fast gleich aus, kostet ein Viertel
      const g = new GTAOPass(this.scene, this.camera, Math.ceil(size.x / 2), Math.ceil(size.y / 2));
      const setSize = g.setSize.bind(g);
      g.setSize = (w, h) => setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
      g.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      g.blendIntensity = 0.9;
      // Rauch, Einschusslöcher und Leuchtspuren dürfen keine Verdeckung werfen
      g._overrideVisibility = function hideEffects() {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          if (o.visible && (o.isPoints || o.isLine || o.isSprite || o.material?.transparent)) {
            o.visible = false;
            cache.push(o);
          }
        });
      };
      c.addPass(g);
      this.gtao = g;
    }
    const vp = new RenderPass(this.viewScene, this.viewCamera);
    vp.clear = false;
    vp.clearDepth = true;
    c.addPass(vp);
    this.viewPass = vp;
    c.addPass(new OutputPass());
    this.composer = c;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  render(showViewmodel) {
    this.viewPass.enabled = showViewmodel;
    this.composer.render();
  }
}
