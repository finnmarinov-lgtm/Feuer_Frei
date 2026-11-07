import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from '../settings.js';

const _size = new THREE.Vector2();

// Auflösung "Automatisch": Läuft das Spiel im Schnitt unter MIN_FPS Bildern pro Sekunde, wird eine
// Stufe kleiner gezeichnet (weniger Pixel entlasten schwache Grafikchips am meisten). Bringt eine
// Stufe nichts (der Rechner hängt am Prozessor, oder der Browser zeigt im Stromsparmodus ohnehin nur
// 30 Bilder), geht es eine zurück und bleibt dabei. Hoch geht es erst beim nächsten Laden der Seite.
const AUTO_STEPS = [1, 0.85, 0.7, 0.5];
const MIN_FPS = 40;
// so lange (Sekunden) wird gemessen, und so lange nach Spielbeginn oder einem Wechsel nicht
const WINDOW = 3;
const SETTLE = 2;

export class AutoScale {
  constructor() {
    this.step = 0;
    this.fpsBefore = 0;
    this.done = false;
    this.reset();
  }

  get scale() {
    return AUTO_STEPS[this.step];
  }

  /** neu anfangen zu messen (nicht im Spiel, nach einem Wechsel) */
  reset() {
    this.wait = SETTLE;
    this.time = 0;
    this.frames = 0;
  }

  /** pro Bild beim Spielen: liefert die neue Stufe, wenn sie sich ändern soll, sonst null */
  update(dt) {
    if (this.done) return null;
    if (this.wait > 0) {
      this.wait -= dt;
      return null;
    }
    this.time += dt;
    this.frames++;
    if (this.time < WINDOW) return null;
    const fps = this.frames / this.time;
    this.reset();
    if (this.fpsBefore) {
      const helped = fps > this.fpsBefore * 1.1;
      this.fpsBefore = 0;
      if (!helped) {
        this.step--;
        this.done = true;
        return this.scale;
      }
    }
    if (fps >= MIN_FPS || this.step === AUTO_STEPS.length - 1) return null;
    this.fpsBefore = fps;
    this.step++;
    return this.scale;
  }
}

// Zeichnet erst die Welt, dann die Waffe in der Hand in einem eigenen Durchgang,
// damit sie nie in Wänden verschwindet.
export class Renderer {
  constructor(container) {
    // "desynchronized" gibt Bilder ohne Umweg über den Compositor aus: spürbar weniger
    // Verzögerung zwischen Maus und Bild (dafür sind vereinzelt Bildrisse möglich).
    // Achtung: Die Leinwand kann dabei schon angezeigt werden, während noch gezeichnet wird.
    // Deshalb nie mehrere Durchgänge direkt ins Bild, sondern immer über den Composer,
    // der das fertige Bild am Ende in einem Zug ausgibt (sonst flackert es).
    // Auf Handys und Tablets nicht: Mit dem Finger bringt es kaum etwas, und der Sonderweg ist dort
    // weniger erprobt (Verdacht, als das Spiel auf Finns Handy einfror, 03.10.2026).
    // Kurze schwarze Aussetzer (Rückmeldung eines Spielers, 06.11.2026): Ohne "preserveDrawingBuffer"
    // leert Chrome die Leinwand zwischen zwei Bildern, und mit "desynchronized" kann der Bildschirm
    // genau diese leere Leinwand zeigen (so beschreibt es Chrome selbst). Deshalb bleibt das alte Bild
    // stehen, bis das neue es überschreibt, und das letzte Bild wird ohne Löschen gezeichnet (OutputPass unten).
    const touchFirst = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: true, stencil: false,
      powerPreference: 'high-performance', desynchronized: !touchFirst, preserveDrawingBuffer: !touchFirst,
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
    this.size = { w: window.innerWidth, h: window.innerHeight, ratio: 1 };
    this._canvasDirty = false;
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

  /** nur die Auflösung ändern (Automatisch); danach resize(), dann passen sich die Zwischenbilder an */
  setScale(renderScale) {
    this.renderScale = renderScale;
  }

  /** Pixel pro CSS-Pixel: Bildschirm, höchstens so viel wie die Grafikstufe erlaubt, mal Auflösungsstufe */
  _ratio() {
    return Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * this.renderScale;
  }

  /** Höhe des Bilds in Pixeln (stimmt schon, bevor die Leinwand beim nächsten Zeichnen umgestellt wird) */
  get bufferHeight() {
    return Math.floor(this.size.h * this.size.ratio);
  }

  /**
   * Leinwand auf die neue Größe bringen, unmittelbar bevor das fertige Bild darauf kommt. Jede neue
   * Größe leert die Leinwand. Geschah das gleich bei resize(), stand sie bis zum Zeichnen leer da
   * (beim Partiestart bis über eine Sekunde, während die Zwischenbilder gezeichnet und Shader
   * übersetzt wurden) und der Bildschirm konnte sie schwarz zeigen.
   */
  _applyCanvas() {
    if (!this._canvasDirty) return;
    this._canvasDirty = false;
    const r = this.renderer;
    const { w, h, ratio } = this.size;
    const cur = r.getSize(_size);
    if (r.getPixelRatio() === ratio && cur.x === w && cur.y === h) return;
    r.setPixelRatio(ratio);
    r.setSize(w, h);
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
    const ratio = this._ratio();
    const size = { x: Math.floor(window.innerWidth * ratio) || 1, y: Math.floor(window.innerHeight * ratio) || 1 };
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
    // Das fertige Bild deckt die ganze Leinwand ab: vorher nicht schwarz löschen. Sonst kann der
    // Bildschirm mit "desynchronized" (siehe oben) genau den gelöschten Zustand zeigen. Eine neue
    // Größe bekommt die Leinwand erst hier, direkt vor dem fertigen Bild (siehe _applyCanvas).
    const out = new OutputPass();
    out.material.depthTest = false;
    out.material.depthWrite = false;
    const outRender = out.render.bind(out);
    out.render = (renderer, ...rest) => {
      this._applyCanvas();
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      outRender(renderer, ...rest);
      renderer.autoClear = autoClear;
    };
    c.addPass(out);
    this.composer = c;
  }

  /** neue Fenstergröße oder Auflösung: Kameras und Zwischenbilder sofort, die Leinwand beim Zeichnen */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = this._ratio();
    this.size = { w, h, ratio };
    this._canvasDirty = true;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
    }
  }

  render(showViewmodel) {
    this.viewPass.enabled = showViewmodel;
    this.composer.render();
  }
}
