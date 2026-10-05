import * as THREE from 'three';

interface Effect {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick: (t: number, obj: THREE.Object3D) => void; // t goes 0 -> 1
}

const sphereGeo = new THREE.IcosahedronGeometry(1, 0);

function basic(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/** Short-lived visual effects. They don't affect gameplay. */
export class Effects {
  private list: Effect[] = [];

  constructor(private scene: THREE.Scene) {}

  private add(obj: THREE.Object3D, life: number, tick: Effect['tick']): void {
    this.scene.add(obj);
    this.list.push({ obj, life, max: life, tick });
  }

  explosion(p: THREE.Vector3, size: number): void {
    const fire = new THREE.Mesh(sphereGeo, basic(0xffa030, 0.95));
    fire.position.copy(p);
    this.add(fire, 0.45, (t, o) => {
      o.scale.setScalar(size * (0.3 + t));
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(t < 0.4 ? 0xffd060 : 0xff6020);
    });
    const smoke = new THREE.Mesh(sphereGeo, basic(0x302a26, 0.6));
    smoke.position.copy(p);
    this.add(smoke, 1.2, (t, o) => {
      o.scale.setScalar(size * (0.4 + t * 1.2));
      o.position.y = p.y + t * size * 1.5;
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    });
  }

  flash(p: THREE.Vector3, size = 0.25): void {
    const m = new THREE.Mesh(sphereGeo, basic(0xfff0a0));
    m.position.copy(p);
    m.scale.setScalar(size);
    this.add(m, 0.06, () => {});
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3): void {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true }));
    this.add(line, 0.08, (t, o) => {
      ((o as THREE.Line).material as THREE.LineBasicMaterial).opacity = 1 - t;
    });
  }

  puff(p: THREE.Vector3, color: number): void {
    const m = new THREE.Mesh(sphereGeo, basic(color, 0.7));
    m.position.copy(p);
    const dx = (Math.random() - 0.5) * 0.8;
    const dz = (Math.random() - 0.5) * 0.8;
    this.add(m, 0.8, (t, o) => {
      o.scale.setScalar(0.2 + t * 0.4);
      o.position.set(p.x + dx * t, p.y + t * 1.2, p.z + dz * t);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
    });
  }

  /** Command feedback ring on the ground. */
  marker(p: THREE.Vector3, color: number): void {
    const geo = new THREE.RingGeometry(0.7, 0.95, 20);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, basic(color));
    m.position.set(p.x, p.y + 0.1, p.z);
    this.add(m, 0.5, (t, o) => {
      o.scale.setScalar(1.4 - t);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - t;
    });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        disposeObject(e.obj);
        this.list.splice(i, 1);
      } else {
        e.tick(1 - e.life / e.max, e.obj);
      }
    }
  }
}

function disposeObject(o: THREE.Object3D): void {
  if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
    if (o.geometry !== sphereGeo) o.geometry.dispose();
    (o.material as THREE.Material).dispose();
  }
}
