// Fotos einer Spielerfigur im Spiel (nur Entwicklung, zum Vergleichen von Modellen).
// In der Konsole des Entwicklungsservers:
//   const F = await import('/scripts/testlauf/foto.js'); await F.setup(); await F.pose({ duck: 1 });
// setup startet ein Team-Spiel mit KI auf dem Hafen und hält die KI an; pose stellt eine Figur an
// einen festen Platz und die Kamera davor. Alles nur im Speicher, nach dem Neuladen ist es weg.
import * as T from './harness.js';
import { WEAPON_IDS } from '/src/config.js';

const P = { x: -2.66, z: 3.05, yaw: 6.239 };
let fig = null;

export async function setup() {
  T.install();
  await T.startTeam({ perTeam: 4, map: 'hafen' });
  await new Promise((r) => setTimeout(r, 2500));
  const g = window.__game;
  g.match.squad.tick = () => {};
  fig = [...g.teamRemotes.values()].find((r) => r.alive && r.team === 'blau');
  // Anzeigen ausblenden, nur das Bild
  const st = document.createElement('style');
  st.textContent = '#hud,#click-resume,#touch{display:none!important}';
  document.head.appendChild(st);
  return fig?.name;
}

export async function pose({ duck = 0, pitch = 0, weapon = 'wolf', side = 0.5, dist = 1.9, look = -0.3, skin = 'standard', team = 'blau' } = {}) {
  const g = window.__game;
  const V = g.camera.position.constructor;
  if (fig.team !== team) {
    fig.team = team;
  }
  fig.setLooks({ ...fig.looks, player: skin });
  for (const s of fig.snaps) {
    s.pos.set(P.x, 0.02, P.z);
    s.yaw = P.yaw;
    s.duck = duck;
    s.pitch = pitch;
    s.w = WEAPON_IDS.indexOf(weapon);
  }
  const a = P.yaw + side;
  const cam = new V(P.x - Math.sin(a) * dist, 0, P.z - Math.cos(a) * dist);
  g.player.spawn(cam, 0);
  g.player.yaw = Math.atan2(-(P.x - cam.x), -(P.z - cam.z));
  g.player.pitch = look;
  g.player.health = 100;
  await new Promise((r) => setTimeout(r, 500));
  return true;
}
