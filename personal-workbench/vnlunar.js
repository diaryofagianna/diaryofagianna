#!/usr/bin/env node
/* vnlunar.js
 * Port of the Lua snippets from the Vietnamese Wikipedia "Âm lịch" programming doc.
 * Everything is self-contained, Node-ready, and also exposes a browser-friendly global.
 *
 * Usage:
 *   node vnlunar.js                     -> runs default tests from the document examples
 *   node vnlunar.js '{"utc":7,"cases":[ ... ]}'   -> run custom tests (see format in code comments)
 *
 * Exports (CommonJS + browser global):
 *   VNLunar = {
 *     toInt, UniversalToJD, UniversalFromJD,
 *     LocalFromJD, LocalToJD,
 *     NewMoon, SunLongitude,
 *     LunarMonth11, LunarYear,
 *     Solar2Lunar, Lunar2Solar,
 *     canchi
 *   }
 *
 * Notes:
 * - Floating point results depend on double precision; we compare with an epsilon in tests.
 * - Month numbering in intermediate steps follows the original logic:
 *     ret4[i] = (i + 11) % 12   // yields 11,0,1,... where 0 is used as "tháng 12"
 */

(function () {
  // ---------- helpers ----------
  function toInt(n) {
    // Lua's toint chopped the fractional part toward zero.
    return Math.trunc(Number(n));
  }

  function INT(d) {
    return Math.floor(d);
  }

  function MOD(x, y) {
    // Matches the Java-like MOD the doc describes; if remainder is 0, return y.
    const z = x - INT(y * Math.floor(x / y));
    return z === 0 ? y : z;
  }

  // ---------- Julian Day conversions (GMT/UTC) ----------
  function UniversalToJD(D, M, Y) {
    let JD;
    if (
      Y > 1582 ||
      (Y === 1582 && M > 10) ||
      (Y === 1582 && M === 10 && D > 14)
    ) {
      JD =
        367 * Y -
        toInt((7 * (Y + toInt((M + 9) / 12))) / 4) -
        toInt((3 * (toInt((Y + (M - 9) / 7) / 100) + 1)) / 4) +
        toInt((275 * M) / 9) +
        D +
        1721028.5;
    } else {
      JD =
        367 * Y -
        toInt((7 * (Y + 5001 + toInt((M - 9) / 7))) / 4) +
        toInt((275 * M) / 9) +
        D +
        1729776.5;
    }
    return JD;
  }

  function UniversalFromJD(JD) {
    let Z = toInt(JD + 0.5);
    const F = JD + 0.5 - Z;
    let A;
    if (Z < 2299161) {
      A = Z;
    } else {
      const alpha = toInt((Z - 1867216.25) / 36524.25);
      A = Z + 1 + alpha - toInt(alpha / 4);
    }
    const B = A + 1524;
    const C = toInt((B - 122.1) / 365.25);
    const D = toInt(365.25 * C);
    const E = toInt((B - D) / 30.6001);
    const dd = toInt(B - D - toInt(30.6001 * E) + F);
    const mm = E < 14 ? E - 1 : E - 13;
    const yyyy = mm < 3 ? C - 4715 : C - 4716;
    return [dd, mm, yyyy];
  }

  // ---------- Local time helpers ----------
  function LocalFromJD(JD, utcHours) {
    return UniversalFromJD(JD + utcHours / 24.0);
  }

  function LocalToJD(D, M, Y, utcHours) {
    return UniversalToJD(D, M, Y) - utcHours / 24.0;
  }

  // ---------- New Moon (k) ----------
  function NewMoon(k) {
    const dr = Math.PI / 180.0;
    const T = k / 1236.85; // Julian centuries from 1900 Jan 0.5
    const T2 = T * T;
    const T3 = T2 * T;

    let Jd1 =
      2415020.75933 +
      29.53058868 * k +
      0.0001178 * T2 -
      0.000000155 * T3;

    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);

    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr =
      306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F =
      21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;

    let C1 =
      (0.1734 - 0.000393 * T) * Math.sin(dr * M) +
      0.0021 * Math.sin(2 * dr * M);
    C1 =
      C1 -
      0.4068 * Math.sin(dr * Mpr) +
      0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));

    let deltat;
    if (T < -11) {
      deltat =
        0.001 +
        0.000839 * T +
        0.0002261 * T2 -
        0.00000845 * T3 -
        0.000000081 * T * T3;
    } else {
      deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    }

    const JdNew = Jd1 + C1 - deltat;
    return JdNew;
  }

  // ---------- Sun longitude ----------
  function SunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525.0; // Julian centuries from J2000.0
    const T2 = T * T;
    const dr = Math.PI / 180.0;

    const M =
      357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2; // deg
    const L0 =
      280.46645 + 36000.76983 * T + 0.0003032 * T2; // deg

    let DL =
      (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);

    let L = L0 + DL; // deg
    L = L * dr; // rad

    // Normalize to [0, 2π)
    L = L - Math.PI * 2 * toInt(L / (Math.PI * 2));
    if (L < 0) L += 2 * Math.PI;

    return L;
  }

  // ---------- Lunar Month 11 (contains Winter Solstice) ----------
  function LunarMonth11(Y, utcHours) {
    const off = LocalToJD(31, 12, Y, utcHours) - 2415021.076998695;
    const k = toInt(off / 29.530588853);
    let jd = NewMoon(k);
    const [d, m, y] = LocalFromJD(jd, utcHours);
    const sunLong = SunLongitude(LocalToJD(d, m, y, utcHours)); // sun longitude at local midnight

    if (sunLong > (3 * Math.PI) / 2) {
      jd = NewMoon(k - 1);
    }
    return LocalFromJD(jd, utcHours); // [dd, mm, yyyy]
  }

  // ---------- Build a lunar year table ----------
  // Returns one of:
  //   b=1 -> dd[], b=2 -> mm[], b=3 -> yyyy[], b=4 -> lunarMonthIndex[], b=5 -> leapFlags[], else -> length
  function LunarYear(Y, b, utcHours) {
    const ret1 = [];
    const ret2 = [];
    const ret3 = [];
    const ret4 = [];
    const ret5 = [];

    const month11A = LunarMonth11(Y - 1, utcHours);
    const jdMonth11A = LocalToJD(month11A[0], month11A[1], month11A[2], utcHours);
    const k = Math.floor(0.5 + (jdMonth11A - 2415021.076998695) / 29.530588853);

    const month11B = LunarMonth11(Y, utcHours);
    const off = LocalToJD(month11B[0], month11B[1], month11B[2], utcHours) - jdMonth11A;

    const leap = off > 365.0;
    const retlength = leap ? 14 : 13;

    ret1[0] = month11A[0];
    ret2[0] = month11A[1];
    ret3[0] = month11A[2];
    ret4[0] = 0;
    ret5[0] = 0;

    ret1[retlength - 1] = month11B[0];
    ret2[retlength - 1] = month11B[1];
    ret3[retlength - 1] = month11B[2];
    ret4[retlength - 1] = 0;
    ret5[retlength - 1] = 0;

    for (let i = 1; i <= retlength - 2; i++) {
      const nm = NewMoon(k + i);
      const a = LocalFromJD(nm, utcHours);
      ret1[i] = a[0];
      ret2[i] = a[1];
      ret3[i] = a[2];
      ret4[i] = 0;
      ret5[i] = 0;
    }

    // initial month numbering (0 means "tháng 12")
    for (let i = 0; i < retlength; i++) {
      ret4[i] = (i + 11) % 12;
    }

    if (leap) {
      const sunLongitudes = new Array(retlength + 1).fill(0);
      for (let i = 0; i < retlength; i++) {
        const jdAtMonthBegin = LocalToJD(ret1[i], ret2[i], ret3[i], utcHours);
        sunLongitudes[i] = SunLongitude(jdAtMonthBegin);
      }
      let found = false;
      for (let i = 0; i < retlength - 1; i++) {
        if (found) {
          ret4[i] = (i + 10) % 12;
        }
        const sl1 = sunLongitudes[i];
        const sl2 = sunLongitudes[i + 1];
        if (Math.floor((sl1 / Math.PI) * 6) === Math.floor((sl2 / Math.PI) * 6)) {
          found = true;
          ret5[i] = 1; // leap month flag
          ret4[i] = (i + 10) % 12;
        }
      }
    }

    switch (b) {
      case 1:
        return ret1;
      case 2:
        return ret2;
      case 3:
        return ret3;
      case 4:
        return ret4;
      case 5:
        return ret5;
      default:
        return retlength;
    }
  }

  // ---------- Solar <-> Lunar ----------
  // Returns [dd, mm, yy, leap] where mm==0 means month 12, leap is 1 or 0
  function Solar2Lunar(D, M, Y, utcHours) {
    let yy = Y;
    let ly1 = LunarYear(Y, 1, utcHours);
    let ly2 = LunarYear(Y, 2, utcHours);
    let ly3 = LunarYear(Y, 3, utcHours);
    let ly4 = LunarYear(Y, 4, utcHours);
    let ly5 = LunarYear(Y, 5, utcHours);
    const month11length = LunarYear(Y, 6, utcHours);

    const month11 = [ly1[month11length - 1], ly2[month11length - 1], ly3[month11length - 1]];
    const jdToday = LocalToJD(D, M, Y, utcHours);
    const jdMonth11 = LocalToJD(month11[0], month11[1], month11[2], utcHours);

    if (jdToday >= jdMonth11) {
      ly1 = LunarYear(Y + 1, 1, utcHours);
      ly2 = LunarYear(Y + 1, 2, utcHours);
      ly3 = LunarYear(Y + 1, 3, utcHours);
      ly4 = LunarYear(Y + 1, 4, utcHours);
      ly5 = LunarYear(Y + 1, 5, utcHours);
      yy = Y + 1;
    }

    let i = LunarYear(Y, 6, utcHours) - 1;
    while (i > 0 && jdToday < LocalToJD(ly1[i], ly2[i], ly3[i], utcHours)) {
      i -= 1;
    }

    const dd = toInt(jdToday - LocalToJD(ly1[i], ly2[i], ly3[i], utcHours)) + 1;
    let mm = ly4[i]; // 0 => month 12
    if (mm >= 11 || mm === 0) {
      yy = yy - 1;
    }
    const leap = ly5[i] ? 1 : 0;
    return [dd, mm, yy, leap];
  }

  // Given lunar D, M (0 means 12), Y (lunar year), leap flag (0/1), return [dd,mm,yyyy] solar
  function Lunar2Solar(D, M, Y, leap, utcHours) {
    let yy = Y;
    if (M >= 11 || M === 0) {
      yy = Y + 1;
    }

    const lm1 = LunarYear(yy, 1, utcHours);
    const lm2 = LunarYear(yy, 2, utcHours);
    const lm3 = LunarYear(yy, 3, utcHours);
    const lm4 = LunarYear(yy, 4, utcHours);
    const lm5 = LunarYear(yy, 5, utcHours);
    const length = LunarYear(yy, 6, utcHours);

    let lunarMonth = null;
    const Mnorm = M === 12 ? 0 : M;

    for (let i = 0; i < length; i++) {
      if (lm4[i] === Mnorm && (lm5[i] ? 1 : 0) === (leap ? 1 : 0)) {
        lunarMonth = [lm1[i], lm2[i], lm3[i]];
        break;
      }
    }
    if (!lunarMonth) {
      throw new Error("Invalid lunar input (no matching month found)");
    }
    const jd = LocalToJD(lunarMonth[0], lunarMonth[1], lunarMonth[2], utcHours);
    const [dd, mm, yyyy] = LocalFromJD(jd + (D - 1), utcHours);
    return [dd, mm, yyyy];
  }

  // ---------- Can-Chi ----------
  function canchi(x) {
    const a = ((x % 10) + 10) % 10;
    const b = ((x % 12) + 12) % 12;
    const CANS = ["Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm"];
    const CHIS = ["Hợi", "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất"];
    return `${CANS[a]} ${CHIS[b]}`;
  }

  // ---------- Exports ----------
  const VNLunar = {
    toInt,
    UniversalToJD,
    UniversalFromJD,
    LocalFromJD,
    LocalToJD,
    NewMoon,
    SunLongitude,
    LunarMonth11,
    LunarYear,
    Solar2Lunar,
    Lunar2Solar,
    canchi,
  };

  // CommonJS
  if (typeof module !== "undefined" && module.exports) {
    module.exports = VNLunar;
  }
  // Browser global
  if (typeof window !== "undefined") {
    window.VNLunar = VNLunar;
  }

  // ---------- CLI test runner ----------
  // You can pass a JSON string as argv[2], e.g.:
  // node vnlunar.js '{"utc":7,"cases":[{"fn":"UniversalToJD","args":[1,1,2000],"approx":2451544.5}]}'
  function nearlyEqual(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] === "number" && typeof b[i] === "number") {
        if (!nearlyEqual(a[i], b[i], 1e-6)) return false;
      } else if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function runDefaultTests() {
    const utc = 7.0;

    const tests = [
      // UniversalToJD
      { name: "UniversalToJD(1,1,2000)", run: () => UniversalToJD(1, 1, 2000), expect: 2451544.5 },
      { name: "UniversalToJD(4,10,1582)", run: () => UniversalToJD(4, 10, 1582), expect: 2299159.5 },
      { name: "UniversalToJD(15,10,1582)", run: () => UniversalToJD(15, 10, 1582), expect: 2299160.5 },

      // UniversalFromJD
      { name: "UniversalFromJD(2451544.5)", run: () => UniversalFromJD(2451544.5), expectArr: [1, 1, 2000] },
      { name: "UniversalFromJD(2451544.2083333335)", run: () => UniversalFromJD(2451544.2083333335), expectArr: [31, 12, 1999] },
      { name: "UniversalFromJD(2299160.5)", run: () => UniversalFromJD(2299160.5), expectArr: [15, 10, 1582] },
      { name: "UniversalFromJD(2299159.5)", run: () => UniversalFromJD(2299159.5), expectArr: [4, 10, 1582] },

      // Local conversions (Vietnam UTC+7)
      { name: "LocalToJD(1,1,2000,7)", run: () => LocalToJD(1, 1, 2000, utc), expect: 2451544.2083333335 },
      { name: "LocalFromJD(2451544.2083333335,7)", run: () => LocalFromJD(2451544.2083333335, utc), expectArr: [1, 1, 2000] },

      // New Moon examples
      { name: "NewMoon(1236)", run: () => NewMoon(1236), expect: 2451520.4393767994 },
      { name: "LocalFromJD(NewMoon(1236),7)", run: () => LocalFromJD(NewMoon(1236), utc), expectArr: [8, 12, 1999] },

      { name: "NewMoon(1237)", run: () => NewMoon(1237), expect: 2451550.2601371277 },
      { name: "LocalFromJD(NewMoon(1237),7)", run: () => LocalFromJD(NewMoon(1237), utc), expectArr: [7, 1, 2000] },

      { name: "NewMoon(1238)", run: () => NewMoon(1238), expect: 2451580.0448043263 },
      { name: "LocalFromJD(NewMoon(1238),7)", run: () => LocalFromJD(NewMoon(1238), utc), expectArr: [5, 2, 2000] },

      { name: "NewMoon(1239)", run: () => NewMoon(1239), expect: 2451609.721434823 },
      { name: "LocalFromJD(NewMoon(1239),7)", run: () => LocalFromJD(NewMoon(1239), utc), expectArr: [6, 3, 2000] },

      // SunLongitude examples
      // Doc example: SunLongitude(2451520.2083333335) ≈ 4.453168980086705
      { name: "SunLongitude(2451520.2083333335)", run: () => SunLongitude(2451520.2083333335), expect: 4.453168980086705 },
      // For 00:00 on 7/1/2000 Hanoi, the correct local JD is 2451550.2083333335 (not 2451520...).
      // Expected ≈ 4.986246180809974 per document.
      { name: "SunLongitude(2451550.2083333335)", run: () => SunLongitude(2451550.2083333335), expect: 4.986246180809974 },
    ];

    let passed = 0;
    for (const t of tests) {
      try {
        const out = t.run();
        let ok = false;
        if (typeof t.expect === "number") {
          ok = nearlyEqual(out, t.expect, 5e-7);
        } else if (t.expectArr) {
          ok = arraysEqual(out, t.expectArr);
        }
        if (ok) {
          console.log(`✅  ${t.name} -> OK`);
          passed++;
        } else {
          console.log(`❌  ${t.name}`);
          console.log("    Expected:", t.expect ?? t.expectArr, " Got:", out);
        }
      } catch (e) {
        console.log(`💥  ${t.name} threw:`, e.message);
      }
    }
    console.log(`\n${passed}/${tests.length} tests passed`);
  }

  function runCustomTests(jsonStr) {
    // Format:
    // {
    //   "utc": 7,
    //   "cases": [
    //     {"fn":"UniversalToJD","args":[1,1,2000],"approx":2451544.5},
    //     {"fn":"UniversalFromJD","args":[2451544.5],"equals":[1,1,2000]},
    //     {"fn":"SunLongitude","args":[2451520.2083333335],"approx":4.453168980086705}
    //   ]
    // }
    let cfg;
    try {
      cfg = JSON.parse(jsonStr);
    } catch (_) {
      console.error("Could not parse custom tests JSON. Falling back to defaults.\n");
      runDefaultTests();
      return;
    }

    const utc = typeof cfg.utc === "number" ? cfg.utc : 7;
    const cases = Array.isArray(cfg.cases) ? cfg.cases : [];
    let passed = 0;

    for (const c of cases) {
      const name =
        c.name || `${c.fn}(${Array.isArray(c.args) ? c.args.join(", ") : ""})`;
      try {
        const fn = VNLunar[c.fn];
        if (typeof fn !== "function") {
          console.log(`❌  ${name} -> function not found`);
          continue;
        }
        const args = Array.isArray(c.args) ? c.args : [];
        // Allow token "UTC" in args to expand to cfg.utc
        const realArgs = args.map((v) => (v === "UTC" ? utc : v));
        const out = fn.apply(null, realArgs);

        let ok = false;
        if (typeof c.approx === "number") {
          ok = typeof out === "number" && nearlyEqual(out, c.approx, c.eps || 5e-7);
        } else if (Array.isArray(c.equals)) {
          ok = arraysEqual(out, c.equals);
        } else {
          // If neither approx nor equals provided, just print the output
          ok = true;
          console.log(`ℹ️  ${name} ->`, out);
        }

        if (ok) {
          console.log(`✅  ${name} -> OK`);
          passed++;
        } else {
          console.log(`❌  ${name}`);
          console.log("    Expected:", c.approx ?? c.equals, " Got:", out);
        }
      } catch (e) {
        console.log(`💥  ${name} threw:`, e.message);
      }
    }
    console.log(`\n${passed}/${cases.length} custom tests passed`);
  }

  const isNode =
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node;

  if (
    isNode &&
    typeof require !== "undefined" &&
    typeof module !== "undefined" &&
    require.main === module
  ) {
    if (process.argv[2]) {
      runCustomTests(process.argv[2]);
    } else {
      runDefaultTests();
    }
  }
})();