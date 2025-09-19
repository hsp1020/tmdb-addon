require("dotenv").config();
const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);
const { getMeta } = require("./getMeta");

const EXCLUDED_LANGUAGES = ["zh", "hi", "id", "vi", "th", "bn", "ml"];

async function getTrending(type, language, page, genre, config) {
  const media_type = type === "series" ? "tv" : type;

  const ITEMS_PER_PAGE = 500;       // 최종 가져올 아이템 수
  const TMDB_PAGE_SIZE = 20;        // TMDb 한 페이지당 아이템 수
  const PAGES_TO_FETCH = Math.ceil(ITEMS_PER_PAGE / TMDB_PAGE_SIZE);

  const startPage = (page - 1) * PAGES_TO_FETCH + 1;

  const fetches = Array.from({ length: PAGES_TO_FETCH }, (_, i) => {
    const parameters = {
      media_type,
      time_window: genre ? genre.toLowerCase() : "day",
      language,
      page: startPage + i,
    };

    return moviedb
      .trending(parameters)
      .then(async (res) => {
        // TMDb 결과에서 제외할 언어 필터 적용
        const filteredResults = res.results.filter(
          (item) => !EXCLUDED_LANGUAGES.includes(item.original_language)
        );

        // getMeta 호출
        const metaPromises = filteredResults.map((item) =>
          getMeta(type, language, item.id, config.rpdbkey)
            .then((result) => result.meta)
            .catch((err) => {
              console.error(`Error fetching metadata for ${item.id}:`, err.message);
              return null;
            })
        );

        const metas = await Promise.all(metaPromises);
        return metas.filter(Boolean);
      })
      .catch((err) => {
        console.error(`Error fetching trending page ${startPage + i}:`, err);
        return [];
      });
  });

  const results = await Promise.all(fetches);
  return {
    metas: results.flat().slice(0, ITEMS_PER_PAGE), // 정확히 500개로 제한
  };
}

module.exports = { getTrending };
