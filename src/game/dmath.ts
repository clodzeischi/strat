/**
 * sin, cos, atan2 and exp for simulation code, in place of Math's: JavaScript engines are free to round those
 * differently in the last digit (V8 has changed its own between versions, and Safari and Firefox differ from it),
 * which makes lockstep players drift apart and replays play out differently from how they were recorded. These are
 * ports of fdlibm (the C library most engines' versions descend from), written with nothing but + - * / and
 * comparisons, which IEEE 754 makes exact everywhere, so every machine gets the same bits. Accurate to within a
 * unit in the last place, like Math's. See also `hypot`.
 */

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LITTLE ? 1 : 0;

/** The top 32 bits of a double (sign, exponent and the top of the fraction), as a signed integer. */
function high(x: number): number {
  f64[0] = x;
  return u32[HI] | 0;
}

/** x with its top 32 bits replaced. */
function withHigh(x: number, hi: number): number {
  f64[0] = x;
  u32[HI] = hi >>> 0;
  return f64[0];
}

// ---- sin and cos ---------------------------------------------------------------------------

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin(x + y) for |x| ≤ π/4, y the tail of x (iy 0: y is 0). */
function kernelSin(x: number, y: number, iy: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** cos(x + y) for |x| ≤ π/4, y the tail of x. */
function kernelCos(x: number, y: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : withHigh(0, ix - 0x00200000);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** x reduced by a multiple n of π/2 to y0 + y1 within ±π/4; returns n. For |x| up to about 800,000. */
let y0 = 0;
let y1 = 0;
function remPio2(x: number): number {
  const hx = high(x);
  const ix = hx & 0x7fffffff;
  const t = Math.abs(x);
  const n = Math.floor(t * INV_PIO2 + 0.5);
  let r = t - n * PIO2_1;
  let w = n * PIO2_1T;
  // Take off more of π/2's digits while the subtraction cancels, so no precision is lost.
  const j = ix >> 20;
  y0 = r - w;
  let i = j - ((high(y0) >> 20) & 0x7ff);
  if (i > 16) {
    let s = r;
    w = n * PIO2_2;
    r = s - w;
    w = n * PIO2_2T - ((s - r) - w);
    y0 = r - w;
    i = j - ((high(y0) >> 20) & 0x7ff);
    if (i > 49) {
      s = r;
      w = n * PIO2_3;
      r = s - w;
      w = n * PIO2_3T - ((s - r) - w);
      y0 = r - w;
    }
  }
  y1 = (r - y0) - w;
  if (hx < 0) {
    y0 = -y0;
    y1 = -y1;
    return -n;
  }
  return n;
}

/** Beyond this, angles aren't reduced exactly (nothing in the game comes near it). */
const REDUCE_LIMIT = 0x413921fb;

export function sin(x: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
  if (ix >= 0x7ff00000) return NaN;
  if (ix > REDUCE_LIMIT) return Math.sin(x);
  const n = remPio2(x) & 3;
  return n === 0 ? kernelSin(y0, y1, 1) : n === 1 ? kernelCos(y0, y1) : n === 2 ? -kernelSin(y0, y1, 1) : -kernelCos(y0, y1);
}

export function cos(x: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return NaN;
  if (ix > REDUCE_LIMIT) return Math.cos(x);
  const n = remPio2(x) & 3;
  return n === 0 ? kernelCos(y0, y1) : n === 1 ? -kernelSin(y0, y1, 1) : n === 2 ? -kernelCos(y0, y1) : kernelSin(y0, y1, 1);
}

// ---- atan and atan2 ------------------------------------------------------------------------

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

export function atan(x: number): number {
  const hx = high(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    if (x !== x) return x;
    return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATAN_HI[id] - ((x * (s1 + s2) - ATAN_LO[id]) - x);
  return hx < 0 ? -r : r;
}

const PI = 3.1415926535897931160;
const PI_LO = 1.2246467991473531772e-16;
const PI_O_2 = 1.5707963267948965580;
const PI_O_4 = 7.8539816339744827900e-1;

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  if (x === 1) return atan(y);
  const hx = high(x);
  const hy = high(y);
  // Which quadrant: bit 0 the sign of y, bit 1 the sign of x.
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
  if (y === 0) return m <= 1 ? y : m === 2 ? PI : -PI;
  if (x === 0) return hy < 0 ? -PI_O_2 : PI_O_2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) return [PI_O_4, -PI_O_4, 3 * PI_O_4, -3 * PI_O_4][m];
    return [0, -0, PI, -PI][m];
  }
  if (y === Infinity || y === -Infinity) return hy < 0 ? -PI_O_2 : PI_O_2;
  const k = ((hy & 0x7fffffff) - (hx & 0x7fffffff)) >> 20;
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return (z - PI_LO) - PI;
  }
}

// ---- exp -----------------------------------------------------------------------------------

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;
const TWO_M1000 = 9.33263618503218878990e-302;

export function exp(x: number): number {
  const h = high(x);
  const neg = h < 0;
  const hx = h & 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (x !== x) return x;
    if (x > 7.09782712893383973096e2) return Infinity;
    if (x < -7.45133219101941108420e2) return 0;
  }
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = neg ? x + LN2_HI : x - LN2_HI;
      lo = neg ? -LN2_LO : LN2_LO;
      k = neg ? -1 : 1;
    } else {
      k = Math.trunc(INV_LN2 * x + (neg ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo - (x * c) / (2 - c)) - hi);
  // Scale by 2^k by adding k to the exponent.
  if (k >= -1021) return withHigh(y, high(y) + (k << 20));
  return withHigh(y, high(y) + ((k + 1000) << 20)) * TWO_M1000;
}
