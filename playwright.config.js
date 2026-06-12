'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 45000,
    expect: {
        timeout: 10000
    },
    reporter: [['list']],
    use: {
        baseURL: 'http://127.0.0.1:4176',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'mobile-chrome',
            use: {
                ...devices['Pixel 5'],
                viewport: { width: 390, height: 844 }
            }
        }
    ],
    webServer: {
        command: 'npm run build && npx serve www -l 4176',
        url: 'http://127.0.0.1:4176',
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    }
});
