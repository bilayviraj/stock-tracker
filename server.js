import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

// Check Upstash credentials and initialize client
let kv;
let useLocalMemory = false;
let localWatchlist = [];
let localSellHistory = [];

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.warn("WARNING: KV_REST_API_URL or KV_REST_API_TOKEN is not defined! Falling back to local in-memory storage.");
  useLocalMemory = true;
} else {
  try {
    kv = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  } catch (err) {
    console.error("Failed to initialize Redis client. Falling back to local in-memory storage:", err.message);
    useLocalMemory = true;
  }
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://finance.yahoo.com',
      'Referer': 'https://finance.yahoo.com/'
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
    const searchQueries = [q];
    const cleanQ = q.trim().toUpperCase();
    if (!cleanQ.endsWith('.NS') && !cleanQ.endsWith('.BO') && !cleanQ.includes(' ')) {
      searchQueries.push(`${cleanQ}.NS`);
      searchQueries.push(`${cleanQ}.BO`);
    }

    const fetchSearch = async (query) => {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&region=IN&lang=en-IN`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Origin': 'https://in.finance.yahoo.com',
          'Referer': 'https://in.finance.yahoo.com/'
        }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.quotes || [];
    };

    const fetchAutocomplete = async (query) => {
      const url = `https://query1.finance.yahoo.com/v6/finance/autocomplete?query=${encodeURIComponent(query)}&lang=en-IN&region=IN`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Origin': 'https://in.finance.yahoo.com',
          'Referer': 'https://in.finance.yahoo.com/'
        }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.ResultSet && data.ResultSet.Result) ? data.ResultSet.Result : [];
    };

    // Query both endpoints for all queries in parallel
    const promises = [];
    for (const query of searchQueries) {
      promises.push(fetchSearch(query));
      promises.push(fetchAutocomplete(query));
    }

    const resultsArray = await Promise.all(promises);
    const allQuotes = resultsArray.flat();
    const uniqueQuotes = [];
    const seenSymbols = new Set();

    for (const item of allQuotes) {
      if (item && item.symbol) {
        const sym = item.symbol.toUpperCase();
        if (!seenSymbols.has(sym)) {
          seenSymbols.add(sym);
          uniqueQuotes.push(item);
        }
      }
    }

    // Filter for Indian stocks (ending with .NS or .BO)
    const indianStocksRaw = uniqueQuotes.filter(item => {
      const sym = item.symbol ? item.symbol.toUpperCase() : '';
      return sym.endsWith('.NS') || sym.endsWith('.BO');
    });

    // Expand suggestions to include both NSE (.NS) and BSE (.BO) variants
    const finalSuggestions = [];
    const seenFinal = new Set();

    for (const item of indianStocksRaw) {
      const rawSym = item.symbol.toUpperCase();
      const baseSym = rawSym.split('.')[0];
      const name = item.longname || item.name || item.shortname || item.symbol;

      const nseSym = `${baseSym}.NS`;
      const bseSym = `${baseSym}.BO`;

      if (!seenFinal.has(nseSym)) {
        seenFinal.add(nseSym);
        finalSuggestions.push({
          symbol: nseSym,
          name: name,
          exchange: 'NSE'
        });
      }
      if (!seenFinal.has(bseSym)) {
        seenFinal.add(bseSym);
        finalSuggestions.push({
          symbol: bseSym,
          name: name,
          exchange: 'BSE'
        });
      }
    }

    res.json(finalSuggestions);
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Get watchlist from Vercel KV or Local Memory
app.get('/api/watchlist', async (req, res) => {
  try {
    let list;
    if (useLocalMemory) {
      list = localWatchlist;
    } else {
      list = await kv.get('watchlist') || [];
    }

    // Normalize and de-duplicate symbols (ensure they end in .NS or .BO)
    let needsUpdate = false;
    const seen = new Set();
    const normalizedList = [];

    for (const item of list) {
      if (item && item.symbol) {
        let sym = item.symbol.trim().toUpperCase();
        if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
          sym = `${sym}.NS`;
          needsUpdate = true;
        }
        if (!seen.has(sym)) {
          seen.add(sym);
          normalizedList.push({
            ...item,
            symbol: sym
          });
        } else {
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      console.log('Normalizing watchlist symbols...');
      if (useLocalMemory) {
        localWatchlist = normalizedList;
      } else {
        try {
          await kv.set('watchlist', normalizedList);
        } catch (err) {
          console.error('Error updating watchlist back to KV:', err);
        }
      }
      res.json(normalizedList);
    } else {
      res.json(list);
    }
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist', details: error.message });
  }
});

app.post('/api/watchlist', async (req, res) => {
  const { symbol, name, buyPrice, target1, target2, stopLoss, tag } = req.body;
  if (!symbol || !name) {
    return res.status(400).json({ error: 'Symbol and name are required' });
  }

  try {
    const cleanSymbol = symbol.toUpperCase();
    let list;
    if (useLocalMemory) {
      list = localWatchlist;
    } else {
      list = await kv.get('watchlist') || [];
    }

    if (list.some(item => item.symbol === cleanSymbol)) {
      return res.status(400).json({ error: 'Stock already in watchlist' });
    }

    const newStock = {
      symbol: cleanSymbol,
      name,
      buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      target1: target1 ? parseFloat(target1) : null,
      target2: target2 ? parseFloat(target2) : null,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      tag: tag ? tag.trim() : null
    };

    list.push(newStock);
    if (useLocalMemory) {
      localWatchlist = list;
    } else {
      await kv.set('watchlist', list);
    }
    res.status(201).json(newStock);
  } catch (error) {
    console.error('Error saving stock:', error);
    res.status(500).json({ error: 'Failed to add stock', details: error.message });
  }
});

app.put('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { buyPrice, target1, target2, stopLoss, tag } = req.body;

  try {
    const cleanSymbol = symbol.toUpperCase();
    let list;
    if (useLocalMemory) {
      list = localWatchlist;
    } else {
      list = await kv.get('watchlist') || [];
    }
    let updatedStock = null;

    list = list.map(item => {
      if (item.symbol === cleanSymbol) {
        updatedStock = {
          ...item,
          buyPrice: buyPrice !== undefined && buyPrice !== null ? parseFloat(buyPrice) : null,
          target1: target1 !== undefined && target1 !== null ? parseFloat(target1) : null,
          target2: target2 !== undefined && target2 !== null ? parseFloat(target2) : null,
          stopLoss: stopLoss !== undefined && stopLoss !== null ? parseFloat(stopLoss) : null,
          tag: tag !== undefined && tag !== null ? tag.trim() : null
        };
        return updatedStock;
      }
      return item;
    });

    if (!updatedStock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    if (useLocalMemory) {
      localWatchlist = list;
    } else {
      await kv.set('watchlist', list);
    }
    res.json(updatedStock);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock', details: error.message });
  }
});

// Delete stock from watchlist in Vercel KV or Local Memory
app.delete('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;

  try {
    const cleanSymbol = symbol.toUpperCase();
    let list;
    if (useLocalMemory) {
      list = localWatchlist;
    } else {
      list = await kv.get('watchlist') || [];
    }
    const initialLength = list.length;

    list = list.filter(item => item.symbol !== cleanSymbol);

    if (list.length === initialLength) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    if (useLocalMemory) {
      localWatchlist = list;
    } else {
      await kv.set('watchlist', list);
    }
    res.json({ message: 'Stock removed successfully', symbol: cleanSymbol });
  } catch (error) {
    console.error('Error deleting stock:', error);
    res.status(500).json({ error: 'Failed to delete stock', details: error.message });
  }
});

