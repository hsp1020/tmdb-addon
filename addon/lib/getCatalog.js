require("dotenv").config();
const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const { getMeta } = require("./getMeta");
const CATALOG_TYPES = require("../static/catalog-types.json");

async function getCatalog(type, language, page, id, genre, config) {
  const mdblistKey = config.mdblistkey;
  if (id.startsWith("mdblist.")) {
    const listId = id.split(".")[1];
    const results = await fetchMDBListItems(listId, mdblistKey, language, page);
    const parseResults = await parseMDBListItems(results, type, genre, language, config.rpdbkey);
    return parseResults;
  }
  const genreList = await getGenreList(language, type);
  const parameters = await buildParameters(type, language, page, id, genre, genreList, config);
  const fetchFunction = type === "movie"
    ? moviedb.discoverMovie.bind(moviedb)
    : moviedb.discoverTv.bind(moviedb);
  // ✅   병  렬   페  치   설  정
  const ITEMS_PER_PAGE = 100;
  const TMDB_PAGE_SIZE = 20;
  const PAGES_TO_FETCH = Math.ceil(ITEMS_PER_PAGE / TMDB_PAGE_SIZE);
  const startPage = (page - 1) * PAGES_TO_FETCH + 1;
  const fetches = Array.from({ length: PAGES_TO_FETCH }, (_, i) => {
    const params = { ...parameters, page: startPage + i };
    return fetchFunction(params)
      .then(res => res.results || [])
      .catch(err => {
        console.error(`Error fetching page ${startPage + i}:`, err.message);
        return [];
      });
  });
  // ✅   여  러   페  이  지   결  과   병  합
  const pages = await Promise.all(fetches);
  const items = pages.flat().slice(0, ITEMS_PER_PAGE); // 최  대   100개   자  르  기
  // ✅   getMeta 병  렬   처  리   (기  존   구  조   유  지  )
  const metaPromises = items.map(item =>
    getMeta(type, language, item.id, config.rpdbkey)
      .then(result => result.meta)
      .catch(err => {
        console.error(`Erro ao buscar metadados para ${item.id}:`, err.message);
        return null;
      })
  );
  const metas = (await Promise.all(metaPromises)).filter(Boolean);
  return { metas };
}
async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages();
  // 공 통  기 본  파 라 미 터
  let parameters = {
    language,
    page,
  };
if (type === 'movie') {
  // 기본값은 1 이상
  parameters.with_original_language = 'ko';
  parameters.certification_country = "KR";
  parameters.certification = "All|7|12|15|18|19";
}

if (type === 'series') {
  parameters.with_original_language = 'ko';
}

if (id.includes("streaming")) {
  const provider = findProvider(id.split(".")[1]);
  parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
  parameters.with_watch_providers = provider.watchProviderId;
  parameters.watch_region = provider.country;
  parameters.with_watch_monetization_types = "flatrate|free|ads";
} else {
  switch (id) {
    case "tmdb.top":
    case "tmdb.language":
      if (type === "movie") {
        parameters['vote_count.gte'] = 5; // ✅ 영화는 최소 투표수 5 이상
      }
      parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
      if (id === "tmdb.language") {
        const findGenre = genre ? findLanguageCode(genre, languages) : language.split("-")[0];
        parameters.with_original_language = findGenre;
      }
      break;

    case "tmdb.year":
      if (type === "movie") {
        parameters['vote_count.gte'] = 1; // ✅ 영화는 최소 투표수 1 이상
      }
      const year = genre ? genre : new Date().getFullYear();
      parameters[type === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
      parameters.sort_by = type === "movie" ? "release_date.desc" : "first_air_date.desc";
      break;

    default:
      break;
  }
}
  return parameters;
}
function findGenreId(genreName, genreList) {
  const genreData = genreList.find(genre => genre.name === genreName);
  return genreData ? genreData.id : undefined;
}
function findLanguageCode(genre, languages) {
  const language = languages.find(lang => lang.name === genre);
  return language ? language.iso_639_1.split("-")[0] : "";
}
function findProvider(providerId) {
  const provider = CATALOG_TYPES.streaming[providerId];
  if (!provider) throw new Error(`Could not find provider: ${providerId}`);
  return provider;
}
module.exports = { getCatalog };
