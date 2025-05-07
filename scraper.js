// scraper.js
require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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
 const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});


  const page = await browser.newPage();
  await page.setCookie(...linkedinCookies);

  console.log('🔐 Logging into LinkedIn...');
  try {
    await page.goto('https://www.linkedin.com/feed', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const url = page.url();
    if (url.includes('/login')) {
      throw new Error('❌ Not logged in – LinkedIn redirected to login page.');
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
    const tag = tagObj.tag;
    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(tag)}&origin=SWITCH_SEARCH_VERTICAL`;

    console.log(`🔍 Searching for tag: ${tag}`);
    try {
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await sleep(3000);
    } catch (err) {
      console.error(`❌ Failed to load search for tag "${tag}":`, err.message);
      continue;
    }

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(2000);
    }

    const posts = await page.evaluate(() => {
      const results = [];
      const nodes = document.querySelectorAll('[class*="update-components-text"]');
      nodes.forEach((node) => {
        const text = node.innerText?.trim();
        if (text && text.length > 30) {
          results.push({
            author_name: 'Unknown',
            post_content: text,
            post_url: window.location.href,
            likes: null,
            comments_count: null,
            status: 'new',
          });
        }
      });
      return results;
    });

    console.log(`📦 Found ${posts.length} posts for "${tag}"`);
    fs.writeFileSync(`posts-${tag}.json`, JSON.stringify(posts, null, 2));

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
