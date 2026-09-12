const {join} = require('path');

/**
 * Browsershot's bundled script hardcodes `require('puppeteer')` (not
 * `puppeteer-core`), so the full package has to be installed — but we always
 * pass our own Chrome via POSTER_CHROME_PATH (setChromePath -> executablePath),
 * so there's no reason to let `npm install` also download a bundled Chromium.
 * This is Puppeteer's documented way to skip that download reliably (an env
 * var at install time is timing-sensitive across npm versions).
 */
module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
    skipDownload: true,
};
