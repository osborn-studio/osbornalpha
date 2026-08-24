#!/usr/bin/env python3
import argparse
import base64
import html
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader


COUNTRY_RE = re.compile(r"^(?:[A-Z]{2}|CN-TW)$")
TICKER_RE = re.compile(
    r"^(?:[A-Z0-9]{1,8}|[0-9]{3,6}|[A-Z]{1,6})(?: [A-Z]{2}| OPTIONS)$"
)
NUMBER_RE = re.compile(r"^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[KM]?$")
PCT_RE = re.compile(r"^-?\d+(?:\.\d+)?%$")


def clean_line(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_number(value: str):
    value = clean_line(value)
    if not value:
        return None
    multiplier = 1
    if value[-1:] in {"K", "M"}:
        multiplier = 1_000 if value[-1] == "K" else 1_000_000
        value = value[:-1]
    try:
        return float(value.replace(",", "")) * multiplier
    except ValueError:
        return None


def parse_percent(value: str):
    value = clean_line(value).replace("%", "")
    try:
        return float(value)
    except ValueError:
        return None


def is_ticker(value: str) -> bool:
    return bool(TICKER_RE.match(clean_line(value)))


def split_pdf_text(pdf_path):
    reader = PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    lines = [clean_line(line) for line in text.splitlines()]
    return [line for line in lines if line], text


def find_section(lines, name):
    try:
        return lines.index(name)
    except ValueError:
        return -1


def parse_key_metrics(lines):
    metrics = {}
    known = {
        "Fund Size",
        "Gross",
        "Net",
        "China Net",
        "Long Total",
        "Short Total",
        "Long Gross",
        "Short Gross",
        "QD SW Size",
        "QD JX Size",
        "QD JX 2 Size",
        "QD/Fund Size",
    }
    i = 0
    stop = find_section(lines, "Option Contract")
    if stop < 0:
        stop = min(len(lines), 80)
    while i < stop:
        if lines[i] in known and i + 1 < len(lines):
            metrics[lines[i]] = lines[i + 1]
            i += 2
        else:
            i += 1
    return [{"label": key, "value": value} for key, value in metrics.items()]


def parse_options(lines):
    start = find_section(lines, "Option Contract")
    end = find_section(lines, "FX")
    if start < 0 or end < 0:
        return []
    rows = []
    i = start + 4
    while i + 3 < end:
        rows.append(
            {
                "contract": lines[i],
                "quantity": lines[i + 1],
                "netExp": lines[i + 2],
                "deltaAdj": lines[i + 3],
                "quantityValue": parse_number(lines[i + 1]),
                "netExpValue": parse_percent(lines[i + 2]),
                "deltaAdjValue": parse_percent(lines[i + 3]),
            }
        )
        i += 4
    return rows


def parse_fx_market(lines):
    start = find_section(lines, "FX")
    end = find_section(lines, "Long")
    fx = []
    market = []
    if start < 0 or end < 0:
        return fx, market

    mkt_start = find_section(lines, "Mkt")
    if mkt_start < 0 or mkt_start > end:
        mkt_start = end
    fx_block = lines[start + 2 : mkt_start]
    market_block = lines[mkt_start + 3 : end]
    fx_codes = {"AUD", "CAD", "CNY", "EUR", "GBP", "HKD", "JPY", "KRW", "USD"}
    market_codes = {"US", "JP", "CN", "HK", "KR", "DE", "CA", "FR", "AU", "GB", "IT"}
    i = 0
    while i < len(fx_block):
        if fx_block[i] in fx_codes and i + 1 < len(fx_block):
            fx.append({"currency": fx_block[i], "rate": fx_block[i + 1], "rateValue": parse_number(fx_block[i + 1])})
            i += 2
        else:
            i += 1

    i = 0
    while i < len(market_block):
        if market_block[i] in market_codes and i + 2 < len(market_block):
            market.append(
                {
                    "market": market_block[i],
                    "net": market_block[i + 1],
                    "gross": market_block[i + 2],
                    "netValue": parse_percent(market_block[i + 1]),
                    "grossValue": parse_percent(market_block[i + 2]),
                }
            )
            i += 3
        else:
            i += 1
    return fx, market


def split_position_records(lines, start_name, end_name=None):
    start = find_section(lines, start_name)
    if start < 0:
        return []
    end = find_section(lines, end_name) if end_name else len(lines)
    if end < 0:
        end = len(lines)

    body = lines[start + 1 : end]
    while body and body[0] != "Ticker":
        body = body[1:]
    header_end = 0
    for idx, line in enumerate(body):
        if line == "HC":
            header_end = idx + 1
            break
    body = body[header_end:]

    starts = []
    for idx in range(len(body) - 1):
        if is_ticker(body[idx]) and body[idx] == body[idx + 1]:
            starts.append(idx)
    starts.append(len(body))
    return [body[starts[i] : starts[i + 1]] for i in range(len(starts) - 1)]


def parse_position_record(record, side):
    if len(record) < 8:
        return None
    ticker, wind = record[0], record[1]
    tail = record[2:]
    first_num = next((idx for idx, value in enumerate(tail) if NUMBER_RE.match(value)), -1)
    if first_num < 1:
        return None

    name = " ".join(tail[:first_num])
    values = tail[first_num:]
    pct_idx = next((idx for idx, value in enumerate(values) if PCT_RE.match(value)), -1)
    if pct_idx < 0:
        return None
    numeric = values[: pct_idx + 1]
    attrs = values[pct_idx + 1 :]

    if len(numeric) == 4:
        lcl_price, avg_cost, quantity, rmb_notional = numeric[0], "", numeric[1], numeric[2]
    else:
        lcl_price = numeric[0] if len(numeric) > 0 else ""
        avg_cost = numeric[1] if len(numeric) > 1 else ""
        quantity = numeric[2] if len(numeric) > 2 else ""
        rmb_notional = numeric[3] if len(numeric) > 3 else ""
    exp = numeric[-1]

    ctry = ""
    hc = ""
    sector_parts = attrs
    if len(attrs) >= 2 and COUNTRY_RE.match(attrs[-2]) and COUNTRY_RE.match(attrs[-1]):
        ctry, hc = attrs[-2], attrs[-1]
        sector_parts = attrs[:-2]
    elif len(attrs) >= 1 and COUNTRY_RE.match(attrs[-1]):
        ctry = attrs[-1]
        sector_parts = attrs[:-1]
    sector = "".join(sector_parts)

    return {
        "side": side,
        "ticker": ticker,
        "wind": wind,
        "name": name,
        "lclPrice": lcl_price,
        "avgCost": avg_cost,
        "quantity": quantity,
        "rmbNotional": rmb_notional,
        "exp": exp,
        "sector": sector,
        "ctry": ctry,
        "hc": hc,
        "lclPriceValue": parse_number(lcl_price),
        "avgCostValue": parse_number(avg_cost),
        "quantityValue": parse_number(quantity),
        "rmbNotionalValue": parse_number(rmb_notional),
        "expValue": parse_percent(exp),
        "searchText": " ".join([side, ticker, wind, name, sector, ctry, hc]).lower(),
    }


def parse_positions(lines):
    rows = []
    for side, end in [("Long", "Short"), ("Short", "Flat"), ("Flat", None)]:
        for record in split_position_records(lines, side, end):
            parsed = parse_position_record(record, side)
            if parsed:
                rows.append(parsed)
    return rows


def aggregate_positions(positions, key):
    totals = defaultdict(lambda: {"count": 0, "notional": 0.0, "exp": 0.0})
    for row in positions:
        label = row.get(key) or "未分类"
        totals[label]["count"] += 1
        totals[label]["notional"] += row.get("rmbNotionalValue") or 0
        totals[label]["exp"] += row.get("expValue") or 0
    return [
        {"label": label, **values}
        for label, values in sorted(totals.items(), key=lambda item: abs(item[1]["notional"]), reverse=True)
    ]


def make_payload(pdf_path):
    lines, raw_text = split_pdf_text(pdf_path)
    title = lines[0] if lines else PDF_PATH.stem
    report_date = next((line for line in lines if re.match(r"^\d{4}-\d{2}-\d{2}$", line)), "")
    positions = parse_positions(lines)
    fx, market = parse_fx_market(lines)
    payload = {
        "sourcePdf": str(pdf_path),
        "title": title,
        "reportDate": report_date,
        "metrics": parse_key_metrics(lines),
        "options": parse_options(lines),
        "fx": fx,
        "market": market,
        "positions": positions,
        "aggregates": {
            "bySector": aggregate_positions(positions, "sector"),
            "byCountry": aggregate_positions(positions, "ctry"),
            "bySide": aggregate_positions(positions, "side"),
        },
        "rawText": raw_text,
        "counts": dict(Counter(row["side"] for row in positions)),
    }
    return payload


def render_html(payload, pdf_path):
    data_json = json.dumps(payload, ensure_ascii=False)
    encoded_pdf = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
    escaped_title = html.escape(payload["title"])
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>{escaped_title} - 临时报表</title>
  <style>
    :root {{
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #65717f;
      --line: #dde3ea;
      --accent: #0f766e;
      --accent-2: #2458a6;
      --danger: #a33b3b;
      --chip: #eef5f4;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 14px;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(246, 247, 249, 0.96);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
    }}
    .wrap {{ max-width: 1480px; margin: 0 auto; padding: 12px 20px; }}
    .topline {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; }}
    h1 {{ margin: 0; font-size: 20px; font-weight: 720; letter-spacing: 0; }}
    .sub {{ color: var(--muted); margin-top: 4px; font-size: 12px; }}
    .actions {{ display: flex; gap: 8px; flex-wrap: wrap; }}
    button, .link-btn {{
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
    }}
    button.active {{ background: var(--accent); color: white; border-color: var(--accent); }}
    main {{ max-width: 1480px; margin: 0 auto; padding: 12px 20px 28px; }}
    .metrics {{ display: grid; grid-template-columns: repeat(6, minmax(140px, 1fr)); gap: 8px; margin-bottom: 10px; }}
    .metric {{ background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }}
    .metric .label {{ color: var(--muted); font-size: 12px; }}
    .metric .value {{ font-size: 17px; font-weight: 700; margin-top: 2px; }}
    .toolbar {{
      display: grid;
      grid-template-columns: minmax(220px, 1.5fr) repeat(4, minmax(140px, 0.8fr));
      gap: 10px;
      margin: 10px 0;
      align-items: end;
    }}
    label {{ display: grid; gap: 5px; color: var(--muted); font-size: 12px; }}
    input, select {{
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      color: var(--ink);
      padding: 7px 9px;
      font: inherit;
      min-height: 34px;
    }}
    .panels {{ display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; margin-bottom: 10px; }}
    .panel {{ background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }}
    .panel h2 {{ margin: 0; padding: 8px 10px; font-size: 13px; border-bottom: 1px solid var(--line); }}
    .mini-table {{ width: 100%; border-collapse: collapse; }}
    .mini-table th, .mini-table td {{ padding: 5px 9px; border-bottom: 1px solid #edf1f5; text-align: right; white-space: nowrap; }}
    .mini-table th:first-child, .mini-table td:first-child {{ text-align: left; }}
    .table-box {{ background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; overflow-y: visible; }}
    table.positions {{ width: 100%; border-collapse: separate; border-spacing: 0; min-width: 1160px; }}
    .positions th {{
      position: sticky;
      top: 0;
      background: #f9fbfc;
      border-bottom: 1px solid var(--line);
      color: #3b4653;
      font-size: 12px;
      text-align: left;
      padding: 5px 8px;
      cursor: pointer;
      white-space: nowrap;
    }}
    .positions td {{ border-bottom: 1px solid #edf1f5; padding: 4px 8px; vertical-align: top; white-space: nowrap; font-size: 12px; line-height: 1.25; }}
    .positions tbody tr:hover {{ background: #f7faf9; }}
    .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .name {{ white-space: normal; min-width: 200px; max-width: 300px; }}
    .badge {{ display: inline-block; padding: 2px 7px; border-radius: 999px; background: var(--chip); color: var(--accent); font-size: 12px; }}
    .badge.short {{ background: #f8eeee; color: var(--danger); }}
    .footer-tools {{ display: flex; justify-content: space-between; align-items: center; margin: 6px 0 8px; color: var(--muted); }}
    details {{ margin-top: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }}
    pre {{ white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; }}
    @media (max-width: 980px) {{
      .metrics {{ grid-template-columns: repeat(2, 1fr); }}
      .toolbar, .panels {{ grid-template-columns: 1fr; }}
      .topline {{ align-items: flex-start; flex-direction: column; }}
    }}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="topline">
        <div>
          <h1>{escaped_title}</h1>
          <div class="sub">日期 <span id="reportDate"></span> · 来源 PDF: {html.escape(pdf_path.name)}</div>
        </div>
        <div class="actions">
          <button type="button" id="resetBtn">重置筛选</button>
          <button type="button" id="copyBtn">复制当前表格 CSV</button>
          <a class="link-btn" href="data:application/pdf;base64,{encoded_pdf}" download="{html.escape(pdf_path.name)}">下载原 PDF</a>
        </div>
      </div>
    </div>
  </header>
  <main>
    <section class="metrics" id="metrics"></section>

    <section class="toolbar">
      <label>全局搜索
        <input id="q" type="search" placeholder="代码、名称、行业、国家..." autofocus />
      </label>
      <label>方向
        <select id="sideFilter"><option value="">全部</option></select>
      </label>
      <label>市场
        <select id="countryFilter"><option value="">全部</option></select>
      </label>
      <label>行业
        <select id="sectorFilter"><option value="">全部</option></select>
      </label>
      <label>最小敞口 %
        <input id="minExp" type="number" step="0.1" placeholder="例如 0.5" />
      </label>
    </section>

    <section class="panels">
      <div class="panel"><h2>市场暴露</h2><table class="mini-table" id="marketTable"></table></div>
      <div class="panel"><h2>期权</h2><table class="mini-table" id="optionTable"></table></div>
      <div class="panel"><h2>行业汇总</h2><table class="mini-table" id="sectorTable"></table></div>
    </section>

    <div class="footer-tools">
      <div id="resultCount"></div>
      <div>点击表头排序</div>
    </div>
    <section class="table-box">
      <table class="positions" id="positionsTable">
        <thead><tr id="headRow"></tr></thead>
        <tbody id="bodyRows"></tbody>
      </table>
    </section>

    <details>
      <summary>原始 PDF 文本</summary>
      <pre id="rawText"></pre>
    </details>
  </main>
  <script id="payload" type="application/json">{data_json}</script>
  <script>
    const data = JSON.parse(document.getElementById('payload').textContent);
    const columns = [
      ['side', '方向'], ['ticker', 'Ticker'], ['name', '名称'], ['sector', '行业'],
      ['ctry', '市场'], ['hc', 'HC'], ['lclPrice', '现价'], ['avgCost', '成本'],
      ['quantity', '数量'], ['rmbNotional', 'RMB Notional'], ['exp', 'Exp %']
    ];
    const numericMap = {{ lclPrice: 'lclPriceValue', avgCost: 'avgCostValue', quantity: 'quantityValue', rmbNotional: 'rmbNotionalValue', exp: 'expValue' }};
    let sortKey = 'rmbNotional';
    let sortDir = -1;

    const fmt = new Intl.NumberFormat('zh-CN', {{ maximumFractionDigits: 0 }});
    const unique = key => [...new Set(data.positions.map(row => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const el = id => document.getElementById(id);

    function fillSelect(id, values) {{
      const select = el(id);
      for (const value of values) {{
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }}
    }}

    function renderMetrics() {{
      el('reportDate').textContent = data.reportDate || '';
      el('metrics').innerHTML = data.metrics.map(item => `<div class="metric"><div class="label">${{item.label}}</div><div class="value">${{item.value}}</div></div>`).join('');
    }}

    function renderMiniTables() {{
      el('marketTable').innerHTML = '<thead><tr><th>市场</th><th>Net</th><th>Gross</th></tr></thead><tbody>' +
        data.market.map(row => `<tr><td>${{row.market}}</td><td>${{row.net}}</td><td>${{row.gross}}</td></tr>`).join('') + '</tbody>';
      el('optionTable').innerHTML = '<thead><tr><th>合约</th><th>数量</th><th>Net</th><th>Delta</th></tr></thead><tbody>' +
        data.options.map(row => `<tr><td>${{row.contract}}</td><td>${{row.quantity}}</td><td>${{row.netExp}}</td><td>${{row.deltaAdj}}</td></tr>`).join('') + '</tbody>';
      el('sectorTable').innerHTML = '<thead><tr><th>行业</th><th>数量</th><th>Notional</th><th>Exp</th></tr></thead><tbody>' +
        data.aggregates.bySector.slice(0, 10).map(row => `<tr><td>${{row.label}}</td><td>${{row.count}}</td><td>${{fmt.format(row.notional)}}</td><td>${{row.exp.toFixed(2)}}%</td></tr>`).join('') + '</tbody>';
    }}

    function filteredRows() {{
      const q = el('q').value.trim().toLowerCase();
      const side = el('sideFilter').value;
      const ctry = el('countryFilter').value;
      const sector = el('sectorFilter').value;
      const minExp = Number(el('minExp').value);
      return data.positions.filter(row => {{
        if (q && !row.searchText.includes(q)) return false;
        if (side && row.side !== side) return false;
        if (ctry && row.ctry !== ctry) return false;
        if (sector && row.sector !== sector) return false;
        if (!Number.isNaN(minExp) && el('minExp').value !== '' && Math.abs(row.expValue || 0) < minExp) return false;
        return true;
      }}).sort((a, b) => {{
        const valueKey = numericMap[sortKey] || sortKey;
        const av = a[valueKey] ?? a[sortKey] ?? '';
        const bv = b[valueKey] ?? b[sortKey] ?? '';
        if (typeof av === 'number' || typeof bv === 'number') return ((av || 0) - (bv || 0)) * sortDir;
        return String(av).localeCompare(String(bv), 'zh-CN') * sortDir;
      }});
    }}

    function renderTable() {{
      const rows = filteredRows();
      el('headRow').innerHTML = columns.map(([key, label]) => `<th data-key="${{key}}">${{label}}${{sortKey === key ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}}</th>`).join('');
      el('bodyRows').innerHTML = rows.map(row => `<tr>
        <td><span class="badge ${{row.side === 'Short' ? 'short' : ''}}">${{row.side}}</span></td>
        <td>${{row.ticker}}</td>
        <td class="name">${{row.name}}</td>
        <td>${{row.sector}}</td>
        <td>${{row.ctry}}</td>
        <td>${{row.hc}}</td>
        <td class="num">${{row.lclPrice}}</td>
        <td class="num">${{row.avgCost}}</td>
        <td class="num">${{row.quantity}}</td>
        <td class="num">${{row.rmbNotional}}</td>
        <td class="num">${{row.exp}}</td>
      </tr>`).join('');
      const totalNotional = rows.reduce((sum, row) => sum + (row.rmbNotionalValue || 0), 0);
      const totalExp = rows.reduce((sum, row) => sum + (row.expValue || 0), 0);
      el('resultCount').textContent = `${{rows.length}} 条 · Notional ${{fmt.format(totalNotional)}} · Exp ${{totalExp.toFixed(2)}}%`;
    }}

    function toCsv(rows) {{
      const escape = value => `"${{String(value ?? '').replaceAll('"', '""')}}"`;
      return [columns.map(([, label]) => escape(label)).join(',')]
        .concat(rows.map(row => columns.map(([key]) => escape(row[key])).join(',')))
        .join('\\n');
    }}

    function bind() {{
      fillSelect('sideFilter', unique('side'));
      fillSelect('countryFilter', unique('ctry'));
      fillSelect('sectorFilter', unique('sector'));
      for (const id of ['q', 'sideFilter', 'countryFilter', 'sectorFilter', 'minExp']) el(id).addEventListener('input', renderTable);
      el('resetBtn').addEventListener('click', () => {{
        for (const id of ['q', 'sideFilter', 'countryFilter', 'sectorFilter', 'minExp']) el(id).value = '';
        renderTable();
      }});
      el('copyBtn').addEventListener('click', async () => {{
        await navigator.clipboard.writeText(toCsv(filteredRows()));
        el('copyBtn').textContent = '已复制 CSV';
        setTimeout(() => el('copyBtn').textContent = '复制当前表格 CSV', 1200);
      }});
      el('headRow').addEventListener('click', event => {{
        const th = event.target.closest('th');
        if (!th) return;
        const key = th.dataset.key;
        sortDir = sortKey === key ? -sortDir : -1;
        sortKey = key;
        renderTable();
      }});
    }}

    renderMetrics();
    renderMiniTables();
    el('rawText').textContent = data.rawText;
    bind();
    renderTable();
  </script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Generate a searchable multidimensional portfolio report from a PDF.")
    parser.add_argument("pdf", type=Path, help="Input portfolio PDF")
    parser.add_argument("-o", "--out-dir", type=Path, default=Path("tmp/portfolio_report"), help="Output directory")
    args = parser.parse_args()

    pdf_path = args.pdf.expanduser().resolve()
    out_dir = args.out_dir.expanduser().resolve()
    out_html = out_dir / "index.html"
    out_json = out_dir / "portfolio-data.json"

    out_dir.mkdir(parents=True, exist_ok=True)
    payload = make_payload(pdf_path)
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    out_html.write_text(render_html(payload, pdf_path), encoding="utf-8")
    print(f"Wrote {out_html}")
    print(f"positions={len(payload['positions'])} options={len(payload['options'])} fx={len(payload['fx'])} market={len(payload['market'])}")


if __name__ == "__main__":
    main()
