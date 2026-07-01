import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper function to fetch stock data from Yahoo Finance chart API
async function fetchStockQuote(symbol) {
  let searchSymbol = symbol.toUpperCase();
  if (!searchSymbol.endsWith('.NS') && !searchSymbol.endsWith('.BO')) {
    searchSymbol = `${searchSymbol}.NS`;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${searchSymbol}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data for ${symbol}`);
  }

  const data = await response.json();
  if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
    throw new Error(`No data found for ${symbol}`);
  }

  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose || meta.chartPreviousClose;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || symbol,
    price: price,
    change: change,
    changePercent: changePercent,
    currency: meta.currency,
    exchange: meta.fullExchangeName
  };
}

// Fetch quote for a single symbol
app.get('/api/quote', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const quote = await fetchStockQuote(symbol);
    res.json(quote);
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch quote data', details: error.message });
  }
});

// Fetch quotes for multiple comma-separated symbols
app.get('/api/quotes', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).json({ error: 'Symbols are required' });
  }

  const symbolList = symbols.split(',').map(s => s.trim());

  try {
    const quotes = await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          return await fetchStockQuote(symbol);
        } catch (err) {
          console.error(`Error fetching quote for ${symbol}:`, err);
          return { symbol, error: true, message: err.message };
        }
      })
    );

    res.json(quotes);
  } catch (error) {
    console.error('Error fetching batch quotes:', error);
    res.status(500).json({ error: 'Failed to fetch quotes data', details: error.message });
  }
});

// Search stock symbols autocomplete endpoint
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.json([]);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    if (!data.quotes) {
      return res.json([]);
    }

    // Filter for Indian stocks (ending with .NS or .BO)
    const indianStocks = data.quotes
      .filter(item => {
        const sym = item.symbol ? item.symbol.toUpperCase() : '';
        return sym.endsWith('.NS') || sym.endsWith('.BO');
      })
      .map(item => ({
        symbol: item.symbol,
        name: item.longname || item.shortname || item.symbol,
        exchange: item.exchDisp === 'Bombay' ? 'BSE' : 'NSE'
      }));

    res.json(indianStocks);
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Wildcard route to direct all other routes to React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Export app for Vercel serverless environment
export default app;

// Listen only if run locally (not in serverless environment)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}
