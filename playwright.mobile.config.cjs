const base = require('./playwright.config.cjs');

module.exports = {
  ...base,
  testIgnore: ['**/visual.spec.cjs'],
  use: {
    ...base.use,
    viewport: { width: 390, height: 844 },
  },
};
