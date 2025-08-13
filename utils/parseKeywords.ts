import Keyword from '../database/models/keyword';

/**
 * Parses the SQL Keyword Model object to frontend cosumable object.
 * @param {Keyword[]} allKeywords - Keywords to scrape
 * @returns {KeywordType[]}
 */
const parseKeywords = (allKeywords: Keyword[]) : KeywordType[] => {
   const parsedItems = allKeywords.map((keywrd:Keyword) => {
      let history: any = {};
      let tags: any = [];
      let lastResult: any = [];
      let lastUpdateError: any = false;
      try {
         history = JSON.parse(keywrd.history);
      } catch (err) {
         console.log('Error parsing history JSON', err);
         history = {};
      }
      try {
         tags = JSON.parse(keywrd.tags);
      } catch (err) {
         console.log('Error parsing tags JSON', err);
         tags = [];
      }
      try {
         lastResult = JSON.parse(keywrd.lastResult);
      } catch (err) {
         console.log('Error parsing lastResult JSON', err);
         lastResult = [];
      }
      try {
         lastUpdateError = keywrd.lastUpdateError !== 'false' && keywrd.lastUpdateError.includes('{')
            ? JSON.parse(keywrd.lastUpdateError)
            : false;
      } catch (err) {
         console.log('Error parsing lastUpdateError JSON', err);
         lastUpdateError = false;
      }
      return {
         ...keywrd,
         history,
         tags,
         lastResult,
         lastUpdateError,
      };
   });
   return parsedItems;
};

export default parseKeywords;
