/**
 * Strategy and Rules Panel Controller.
 */
import { STRATEGIES } from '../../strategies/index.js';
import strategyLibrary from '../../strategies/StrategyLibrary.js';
import { getUIStore } from './UIState.js';

const RISK_COLORS = {
  'Low': '#22c55e', 'Medium': '#f59e0b', 'High': '#ef4444', 'Very High': '#dc2626'
};
const CAT_COLORS = {
  'Trend': '#3b82f6', 'Momentum': '#a855f7', 'Volatility': '#f97316',
  'Volume': '#06b6d4', 'Pattern': '#84cc16', 'Smart Money': '#ec4899',
  'Quantitative': '#8b5cf6'
};

export function renderStrategies() {
  const container = document.getElementById('strategies-list');
  if (!container) return;

  chrome.storage.local.get(['activeStrategies'], (res) => {
    const activeStrategies = res.activeStrategies || {};
    container.innerHTML = '';
    
    const strategyEntries = Object.entries(STRATEGIES);
    if (strategyEntries.length === 0) {
      container.innerHTML = '<div class="center-text">No custom strategies loaded.</div>';
      return;
    }

    strategyEntries.forEach(([name, strategy]) => {
      const active = !!activeStrategies[name];
      const item = document.createElement('div');
      item.className = 'list-item';
      
      item.innerHTML = `
        <div class="item-main">
          <div class="item-title">${name}</div>
          <div class="item-desc">${strategy.description}</div>
        </div>
        <div class="item-action">
          <label class="switch">
            <input type="checkbox" class="strategy-toggle" data-strategy="${name}" ${active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `;
      
      container.appendChild(item);
    });

    container.querySelectorAll('.strategy-toggle').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const name = e.target.getAttribute('data-strategy');
        const checked = e.target.checked;
        
        chrome.storage.local.get(['activeStrategies'], (storageRes) => {
          const current = storageRes.activeStrategies || {};
          current[name] = checked;
          chrome.storage.local.set({ activeStrategies: current });
        });
      });
    });
  });
}

export function renderRules() {
  const rulesListEl = document.getElementById('rules-list');
  if (!rulesListEl) return;

  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    if (rules.length === 0) {
      rulesListEl.innerHTML = '<div class="center-text">No active rules.</div>';
      return;
    }

    rulesListEl.innerHTML = '';
    rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const main = document.createElement('div');
      main.className = 'item-main';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = rule.name || 'Custom Rule';

      const desc = document.createElement('div');
      desc.className = 'item-desc';
      let statsText = '';
      if (rule.stats) {
        const totalTrades = rule.stats.wins + rule.stats.losses;
        const wr = totalTrades > 0 ? ((rule.stats.wins / totalTrades) * 100).toFixed(0) : 0;
        statsText = `<div style="margin-top: 4px; font-weight: bold; font-size: 0.7rem; color: var(--primary);">Win Rate: ${wr}% | Max DD: ${rule.stats.maxDd.toFixed(2)}% | PnL: ${rule.stats.totalPnl.toFixed(2)}%</div>`;
      }
      desc.innerHTML = (rule.originalPrompt || JSON.stringify(rule.conditions)) + statsText;

      main.appendChild(title);
      main.appendChild(desc);

      const action = document.createElement('div');
      action.className = 'item-action';

      const label = document.createElement('label');
      label.className = 'switch';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = rule.enabled;
      checkbox.addEventListener('change', () => {
        const updated = rules.map(r => r.id === rule.id ? { ...r, enabled: checkbox.checked } : r);
        chrome.storage.local.set({ rules: updated });
      });

      const slider = document.createElement('span');
      slider.className = 'slider';

      label.appendChild(checkbox);
      label.appendChild(slider);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.style.width = '24px';
      delBtn.style.height = '24px';
      delBtn.style.borderColor = 'rgba(255, 23, 68, 0.2)';
      delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      delBtn.addEventListener('click', () => {
        const filtered = rules.filter(r => r.id !== rule.id);
        chrome.storage.local.set({ rules: filtered }, () => renderRules());
      });

      action.appendChild(label);
      action.appendChild(delBtn);

      item.appendChild(main);
      item.appendChild(action);
      rulesListEl.appendChild(item);
    });
  });
}

