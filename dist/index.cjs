'use strict';

const puppeteer = require('puppeteer');
const fsPromises = require('fs/promises');
const path = require('path');
const url = require('url');
const fs = require('fs');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const puppeteer__default = /*#__PURE__*/_interopDefaultCompat(puppeteer);
const fsPromises__default = /*#__PURE__*/_interopDefaultCompat(fsPromises);

const __filename$1 = url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)));
const __dirname$1 = path.dirname(__filename$1);
async function loadFingerprints(debug = false, customDir) {
  const localCorePath = path.resolve(__dirname$1, "../../core");
  const nodeModulesCorePath = path.resolve(__dirname$1, "../../node_modules/whats-that-tech-core/core");
  const distCorePath = path.resolve(__dirname$1, "../../dist/core.json");
  if (customDir && fs.existsSync(customDir)) {
    if (debug) {
      console.log(`Attempting to load fingerprints from custom directory: ${customDir}`);
    }
    try {
      const sourcePath = customDir;
      const techDirs = await fsPromises.readdir(sourcePath);
      const fingerprints = {};
      for (const tech of techDirs) {
        const techPath = path.join(sourcePath, tech);
        if (!fs.statSync(techPath).isDirectory() || tech.startsWith(".")) continue;
        try {
          const files = await fsPromises.readdir(techPath);
          for (const file of files) {
            if (file.endsWith(".json")) {
              const fingerprintPath = path.join(techPath, file);
              const content = await fsPromises.readFile(fingerprintPath, "utf-8");
              fingerprints[tech] = JSON.parse(content);
              if (debug) {
                console.log(`Loaded custom fingerprint for ${tech}`);
              }
            }
          }
        } catch (error) {
          if (debug) {
            console.error(`Failed to load fingerprint for ${tech} from custom directory:`, error);
          }
        }
      }
      if (Object.keys(fingerprints).length > 0) {
        if (debug) {
          console.log(`Loaded ${Object.keys(fingerprints).length} fingerprints from custom directory: ${customDir}`);
        }
        return fingerprints;
      } else {
        if (debug) {
          console.warn(`Custom directory specified (${customDir}), but no fingerprints were loaded from it.`);
        }
      }
    } catch (error) {
      if (debug) {
        console.error(`Error accessing custom directory ${customDir}:`, error);
      }
    }
  } else if (customDir && !fs.existsSync(customDir)) {
    if (debug) {
      console.warn(`Custom directory specified (${customDir}), but it does not exist. Falling back to default paths.`);
    }
  }
  if (fs.existsSync(localCorePath) || fs.existsSync(nodeModulesCorePath)) {
    const sourcePath = fs.existsSync(localCorePath) ? localCorePath : nodeModulesCorePath;
    if (debug) {
      console.log("Loading fingerprints from development path:", sourcePath);
    }
    const techDirs = await fsPromises__default.readdir(sourcePath);
    const fingerprints = {};
    for (const tech of techDirs) {
      const techPath = path.join(sourcePath, tech);
      const stat = await fsPromises__default.stat(techPath);
      if (!stat.isDirectory() || tech.startsWith(".")) continue;
      try {
        const files = await fsPromises__default.readdir(techPath);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const fingerprintPath = path.join(techPath, file);
            const content = await fsPromises__default.readFile(fingerprintPath, "utf-8");
            fingerprints[tech] = JSON.parse(content);
            if (debug) {
              console.log(`Loaded fingerprint for ${tech}`);
            }
          }
        }
      } catch (error) {
        if (debug) {
          console.error(`Failed to load fingerprint for ${tech}:`, error);
        }
        continue;
      }
    }
    if (debug) {
      console.log(`Loaded ${Object.keys(fingerprints).length} fingerprints from development mode`);
    }
    return fingerprints;
  }
  try {
    if (fs.existsSync(distCorePath)) {
      const corePath = distCorePath;
      if (debug) {
        console.log("Loading fingerprints from distribution/fallback path:", corePath);
      }
      const content = await fsPromises__default.readFile(corePath, "utf-8");
      const fingerprints = JSON.parse(content);
      if (debug) {
        console.log(`Loaded ${Object.keys(fingerprints).length} fingerprints from core.json`);
      }
      return fingerprints;
    }
  } catch (error) {
    if (debug) {
      console.error("Failed to load core.json:", error);
    }
  }
  if (debug) {
    console.error("No fingerprints could be loaded from any source");
  }
  return {};
}

