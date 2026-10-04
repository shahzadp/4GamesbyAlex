/* Measure the app process's CPU usage over a fixed window, in percent of one core.
 *
 * Why not `top -b -n 1`: it is an instantaneous sample and reads anywhere from
 * 0.0% to 87% on this device for the same steady state, which is how the first
 * pass at this investigation nearly produced a false conclusion.
 *
 * /proc/<pid>/stat exposes utime and stime in clock ticks. The delta over a known
 * interval divided by (interval * CLK_TCK) is the true average. CLK_TCK is 100 on
 * every Android ABI, and getconf is queried anyway rather than assumed. */
const { execFileSync } = require('child_process');

const PKG = process.argv[2] || 'com.example.artgallery';
const WINDOW_S = Number(process.argv[3] || 6);

const adb = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';
const sh = (cmd) => execFileSync(adb, ['shell', cmd], { encoding: 'utf8' }).trim();

const pid = sh(`pidof ${PKG} || pgrep -f ${PKG}`).split(/\s+/)[0];
if (!pid) { console.error('process not running'); process.exit(1); }

let hz = 100;
try {
  const v = sh('getconf CLK_TCK');
  if (v && Number(v) > 0) hz = Number(v);
} catch (e) { /* keep the default */ }

/* Fields 14 and 15 (1-based) are utime and stime. Field 2 is comm in parens and
   may contain spaces, so split after the closing paren. */
function ticks() {
  const s = sh(`cat /proc/${pid}/stat`);
  const rest = s.slice(s.lastIndexOf(')') + 2).split(' ');
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  return utime + stime;
}

const t0 = ticks();
const w0 = Date.now();
execFileSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Seconds ${WINDOW_S}`]);
const t1 = ticks();
const elapsed = (Date.now() - w0) / 1000;

const deltaTicks = t1 - t0;
const pct = (deltaTicks / (elapsed * hz)) * 100;

console.log(`pid=${pid} hz=${hz} window=${elapsed.toFixed(1)}s ticks=${deltaTicks}`
  + ` -> ${pct.toFixed(1)}% of one core`);