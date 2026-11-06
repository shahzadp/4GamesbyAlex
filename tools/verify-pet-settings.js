/* Probe: pet settings page after the reminder removal.
 *
 * Checks, in English and in Urdu:
 *   - no #pet-reminder-block or any reminder control remains
 *   - memories and voice/AI sections render
 *   - the page does not overflow horizontally
 *   - no page errors were thrown
 */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL = "http://127.0.0.1:8099/index.html";

async function checkLang(cdp, lang) {
  await cdp.send("Page.navigate", { url: URL });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await evaluate(cdp, `typeof switchPage === 'function'`)) break;
  }
  await evaluate(cdp, `localStorage.setItem('pet_language', '${lang}')`);
  await cdp.send("Page.navigate", { url: URL });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await evaluate(cdp, `typeof switchPage === 'function'`)) break;
  }
  // run the pet language pass and open the settings page
  await evaluate(cdp, `(() => {
    const select = document.getElementById('pet-language');
    if (select) { select.value = '${lang}'; select.dispatchEvent(new Event('change')); }
    switchPage('pet-settings');
    return true;
  })()`);
  await sleep(400);

  return JSON.parse(
    await evaluate(
      cdp,
      `JSON.stringify((function () {
        const page = document.getElementById('page-pet-settings');
        const scroll = document.documentElement.scrollWidth;
        const inner = window.innerWidth;
        const reminder = document.getElementById('pet-reminder-block');
        const reminderControls = page.querySelectorAll('[id^="pet-reminder"], [data-i18n^="reminder"], [data-i18n^="reliability"], [data-i18n^="autostart"], [id*="reminder" i], [class*="reminder" i]').length;
        const heading = (id) => (document.getElementById(id) || {}).textContent || '';
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        return {
          lang: document.documentElement.lang,
          petLanguage: localStorage.getItem('pet_language'),
          reminderBlockExists: Boolean(reminder),
          reminderControls,
          memoriesHeading: heading('pet-memory-heading'),
          voiceHeading: heading('pet-voice-heading'),
          memoriesVisible: visible(document.getElementById('pet-memory-heading')),
          voiceVisible: visible(document.getElementById('pet-voice-heading')),
          apiKeyVisible: visible(document.getElementById('pet-api-key')),
          languageSelectVisible: visible(document.getElementById('pet-language')),
          pageScrollWidth: scroll,
          windowInnerWidth: inner,
          overflow: scroll > inner + 1
        };
      })())`
    )
  );
}

async function main() {
  const { cdp, close } = await launchEdge({ width: 900, height: 420 });
  const failures = [];
  const errors = [];

  cdp.on("Runtime.exceptionThrown", (params) => {
    const d = params.exceptionDetails;
    const text = d.exception?.description || d.text || JSON.stringify(d);
    errors.push(String(text).split("\n")[0]);
  });

  try {
    for (const lang of ["en", "ur"]) {
      const report = await checkLang(cdp, lang);
      console.log(`\n${lang.toUpperCase()} pet settings:`);
      console.log(JSON.stringify(report, null, 2));

      if (report.reminderBlockExists) failures.push(`${lang}: the reminder block is still in the page`);
      if (report.reminderControls > 0) failures.push(`${lang}: ${report.reminderControls} reminder control(s) still in the page`);
      if (!report.memoriesHeading) failures.push(`${lang}: the memories section did not render`);
      if (!report.voiceHeading) failures.push(`${lang}: the voice and AI section did not render`);
      if (!report.memoriesVisible || !report.voiceVisible || !report.apiKeyVisible || !report.languageSelectVisible) {
        failures.push(`${lang}: a section of the settings page is not visible`);
      }
      if (report.overflow) failures.push(`${lang}: the page overflows horizontally (${report.pageScrollWidth}px vs ${report.windowInnerWidth}px)`);
    }

    const realErrors = errors.filter((e) => !/WebGL|swiftshader|GroupMarkerNotSet|Automatic fallback|GPU stall/i.test(e));
    if (realErrors.length) failures.push(`page errors: ${realErrors.join(" | ")}`);

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: pet settings page renders in English and Urdu with no reminder content and no overflow");
    }
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
