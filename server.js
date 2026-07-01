import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { kv } from '@vercel/kv';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Check Vercel KV credentials
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.warn("WARNING: Vercel KV environment variables (KV_REST_API_URL / KV_REST_API_TOKEN) are not defined!");
}


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

// Get watchlist from Vercel KV
app.get('/api/watchlist', async (req, res) => {
  try {
    const list = await kv.get('watchlist');
    res.json(list || []);
  } catch (error) {
    console.error('Error fetching watchlist from KV:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist', details: error.message });
  }
});

// Add stock to watchlist in Vercel KV
app.post('/api/watchlist', async (req, res) => {
  const { symbol, name, buyPrice, target1, target2, stopLoss } = req.body;
  if (!symbol || !name) {
    return res.status(400).json({ error: 'Symbol and name are required' });
  }

  try {
    const cleanSymbol = symbol.toUpperCase();
    const list = await kv.get('watchlist') || [];
    
    if (list.some(item => item.symbol === cleanSymbol)) {
      return res.status(400).json({ error: 'Stock already in watchlist' });
    }

    const newStock = {
      symbol: cleanSymbol,
      name,
      buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      target1: target1 ? parseFloat(target1) : null,
      target2: target2 ? parseFloat(target2) : null,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null
    };

    list.push(newStock);
    await kv.set('watchlist', list);
    res.status(201).json(newStock);
  } catch (error) {
    console.error('Error saving stock to KV:', error);
    res.status(500).json({ error: 'Failed to add stock', details: error.message });
  }
});

// Update stock in watchlist in Vercel KV
app.put('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { buyPrice, target1, target2, stopLoss } = req.body;

  try {
    const cleanSymbol = symbol.toUpperCase();
    let list = await kv.get('watchlist') || [];
    let updatedStock = null;

    list = list.map(item => {
      if (item.symbol === cleanSymbol) {
        updatedStock = {
          ...item,
          buyPrice: buyPrice !== undefined && buyPrice !== null ? parseFloat(buyPrice) : null,
          target1: target1 !== undefined && target1 !== null ? parseFloat(target1) : null,
          target2: target2 !== undefined && target2 !== null ? parseFloat(target2) : null,
          stopLoss: stopLoss !== undefined && stopLoss !== null ? parseFloat(stopLoss) : null
        };
        return updatedStock;
      }
      return item;
    });

    if (!updatedStock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    await kv.set('watchlist', list);
    res.json(updatedStock);
  } catch (error) {
    console.error('Error updating stock in KV:', error);
    res.status(500).json({ error: 'Failed to update stock', details: error.message });
  }
});

// Delete stock from watchlist in Vercel KV
app.delete('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;

  try {
    const cleanSymbol = symbol.toUpperCase();
    let list = await kv.get('watchlist') || [];
    const initialLength = list.length;

    list = list.filter(item => item.symbol !== cleanSymbol);

    if (list.length === initialLength) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    await kv.set('watchlist', list);
    res.json({ message: 'Stock removed successfully', symbol: cleanSymbol });
  } catch (error) {
    console.error('Error deleting stock from KV:', error);
    res.status(500).json({ error: 'Failed to delete stock', details: error.message });
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
