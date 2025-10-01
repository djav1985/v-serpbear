const proxy:ScraperSettings = {
   id: 'proxy',
   name: 'Proxy',
   website: '',
   resultObjectKey: 'data',
   supportsMapPack: false,
   headers: () => ({ Accept: 'gzip,deflate,compress;' }),
   scrapeURL: (keyword: KeywordType) => `https://www.google.com/search?num=100&q=${encodeURI(keyword.keyword)}`,
};

export default proxy;
