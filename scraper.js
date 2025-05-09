// scraper.js
require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const linkedinCookies = [
  {
    name: 'li_at',
    value: process.env.LINKEDIN_COOKIE,
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  },
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runScraper() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
  );

  await page.setCookie(...linkedinCookies);
  console.log('🔐 Logging into LinkedIn...');

  try {
    await page.goto('https://www.linkedin.com/feed', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const url = page.url();
    if (url.includes('/login')) {
      console.error('❌ Not logged in – LinkedIn redirected to login page.');
      await page.screenshot({ path: 'login-failed.png' });
      await browser.close();
      return;
    }

    console.log('✅ Logged into LinkedIn successfully.');
  } catch (err) {
    console.error('❌ LinkedIn login failed:', err.message);
    await browser.close();
    return;
  }

  const { data: tags, error: tagError } = await supabase.from('interest_tags').select('tag');
  if (tagError) {
    console.error('❌ Failed to fetch tags:', tagError.message);
    await browser.close();
    return;
  }

  for (const tagObj of tags) {
    const tag = tagObj.tag.trim();
    if (!tag) continue;

    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(tag)}`;
    console.log(`🔍 Searching for tag: ${tag}`);

    try {
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await sleep(4000);
    } catch (err) {
      console.error(`❌ Failed to load search for tag "${tag}":`, err.message);
      continue;
    }

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(3000);
    }

    const posts = await page.evaluate(() => {
      const results = [];

      const containers = document.querySelectorAll('[data-urn][class*="search-content"]');
      containers.forEach(container => {
        const textNode = container.querySelector('[class*="update-components-text"]');
        const authorNode = container.querySelector('span[class*="feed-shared-actor__name"]') || container.querySelector('span[class*="entity-result__title-text"]');
        const socialCounts = container.querySelector('[class*="social-details-social-counts"]');

        const text = textNode?.innerText?.trim();
        const author = authorNode?.innerText?.trim() || 'Unknown';

        const likesMatch = socialCounts?.innerText?.match(/(\d+(,\d{3})*|\d+)\s+like/) || [];
        const commentsMatch = socialCounts?.innerText?.match(/(\d+(,\d{3})*|\d+)\s+comment/) || [];

        const likes = parseInt(likesMatch[1]?.replace(/,/g, '')) || 0;
        const comments = parseInt(commentsMatch[1]?.replace(/,/g, '')) || 0;

        const postAnchor = container.querySelector('a[href*="/feed/update/"]');
        const postUrl = postAnchor?.href || '';

        if (text && postUrl) {
          results.push({
            author_name: author,
            post_content: text,
            post_url: postUrl,
            likes,
            comments_count: comments,
            status: 'new',
          });
        }
      });

      return results;
    });

    console.log(`📦 Found ${posts.length} posts for "${tag}"`);

    for (const post of posts) {
      console.log('⬇ Inserting post preview:', post.post_content.slice(0, 60));
      const { error } = await supabase.from('linkedin_posts').insert([post]);
      if (error) {
        console.error('❌ Insert failed:', error.message);
      } else {
        console.log('✅ Inserted post');
      }
    }
  }

  console.log('✅ Scraper finished');
  await browser.close();
}

module.exports = { runScraper };
