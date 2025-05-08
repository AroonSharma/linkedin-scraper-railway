const cors = require('cors');
app.use(cors());
const express = require('express');
const { runScraper } = require('./scraper'); // make sure you move scraper logic into scraper.js
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.post('/scrape-now', async (req, res) => {
  console.log('🔥 Received /scrape-now request');
  res.status(200).send('✅ Server is alive and received your request!');
});

app.get('/', (req, res) => res.send('LinkedIn scraper is live 🚀'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
