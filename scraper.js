require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// 🔐 Supabase setup
const supabaseUrl = 'https://nzzzuxzftjrodmtlfmpn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56enp1eHpmdGpyb2RtdGxmbXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MDE3NDUsImV4cCI6MjA2MjE3Nzc0NX0.CBFWDudW6UwpJR2_TSkOV6dT_d7jUtMr70SspgxyZ8E';
const supabase = createClient(supabaseUrl, supabaseKey);

// 🍪 LinkedIn cookie
const linkedinCookies = [
  {
    name: 'li_at',
    value: 'AQEDAQFOrqIEE2EkAAABloFc5ZAAAAGWyZ5KbVYAZPh4ErUTyfSID2eBmxhK-KKFUKu1wVZi64xM4hi5AvwqZcvdbsHDZor2nZxLa1k03fw9mnj33aCaNGe3_pz9UDQtPvqTUPImP03nn2Ugrk7GAJaQ',
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  },
];

// 💤 Custom delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
    devtools: true,
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
      console.error('❌ Not logged in – LinkedIn redirected to login page.');
      console.log('🛑 Keeping browser open for inspection...');
      await new Promise(() => {});
    }

    console.log('✅ Logged into LinkedIn successfully.');
  } catch (err) {
    console.error('❌ LinkedIn feed page failed to load:', err.message);
    console.log('🛑 Keeping browser open for inspection...');
    await new Promise(() => {});
  }

  // 🎯 Fetch interest tags
  const { data: tags, error: tagError } = await supabase.from('interest_tags').select('tag');
  console.log('📥 Tags from Supabase:', tags);
  if (tagError) {
    console.error('❌ Failed to fetch tags:', tagError.message);
    await new Promise(() => {});
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

    if (posts.length === 0) {
      console.log(`⚠️ No posts scraped for "${tag}".`);
      continue;
    }

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

  console.log('🛑 Script done. Keeping browser open for inspection...');
  await new Promise(() => {}); // ⛔ Infinite pause
})();
