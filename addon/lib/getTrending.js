require("dotenv").config();
const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);
const { getMeta } = require("./getMeta");

const EXCLUDED_LANGUAGES = ["zh", "hi", "id", "vi", "th", "bn", "ml"];

async function getTrending(type, language, genre, config) {
  const media_type = type === "series" ? "tv" : type;

  // 25페이지 병렬 호출
  const pages = Array.from({ length: 25 }, (_, i) => i + 1);
  const trendingPromises = pages.map(async (page) => {
    const parameters = {
      media_type,
      time_window: genre ? genre.toLowerCase() : "day",
      language,
      page,
    };

    try {
      const res = await moviedb.trending(parameters);
      if (!res.results || res.results.length === 0) return [];
      // 특정 언어 제외
      return res.results.filter(el => !EXCLUDED_LANGUAGES.includes(el.original_language));
    } catch (err) {
      console.error(`Error fetching trending page ${page}:`, err.message);
      return [];
    }
  });

  const allResultsPages = await Promise.all(trendingPromises);
  const allResults = allResultsPages.flat();

  // 메타데이터도 병렬 호출
  const metaPromises = allResults.map(item =>
    getMeta(type, language, item.id, config.rpdbkey)
      .then(result => result.meta)
      .catch(err => {
        console.error(`Error fetching metadata for ${item.id}:`, err.message);
        return null;
      })
  );

  const metas = (await Promise.all(metaPromises)).filter(Boolean);
  return { metas };
}

module.exports = { getTrending };
