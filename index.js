const express = require('express');
const cors = require('cors');
const { runScraper } = require('./scraper');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.post('/scrape-now', async (req, res) => {
  try {
    await runScraper();
    res.status(200).send('✅ Scraping completed successfully!');
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    res.status(500).send('Error occurred during scraping.');
  }
});

app.get('/', (req, res) => res.send('LinkedIn scraper is live 🚀'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
