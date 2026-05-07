const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to Power Automate...');
  await page.goto('https://make.powerautomate.com');
  
  // Wait for redirect to login
  await page.waitForTimeout(2000);
  
  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'power-automate-login.png' });
  
  await browser.close();
  console.log('Done.');
})();
