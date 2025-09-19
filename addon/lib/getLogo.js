require('dotenv').config();
const FanartTvApi = require("fanart.tv-api");
const apiKey = process.env.FANART_API;
const baseUrl = "http://webservice.fanart.tv/v3/";
const fanart = new FanartTvApi({ apiKey, baseUrl });

const { TMDBClient } = require("../utils/tmdbClient");
const moviedb = new TMDBClient(process.env.TMDB_API);

/**
 * SVG 파 일 인 지  확 인
 */
function isSvgUrl(url) {
  return url.toLowerCase().endsWith('.svg');
}
/**
 * 로 고  선 택  우 선 순 위  (SVG 제 외 ):
 * 1. 정 확 한  언 어  일 치  (e.g., 'ko-KR' → 'ko-KR')
 * 2. 기 본  언 어  일 치  (e.g., 'ko-KR' → 'ko')
 * 3. 그  외  (1,2순 위  없 으 면  빈  문 자 열  반 환 )
 * SVG 파 일 은  모 든  단 계 에 서  제 외
 */
function pickLogo(logos, language) {
  const primaryLang = language; // 'ko-KR'
  const secondaryLang = language.split("-")[0]; // 'ko'
  // SVG가  아 닌  로 고 만  필 터 링
  const nonSvgLogos = logos.filter(logo => !isSvgUrl(logo.url));
  // 1순 위 : 정 확 한  언 어  일 치  (SVG 제 외 )
  const exactMatch = nonSvgLogos.find(l => l.lang === primaryLang)?.url;
  if (exactMatch) return exactMatch;
  // 2순 위 : 기 본  언 어  일 치  (SVG 제 외 )
  const partialMatch = nonSvgLogos.find(l => l.lang === secondaryLang)?.url;
  if (partialMatch) return partialMatch;
  // 1,2순 위  없 으 면  빈  문 자 열  반 환
  return '';
}
/**
 * 영 화  로 고  가 져 오 기  (TMDB ID 기 준 )
 */
async function getLogo(tmdbId, language) {
  if (!tmdbId) {
    throw new Error(`TMDB ID not available for logo: ${tmdbId}`);
  }
  const [fanartRes, tmdbRes] = await Promise.all([
    fanart
      .getMovieImages(tmdbId)
      .then(res => res.hdmovielogo || [])
      .catch(() => []),
    moviedb
      .movieImages({ id: tmdbId })
      .then(res => res.logos || [])
      .catch(() => [])
  ]);
  // Fanart.tv 로 고  처 리  (빈  문 자 열  보 존 )
  const fanartLogos = fanartRes.map(l => ({
    url: l.url,
    lang: l.lang === "" ? "" : (l.lang || "ko"), // no language → 빈  문 자 열  유 지
    source: 'fanart'
  }));
  // TMDb 로 고  처 리  (no language → 빈  문 자 열 )
  const tmdbLogos = tmdbRes.map(l => ({
    url: `https://image.tmdb.org/t/p/original${l.file_path}`,
    lang: !l.iso_639_1 ? "" : l.iso_639_1, // no language → ""
    source: 'tmdb'
  }));
  const combined = [...fanartLogos, ...tmdbLogos];
  return pickLogo(combined, language);
}
/**
 * TV 로 고  가 져 오 기  (TVDB ID 또 는  TMDB ID 기 준 )
 */
async function getTvLogo(tvdb_id, tmdbId, language) {
  if (!tvdb_id && !tmdbId) {
    throw new Error(`TVDB ID and TMDB ID not available for logos.`);
  }
  const [fanartRes, tmdbRes] = await Promise.all([
    tvdb_id
      ? fanart
          .getShowImages(tvdb_id)
          .then(res => res.hdtvlogo || [])
          .catch(() => [])
      : Promise.resolve([]),
    tmdbId
      ? moviedb
          .tvImages({ id: tmdbId })
          .then(res => res.logos || [])
          .catch(() => [])
      : Promise.resolve([])
  ]);
  // Fanart.tv 로 고  처 리
  const fanartLogos = fanartRes.map(l => ({
    url: l.url,
    lang: l.lang === "" ? "" : (l.lang || "ko"), // no language → 빈  문 자 열  유 지
    source: 'fanart'
  }));
  // TMDb 로 고  처 리
  const tmdbLogos = tmdbRes.map(l => ({
    url: `https://image.tmdb.org/t/p/original${l.file_path}`,
    lang: !l.iso_639_1 ? "" : l.iso_639_1, // no language → ""
    source: 'tmdb'
  }));
  const combined = [...fanartLogos, ...tmdbLogos];
  return pickLogo(combined, language);
}
module.exports = { getLogo, getTvLogo, isSvgUrl };

