// Mock for until-async package
const until = async (callback) => {
  try {
    const result = await callback();
    return [null, result];
  } catch (error) {
    return [error, null];
  }
};

module.exports = { until };