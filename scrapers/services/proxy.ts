const proxy:ScraperSettings = {
   id: 'proxy',
   name: 'Proxy',
   website: '',
   resultObjectKey: 'data',
   supportsMapPack: false,
   headers: () => ({ Accept: 'gzip,deflate,compress;' }),
   scrapeURL: (keyword: KeywordType, _settings: SettingsType, _countries: countryData, pagination?: ScraperPagination) => {
      const p = pagination || { start: 0, num: 10 };
      return `https://www.google.com/search?num=${p.num}&start=${p.start}&q=${encodeURI(keyword.keyword)}`;
   },
};

export default proxy;