async function findTech(options) {
  const { url, headless = true, timeout = 3e4, categories, excludeCategories, customFingerprintsDir, debug = false, onProgress } = options;
  onProgress?.({
    current: 1,
    total: 1,
    currentUrl: url,
    status: "processing"
  });
  try {
    if (debug) {
      if (customFingerprintsDir) {
        console.log(`Debug: Attempting to load fingerprints from custom directory specified: ${customFingerprintsDir}`);
      } else {
        console.log("Debug: No custom fingerprint directory specified. Using default path resolution (Dev -> Node Modules -> Dist -> Root).");
      }
    }
    const fingerprints = await loadFingerprints(debug, customFingerprintsDir);
    if (Object.keys(fingerprints).length === 0) {
      throw new Error("No fingerprints loaded");
    }
    if (debug) {
      console.log("Current working directory:", process.cwd());
      console.log("Available fingerprints:", Object.keys(fingerprints));
    }
    const browser = await puppeteer__default.launch({ headless });
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout });
      const results = [];
      for (const [tech, fingerprint] of Object.entries(fingerprints)) {
        if (categories && fingerprint.categories) {
          const hasMatchingCategory = fingerprint.categories.some((cat) => categories.includes(cat));
          if (!hasMatchingCategory) continue;
        }
        if (excludeCategories && fingerprint.categories) {
          const hasExcludedCategory = fingerprint.categories.some((cat) => excludeCategories.includes(cat));
          if (hasExcludedCategory) continue;
        }
        const detected = await detectTechnology(page, fingerprint);
        if (debug && detected) {
          console.log(`Detected ${tech} with categories:`, fingerprint.categories);
        }
        results.push({
          name: tech,
          categories: fingerprint.categories || ["unidentified"],
          detected
        });
      }
      onProgress?.({
        current: 1,
        total: 1,
        currentUrl: url,
        status: "completed"
      });
      return results;
    } finally {
      await browser.close();
    }
  } catch (error) {
    onProgress?.({
      current: 1,
      total: 1,
      currentUrl: url,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
async function detectTechnology(page, fingerprint) {
  const { detectors } = fingerprint;
  if (detectors.htmlContains) {
    const html = await page.content();
    if (detectors.htmlContains.some((text) => html.includes(text))) {
      return true;
    }
  }
  if (detectors.htmlRegex) {
    const html = await page.content();
    if (new RegExp(detectors.htmlRegex).test(html)) {
      return true;
    }
  }
  if (detectors.requestUrlRegex) {
    const requests = await page.evaluate(() => {
      return globalThis.performance.getEntriesByType("resource").map((entry) => entry.name);
    });
    const regexes = Array.isArray(detectors.requestUrlRegex) ? detectors.requestUrlRegex : [detectors.requestUrlRegex];
    if (requests.some(
      (url) => regexes.some((regex) => new RegExp(regex).test(url))
    )) {
      return true;
    }
  }
  if (detectors.selectorExists) {
    for (const selector of detectors.selectorExists) {
      if (await page.$(selector)) {
        return true;
      }
    }
  }
  if (detectors.globalVariables) {
    const globals = await page.evaluate((vars) => {
      return vars.map((v) => globalThis[v] !== void 0);
    }, detectors.globalVariables);
    if (globals.some((exists) => exists)) {
      return true;
    }
  }
  if (detectors.cssCommentRegex) {
    const styles = await page.evaluate(() => {
      return Array.from(globalThis.document.styleSheets).map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
        } catch {
          return "";
        }
      }).join("\n");
    });
    if (new RegExp(detectors.cssCommentRegex).test(styles)) {
      return true;
    }
  }
  return false;
}
if ((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)) === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Please provide URLs as arguments");
    process.exit(1);
  }
  const options = {
    url: args[0],
    headless: true,
    onProgress: (progress) => {
      console.log(JSON.stringify(progress));
    }
  };
  findTech(options).then((results) => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }).catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

exports.findTech = findTech;
