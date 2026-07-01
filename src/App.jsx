import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

export default function App() {
  const [watchlist, setWatchlist] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [target1, setTarget1] = useState('');
  const [target2, setTarget2] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedStockPrice, setSelectedStockPrice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editTarget1, setEditTarget1] = useState('');
  const [editTarget2, setEditTarget2] = useState('');
  const [editStopLoss, setEditStopLoss] = useState('');
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  const fetchPricesForList = async (list) => {
    if (!list || list.length === 0) return;
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
      console.error('Error fetching prices:', error);
    }
  };

  const refreshPrices = async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    await fetchPricesForList(watchlist);
    setLoading(false);
  };

  useEffect(() => {
    const initWatchlist = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/watchlist`);
        if (response.ok) {
          const list = await response.json();
          setWatchlist(list);
          if (list.length > 0) {
            await fetchPricesForList(list);
          }
        }
      } catch (error) {
        console.error('Failed to load watchlist from DB:', error);
      } finally {
        setLoading(false);
      }
    };

    initWatchlist();

    const interval = setInterval(refreshPrices, 60000);
    return () => clearInterval(interval);
  }, [watchlist.length]);

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

      // Save to database
      const dbResponse = await fetch(`${API_BASE}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: data.symbol,
          name: data.name,
          buyPrice: buyPrice ? parseFloat(buyPrice) : null,
          target1: target1 ? parseFloat(target1) : null,
          target2: target2 ? parseFloat(target2) : null,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null
        })
      });

      if (!dbResponse.ok) {
        const errData = await dbResponse.json();
        throw new Error(errData.error || 'Failed to save stock to database');
      }

      const dbStock = await dbResponse.json();

      const newStock = {
        ...dbStock,
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

  const handleRemoveStock = async (symbol) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/watchlist/${symbol}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete from database');
      setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    } catch (err) {
      alert(err.message || 'Error removing stock');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (stock) => {
    setEditingStock(stock);
    setEditBuyPrice(stock.buyPrice !== null && stock.buyPrice !== undefined ? stock.buyPrice.toString() : '');
    setEditTarget1(stock.target1 !== null && stock.target1 !== undefined ? stock.target1.toString() : '');
    setEditTarget2(stock.target2 !== null && stock.target2 !== undefined ? stock.target2.toString() : '');
    setEditStopLoss(stock.stopLoss !== null && stock.stopLoss !== undefined ? stock.stopLoss.toString() : '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/watchlist/${editingStock.symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyPrice: editBuyPrice ? parseFloat(editBuyPrice) : null,
          target1: editTarget1 ? parseFloat(editTarget1) : null,
          target2: editTarget2 ? parseFloat(editTarget2) : null,
          stopLoss: editStopLoss ? parseFloat(editStopLoss) : null
        })
      });

      if (!response.ok) throw new Error('Failed to update stock in database');
      const updatedStock = await response.json();

      setWatchlist(prev => prev.map(item => {
        if (item.symbol.toUpperCase() === editingStock.symbol.toUpperCase()) {
          return {
            ...item,
            buyPrice: updatedStock.buyPrice,
            target1: updatedStock.target1,
            target2: updatedStock.target2,
            stopLoss: updatedStock.stopLoss
          };
        }
        return item;
      }));
      setShowEditModal(false);
      setEditingStock(null);
    } catch (err) {
      alert(err.message || 'Error saving changes');
    } finally {
      setLoading(false);
    }
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
    fileReader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          setLoading(true);
          let importCount = 0;
          for (const newItem of parsed) {
            const sym = newItem.symbol ? newItem.symbol.toUpperCase() : '';
            if (sym && !watchlist.some(item => item.symbol.toUpperCase() === sym)) {
              try {
                await fetch(`${API_BASE}/watchlist`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    symbol: newItem.symbol,
                    name: newItem.name || '',
                    buyPrice: newItem.buyPrice ? parseFloat(newItem.buyPrice) : null,
                    target1: newItem.target1 ? parseFloat(newItem.target1) : null,
                    target2: newItem.target2 ? parseFloat(newItem.target2) : null,
                    stopLoss: newItem.stopLoss ? parseFloat(newItem.stopLoss) : null
                  })
                });
                importCount++;
              } catch (e) {
                console.error("Failed to import symbol", sym, e);
              }
            }
          }
          
          // Refresh list from DB
          const response = await fetch(`${API_BASE}/watchlist`);
          if (response.ok) {
            const list = await response.json();
            setWatchlist(list);
            if (list.length > 0) {
              await fetchPricesForList(list);
            }
          }
          
          alert(`Watchlist imported: ${importCount} new stocks added successfully!`);
        } else {
          alert("Invalid file format. Expected a JSON array.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      } finally {
        setLoading(false);
      }
    };
    e.target.value = null;
  };

  return (
    <div className="container">
      <header>
        <div className="logo-section">
          <h1><span>📈</span> <span className="title-text">Stock Tracker</span></h1>
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

      {/* List of stock rows */}
      {watchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Your watchlist is empty</h3>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Add your first stock</button>
        </div>
      ) : (
        <div className="watchlist-list">
          {watchlist.map((stock) => {
            const pctChangeFromBuy = (stock.buyPrice && stock.currentPrice)
              ? ((stock.currentPrice - stock.buyPrice) / stock.buyPrice) * 100
              : null;

            const isTarget1Hit = stock.target1 && stock.currentPrice >= stock.target1;
            const isTarget2Hit = stock.target2 && stock.currentPrice >= stock.target2;
            const isStopLossHit = stock.stopLoss && stock.currentPrice <= stock.stopLoss;
            const isExpanded = expandedSymbol === stock.symbol;

            return (
              <div className="stock-row" key={stock.symbol}>
                <div className="stock-row-main" onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}>
                  <div className="stock-row-left">
                    <div className="sym-container">
                      <span className="sym">{stock.symbol.split('.')[0]}</span>
                      <span className="exchange-badge">{stock.symbol.endsWith('.BO') ? 'BSE' : 'NSE'}</span>
                    </div>
                    <div className="name" title={stock.name}>{stock.name}</div>
                    {stock.buyPrice && (
                      <div className="buy-info">Avg: ₹{stock.buyPrice.toFixed(2)}</div>
                    )}
                  </div>

                  <div className="stock-row-middle">
                    <div className="target-info">
                      <span className={`target-tag ${isTarget1Hit ? 'hit' : ''}`}>
                        T1: {stock.target1 ? `₹${stock.target1.toFixed(2)}` : '—'}
                      </span>
                      <span className={`target-tag ${isTarget2Hit ? 'hit' : ''}`}>
                        T2: {stock.target2 ? `₹${stock.target2.toFixed(2)}` : '—'}
                      </span>
                      <span className={`target-tag ${isStopLossHit ? 'sl-hit' : ''}`}>
                        SL: {stock.stopLoss ? `₹${stock.stopLoss.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="stock-row-right">
                    <span className="price">₹{stock.currentPrice?.toFixed(2) || 'N/A'}</span>
                    {stock.changePercent !== undefined && (
                      <span className={`returns ${stock.change >= 0 ? 'up' : 'down'}`}>
                        {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="stock-row-expanded">
                    <div className="expanded-alerts">
                      <span className={`target-tag ${isTarget1Hit ? 'hit' : ''}`}>
                        T1: {stock.target1 ? `₹${stock.target1.toFixed(2)}` : '—'}
                      </span>
                      <span className={`target-tag ${isTarget2Hit ? 'hit' : ''}`}>
                        T2: {stock.target2 ? `₹${stock.target2.toFixed(2)}` : '—'}
                      </span>
                      <span className={`target-tag ${isStopLossHit ? 'sl-hit' : ''}`}>
                        SL: {stock.stopLoss ? `₹${stock.stopLoss.toFixed(2)}` : '—'}
                      </span>
                      {pctChangeFromBuy !== null && (
                        <span className={`returns ${pctChangeFromBuy >= 0 ? 'up' : 'down'}`} style={{ marginLeft: '0.5rem', alignSelf: 'center', fontWeight: 'bold' }}>
                          P&L: {pctChangeFromBuy >= 0 ? '+' : ''}{pctChangeFromBuy.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="expanded-actions">
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleEditClick(stock)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleRemoveStock(stock.symbol)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
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

      {/* Edit Stock Modal */}
      {showEditModal && editingStock && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">Edit Stock: {editingStock.symbol}</h2>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Symbol / Ticker</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingStock.symbol}
                  disabled
                />
                {editingStock.currentPrice !== null && editingStock.currentPrice !== undefined && (
                  <div style={{ marginTop: '8px', color: 'var(--gain)', fontSize: '0.85rem', fontWeight: 600 }}>
                    💡 Current Price: ₹{editingStock.currentPrice.toFixed(2)}
                  </div>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)', marginTop: '4px', display: 'block' }}>
                  Symbol/Ticker cannot be modified.
                </span>
              </div>
              <div className="form-group">
                <label>Buy Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Purchase price per share"
                  value={editBuyPrice}
                  onChange={(e) => setEditBuyPrice(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Target 1 (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="First profit target"
                  value={editTarget1}
                  onChange={(e) => setEditTarget1(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Target 2 (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Second profit target"
                  value={editTarget2}
                  onChange={(e) => setEditTarget2(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Stop Loss (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Loss limit price"
                  value={editStopLoss}
                  onChange={(e) => setEditStopLoss(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditingStock(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
