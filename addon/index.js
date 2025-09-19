const express = require("express");
const favicon = require('serve-favicon');
const path = require("path")
const addon = express();
const analytics = require('./utils/analytics');
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { blurImage } = require('./utils/imageProcessor');
const { testProxy, PROXY_CONFIG } = require('./utils/httpClient');

addon.use(analytics.middleware);
addon.use(favicon(path.join(__dirname, '../public/favicon.png')));
addon.use(express.static(path.join(__dirname, '../public')));
addon.use(express.static(path.join(__dirname, '../dist')));

const getCacheHeaders = function (opts) {
  opts = opts || {};

  if (!Object.keys(opts).length) return false;

  let cacheHeaders = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };

  return Object.keys(cacheHeaders)
    .map((prop) => {
      const value = opts[prop];
      if (!value) return false;
      return cacheHeaders[prop] + "=" + value;
    })
    .filter((val) => !!val)
    .join(", ");
};

const respond = function (res, data, opts) {
  const cacheControl = getCacheHeaders(opts);
  if (cacheControl) res.setHeader("Cache-Control", `${cacheControl}, public`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

addon.get("/", function (_, res) {
  res.redirect("/configure");
});

addon.get("/request_token", async function (req, res) {
  const requestToken = await getRequestToken()
  respond(res, requestToken);
});

addon.get("/session_id", async function (req, res) {
  const requestToken = req.query.request_token
  const sessionId = await getSessionId(requestToken)
  respond(res, sessionId);
});

addon.use('/configure', express.static(path.join(__dirname, '../dist')));

addon.use('/configure', (req, res, next) => {
  const config = parseConfig(req.params.catalogChoices) || {};
  next();
});

addon.get('/:catalogChoices?/configure', function (req, res) {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

addon.get("/:catalogChoices?/manifest.json", async function (req, res) {
    const { catalogChoices } = req.params;
    const config = parseConfig(catalogChoices) || {};
    const manifest = await getManifest(config);
    
    const cacheOpts = {
        cacheMaxAge: 12 * 60 * 60,
        staleRevalidate: 14 * 24 * 60 * 60, 
        staleError: 30 * 24 * 60 * 60, 
    };
    respond(res, manifest, cacheOpts);
});

addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async function (req, res) {
  const { catalogChoices, type, id, extra } = req.params;
  const config = parseConfig(catalogChoices) || {};
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey
  const sessionId = config.sessionId
  const { genre, skip, search } = extra
    ? Object.fromEntries(
      new URLSearchParams(req.url.split("/").pop().split("?")[0].slice(0, -5)).entries()
    )
    : {};
  let page;
  // MDBList 카  탈  로  그i  ID인t 지   확^ 인W 하r 여I  page 계^ 산C  로  직   분  기
  if (id.startsWith("mdblist.")) { // MDBList 카  탈  로  그   ID를   특  정  하^ 는J  조i 건   (예  : "mdblist.abcd", "mdblist.1234")
    // MDBList는   fetchMDBListItems에  서   limit=100이  므  로  , skip을   100으  로   나  눔
    page = Math.ceil(skip ? skip / 100 + 1 : undefined) || 1;
  } else {
    // 그   외  의   카  탈  로  그  (예  : TMDB)는   기  존   로  직  인   20으  로   나  눔
    page = Math.ceil(skip ? skip / 100 + 1 : undefined) || 1;
  }
  let metas = [];
  try {
    const args = [type, language, page]; // page 변  수  가   이  제   MDBList에   맞  춰   계  산  됩  니  다  .
    

    if (search) {
      metas = await getSearch(id, type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(...args, genre, config);
          break;
        case "tmdb.favorites":
          metas = await getFavorites(...args, genre, sessionId);
          break;
        case "tmdb.watchlist":
          metas = await getWatchList(...args, genre, sessionId);
          break;
        default:
          metas = await getCatalog(...args, id, genre, config);
          break;
      }
    }
  } catch (e) {
    res.status(404).send((e || {}).message || "Not found");
    return;
  }
  const cacheOpts = {
    cacheMaxAge: 1 * 24 * 60 * 60, 
    staleRevalidate: 7 * 24 * 60 * 60,
    staleError: 14 * 24 * 60 * 60,
  };
  if (rpdbkey) {
    try {
      metas = JSON.parse(JSON.stringify(metas));
      metas.metas = await Promise.all(metas.metas.map(async (el) => {
        const rpdbImage = getRpdbPoster(type, el.id.replace('tmdb:', ''), language, rpdbkey) 
        el.poster = await checkIfExists(rpdbImage) ? rpdbImage : el.poster;
        return el;
      }))
    } catch (e) { }
  }
  respond(res, metas, cacheOpts);
});

addon.get("/:catalogChoices?/meta/:type/:id.json", async function (req, res) {
  const { catalogChoices, type, id } = req.params;
  const config = parseConfig(catalogChoices) || {};
  const tmdbId = id.split(":")[1];
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey;
  const imdbId = req.params.id.split(":")[0];

  if (req.params.id.includes("tmdb:")) {
    const resp = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, async () => {
      return await getMeta(type, language, tmdbId, rpdbkey, config);
    });
    const cacheOpts = {
      staleRevalidate: 20 * 24 * 60 * 60,
      staleError: 30 * 24 * 60 * 60,
    };
    if (type == "movie") {
      cacheOpts.cacheMaxAge = 14 * 24 * 60 * 60;
    } else if (type == "series") {
      const hasEnded = !!((resp.releaseInfo || "").length > 5);
      cacheOpts.cacheMaxAge = (hasEnded ? 14 : 1) * 24 * 60 * 60;
    }
    respond(res, resp, cacheOpts);
  }
  if (req.params.id.includes("tt")) {
    const tmdbId = await getTmdb(type, imdbId);
    if (tmdbId) {
      const resp = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, async () => {
        return await getMeta(type, language, tmdbId, rpdbkey, config);
      });
      const cacheOpts = {
        staleRevalidate: 20 * 24 * 60 * 60,
        staleError: 30 * 24 * 60 * 60,
      };
      if (type == "movie") {
        cacheOpts.cacheMaxAge = 14 * 24 * 60 * 60;
      } else if (type == "series") {
        const hasEnded = !!((resp.releaseInfo || "").length > 5);
        cacheOpts.cacheMaxAge = (hasEnded ? 14 : 1) * 24 * 60 * 60;
      }
      respond(res, resp, cacheOpts);
    } else {
      respond(res, { meta: {} });
    }
  }
});

addon.get("/api/proxy/status", async function (req, res) {
  try {
    const proxyStatus = {
      enabled: PROXY_CONFIG.enabled,
      host: PROXY_CONFIG.host,
      port: PROXY_CONFIG.port,
      protocol: PROXY_CONFIG.protocol,
      working: false
    };

    if (PROXY_CONFIG.enabled) {
      proxyStatus.working = await testProxy();
    }

    respond(res, proxyStatus);
  } catch (error) {
    console.error('Error checking proxy status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

addon.get("/api/image/blur", async function (req, res) {
  const imageUrl = req.query.url;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL not provided' });
  }

  try {
    const blurredImageBuffer = await blurImage(imageUrl);
    
    if (!blurredImageBuffer) {
      return res.status(500).json({ error: 'Error processing image' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    res.send(blurredImageBuffer);
  } catch (error) {
    console.error('Error in blur route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = addon;