// GET sold history
app.get('/api/sold', async (req, res) => {
  try {
    let list;
    if (useLocalMemory) {
      list = localSellHistory;
    } else {
      list = await kv.get('sellHistory') || [];
    }
    res.json(list);
  } catch (error) {
    console.error('Error fetching sell history:', error);
    res.status(500).json({ error: 'Failed to fetch sell history', details: error.message });
  }
});

// POST sold stock entry
app.post('/api/sold', async (req, res) => {
  const { symbol, name, buyPrice, sellPrice, sellDate, tag } = req.body;
  if (!symbol || !name || !sellPrice) {
    return res.status(400).json({ error: 'Symbol, name, and sellPrice are required' });
  }
  try {
    let list;
    if (useLocalMemory) {
      list = localSellHistory;
    } else {
      list = await kv.get('sellHistory') || [];
    }
    const entry = {
      id: Date.now().toString(),
      symbol: symbol.toUpperCase(),
      name,
      buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      sellPrice: sellPrice ? parseFloat(sellPrice) : null,
      sellDate: sellDate || new Date().toISOString().split('T')[0],
      tag: tag ? tag.trim() : null
    };
    list.push(entry);
    if (useLocalMemory) {
      localSellHistory = list;
    } else {
      await kv.set('sellHistory', list);
    }
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error saving sold stock:', error);
    res.status(500).json({ error: 'Failed to save sold stock', details: error.message });
  }
});

// DELETE sold stock entry
app.delete('/api/sold/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let list;
    if (useLocalMemory) {
      list = localSellHistory;
    } else {
      list = await kv.get('sellHistory') || [];
    }
    const initialLength = list.length;
    list = list.filter(item => item.id !== id);
    if (list.length === initialLength) {
      return res.status(404).json({ error: 'Sold stock record not found' });
    }
    if (useLocalMemory) {
      localSellHistory = list;
    } else {
      await kv.set('sellHistory', list);
    }
    res.json({ message: 'Sold record deleted successfully', id });
  } catch (error) {
    console.error('Error deleting sold stock:', error);
    res.status(500).json({ error: 'Failed to delete sold record', details: error.message });
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
