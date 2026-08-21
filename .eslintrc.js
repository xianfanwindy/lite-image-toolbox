module.exports = {
  env: { browser: true, node: true },
  globals: {
    App: 'readonly', Component: 'readonly', Page: 'readonly',
    getCurrentPages: 'readonly', wx: 'readonly'
  },
  extends: 'eslint:recommended',
  parserOptions: { ecmaVersion: 2021, sourceType: 'script' }
}