export async function initLibrary() {
  const listEl      = document.getElementById('lib-list');
  const searchEl    = document.getElementById('lib-search');
  const catEl       = document.getElementById('lib-filter-cat');
  const riskEl      = document.getElementById('lib-filter-risk');
  const summaryEl   = document.getElementById('lib-summary');
  const modalEl     = document.getElementById('lib-modal');
  const modalBodyEl = document.getElementById('lib-modal-body');

  if (!listEl) return;

  await strategyLibrary.load();

  const summary = strategyLibrary.getSummary();
  if (summaryEl) {
    const catStr = Object.entries(summary.categories)
      .map(([k, v]) => `${k}: ${v}`).join(' · ');
    summaryEl.textContent = `${summary.total} strategies · ${catStr}`;
  }

  let currentStrategies = strategyLibrary.getAll();

  function applyFilters() {
    const query   = searchEl?.value?.trim() || '';
    const cat     = catEl?.value  || '';
    const risk    = riskEl?.value || '';

    let list = strategyLibrary.getAll();
    if (query) list = list.filter(s =>
      (s.strategyName  || '').toLowerCase().includes(query.toLowerCase()) ||
      (s.description   || '').toLowerCase().includes(query.toLowerCase()) ||
      (s.subCategory   || '').toLowerCase().includes(query.toLowerCase()) ||
      (s.requiredIndicators || '').toLowerCase().includes(query.toLowerCase())
    );
    if (cat)  list = list.filter(s => (s.category  || '').toLowerCase() === cat.toLowerCase());
    if (risk) list = list.filter(s => (s.riskLevel || '').toLowerCase() === risk.toLowerCase());

    currentStrategies = list;
    renderList(list);
  }

  function renderList(strategies) {
    listEl.innerHTML = '';
    if (strategies.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.7rem; padding:20px 0;">No strategies match your filters.</div>`;
      return;
    }

    for (const s of strategies) {
      const riskColor = RISK_COLORS[s.riskLevel] || '#888';
      const catColor  = CAT_COLORS[s.category]   || '#888';
      const conf      = parseFloat(s.confidenceScore) || 0;

      const card = document.createElement('div');
      card.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 10px 12px;
        cursor: pointer;
        transition: border-color 0.15s, transform 0.1s;
        margin-bottom: 8px;
      `;
      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.72rem; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${s.strategyName || 'Unnamed'}
            </div>
            <div style="font-size:0.62rem; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${s.subCategory || ''} · ${s.bestTimeframe || 'Any'} · ${s.bestMarket || 'Universal'}
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0;">
            <span style="font-size:0.58rem; font-weight:700; background:${catColor}22; color:${catColor}; border-radius:4px; padding:1px 6px;">
              ${s.category || ''}
            </span>
            <span style="font-size:0.58rem; font-weight:700; background:${riskColor}22; color:${riskColor}; border-radius:4px; padding:1px 6px;">
              ${s.riskLevel || ''} risk
            </span>
          </div>
        </div>
        <div style="margin-top:6px; display:flex; align-items:center; gap:10px;">
          <div style="flex:1; height:3px; background:var(--border-color); border-radius:2px; overflow:hidden;">
            <div style="width:${Math.min(conf, 100)}%; height:100%; background: linear-gradient(90deg, #3b82f6, #22c55e); border-radius:2px;"></div>
          </div>
          <span style="font-size:0.6rem; color:var(--text-muted); flex-shrink:0;">${conf}% conf</span>
          <span style="font-size:0.6rem; color:${s.expectedDirection === 'Bullish' ? '#22c55e' : s.expectedDirection === 'Bearish' ? '#ef4444' : '#888'}; font-weight:700; flex-shrink:0;">
            ${s.expectedDirection || 'Neutral'}
          </span>
        </div>
      `;
      card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--primary)'; card.style.transform = 'translateY(-1px)'; });
      card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border-color)'; card.style.transform = ''; });
      card.addEventListener('click', () => showDetail(s));
      listEl.appendChild(card);
    }
  }

  function showDetail(s) {
    const riskColor = RISK_COLORS[s.riskLevel] || '#888';
    const catColor  = CAT_COLORS[s.category]   || '#888';

    const row = (label, val) => val ? `
      <div style="display:flex; gap:6px; padding:4px 0; border-bottom:1px solid var(--border-color);">
        <span style="color:var(--text-muted); font-size:0.62rem; flex:0 0 110px;">${label}</span>
        <span style="font-size:0.65rem; color:var(--text-main); flex:1;">${val}</span>
      </div>` : '';

    modalBodyEl.innerHTML = `
      <button id="lib-modal-close" style="position:absolute; top:10px; right:12px; background:none; border:none; color:var(--text-muted); font-size:1.1rem; cursor:pointer; line-height:1;">✕</button>
      <div style="margin-bottom:10px; padding-right:20px;">
        <div style="font-size:0.78rem; font-weight:800; color:var(--text-main); margin-bottom:4px;">${s.strategyName}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <span style="font-size:0.58rem; font-weight:700; background:${catColor}22; color:${catColor}; border-radius:4px; padding:1px 7px;">${s.category}</span>
          <span style="font-size:0.58rem; font-weight:700; background:${riskColor}22; color:${riskColor}; border-radius:4px; padding:1px 7px;">${s.riskLevel} risk</span>
          <span style="font-size:0.58rem; color:var(--text-muted); border:1px solid var(--border-color); border-radius:4px; padding:1px 7px;">${s.expectedDirection || 'Neutral'}</span>
        </div>
      </div>
      <div style="font-size:0.63rem; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${s.description || ''}</div>
      ${row('Buy Signal', s.buySignal)}
      ${row('Sell Signal', s.sellSignal)}
      ${row('Hold Condition', s.holdCondition)}
      ${row('Take Profit', s.takeProfit)}
      ${row('Stop Loss', s.stopLoss)}
      ${row('Exit Long', s.exitLong)}
      ${row('Exit Short', s.exitShort)}
      ${row('Required Indicators', s.requiredIndicators)}
      ${row('Confirmation', s.confirmationIndicators)}
      ${row('Best Timeframe', s.bestTimeframe)}
      ${row('Best Market', s.bestMarket)}
      ${row('Trending Market', s.trendingMarket)}
      ${row('Sideways Market', s.sidewaysMarket)}
      ${row('Confidence', s.confidenceScore + '%')}
      ${row('Est. Success', s.estimatedSuccessProbability)}
      ${row('Expected Move', s.expectedMove)}
      ${row('Time to Play Out', s.typicalTimeTo)}
      ${row('False Signal Risk', s.falseSignalRisk)}
      ${row('Common Failures', s.commonFailureConditions)}
      ${row('Priority', s.priority)}
      <button id="lib-import-btn" style="width:100%; margin-top:12px; padding:9px; background:var(--primary); color:#fff; border:none; border-radius:7px; font-size:0.72rem; font-weight:700; cursor:pointer; letter-spacing:0.04em;">
        ⚡ Add to My Rules
      </button>
      <div id="lib-import-status" style="display:none; text-align:center; font-size:0.65rem; margin-top:6px; color:var(--success);">✓ Rule saved successfully!</div>
    `;

    modalEl.style.display = 'block';

    document.getElementById('lib-modal-close').addEventListener('click', () => {
      modalEl.style.display = 'none';
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) modalEl.style.display = 'none';
    });

    document.getElementById('lib-import-btn').addEventListener('click', () => {
      importLibraryRule(s);
    });
  }

  function importLibraryRule(s) {
    const rule = strategyLibrary.toRule(s);
    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      if (rules.some(r => r.id === rule.id)) {
        const statusEl = document.getElementById('lib-import-status');
        if (statusEl) {
          statusEl.textContent = '⚠ Already in your rules.';
          statusEl.style.color = 'var(--warning)';
          statusEl.style.display = 'block';
        }
        return;
      }
      rules.push(rule);
      chrome.storage.local.set({ rules }, () => {
        const statusEl = document.getElementById('lib-import-status');
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.color = 'var(--success)';
          statusEl.textContent = '✓ Rule saved successfully!';
        }
        renderRules();
      });
    });
  }

  searchEl?.addEventListener('input', applyFilters);
  catEl?.addEventListener('change',   applyFilters);
  riskEl?.addEventListener('change',  applyFilters);

  renderList(currentStrategies);
}
