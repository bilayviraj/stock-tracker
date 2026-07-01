import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

export default function App() {
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem('stock_watchlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [target1, setTarget1] = useState('');
  const [target2, setTarget2] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedStockPrice, setSelectedStockPrice] = useState(null);

  // Auto refresh interval setup
  useEffect(() => {
    localStorage.setItem('stock_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    // Initial fetch of current prices
    refreshPrices();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(refreshPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  const refreshPrices = async () => {
    const saved = localStorage.getItem('stock_watchlist');
    const list = saved ? JSON.parse(saved) : watchlist;
    if (list.length === 0) return;

    setLoading(true);
    const symbols = list.map(item => item.symbol).join(',');

    try {
      const response = await fetch(`${API_BASE}/quotes?symbols=${symbols}`);
      if (!response.ok) throw new Error('Failed to fetch stock updates');
      const data = await response.json();

      setWatchlist(prev => {
        return prev.map(item => {
          const match = data.find(q => q.symbol.toUpperCase() === item.symbol.toUpperCase());
          if (match && !match.error) {
            return {
              ...item,
              name: match.name,
              currentPrice: match.price,
              changePercent: match.changePercent,
              change: match.change
            };
          }
          return item;
        });
      });
    } catch (error) {
      console.error('Error refreshing prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!searchSymbol) {
      setErrorMsg('Please enter a stock symbol');
      return;
    }

    let symbol = searchSymbol.trim().toUpperCase();
    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) {
      symbol = `${symbol}.NS`; // Default to NSE
    }

    // Check duplicate
    if (watchlist.some(item => item.symbol.toUpperCase() === symbol.toUpperCase())) {
      setErrorMsg('Stock already in watchlist');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/quote?symbol=${symbol}`);
      if (!response.ok) throw new Error('Stock not found or API error');
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      const newStock = {
        symbol: data.symbol,
        name: data.name,
        buyPrice: buyPrice ? parseFloat(buyPrice) : null,
        target1: target1 ? parseFloat(target1) : null,
        target2: target2 ? parseFloat(target2) : null,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        currentPrice: data.price,
        changePercent: data.changePercent,
        change: data.change
      };

      setWatchlist(prev => [...prev, newStock]);
      
      // Reset inputs
      setSearchSymbol('');
      setBuyPrice('');
      setTarget1('');
      setTarget2('');
      setStopLoss('');
      setShowAddModal(false);
      setSelectedStockPrice(null);
    } catch (err) {
      setErrorMsg(err.message || 'Error adding stock');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStock = (symbol) => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
  };

  // Stats calculation
  const totalStocks = watchlist.length;
  const profitableStocks = watchlist.filter(item => {
    if (!item.buyPrice || !item.currentPrice) return false;
    return item.currentPrice > item.buyPrice;
  }).length;
  const losingStocks = watchlist.filter(item => {
    if (!item.buyPrice || !item.currentPrice) return false;
    return item.currentPrice < item.buyPrice;
  }).length;

  // Add search suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [shouldSearch, setShouldSearch] = useState(true);

  useEffect(() => {
    if (!shouldSearch || searchSymbol.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchSymbol)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchSymbol, shouldSearch]);

  const exportWatchlist = () => {
    if (watchlist.length === 0) {
      alert("Watchlist is empty. Add some stocks first before exporting.");
      return;
    }
    const cleanWatchlist = watchlist.map(({ symbol, name, buyPrice, target1, target2, stopLoss }) => ({
      symbol, name, buyPrice, target1, target2, stopLoss
    }));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanWatchlist, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "stock_watchlist.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importWatchlist = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          setWatchlist(prev => {
            const merged = [...prev];
            parsed.forEach(newItem => {
              const sym = newItem.symbol ? newItem.symbol.toUpperCase() : '';
              if (sym && !merged.some(item => item.symbol.toUpperCase() === sym)) {
                merged.push({
                  symbol: newItem.symbol,
                  name: newItem.name || '',
                  buyPrice: newItem.buyPrice ? parseFloat(newItem.buyPrice) : null,
                  target1: newItem.target1 ? parseFloat(newItem.target1) : null,
                  target2: newItem.target2 ? parseFloat(newItem.target2) : null,
                  stopLoss: newItem.stopLoss ? parseFloat(newItem.stopLoss) : null,
                  currentPrice: null,
                  changePercent: 0,
                  change: 0
                });
              }
            });
            return merged;
          });
          alert("Watchlist imported successfully! Refreshing prices...");
          setTimeout(refreshPrices, 100);
        } else {
          alert("Invalid file format. Expected a JSON array.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    e.target.value = null;
  };

  return (
    <div className="container">
      <header>
        <div className="logo-section">
          <h1><span>📈</span> Stock Tracker</h1>
          <p>Real-time stock watchlist with target & stop-loss alerts</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={refreshPrices} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
          <button className="btn btn-secondary" onClick={exportWatchlist}>
            📤 Export
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            📥 Import
            <input type="file" accept=".json" onChange={importWatchlist} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            ➕ Add Stock
          </button>
        </div>
      </header>

      {/* Summary statistics */}
      <section className="overall-stats">
        <div className="stat-card">
          <div className="stat-card-info">
            <p>Total Tracked</p>
            <h3>{totalStocks}</h3>
          </div>
          <span className="stat-icon">📊</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-info">
            <p>Profitable Positions</p>
            <h3 style={{ color: 'var(--gain)' }}>{profitableStocks}</h3>
          </div>
          <span className="stat-icon">🟢</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-info">
            <p>Negative Positions</p>
            <h3 style={{ color: 'var(--loss)' }}>{losingStocks}</h3>
          </div>
          <span className="stat-icon">🔴</span>
        </div>
      </section>

      {/* Grid of stock cards */}
      {watchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Your watchlist is empty</h3>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Add your first stock</button>
        </div>
      ) : (
        <div className="grid">
          {watchlist.map((stock) => {
            const pctChangeFromBuy = (stock.buyPrice && stock.currentPrice)
              ? ((stock.currentPrice - stock.buyPrice) / stock.buyPrice) * 100
              : null;

            const isTarget1Hit = stock.target1 && stock.currentPrice >= stock.target1;
            const isTarget2Hit = stock.target2 && stock.currentPrice >= stock.target2;
            const isStopLossHit = stock.stopLoss && stock.currentPrice <= stock.stopLoss;

            return (
              <div className="card" key={stock.symbol}>
                <div className="card-header">
                  <div className="stock-info">
                    <div className="sym">{stock.symbol}</div>
                    <div className="name" title={stock.name}>{stock.name}</div>
                  </div>
                  <div className="price-badge">
                    <div className="price-val">₹{stock.currentPrice?.toFixed(2) || 'N/A'}</div>
                    {stock.changePercent !== undefined && (
                      <div className={`change-val ${stock.change >= 0 ? 'up' : 'down'}`}>
                        {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Target alerts */}
                {isTarget2Hit && (
                  <div className="target-alert target-hit">
                    🎉 Target 2 Hit! (₹{stock.target2})
                  </div>
                )}
                {isTarget1Hit && !isTarget2Hit && (
                  <div className="target-alert target-hit">
                    🎉 Target 1 Hit! (₹{stock.target1})
                  </div>
                )}
                {isStopLossHit && (
                  <div className="target-alert stop-loss-hit">
                    ⚠️ Stop Loss Triggered! (₹{stock.stopLoss})
                  </div>
                )}

                <div className="card-stats">
                  <div className="stat-box">
                    <span className="stat-label">Buy Price</span>
                    <span className="stat-value">
                      {stock.buyPrice ? `₹${stock.buyPrice.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Returns</span>
                    <span className={`stat-value ${pctChangeFromBuy >= 0 ? 'up' : pctChangeFromBuy < 0 ? 'down' : ''}`} style={{ color: pctChangeFromBuy >= 0 ? 'var(--gain)' : pctChangeFromBuy < 0 ? 'var(--loss)' : 'var(--text-main)' }}>
                      {pctChangeFromBuy !== null ? `${pctChangeFromBuy >= 0 ? '+' : ''}${pctChangeFromBuy.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Target 1</span>
                    <span className="stat-value" style={{ color: isTarget1Hit ? 'var(--gain)' : 'inherit' }}>
                      {stock.target1 ? `₹${stock.target1.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Target 2</span>
                    <span className="stat-value" style={{ color: isTarget2Hit ? 'var(--gain)' : 'inherit' }}>
                      {stock.target2 ? `₹${stock.target2.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="stat-box" style={{ gridColumn: 'span 2' }}>
                    <span className="stat-label">Stop Loss</span>
                    <span className="stat-value" style={{ color: isStopLossHit ? 'var(--loss)' : 'inherit' }}>
                      {stock.stopLoss ? `₹${stock.stopLoss.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleRemoveStock(stock.symbol)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">Add Stock to Watchlist</h2>
            <form onSubmit={handleAddStock}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Symbol / Ticker</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. RELIANCE, TCS, HDFCBANK"
                  value={searchSymbol}
                  onChange={(e) => {
                    setSearchSymbol(e.target.value);
                    setShouldSearch(true);
                    setSelectedStockPrice(null);
                  }}
                  disabled={loading}
                  required
                  autoComplete="off"
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions-list">
                    {suggestions.map((item) => (
                      <li
                        key={item.symbol}
                        onClick={async () => {
                          setSearchSymbol(item.symbol);
                          setShouldSearch(false);
                          setSuggestions([]);
                          setShowSuggestions(false);
                          setSelectedStockPrice(null);
                          try {
                            const response = await fetch(`${API_BASE}/quote?symbol=${item.symbol}`);
                            if (response.ok) {
                              const quote = await response.json();
                              setSelectedStockPrice(quote.price);
                            }
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                      >
                        <span className="suggestion-symbol">{item.symbol}</span>
                        <span className="suggestion-name">{item.name} ({item.exchange})</span>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedStockPrice !== null && (
                  <div style={{ marginTop: '8px', color: 'var(--gain)', fontSize: '0.85rem', fontWeight: 600 }}>
                    💡 Current Price: ₹{selectedStockPrice.toFixed(2)}
                  </div>
                )}

                <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)', marginTop: '4px', display: 'block' }}>
                  Suffixes like .NS (NSE) or .BO (BSE) will be applied. Default is .NS.
                </span>
              </div>
              <div className="form-group">
                <label>Buy Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Purchase price per share"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Target 1 (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="First profit target"
                  value={target1}
                  onChange={(e) => setTarget1(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Target 2 (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Second profit target"
                  value={target2}
                  onChange={(e) => setTarget2(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Stop Loss (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Loss limit price"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  disabled={loading}
                />
              </div>

              {errorMsg && (
                <div style={{ color: 'var(--loss)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setErrorMsg(''); setSelectedStockPrice(null); }} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Adding...' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
