import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

export default function App() {
  const [watchlist, setWatchlist] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [target1, setTarget1] = useState('');
  const [target2, setTarget2] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [tag, setTag] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedStockPrice, setSelectedStockPrice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editTarget1, setEditTarget1] = useState('');
  const [editTarget2, setEditTarget2] = useState('');
  const [editStopLoss, setEditStopLoss] = useState('');
  const [editTag, setEditTag] = useState('');
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [sortBy, setSortBy] = useState('none');
  const [filterBy, setFilterBy] = useState('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeTab, setActiveTab] = useState('sort');
  const [tempSortBy, setTempSortBy] = useState('none');
  const [tempFilterBy, setTempFilterBy] = useState('all');

  const uniqueTags = Array.from(new Set(watchlist.map(stock => stock.tag).filter(Boolean)));

  const fetchPricesForList = async (list) => {
    if (!list || list.length === 0) return;
    const symbols = list.map(item => item.symbol).join(',');

    try {
      const response = await fetch(`${API_BASE}/quotes?symbols=${encodeURIComponent(symbols)}`);
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

  const watchlistRef = React.useRef(watchlist);
  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

  const refreshPrices = async () => {
    if (watchlistRef.current.length === 0) return;
    setLoading(true);
    await fetchPricesForList(watchlistRef.current);
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
        setIsInitialLoad(false);
      }
    };

    initWatchlist();

    const interval = setInterval(refreshPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-reset filter if active tag filter is deleted/removed
  useEffect(() => {
    const activeFilterExists = ['all', 't1', 't2', 'sl', 'profitable', 'losing', 'near-t2', 'near-sl'].includes(filterBy) || uniqueTags.includes(filterBy);
    if (watchlist.length > 0 && !activeFilterExists) {
      setFilterBy('all');
    }
  }, [watchlist, uniqueTags.join(','), filterBy]);

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
      const response = await fetch(`${API_BASE}/quote?symbol=${encodeURIComponent(symbol)}`);
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
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          tag: tag ? tag.trim() : null
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
      setTag('');
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
      const response = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(symbol)}`, {
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
    setEditTag(stock.tag || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(editingStock.symbol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyPrice: editBuyPrice ? parseFloat(editBuyPrice) : null,
          target1: editTarget1 ? parseFloat(editTarget1) : null,
          target2: editTarget2 ? parseFloat(editTarget2) : null,
          stopLoss: editStopLoss ? parseFloat(editStopLoss) : null,
          tag: editTag ? editTag.trim() : null
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
            stopLoss: updatedStock.stopLoss,
            tag: updatedStock.tag
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
            let sym = newItem.symbol ? newItem.symbol.trim().toUpperCase() : '';
            if (sym) {
              if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
                sym = `${sym}.NS`;
              }
              if (!watchlist.some(item => item.symbol.toUpperCase() === sym)) {
                try {
                  await fetch(`${API_BASE}/watchlist`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      symbol: sym,
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

  const handleApply = () => {
    setSortBy(tempSortBy);
    setShowFilterModal(false);
  };

  const handleReset = () => {
    setTempSortBy('none');
    setSortBy('none');
    setShowFilterModal(false);
  };

  const openFilterModal = () => {
    setTempSortBy(sortBy);
    setShowFilterModal(true);
  };

  const processedWatchlist = (() => {
    let list = [...watchlist];

    // 1. Filtering
    if (filterBy === 't1') {
      list = list.filter(stock => stock.target1 && stock.currentPrice >= stock.target1);
    } else if (filterBy === 't2') {
      list = list.filter(stock => stock.target2 && stock.currentPrice >= stock.target2);
    } else if (filterBy === 'sl') {
      list = list.filter(stock => stock.stopLoss && stock.currentPrice <= stock.stopLoss);
    } else if (filterBy === 'profitable') {
      list = list.filter(stock => stock.buyPrice && stock.currentPrice && stock.currentPrice >= stock.buyPrice);
    } else if (filterBy === 'losing') {
      list = list.filter(stock => stock.buyPrice && stock.currentPrice && stock.currentPrice < stock.buyPrice);
    } else if (filterBy === 'near-t2') {
      list = list.filter(stock => stock.target2 && stock.currentPrice && (
        stock.target1 
          ? (stock.currentPrice < stock.target2 && stock.currentPrice >= stock.target2 - (stock.target2 - stock.target1) * 0.2)
          : (stock.currentPrice < stock.target2 && stock.currentPrice >= stock.target2 * 0.98)
      ));
    } else if (filterBy === 'near-sl') {
      list = list.filter(stock => stock.stopLoss && stock.currentPrice && stock.currentPrice > stock.stopLoss && stock.currentPrice <= stock.stopLoss * 1.02);
    } else if (uniqueTags.includes(filterBy)) {
      list = list.filter(stock => stock.tag === filterBy);
    }

    // 2. Sorting
    list.sort((a, b) => {
      if (sortBy === 'alpha-asc') {
        return a.symbol.localeCompare(b.symbol);
      }
      if (sortBy === 'alpha-desc') {
        return b.symbol.localeCompare(a.symbol);
      }
      if (sortBy === 'change-desc') {
        const changeA = a.changePercent !== undefined ? a.changePercent : -999999;
        const changeB = b.changePercent !== undefined ? b.changePercent : -999999;
        return changeB - changeA;
      }
      if (sortBy === 'change-asc') {
        const changeA = a.changePercent !== undefined ? a.changePercent : 999999;
        const changeB = b.changePercent !== undefined ? b.changePercent : 999999;
        return changeA - changeB;
      }
      if (sortBy === 'pnl-abs-desc') {
        const pnlA = (a.buyPrice && a.currentPrice) ? (a.currentPrice - a.buyPrice) : -999999;
        const pnlB = (b.buyPrice && b.currentPrice) ? (b.currentPrice - b.buyPrice) : -999999;
        return pnlB - pnlA;
      }
      if (sortBy === 'pnl-abs-asc') {
        const pnlA = (a.buyPrice && a.currentPrice) ? (a.currentPrice - a.buyPrice) : 999999;
        const pnlB = (b.buyPrice && b.currentPrice) ? (b.currentPrice - b.buyPrice) : 999999;
        return pnlA - pnlB;
      }
      if (sortBy === 'pnl-pct-desc') {
        const pctA = (a.buyPrice && a.currentPrice) ? ((a.currentPrice - a.buyPrice) / a.buyPrice) * 100 : -999999;
        const pctB = (b.buyPrice && b.currentPrice) ? ((b.currentPrice - b.buyPrice) / b.buyPrice) * 100 : -999999;
        return pctB - pctA;
      }
      if (sortBy === 'pnl-pct-asc') {
        const pctA = (a.buyPrice && a.currentPrice) ? ((a.currentPrice - a.buyPrice) / a.buyPrice) * 100 : 999999;
        const pctB = (b.buyPrice && b.currentPrice) ? ((b.currentPrice - b.buyPrice) / b.buyPrice) * 100 : 999999;
        return pctA - pctB;
      }
      return 0;
    });

    return list;
  })();

  return (
    <div className="container">
      <header>
        <div className="logo-section">
          <h1 style={{ display: 'flex', alignItems: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px', flexShrink: 0 }}>
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#4f46e5" />
                </linearGradient>
                <linearGradient id="glow-grad" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10b981" />
                  <stop offset="1" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#logo-grad)" fillOpacity="0.15" stroke="url(#logo-grad)" strokeWidth="1.5"/>
              <path d="M8 22L14 16L18 20L24 12" stroke="url(#glow-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 12H24V17" stroke="url(#glow-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="12" r="2" fill="#10b981"/>
            </svg>
            <span className="title-text">TradeWatcher</span>
          </h1>
          <p>Real-time stock watchlist with target & stop-loss alerts</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-icon btn-secondary" onClick={openFilterModal} title="Sort & Filter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="2" y1="14" x2="6" y2="14"></line>
              <line x1="10" y1="8" x2="14" y2="8"></line>
              <line x1="18" y1="16" x2="22" y2="16"></line>
            </svg>
          </button>
          <button className="btn btn-icon btn-primary" onClick={() => setShowAddModal(true)} title="Add Stock">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <div className="menu-container" style={{ position: 'relative' }}>
            <button className="btn btn-icon btn-secondary" onClick={() => setShowMenu(!showMenu)} title="Menu">
              ⋮
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { setShowMenu(false); refreshPrices(); }} disabled={loading}>
                  🔄 Refresh
                </button>
                <button className="dropdown-item" onClick={() => { setShowMenu(false); exportWatchlist(); }}>
                  📤 Export
                </button>
                <label className="dropdown-item" style={{ cursor: 'pointer' }}>
                  📥 Import
                  <input type="file" accept=".json" onChange={(e) => { setShowMenu(false); importWatchlist(e); }} style={{ display: 'none' }} />
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Summary statistics */}
      <section className="overall-stats">
        <div 
          className={`stat-card ${filterBy === 'all' ? 'active-all' : ''}`}
          onClick={() => setFilterBy('all')}
        >
          <div className="stat-card-info">
            <p>Total Tracked</p>
            <h3>{totalStocks}</h3>
          </div>
          <span className="stat-icon">📊</span>
        </div>
        <div 
          className={`stat-card ${filterBy === 'profitable' ? 'active-profitable' : ''}`}
          onClick={() => setFilterBy('profitable')}
        >
          <div className="stat-card-info">
            <p>Profitable Positions</p>
            <h3 style={{ color: 'var(--gain)' }}>{profitableStocks}</h3>
          </div>
          <span className="stat-icon">🟢</span>
        </div>
        <div 
          className={`stat-card ${filterBy === 'losing' ? 'active-losing' : ''}`}
          onClick={() => setFilterBy('losing')}
        >
          <div className="stat-card-info">
            <p>Negative Positions</p>
            <h3 style={{ color: 'var(--loss)' }}>{losingStocks}</h3>
          </div>
          <span className="stat-icon">🔴</span>
        </div>
      </section>

      {/* Filter Tabs / Pills */}
      {watchlist.length > 0 && (
        <div className="filter-tabs-bar">
          <button 
            className={`filter-pill ${filterBy === 'all' ? 'active' : ''}`}
            onClick={() => setFilterBy('all')}
          >
            All ({watchlist.length})
          </button>
          <button 
            className={`filter-pill ${filterBy === 't1' ? 'active' : ''}`}
            onClick={() => setFilterBy('t1')}
          >
            T1 ({watchlist.filter(s => s.target1 && s.currentPrice >= s.target1).length})
          </button>
          <button 
            className={`filter-pill ${filterBy === 't2' ? 'active' : ''}`}
            onClick={() => setFilterBy('t2')}
          >
            T2 ({watchlist.filter(s => s.target2 && s.currentPrice >= s.target2).length})
          </button>
          <button 
            className={`filter-pill ${filterBy === 'sl' ? 'active' : ''}`}
            onClick={() => setFilterBy('sl')}
          >
            SL ({watchlist.filter(s => s.stopLoss && s.currentPrice <= s.stopLoss).length})
          </button>
          <button 
            className={`filter-pill ${filterBy === 'near-t2' ? 'active' : ''}`}
            onClick={() => setFilterBy('near-t2')}
          >
            Near T2 ({watchlist.filter(s => s.target2 && s.currentPrice && (
              s.target1 
                ? (s.currentPrice < s.target2 && s.currentPrice >= s.target2 - (s.target2 - s.target1) * 0.2)
                : (s.currentPrice < s.target2 && s.currentPrice >= s.target2 * 0.98)
            )).length})
          </button>
          <button 
            className={`filter-pill ${filterBy === 'near-sl' ? 'active' : ''}`}
            onClick={() => setFilterBy('near-sl')}
          >
            Near SL ({watchlist.filter(s => s.stopLoss && s.currentPrice && s.currentPrice > s.stopLoss && s.currentPrice <= s.stopLoss * 1.02).length})
          </button>
          
          {uniqueTags.map(tagName => (
            <button 
              key={tagName}
              className={`filter-pill ${filterBy === tagName ? 'active' : ''}`}
              onClick={() => setFilterBy(tagName)}
            >
              {tagName} ({watchlist.filter(s => s.tag === tagName).length})
            </button>
          ))}
        </div>
      )}

      {/* List of stock rows */}
      {isInitialLoad ? (
        <div className="watchlist-list skeleton-container">
          {[1, 2, 3].map((i) => (
            <div className="skeleton-row" key={i}>
              <div className="skeleton-top">
                <div className="skeleton-bar skeleton-sym"></div>
                <div className="skeleton-bar skeleton-price"></div>
              </div>
              <div className="skeleton-bottom">
                <div className="skeleton-bar skeleton-buy"></div>
                <div className="skeleton-targets">
                  <div className="skeleton-bar skeleton-tag"></div>
                  <div className="skeleton-bar skeleton-tag"></div>
                  <div className="skeleton-bar skeleton-tag"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Your watchlist is empty</h3>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Add your first stock</button>
        </div>
      ) : processedWatchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-muted)' }}>No stocks match the selected filter</h3>
        </div>
      ) : (
        <div className="watchlist-list" key={filterBy}>
          {processedWatchlist.map((stock) => {
            const pctChangeFromBuy = (stock.buyPrice && stock.currentPrice)
              ? ((stock.currentPrice - stock.buyPrice) / stock.buyPrice) * 100
              : null;
            const absPnl = (stock.buyPrice && stock.currentPrice)
              ? stock.currentPrice - stock.buyPrice
              : null;

            const isTarget1Hit = stock.target1 && stock.currentPrice >= stock.target1;
            const isTarget2Hit = stock.target2 && stock.currentPrice >= stock.target2;
            const isStopLossHit = stock.stopLoss && stock.currentPrice <= stock.stopLoss;
            const isExpanded = expandedSymbol === stock.symbol;

            return (
              <div className="stock-row" key={stock.symbol}>
                <div className="stock-row-main" onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}>
                  {/* Top Row: Ticker Info & Market Price */}
                  <div className="stock-row-top">
                    <div className="stock-row-left-group">
                      <div className="sym-container">
                        <span className="sym">{stock.symbol.split('.')[0]}</span>
                        <span className="exchange-badge">{stock.symbol.endsWith('.BO') ? 'BSE' : 'NSE'}</span>
                        {stock.tag && <span className="tag-badge">{stock.tag}</span>}
                      </div>
                      <div className="name" title={stock.name}>{stock.name}</div>
                    </div>

                    <div className="stock-row-right-group">
                      <span className="price">₹{stock.currentPrice?.toFixed(2) || 'N/A'}</span>
                      {stock.changePercent !== undefined && (
                        <span className={`returns ${stock.change >= 0 ? 'up' : 'down'}`}>
                          {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row: Buy Details, P&L, and Targets */}
                  {(stock.buyPrice || stock.target1 || stock.target2 || stock.stopLoss) && (
                    <div className="stock-row-bottom">
                      <div className="buy-info">
                        {stock.buyPrice && (
                          <>
                            <span className="buy-val">Buy: ₹{stock.buyPrice.toFixed(2)}</span>
                            {pctChangeFromBuy !== null && absPnl !== null && (
                              <span className="pnl-val">
                                P&L: <span style={{ color: pctChangeFromBuy >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 600 }}>
                                  {pctChangeFromBuy >= 0 ? '+' : ''}{pctChangeFromBuy.toFixed(2)}% ({pctChangeFromBuy >= 0 ? '+' : ''}₹{absPnl.toFixed(2)})
                                </span>
                              </span>
                            )}
                          </>
                        )}
                      </div>

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
                  )}
                </div>

                {isExpanded && (
                  <div className="stock-row-expanded">
                    <div className="expanded-actions" style={{ margin: '0 0 0 auto' }}>
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
                            const response = await fetch(`${API_BASE}/quote?symbol=${encodeURIComponent(item.symbol)}`);
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
              <div className="form-group">
                <label>Tag (e.g. Swing, Long Term)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Optional custom tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
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
              <div className="form-group">
                <label>Tag (e.g. Swing, Long Term)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Optional custom tag"
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
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
      {/* Bottom Sheet Sort Modal */}
      {showFilterModal && (
        <div className="sheet-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header" style={{ justifyContent: 'center', padding: '1.2rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Sort Watchlist</h3>
            </div>

            <div className="sheet-content">
              <div className="sort-section animate-fade">
                <div className="sort-option-group">
                  <div className="option-label">Alphabetical Order</div>
                  <div className="button-grid">
                    <button 
                      className={`pill-btn ${tempSortBy === 'alpha-asc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'alpha-asc' ? 'none' : 'alpha-asc')}
                    >
                      A to Z
                    </button>
                    <button 
                      className={`pill-btn ${tempSortBy === 'alpha-desc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'alpha-desc' ? 'none' : 'alpha-desc')}
                    >
                      Z to A
                    </button>
                  </div>
                </div>

                <div className="sort-option-group">
                  <div className="option-label">LTP Change (%)</div>
                  <div className="button-grid">
                    <button 
                      className={`pill-btn ${tempSortBy === 'change-desc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'change-desc' ? 'none' : 'change-desc')}
                    >
                      High to Low
                    </button>
                    <button 
                      className={`pill-btn ${tempSortBy === 'change-asc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'change-asc' ? 'none' : 'change-asc')}
                    >
                      Low to High
                    </button>
                  </div>
                </div>

                <div className="sort-option-group">
                  <div className="option-label">Overall Gain & Loss (Value)</div>
                  <div className="button-grid">
                    <button 
                      className={`pill-btn ${tempSortBy === 'pnl-abs-desc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'pnl-abs-desc' ? 'none' : 'pnl-abs-desc')}
                    >
                      High to Low
                    </button>
                    <button 
                      className={`pill-btn ${tempSortBy === 'pnl-abs-asc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'pnl-abs-asc' ? 'none' : 'pnl-abs-asc')}
                    >
                      Low to High
                    </button>
                  </div>
                </div>

                <div className="sort-option-group">
                  <div className="option-label">Overall Gain & Loss (Percent)</div>
                  <div className="button-grid">
                    <button 
                      className={`pill-btn ${tempSortBy === 'pnl-pct-desc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'pnl-pct-desc' ? 'none' : 'pnl-pct-desc')}
                    >
                      High to Low
                    </button>
                    <button 
                      className={`pill-btn ${tempSortBy === 'pnl-pct-asc' ? 'selected' : ''}`}
                      onClick={() => setTempSortBy(tempSortBy === 'pnl-pct-asc' ? 'none' : 'pnl-pct-asc')}
                    >
                      Low to High
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="sheet-actions">
              <button className="btn btn-secondary reset-btn" onClick={handleReset}>
                RESET
              </button>
              <button className="btn btn-primary apply-btn" onClick={handleApply}>
                APPLY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
