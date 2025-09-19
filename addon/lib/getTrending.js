require("dotenv").config();
const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);

// 2번 코드가 참조하던 유틸을 주입받는 형태로 안전 처리
// 외부에서 parseMedia와 genreList를 넘기지 않으면 에러 방지
function createGetTrending({ parseMedia, genreList } = {}) {
  if (typeof parseMedia !== "function") {
    throw new Error("parseMedia 함수가 필요합니다.");
  }

  const EXCLUDED_LANGUAGES = ["zh", "hi", "id", "vi", "th", "bn", "ml"];

  return async function getTrending(type, language, page, genre) {
    const media_type = type === "series" ? "tv" : type;

    const ITEMS_PER_PAGE = 500;      // 최종 가져올 아이템 수
    const TMDB_PAGE_SIZE = 20;       // TMDb 한 페이지당 아이템 수
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
        .then((res) =>
          res.results
            .filter(
              (el) => !EXCLUDED_LANGUAGES.includes(el.original_language)
            )
            .map((el) => parseMedia(el, type, genreList))
        )
        .catch((err) => {
          console.error(`Error fetching trending page ${startPage + i}:`, err);
          return [];
        });
    });

    const results = await Promise.all(fetches);
    return {
      metas: results.flat().slice(0, ITEMS_PER_PAGE),
    };
  };
}

module.exports = { createGetTrending };
