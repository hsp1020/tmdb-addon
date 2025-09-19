require("dotenv").config();
const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);
const { parseMedia } = require("./parseMedia"); // parseMedia 함수 import 필요
const genreList = require("./genreList");       // 필요 시 장르 리스트 import

const EXCLUDED_LANGUAGES = ["zh", "hi", "id", "vi", "th", "bn", "ml"];

async function getTrending(type, language, page, genre, config) {
  const media_type = type === "series" ? "tv" : type;

  const ITEMS_PER_PAGE = 500;       // 최종 가져올 아이템 수
  const TMDB_PAGE_SIZE = 20;        // TMDb 한 페이지당 20개
  const PAGES_TO_FETCH = Math.ceil(ITEMS_PER_PAGE / TMDB_PAGE_SIZE);

  const startPage = (page - 1) * PAGES_TO_FETCH + 1;

  // 페이지 단위 병렬 fetch
  const fetches = Array.from({ length: PAGES_TO_FETCH }, (_, i) => {
    const parameters = {
      media_type,
      time_window: genre ? genre.toLowerCase() : "day",
      language,
      page: startPage + i,
    };

    return moviedb
      .trending(parameters)
      .then((res) =>
        res.results
          .filter(el => !EXCLUDED_LANGUAGES.includes(el.original_language)) // 제외 언어 필터
          .map(el => parseMedia(el, type, genreList)) // 필터 후 parseMedia
      )
      .catch((err) => {
        console.error(`Error fetching trending page ${startPage + i}:`, err);
        return [];
      });
  });

  const results = await Promise.all(fetches);

  return {
    metas: results.flat().slice(0, ITEMS_PER_PAGE), // 최종 500개 제한
  };
}

module.exports = { getTrending };
