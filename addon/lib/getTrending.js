require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const moviedb = new MovieDb(process.env.TMDB_API);
const { getGenreList } = require("./getGenreList");
const { parseMedia } = require("../utils/parseProps");
async function getTrending(type, language, page, genre) {
  const media_type = type === "series" ? "tv" : type;
  const genreList = await getGenreList(language, type);
  const ITEMS_PER_PAGE = 500;
  const TMDB_PAGE_SIZE = 20;  // TMDB는   한   페  이  지  에   20개  만   줌
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
          .filter(el => !["zh", "hi", "id", "vi", "th", "bn", "ml"].includes(el.original_language)) // 제  외  할   언  어   필  터
          .map((el) => parseMedia(el, type, genreList))
      )
      .catch((err) => {
        console.error(`Error fetching trending page ${startPage + i}:`, err);
        return [];
      });
  });
  const results = await Promise.all(fetches);
  return {
    metas: results.flat().slice(0, ITEMS_PER_PAGE)
  };
}
module.exports = { getTrending };
