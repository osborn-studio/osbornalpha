-- ============================================================================
-- Seed: stocks_universe + financial_history (public reference data)
-- Run with: supabase db reset  (local)  or  supabase db push  (linked project)
-- For production: paste into Supabase SQL editor or pipe via psql.
-- ============================================================================

insert into public.stocks_universe (ticker, name, pinyin, market, industry, last_price) values
  ('00700.HK', '腾讯控股',    'TXKG', 'HK', '互联网',    420.40),
  ('09988.HK', '阿里巴巴',    'ALBB', 'HK', '互联网',    88.50),
  ('03690.HK', '美团',        'MT',   'HK', '互联网',    155.00),
  ('01024.HK', '快手',        'KS',   'HK', '互联网',    52.10),
  ('01810.HK', '小米集团',    'XMJT', 'HK', '消费电子',  18.20),
  ('02318.HK', '中国平安',    'ZGPA', 'HK', '保险',      45.50),
  ('00939.HK', '建设银行',    'JSYH', 'HK', '银行',       7.80),
  ('AAPL',     'Apple',       'AAPL', 'US', '消费电子',  215.20),
  ('NVDA',     'NVIDIA',      'NVDA', 'US', '半导体',   1180.50),
  ('MSFT',     '微软',        'MSFT', 'US', '云计算',    420.80),
  ('GOOGL',    'Alphabet',    'ABC',  'US', '互联网',    175.60),
  ('META',     'Meta',        'META', 'US', '互联网',    510.20),
  ('AMZN',     '亚马逊',      'YMX',  'US', '电商云',    195.50),
  ('TSLA',     '特斯拉',      'TSL',  'US', '汽车',      195.30),
  ('BRK.B',    'Berkshire B', 'BKB',  'US', '综合金融',  442.30),
  ('PDD',      '拼多多',      'PDD',  'US', '电商',     132.50),
  ('BABA',     '阿里巴巴 ADR', 'BABA', 'US', '互联网',   88.50),
  ('BIDU',     '百度',        'BD',   'US', '互联网',   100.00),
  ('COIN',     'Coinbase',    'COIN', 'US', '加密',     215.40),
  ('PLTR',     'Palantir',    'PLTR', 'US', '软件',      28.50),
  ('600519.SH','贵州茅台',    'GZMT', 'A',  '白酒',    1580.00),
  ('002594.SZ','比亚迪',      'BYD',  'A',  '汽车',     285.50),
  ('000333.SZ','美的集团',    'MDJT', 'A',  '家电',      85.00),
  ('300750.SZ','宁德时代',    'NDSD', 'A',  '电池',     210.00),
  ('688981.SH','中芯国际',    'ZXGJ', 'A',  '半导体',   78.50),
  ('600036.SH','招商银行',    'ZSYH', 'A',  '银行',     45.00),
  ('601318.SH','中国平安',    'ZGPA', 'A',  '保险',     50.00),
  ('002475.SZ','立讯精密',    'LXJM', 'A',  '消费电子', 35.40),
  ('000858.SZ','五粮液',      'WLY',  'A',  '白酒',    180.00),
  ('600276.SH','恒瑞医药',    'HRYY', 'A',  '医药',     48.00)
on conflict (ticker) do update
  set name = excluded.name, pinyin = excluded.pinyin, market = excluded.market,
      industry = excluded.industry, last_price = excluded.last_price;

-- 5-year financial history for a few flagship tickers
insert into public.financial_history (ticker, fiscal_year, period, revenue, net_income, roe) values
  ('00700.HK', 2021, 'annual', 5602, 1883, 22.1),
  ('00700.HK', 2022, 'annual', 5546, 1882, 18.5),
  ('00700.HK', 2023, 'annual', 6090, 1150,  9.8),
  ('00700.HK', 2024, 'annual', 6602, 1576, 13.2),
  ('00700.HK', 2025, 'annual', 7098, 1941, 16.4),
  ('NVDA', 2021, 'annual',  269,  97,  44.8),
  ('NVDA', 2022, 'annual',  270,  44,  18.6),
  ('NVDA', 2023, 'annual',  609, 297,  91.4),
  ('NVDA', 2024, 'annual', 1305, 730, 115.3),
  ('NVDA', 2025, 'annual', 2200,1080,  82.3),
  ('AAPL', 2021, 'annual', 3658, 947, 147.4),
  ('AAPL', 2022, 'annual', 3943, 998, 175.5),
  ('AAPL', 2023, 'annual', 3832, 970, 156.1),
  ('AAPL', 2024, 'annual', 3912, 989, 152.8),
  ('AAPL', 2025, 'annual', 4035,1052, 156.8),
  ('600519.SH', 2021, 'annual', 1095, 525, 29.9),
  ('600519.SH', 2022, 'annual', 1276, 627, 31.1),
  ('600519.SH', 2023, 'annual', 1505, 747, 34.2),
  ('600519.SH', 2024, 'annual', 1709, 838, 34.7),
  ('600519.SH', 2025, 'annual', 1900, 920, 33.2),
  ('002594.SZ', 2021, 'annual', 2161,  30,  3.7),
  ('002594.SZ', 2022, 'annual', 4241, 166, 14.0),
  ('002594.SZ', 2023, 'annual', 6023, 300, 21.6),
  ('002594.SZ', 2024, 'annual', 7775, 402, 26.0),
  ('002594.SZ', 2025, 'annual', 9200, 510, 24.5)
on conflict (ticker, fiscal_year, period) do update
  set revenue = excluded.revenue, net_income = excluded.net_income, roe = excluded.roe;
