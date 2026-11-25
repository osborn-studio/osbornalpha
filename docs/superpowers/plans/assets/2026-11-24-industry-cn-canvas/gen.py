#!/usr/bin/env python3
# Generates the CN industry artboards (static .dc.html). Usage: gen.py <outdir> <kit-css-href> <cn-css-href> [heights.json]
import os, sys, json
OUT, KIT, CNCSS = sys.argv[1], sys.argv[2], sys.argv[3]
HEIGHTS = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
LANG = 'zh'
BOARDS = {}  # name -> (w, h, title, fill)

def t(zh, en): return zh if LANG == 'zh' else en
def h(zh, en): return f'{zh} <span class="en">{en}</span>' if LANG == 'zh' else en
def F(n): return f'{n}.dc.html' if LANG == 'zh' else f'{n}-en.dc.html'
def M(s): return f'<span class="m">{s}</span>'

ACT = '2026-11-21T02:10:00+08:00'

def doc(name, title, body, w, hh, fixed=False, ctitle=None, both=True):
    fn = F(name) if both else f'{name}.dc.html'
    hh = HEIGHTS.get(fn, hh)
    root = (f'width:{w}px;min-height:{hh}px;' if fixed else 'min-height:100vh;') + 'display:flex;flex-direction:column'
    s = f'''<!doctype html>
<html lang="{'zh-CN' if LANG == 'zh' else 'en'}">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="{KIT}">
<link rel="stylesheet" href="{CNCSS}">
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
body{{margin:0;background:#0a0a0b}}
a{{color:#a1a1aa}}a:hover{{color:#fafafa}}
</style>
</helmet>
<div class="oa" style="{root}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{hh}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
    open(os.path.join(OUT, 'project', fn), 'w').write(s)
    BOARDS[fn] = dict(w=w, h=hh, title=ctitle or title, fill=not fixed)

# ---------- shared shell ----------
def top():
    nav = [('宏观', 'Macro', 'MacroLanding.dc.html'), ('股票池', 'Watchlist', '#watchlist'), ('研究', 'Research', 'Hub.dc.html'),
           ('我的投资', 'Portfolio', '#portfolio'), ('分析', 'Analysis', '#analyst'), ('工具', 'Tools', '#tools'), ('设置', 'Settings', '#settings')]
    a = ''.join(f'<a href="{u}"{" class=\"on\"" if z == "研究" else ""}>{t(z, e)}</a>' for z, e, u in nav)
    zon, eon = ('class="on" aria-pressed="true"', 'aria-pressed="false"') if LANG == 'zh' else ('aria-pressed="false"', 'class="on" aria-pressed="true"')
    return f'''<header class="top">
<a href="MacroLanding.dc.html" class="logo">Osborn<b>Alpha</b></a>
<nav class="topnav" aria-label="{t('主导航', 'Main')}">{a}</nav>
<span class="sp"></span>
<label class="row" style="gap:6px"><span class="tiny">{t('搜索', 'Search')}</span><input class="inp" type="search" placeholder="{t('股票 / 指标 / 行业 / 专题', 'Stock / indicator / industry / topic')}" style="width:240px"></label>
<div class="seg" role="group" aria-label="{t('语言', 'Language')}"><button type="button" {zon}>中</button><button type="button" {eon}>EN</button></div>
</header>
<nav class="chain" aria-label="{t('研究链', 'Research chain')}">
<span class="cap" style="margin-right:6px">{t('研究链', 'Research chain')}</span>
<a href="MacroLanding.dc.html"><span class="n">01</span>{t('宏观策略', 'Macro')}</a><span class="sep">→</span>
<a href="{F('Cn-List')}" class="on" aria-current="page"><span class="n">02</span>{t('行业研究', 'Industries')}</a><span class="sep">→</span>
<a href="Company.dc.html"><span class="n">03</span>{t('公司研究', 'Companies')}</a><span class="sep">→</span>
<a href="Foreign.dc.html"><span class="n">04</span>{t('外资研报', 'Broker research')}</a><span class="sep">→</span>
<a href="TopicDirectory.dc.html"><span class="n">05</span>{t('专题研究', 'Topics')}</a>
<span class="sp"></span>
<a href="Main.dc.html" style="border-style:dashed">{t('这条链怎么读', 'How to read the chain')}</a>
</nav>'''

def mshell_top(title=None):
    return f'''<header class="mtop"><a href="MacroLanding.dc.html" class="logo">Osborn<b>Alpha</b></a><span class="sp"></span><button type="button" class="ibtn" aria-label="{t('搜索', 'Search')}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg></button></header>
<nav class="mchain" aria-label="{t('研究链', 'Research chain')}"><a href="M-Macro.dc.html">01 {t('宏观', 'Macro')}</a><a href="{F('M-Cn-List')}" class="on">02 {t('行业', 'Industries')}</a><a href="#co">03 {t('公司', 'Companies')}</a><a href="#fr">04 {t('外资研报', 'Brokers')}</a><a href="M-Topic.dc.html">05 {t('专题', 'Topics')}</a></nav>'''

def mtab():
    return f'''<nav class="tabbar" aria-label="{t('主导航', 'Main')}"><a href="M-Macro.dc.html">{t('宏观', 'Macro')}</a><a href="#watch">{t('股票池', 'Watchlist')}</a><a href="{F('M-Cn-List')}" class="on">{t('研究', 'Research')}</a><a href="#pf">{t('我的投资', 'Portfolio')}</a><a href="#more">{t('更多', 'More')}</a></nav>'''

def tag_fact(): return f'<span class="tag fact">{t("事实", "Fact")}</span>'
def tag_judg(): return f'<span class="tag judg">{t("判断", "Judgment")}</span>'
def org_v(): return f'<span class="org"><i></i>{t("供应商口径", "Vendor-reported")}</span>'
def org_c(): return f'<span class="org cmp"><i></i>{t("本站计算", "Computed")}</span>'
def derived(f): return f'<span class="chip">{t("本站推算", "Derived")} · {M(f)}</span>'

def adm(ds_zh, ds_en, extra=''):
    return f'''<div class="adm" role="status"><span class="row"><span class="st recon">{t('内部预览', 'Internal preview')}</span><b>{t('仅管理员可见 · 供应商数据尚未获准对外展示', 'Admins only · vendor data is not yet licensed for display')}</b></span>
<span style="display:block;margin-top:4px">{t(f'数据集“{ds_zh}”的许可状态是“内部”。只有管理员看到这些数字；其他已登录用户看到“数据授权待确认”，并被引到 SIC 方案。公开前，须由 owner 在许可表登记合同条款。', f'Dataset "{ds_en}" has licence status "internal". Only admins see these numbers; other signed-in users see "data licence pending" and are pointed to the SIC scheme. Before it goes public the owner records the contract clause in the licence table.')}{extra}</span></div>'''

def scheme_seg():
    return f'''<div class="seg" role="group" aria-label="{t('方案', 'Scheme')}"><a href="IndustrySic.dc.html">{t('SIC · 美股（SEC）', 'SIC · US (SEC)')}</a><a href="{F('Cn-List')}" class="on" aria-current="true">{t('申万 2021 · A 股 · 内部预览', 'SW 2021 · A-shares · internal preview')}</a></div>'''

def fresh():
    return f'''<span class="chip"><span class="dot"></span>{t('财务', 'Financials')} {M('2026-11-20')} · {t('正常', 'fresh')}</span>
<span class="chip"><span class="dot"></span>{t('估值', 'Valuation')} {M('2026-11-21')} · {t('正常', 'fresh')}</span>
<span class="chip warn"><span class="dot w"></span>{t('成分', 'Membership')} {M('2026-11-10')} · {t('过期', 'stale')}</span>'''

def legend(): return tag_fact() + tag_judg()

def foot(internal=True):
    chips = f'<span class="chip">{t("恒生聚源 Gildata · 数据地图（内部，未公开署名）", "Gildata · Datamap (internal, attribution not public)")}</span>' if internal else f'<span class="chip">{t("恒生聚源 Gildata", "Gildata")}</span><span class="chip">[{t("合同要求的署名措辞", "attribution wording required by contract")}]</span>'
    return f'''<div class="foot"><span class="cap">{t('来源', 'Sources')}</span>{chips}<span class="sp"></span><a href="{F('Cn-Drawer')}" class="btn">{t('方法与来源', 'Methods and sources')}</a></div>
<div class="disc">{t('本页内容不构成投资建议。数据可能延迟或修订；每个数字的来源见其抽屉。公共页脚只在数据集公开后显示供应商署名。', 'Nothing on this page is investment advice. Data may be delayed or revised; each number opens its source. The public footer shows the vendor attribution only once a dataset is public.')}</div>'''

# ---------- data ----------
def ind(i):
    zh, en = f'行业 {i:02d}', f'Industry {i:02d}'
    if i == 17: zh, en = '行业 17（金融类）', 'Industry 17 (financial)'
    if i == 8: zh, en = '行业 08（长名称示例）', 'Industry 08 (a long English name that wraps)'
    return t(zh, en), f'801{i:02d}x.SI', 20 + (i * 37) % 260

def val(i, j): return ((i * 17 + j * 29) % 53) - 14 + ((i * 3 + j) % 10) / 10
def sgn(v, unit='%'): return ('+' if v > 0 else '−' if v < 0 else '') + f'{abs(v):.1f}{unit}'
def cls(v):
    a = abs(v)
    if v > 0: return 'p1' if a < 8 else 'p2' if a < 16 else 'p3' if a < 28 else 'p4'
    if v < 0: return 'n1' if a < 4 else 'n2' if a < 8 else 'n3' if a < 12 else 'n4'
    return ''

def na(zh, en, rz, re, href=None, mh=''):
    href = href or F('Cn-States')
    return f'<a href="{href}" class="hc na"{mh}>{t(zh, en)}<small>{t(rz, re)}</small></a>'

def cell(i, j, drawer=None, mh=''):
    drawer = drawer or F('Cn-Drawer')
    if j == 0: return na('缺失', 'Missing', '无对比期', 'no prior period', mh=mh)
    if (i, j) == (12, 4): return na('缺失', 'Missing', '供应商未提供', 'not provided', mh=mh)
    if (i, j) == (21, 6): return na('缺失', 'Missing', '解析失败', 'could not be read', mh=mh)
    if (i, j) == (9, 9): return na('覆盖不足', 'Low coverage', '0.62', '0.62', mh=mh)
    v = 128.4 if (i, j) == (3, 5) else val(i, j)
    rv = f'<span class="rv">{t("已修订", "rev.")}</span>' if (i, j) == (5, 7) else ''
    return f'<a href="{drawer}" class="hc {cls(v)}"{mh}>{sgn(v)}{rv}</a>'

YEARS = [f'FY{y}' for y in range(2016, 2026)]

def ramp_legend():
    neg = ''.join(f'<span class="sw hc n{k}" style="display:inline-block;min-height:0;padding:0"></span>' for k in (4, 3, 2, 1))
    pos = ''.join(f'<span class="sw hc p{k}" style="display:inline-block;min-height:0;padding:0"></span>' for k in (1, 2, 3, 4))
    return f'''<span class="row tiny" style="gap:4px">{t('负', 'negative')} {neg} <span class="m">0</span> {pos} {t('正', 'positive')}</span><span class="st miss">{t('缺失', 'Missing')}</span><span class="st miss">{t('覆盖不足', 'Low coverage')}</span><span class="st rev">{t('已修订', 'Revised')}</span>'''

# ---------- LIST (grid) ----------
def controls(view='grid', metric=0, basis=0, display=0):
    ms = [('营收同比', 'Revenue YoY'), ('归母净利同比', 'Parent net profit YoY'), ('毛利率', 'Gross margin'), ('ROE', 'ROE')]
    mseg = ''.join(f'<a href="#metric"{" class=\"on\" aria-current=\"true\"" if k == metric else ""}>{t(z, e)}</a>' for k, (z, e) in enumerate(ms))
    on = ' class="on" aria-current="true"'
    disp = '' if view == 'stages' else f'''<label class="field">{t('显示', 'Display')}<span class="seg"><a href="#heat"{on if display == 0 else ''}>{t('热力图', 'Heatmap')}</a><a href="#table"{on if display == 1 else ''}>{t('表格', 'Table')}</a></span></label>'''
    return f'''<div class="row">
<label class="field">{t('层级', 'Level')}<span class="seg"><a href="#l1" class="on" aria-current="true">{t('一级', 'Level 1')}</a></span></label>
<label class="field">{t('指标', 'Metric')}<span class="seg">{mseg}</span></label>
<label class="field">{t('口径', 'Basis')}<span class="seg"><a href="#annual"{on if basis == 0 else ''}>{t('年度', 'Annual')}</a><a href="#quarter"{on if basis == 1 else ''}>{t('单季', 'Single quarter')}</a></span></label>
<label class="field">{t('视图', 'View')}<span class="seg"><a href="{F('Cn-List')}"{on if view == 'grid' else ''}>{t('网格', 'Grid')}</a><a href="{F('Cn-Stages')}"{on if view == 'stages' else ''}>{t('阶段', 'Stages')}</a></span></label>
<span class="sp"></span>{disp}
<span class="tiny">{t('二、三级暂只提供分类导航与成分，不提供聚合值。口径、视图、指标都是链接（查询参数），可收藏。', 'Levels 2 and 3 offer navigation and constituents only. Basis, view and metric are links (search params), so a view can be bookmarked.')}</span>
</div>'''

def runbar():
    return f'''<div class="card" style="flex-direction:row;flex-wrap:wrap;align-items:center;padding:10px 14px">
<span class="cap">{t('供应商运行', 'Vendor run')}</span>{M('[run_id]')}<span class="chip">{t('第 3 代', 'Generation 3')}</span><span class="chip">{t('激活', 'Activated')} {M(ACT)}</span><span class="chip">{M('31')} {t('个行业', 'industries')} · {M('10')} {t('个年度', 'fiscal years')}</span><span class="st recon">{t('重建口径', 'Reconstructed')}</span>{org_v()}
<span class="sp"></span><a href="{F('Cn-Drawer')}" class="btn">{t('方法与来源', 'Methods and sources')}</a>
<span class="sub" style="flex-basis:100%">{t('供应商没有公布聚合方法和成分名单，所以历史值不是当时可见的数字。每格的可得时刻是本次运行的激活时刻，不回溯到期间。', 'The vendor publishes neither its aggregation method nor the member list, so past values are not what was visible at the time. Each cell became available at this run’s activation, not at the period end.')}</span>
</div>'''

def list_page():
    rows = ''
    for i in range(1, 32):
        n, c, m = ind(i)
        tds = ''.join(f'<td>{cell(i, j)}</td>' for j in range(10))
        rows += f'<tr><td><a href="{F("Cn-Detail")}" style="color:#fafafa"><span class="m fog">{c}</span> {n}</a></td><td class="m r">{m}</td>{tds}</tr>\n'
    ths = ''.join(f'<th class="r">{y}</th>' for y in YEARS)
    trows = ''
    for i in (3, 5, 9, 12, 17):
        n, c, m = ind(i)
        def tv(j):
            if j == 0: return f'<span class="st miss">{t("缺失 · 无对比期", "Missing · no prior period")}</span>'
            if (i, j) == (12, 4): return f'<span class="st miss">{t("缺失 · 供应商未提供", "Missing · not provided by vendor")}</span>'
            if (i, j) == (9, 9): return f'<span class="st miss">{t("覆盖不足", "Low coverage")} {M("0.62")}</span>'
            v = 128.4 if (i, j) == (3, 5) else val(i, j)
            r = f' <span class="st rev">{t("已修订", "Revised")}</span>' if (i, j) == (5, 7) else ''
            return f'<a href="{F("Cn-Drawer")}" class="src">{sgn(v)}</a>{r}'
        cov = '0.62' if i == 9 else f'{0.9 + (i % 9) / 100:.2f}'
        trows += f'<tr><td>{n}</td><td class="m">{c}</td><td class="r">{tv(0)}</td><td class="r">{tv(4)}</td><td class="r">{tv(5)}</td><td class="r">{tv(7)}</td><td class="r">{tv(9)}</td><td class="m r">{m}</td><td class="m r">{cov}</td><td><a href="{F("Cn-Drawer")}" style="color:#ca8a04">{t("来源", "Source")} ▸</a></td></tr>\n'
    gm = ''
    for i, vals in ((4, [31.5, 30.0, 28.5]), (17, None), (22, [-2.5, 4.0, 12.0])):
        n, c, m = ind(i)
        if vals is None:
            tds = f'<td colspan="3"><span class="hc na" style="flex-direction:row;gap:6px">{t("未服务", "Not served")}<small>{t("不适用于该行业", "not applicable to this industry")}</small></span></td>'
        else:
            tds = ''.join(f'<td><a href="{F("Cn-Drawer")}" class="hc {cls(v)}">{sgn(v)}</a></td>' for v in vals)
        gm += f'<tr><td><span class="m fog">{c}</span> {n}</td>{tds}</tr>'
    body = f'''{top()}
<main class="wrap">
<div class="ph">
<div class="col" style="gap:2px">
<h1 class="h1">{h('行业研究', 'Industry research')}</h1>
<span class="sub">{t('申万一级 · 31 个行业 · 年度。只陈述数值与覆盖；行业阶段是判断，只出现在“阶段”视图和行业详情的判断区。', 'SW level 1 · 31 industries · annual. Values and coverage only; an industry’s stage is a judgment and appears only in the Stages view and the judgment area of a detail page.')}</span>
</div>
<span class="sp"></span>{scheme_seg()}{fresh()}{legend()}
</div>
{adm('恒生聚源 · 行业财务（供应商口径）', 'Gildata · industry financials (vendor-reported)')}
{runbar()}
{controls()}
<section class="card" aria-labelledby="cl-heat" id="heat">
<div class="row"><h2 id="cl-heat" class="h2">{h('营收同比 · 年度', 'Revenue YoY, annual')}</h2>{tag_fact()}{org_v()}{derived('yoy/1')}<span class="sp"></span>{ramp_legend()}</div>
<span class="tiny">{t('铜色 = 正值，灰色加细框 = 负值；符号始终印出，深浅只表示幅度，不表示好坏，也不是涨跌色。点击格 → 来源抽屉；点击行名 → 行业详情。FY2016 没有上年基数，整列是“缺失 · 无对比期”，不是空白也不是 0。', 'Brass = positive, grey with a hairline frame = negative; the sign is always printed, depth shows magnitude only, not good or bad, and is not the market up/down colour. A cell opens its source; a row name opens the industry. FY2016 has no prior-year base, so the whole column reads "Missing · no prior period", never blank and never 0.')}</span>
<div class="tw"><table class="t" style="table-layout:fixed;min-width:1180px">
<thead><tr><th style="width:{t('210px', '250px')}">{t('行业', 'Industry')}</th><th style="width:56px" class="r">{t('成分', 'Members')}</th>{ths}</tr></thead>
<tbody>
{rows}</tbody></table></div>
<span class="tiny">{t('行按代码排序；表格视图可按任一列排序。成分数是供应商返回的家数。', 'Rows are ordered by code; the table view sorts by any column. Members is the count returned by the vendor.')}</span>
</section>

<section class="card" aria-labelledby="cl-table" id="table">
<div class="row"><h2 id="cl-table" class="h2">{h('表格视图', 'Table view')}</h2>{tag_fact()}{org_v()}<span class="tiny">{t('与热力图同一份数据，不用颜色也能读；“显示”切到表格时只留这一块。此处节选 5 行、5 期。', 'Same data as the heatmap, readable without colour; with Display set to Table only this block remains. Excerpt: 5 rows, 5 periods.')}</span></div>
<div class="tw"><table class="t">
<thead><tr><th><a href="#sort">{t('行业', 'Industry')} ↕</a></th><th>{t('代码', 'Code')}</th><th class="r">FY2016</th><th class="r">FY2020</th><th class="r">FY2021</th><th class="r">FY2023</th><th class="r"><a href="#sort" style="color:#ca8a04">FY2025 ↓</a></th><th class="r">{t('成分数', 'Members')}</th><th class="r">{t('覆盖', 'Coverage')}</th><th>{t('来源', 'Source')}</th></tr></thead>
<tbody>
{trows}</tbody></table></div>
<span class="tiny">{t('覆盖 = 供应商返回的成分数 ÷ 本站在该期末解析到的成分数；低于 0.8 不显示数值（设计假设，待数据侧确认）。', 'Coverage = members returned by the vendor ÷ members we resolve at that period end; below 0.8 no value is shown (design assumption, to be confirmed by the data work).')}</span>
</section>

<div class="g2">
<section class="card" aria-labelledby="cl-gm">
<div class="row"><h2 id="cl-gm" class="h2">{h('指标切到“毛利率”时', 'With metric = Gross margin')}</h2>{tag_fact()}{org_v()}</div>
<div class="tw"><table class="t" style="table-layout:fixed"><thead><tr><th style="width:230px">{t('行业', 'Industry')}</th><th class="r">FY2023</th><th class="r">FY2024</th><th class="r">FY2025</th></tr></thead><tbody>{gm}</tbody></table></div>
<span class="tiny">{t('金融类行业没有毛利率：整行写“未服务 · 不适用于该行业”，不留空。', 'Financial industries have no gross margin: the row reads "Not served · not applicable to this industry", never left blank.')}</span>
</section>
<section class="card" aria-labelledby="cl-j">
<div class="row"><h2 id="cl-j" class="h2">{h('判断在哪里', 'Where judgments live')}</h2>{tag_judg()}</div>
<div class="slot">{t('网格里没有任何判断。阶段、估值结论、景气综合都是登记过的方法给出的判断，只出现在“阶段”视图和行业详情的判断区，并写明方法、日期和输入。', 'The grid holds no judgment. Stage, valuation verdict and composite prosperity come from registered methods and appear only in the Stages view and the judgment area of a detail page, each with its method, date and inputs.')}</div>
<div class="row"><a href="{F('Cn-Stages')}" class="btn">{t('阶段视图', 'Stages view')}</a><a href="{F('Cn-Detail')}" class="btn pri">{t('行业详情 →', 'Industry detail →')}</a></div>
</section>
</div>
{foot()}
</main>'''
    doc('Cn-List', t('行业研究 申万 列表 网格', 'Industries SW list grid'), body, 1440, 2300,
        ctitle=t('中国行业 · 列表（网格 + 表格）· 管理员预览', 'CN industries · list (grid + table) · admin preview · EN'))

# ---------- STAGES ----------
STAGES = [('growth-mid', '成长中期', 'Mid growth', 6), ('growth-late', '成长后期', 'Late growth', 9), ('mature', '成熟期', 'Mature', 11), ('decline', '衰退期', 'Decline', 3)]
METHOD = 'industry_lifecycle_stage@v1'
ASOF = '2026-11-21'

def cagr(i, k): return ((i * 11 + k * 7) % 37) - 9 + ((i + k) % 10) / 10
def cbar(v):
    w = min(abs(v), 30) / 30 * 50
    st = f'left:50%;width:{w:.0f}%' if v >= 0 else f'left:{50 - w:.0f}%;width:{w:.0f}%'
    return f'<span class="cb" aria-hidden="true"><i{" class=\"neg\"" if v < 0 else ""} style="{st}"></i></span>'
def cagr_td(i, k):
    if (i, k) == (30, 0): return f'<td class="r"><span class="st miss">{t("缺失 · 历史不足", "Missing · not enough history")}</span></td>'
    v = cagr(i, k)
    return f'<td class="r"><a href="{F("Cn-Drawer")}" class="src">{sgn(v)}</a> {cbar(v)}</td>'
def roe_td(i):
    if i == 31: return f'<td class="r"><span class="st miss">{t("缺失 · 供应商未提供", "Missing · not provided by vendor")}</span></td>'
    return f'<td class="r"><a href="{F("Cn-Drawer")}" class="src">{4 + (i * 5) % 17 + (i % 10) / 10:.1f}%</a></td>'

def stage_rows(ids, since=True):
    out = ''
    for i in ids:
        n, c, m = ind(i)
        s = f'<td><span class="tag judg">{t("自", "since")} FY{2019 + i % 6} {t("年报", "report")}</span></td>' if since else ''
        out += f'<tr><td><a href="{F("Cn-Detail")}" style="color:#fafafa"><span class="m fog">{c}</span> {n}</a></td>{cagr_td(i, 0)}{cagr_td(i, 1)}{cagr_td(i, 2)}{roe_td(i)}{s}<td><a href="{F("Cn-Detail")}" style="color:#ca8a04">{t("详情", "Detail")} →</a></td></tr>\n'
    return out

def stage_thead(since=True, sort=False):
    a = ' ↕' if sort else ''
    s = f'<th>{t("进入该阶段（判断）", "In stage since (judgment)")}</th>' if since else ''
    return f'<thead><tr><th>{t("行业", "Industry")}{a}</th><th class="r">{t("营收 CAGR", "Revenue CAGR")} 2016→19{a}</th><th class="r">2019→22{a}</th><th class="r">2022→25{a}</th><th class="r">ROE FY2025{a}</th>{s}<th></th></tr></thead>'

def stage_header(view_sub):
    return f'''<div class="ph">
<div class="col" style="gap:2px">
<h1 class="h1">{h('行业研究 · 阶段', 'Industry research · stages')}</h1>
<span class="sub">{view_sub}</span>
</div>
<span class="sp"></span>{scheme_seg()}{fresh()}{legend()}
</div>'''

def stages_page():
    strip = f'''<span class="chip" style="border-style:dashed">{t('导入期', 'Introduction')} {M('0')} · {t('一级行业不适用', 'not applicable at level 1')}</span><span class="chip" style="border-style:dashed">{t('成长初期', 'Early growth')} {M('0')} · {t('一级行业不适用', 'not applicable at level 1')}</span>'''
    for sid, z, e, n in STAGES:
        strip += f'<a href="#stage-{sid}" class="chip on" style="min-height:32px">{t(z, e)} {M(n)}</a>'
    strip += f'<a href="#stage-abstained" class="chip" style="min-height:32px">{t("未归类", "Abstained")} {M(2)}</a>'
    groups, start = '', 1
    for sid, z, e, n in STAGES:
        ids = list(range(start, start + n)); start += n
        groups += f'''<section id="stage-{sid}" class="col" style="gap:8px" aria-labelledby="sg-{sid}">
<div class="card judg">
<div class="row">{tag_judg()}<h2 id="sg-{sid}" class="h2" style="font-size:16px">{h(z, e)}</h2><span class="chip">{M(n)} {t('个行业', 'industries')}</span><span class="chip">{t('方法', 'Method')} {M(METHOD)}</span><span class="chip">{t('判断截至', 'As of')} {M(ASOF)}</span><span class="chip">{t('待结算', 'Open')}</span><span class="sp"></span><span class="tiny m">#stage-{sid}</span><a href="#method" class="btn">{t('方法文档', 'Method document')}</a><a href="#history" class="btn">{t('历史', 'History')}</a></div>
<dl class="kv"><dt>{t('规则', 'Rule')}</dt><dd>[{t('方法文档里的规则句：只用三段 3 年营收复合增速和 ROE 的数值阈值，不含宏观调整；阈值待方法规格确定', 'rule sentence from the method document: numeric thresholds on the three 3-year revenue CAGRs and ROE only, no macro override; thresholds pending the method spec')}]</dd><dt>{t('证伪条件', 'Falsified if')}</dt><dd>[{t('下一个年报周期后，若输入落到本组阈值之外，则该行业的本条判断被证伪并结算', 'after the next annual-report cycle, an industry whose inputs fall outside this group’s thresholds has this judgment falsified and settled')}]</dd><dt>{t('输入', 'Inputs')}</dt><dd>{t('下表四列（事实，可点开来源）；输入快照', 'the four columns below (facts, each opens its source); input snapshot')} {M('[snapshot_id]')}</dd></dl>
</div>
<div class="card">
<div class="row">{tag_fact()}{org_v()}{derived('cagr_3y/1')}<span class="tiny">{t('复合增速与 ROE 是事实；只有“进入该阶段”一列和上面的分组标题是判断。', 'CAGRs and ROE are facts; only the "in stage since" column and the group title above are judgments.')}</span></div>
<div class="tw"><table class="t">{stage_thead()}<tbody>
{stage_rows(ids)}</tbody></table></div>
</div>
</section>
'''
    body = f'''{top()}
<main class="wrap">
{stage_header(t(f'申万一级 · 31 个行业。分组是判断：方法 {METHOD} · 判断截至 {ASOF} · 草稿，尚不可发布。', f'SW level 1 · 31 industries. The grouping is a judgment: method {METHOD} · as of {ASOF} · draft, not yet publishable.'))}
{adm('恒生聚源 · 衍生指标', 'Gildata · derived figures', t(' 另外，本方法已登记但尚不可发布（回测未完成），所以分组本身也只有管理员可见。', ' In addition this method is registered but not yet publishable (back-test not finished), so the grouping itself is admin-only too.'))}
{controls(view='stages')}
<section class="card judg" aria-labelledby="st-strip">
<div class="row">{tag_judg()}<h2 id="st-strip" class="h2">{h('阶段分布', 'Stage distribution')}</h2><span class="chip">{t('方法', 'Method')} {M(METHOD)}</span><span class="chip">{t('判断截至', 'As of')} {M(ASOF)}</span><span class="sp"></span><a href="#method" class="btn">{t('方法文档', 'Method document')}</a></div>
<nav class="row" aria-label="{t('阶段锚点', 'Stage anchors')}">{strip}</nav>
<div class="tw"><table class="t"><thead><tr><th>{t('阶段', 'Stage')}</th><th class="r">{t('行业数', 'Industries')}</th><th>{t('说明', 'Note')}</th></tr></thead><tbody>
<tr class="off"><td>{t('导入期', 'Introduction')}</td><td class="m r">0</td><td>{t('一级行业不适用', 'not applicable at level 1')}</td></tr>
<tr class="off"><td>{t('成长初期', 'Early growth')}</td><td class="m r">0</td><td>{t('一级行业不适用', 'not applicable at level 1')}</td></tr>
<tr><td>{t('成长中期', 'Mid growth')}</td><td class="m r">6</td><td class="m">#stage-growth-mid</td></tr>
<tr><td>{t('成长后期', 'Late growth')}</td><td class="m r">9</td><td class="m">#stage-growth-late</td></tr>
<tr><td>{t('成熟期', 'Mature')}</td><td class="m r">11</td><td class="m">#stage-mature</td></tr>
<tr><td>{t('衰退期', 'Decline')}</td><td class="m r">3</td><td class="m">#stage-decline</td></tr>
<tr><td>{t('未归类', 'Abstained')}</td><td class="m r">2</td><td>{t('方法无法归类，见页底', 'the method could not classify, see the end of the page')}</td></tr>
</tbody></table></div>
<span class="tiny">{t('芯片即锚点；下面的表是它的无色等价物。两个最早阶段没有一级行业，写明“不适用”，不做成死链。', 'Each chip is an anchor; the table below is its colour-free equivalent. The two earliest stages hold no level-1 industry and say so instead of being dead links.')}</span>
</section>
{groups}
<section id="stage-abstained" class="col" style="gap:8px" aria-labelledby="sg-abs">
<div class="card judg"><div class="row">{tag_judg()}<h2 id="sg-abs" class="h2" style="font-size:16px">{h('未归类', 'Abstained')}</h2><span class="chip">{M(2)} {t('个行业', 'industries')}</span><span class="chip">{t('方法', 'Method')} {M(METHOD)}</span><span class="chip">{t('判断截至', 'As of')} {M(ASOF)}</span><span class="chip">{t('弃权', 'Abstained')}</span></div>
<span class="sub">{t('方法在输入不全时弃权，不猜。每行写明缺了什么。', 'The method abstains when inputs are incomplete; it does not guess. Each row says what is missing.')}</span></div>
<div class="card"><div class="row">{tag_fact()}{org_v()}{derived('cagr_3y/1')}</div>
<div class="tw"><table class="t">{stage_thead(since=False)}<tbody>
{stage_rows([30, 31], since=False)}</tbody></table></div>
<span class="tiny">{t('行业 30：2016→19 缺少端点，历史不足。行业 31：ROE 供应商未提供。', 'Industry 30: an end point for 2016→19 is missing. Industry 31: ROE not provided by the vendor.')}</span></div>
</section>
{foot()}
</main>'''
    doc('Cn-Stages', t('行业研究 申万 阶段视图', 'Industries SW stages view'), body, 1440, 2900,
        ctitle=t('中国行业 · 阶段视图（方法已登记，管理员预览）', 'CN industries · stages view (method registered, admin preview) · EN'))

def stages_nomethod_page():
    body = f'''{top()}
<main class="wrap">
{stage_header(t('申万一级 · 31 个行业。尚无已发布的阶段方法：只列事实，不分组。', 'SW level 1 · 31 industries. No stage method is published: facts only, no grouping.'))}
{adm('恒生聚源 · 衍生指标', 'Gildata · derived figures')}
{controls(view='stages')}
<div class="note"><span class="row"><span class="st">{t('无判断', 'No judgment')}</span><b>{t('尚未发布阶段判断方法', 'No stage method published')}</b></span>
<span style="display:block;margin-top:4px">{t('行业阶段是本站的判断，不是数据商字段。方法登记并通过回测之前，这里不分组、不贴阶段标签，只给三段营收复合增速和 ROE，可按任一列排序。', 'An industry’s stage is our own judgment, not a vendor field. Until a method is registered and back-tested this page does not group or label industries; it lists the three revenue CAGRs and ROE, sortable by any column.')}</span></div>
<section class="card" aria-labelledby="nm-t">
<div class="row"><h2 id="nm-t" class="h2">{h('三段营收复合增速与 ROE', 'Three revenue CAGRs and ROE')}</h2>{tag_fact()}{org_v()}{derived('cagr_3y/1')}<span class="sp"></span><span class="tiny">{t('节选 10 行；完整为 31 行', 'Excerpt of 10 rows; 31 in full')}</span></div>
<div class="tw"><table class="t">{stage_thead(since=False, sort=True)}<tbody>
{stage_rows(list(range(1, 9)) + [30, 31], since=False)}</tbody></table></div>
<span class="tiny">{t('迷你条以 0 为中线：铜色向右 = 正，灰色加框向左 = 负；数值始终印出。', 'Mini bars are centred on 0: brass to the right = positive, framed grey to the left = negative; the value is always printed.')}</span>
</section>
{foot()}
</main>'''
    doc('Cn-StagesNoMethod', t('行业研究 申万 阶段 无方法', 'Industries SW stages no method'), body, 1440, 1150,
        ctitle=t('中国行业 · 阶段视图（尚无已发布方法）', 'CN industries · stages view (no method published) · EN'))

# ---------- DETAIL ----------
def kvrow(k, v): return f'<dt>{k}</dt><dd>{v}</dd>'

def judg_card(title, label, method, status, cond, extra=''):
    return f'''<div class="card in judg"><div class="row">{tag_judg()}<span class="cap">{title}</span><span class="sp"></span><span class="chip">{status}</span></div>
<span style="font-size:17px;font-weight:600">{label}</span>{extra}
<dl class="kv" style="grid-template-columns:96px minmax(0,1fr)">{kvrow(t('方法', 'Method'), M(method))}{kvrow(t('判断截至', 'As of'), M(ASOF))}{kvrow(t('证伪条件', 'Falsified if'), cond)}{kvrow(t('输入', 'Inputs'), f'<a href="{F("Cn-Drawer")}" style="color:#ca8a04">{t("输入快照与各输入的来源", "input snapshot and each input’s source")} ▸</a>')}</dl>
<div class="row"><a href="#method" class="btn">{t('方法文档', 'Method document')}</a><a href="#history" class="btn">{t('历史', 'History')}</a></div></div>'''

def prosperity_rows(mobile=False):
    dims = [('营收增速', 'Revenue growth', '+12.3%', 72, 'FY2016–FY2025', None), ('ROE', 'ROE', '9.5%', 41, 'FY2016–FY2025', None),
            ('毛利率', 'Gross margin', '24.0%', 58, 'FY2016–FY2025', None),
            ('经营现金流 / 营收', 'Operating cash flow / revenue', None, None, None, (t('缺失 · 供应商未提供', 'Missing · not provided by vendor'))),
            ('估值（PB 分位）', 'Valuation (PB percentile)', None, None, None, (t('缺失 · 历史不足', 'Missing · not enough history')))]
    out = ''
    for z, e, v, p, w, miss in dims:
        if miss:
            bar = '<span class="pb na" aria-hidden="true"></span>'
            vv, pp, ww = f'<span class="st miss">{miss}</span>', '<span class="fog">—</span>', '<span class="fog">—</span>'
        else:
            bar = f'<span class="pb" aria-hidden="true"><i style="width:{p}%"></i><b style="left:{p}%"></b></span>'
            vv, pp, ww = f'<a href="{F("Cn-Drawer")}" class="src">{v}</a>', f'<a href="{F("Cn-Drawer")}" class="src">P{p}</a>', M(w)
        if mobile:
            out += f'<div class="mcard"><span class="row"><span>{t(z, e)}</span><span class="sp"></span>{vv}</span>{bar}<span class="row tiny">{t("分位", "Percentile")} {pp}<span class="sp"></span>{ww}</span></div>'
        else:
            out += f'<div class="prow"><span>{t(z, e)}</span><span style="text-align:right">{vv}</span>{bar}<span style="text-align:right">{pp}</span><span class="tiny">{ww}</span></div>'
    return out

def series_svg():
    return f'''<svg role="img" aria-label="{t('营收同比年度序列折线；FY2020 缺失处断开；数值见旁边的表格', 'Revenue YoY annual series; broken at FY2020 where the value is missing; values are in the table beside it')}" viewBox="0 0 600 220" style="width:100%;height:220px">
<line x1="40" y1="20" x2="40" y2="190" stroke="rgba(255,255,255,.12)"></line><line x1="40" y1="130" x2="590" y2="130" stroke="rgba(255,255,255,.3)" stroke-dasharray="2 3"></line>
<polyline fill="none" stroke="#fafafa" stroke-width="2" points="70,96 136,80 202,112"></polyline>
<polyline fill="none" stroke="#fafafa" stroke-width="2" points="334,52 400,150 466,124 532,84"></polyline>
<g fill="#0a0a0b" stroke="#ca8a04" stroke-width="2"><circle cx="70" cy="96" r="4"></circle><circle cx="136" cy="80" r="4"></circle><circle cx="202" cy="112" r="4"></circle><circle cx="334" cy="52" r="4"></circle><circle cx="400" cy="150" r="4"></circle><circle cx="532" cy="84" r="4"></circle></g>
<rect x="461" y="119" width="10" height="10" fill="#0a0a0b" stroke="#eab308" stroke-width="2"></rect>
<line x1="268" y1="20" x2="268" y2="190" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"></line>
<g font-size="10" fill="#a1a1aa" font-family="Geist Mono"><text x="54" y="206">FY2017</text><text x="186" y="206">FY2019</text><text x="318" y="206">FY2021</text><text x="450" y="206">FY2023</text><text x="516" y="206">FY2024</text><text x="18" y="134">0</text><text x="6" y="60">+20%</text><text x="6" y="176">−10%</text></g>
<text x="268" y="110" text-anchor="middle" font-size="11" fill="#8b8b94">{t('缺失', 'Missing')}</text>
</svg>'''

def series_table():
    rows = [('FY2024', '+12.3%', None), ('FY2023', '+1.5%', 'rev'), ('FY2022', '−4.5%', None), ('FY2021', '+20.0%', None), ('FY2020', None, 'miss'), ('FY2019', '+4.5%', None), ('FY2018', '+12.5%', None), ('FY2017', '+8.5%', None)]
    out = ''
    for p, v, s in rows:
        if s == 'miss': vv = f'<span class="st miss">{t("缺失 · 供应商未提供", "Missing · not provided by vendor")}</span>'
        else: vv = f'<a href="{F("Cn-Drawer")}" class="src">{v}</a>' + (f' <span class="st rev">{t("已修订", "Revised")}</span>' if s == 'rev' else '')
        mem = t('成分 118 → 121，口径有变', 'members 118 → 121, set changed') if p == 'FY2022' else '—'
        out += f'<tr><td class="m">{p}</td><td class="r">{vv}</td><td class="tiny">{mem}</td><td class="m">{t("运行激活时刻", "run activation")}</td></tr>'
    return out

def detail_page():
    n, c, m = ind(5)
    lv = [(t('营收', 'Revenue'), f'[{t("值", "value")}] {t("亿元", "CNY 100m")}', 'FY2025', False), (t('营收同比', 'Revenue YoY'), '+12.3%', 'FY2025', False),
          (t('归母净利', 'Parent net profit'), f'[{t("值", "value")}] {t("亿元", "CNY 100m")}', 'FY2025', True), (t('归母净利同比', 'Parent net profit YoY'), '−4.5%', 'FY2025', False),
          (t('毛利率', 'Gross margin'), '24.0%', 'FY2025', False), ('ROE', '9.5%', 'FY2025', False), (t('成分数', 'Members'), '121', '2026-11-10', False)]
    lvh = ''
    for k, v, p, rev in lv:
        r = f'<span class="st rev">{t("已修订 · 原值见抽屉", "Revised · previous value in the drawer")}</span>' if rev else ''
        lvh += f'<div class="card in"><span class="cap">{k} · {p}</span><a href="{F("Cn-Drawer")}" class="src" style="font-size:20px;align-self:flex-start">{v}</a><span class="tiny">{t("覆盖", "Coverage")} {M("0.97")}</span>{r}</div>'
    def vrow(k, cur, p, nn, miss=None):
        if miss:
            return f'<div class="prow"><span>{k}</span><span style="text-align:right"><span class="st miss">{t("缺失", "Missing")}</span></span><span class="pb na" aria-hidden="true"></span><span class="fog" style="text-align:right">—</span><span class="tiny">{miss}</span></div>'
        return f'<div class="prow"><span>{k}</span><span style="text-align:right"><a href="{F("Cn-Drawer")}" class="src">{cur}</a></span><span class="pb" aria-hidden="true"><i style="width:{p}%"></i><b style="left:{p}%"></b></span><span style="text-align:right"><a href="{F("Cn-Drawer")}" class="src">P{p}</a></span><span class="tiny">n = {M(nn)} {t("个月末", "month-ends")}</span></div>'
    cons = ''
    for k in range(1, 6):
        cons += f'<tr><td>{t("公司", "Company")} {k:02d}</td><td class="m"><a href="Company.dc.html" style="color:#ca8a04">0000{k:02d}.SZ</a></td><td class="m">2026-11-10</td><td><span class="st miss">{t("供应商未提供", "not provided by vendor")}</span></td></tr>'
    body = f'''{top()}
<main class="wrap">
<div class="ph">
<div class="col" style="gap:2px">
<span class="tiny"><a href="{F('Cn-List')}">{t('行业研究', 'Industry research')}</a> / {t('申万 2021 · 一级', 'SW 2021 · level 1')} / {c}</span>
<h1 class="h1"><span class="m fog" style="font-size:16px">{c}</span> {n}{'' if LANG == 'en' else ' <span class="en">Industry 05</span>'}</h1>
<span class="sub">{t('申万 2021 一级行业。中文名来自分类来源；英文名取自仓库里人工审过的对照表，不做运行时机器翻译。', 'A Shenwan 2021 level-1 industry. The Chinese name comes from the classification source; the English name comes from a reviewed table in the repository, not machine translation at run time.')}</span>
</div>
<span class="sp"></span>{fresh()}<span class="st recon">{t('重建口径', 'Reconstructed')}</span>{legend()}
<div class="row" style="flex-basis:100%"><a href="{F('Cn-Constituents')}" class="btn">{t('成分', 'Constituents')} {M(121)}</a><a href="#replay" class="btn">{t('怎样重放一个数字', 'How to replay a number')}</a></div>
</div>
{adm('恒生聚源 · 行业财务 / 估值 / 衍生指标', 'Gildata · industry financials / valuation / derived figures')}

<section class="card" aria-labelledby="d-lv">
<div class="row"><h2 id="d-lv" class="h2">{h('最新值', 'Latest values')}</h2>{tag_fact()}{org_v()}<span class="tiny">{t('每个数字点开来源抽屉；同比为本站由供应商累计值推算。', 'Each number opens its source; YoY is derived by us from the vendor’s cumulative figures.')}</span></div>
<div class="g4">{lvh}</div>
</section>

<section class="card" aria-labelledby="d-series">
<div class="row"><h2 id="d-series" class="h2">{h('序列', 'Series')}</h2>{tag_fact()}{org_v()}{derived('yoy/1')}
<div class="seg" role="group" aria-label="{t('指标', 'Metric')}"><a href="#m" class="on" aria-current="true">{t('营收同比', 'Revenue YoY')}</a><a href="#m">{t('归母净利同比', 'Parent net profit YoY')}</a><a href="#m">{t('毛利率', 'Gross margin')}</a><a href="#m">ROE</a></div>
<span class="sp"></span>
<div class="seg" role="group" aria-label="{t('口径', 'Basis')}"><a href="#b" class="on" aria-current="true">{t('年度', 'Annual')}</a><a href="#b">{t('单季', 'Single quarter')}</a></div>
<div class="seg" role="group" aria-label="{t('显示', 'Display')}"><button type="button" class="on" aria-pressed="true">{t('图 + 表', 'Chart + table')}</button><button type="button" aria-pressed="false">{t('只看表', 'Table only')}</button></div></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">
<figure style="margin:0">{series_svg()}
<figcaption class="tiny">{t('断开处是缺失，不插值。方形点 = 已修订。虚线是 0。折线不着红绿。', 'A break is a missing value; nothing is interpolated. Square point = revised. Dashed line = 0. The line is never red or green.')}</figcaption></figure>
<div class="tw"><table class="t"><thead><tr><th>{t('期间', 'Period')}</th><th class="r">{t('值', 'Value')}</th><th>{t('成分口径', 'Member set')}</th><th>{t('可得时刻', 'Available at')}</th></tr></thead><tbody>{series_table()}</tbody></table></div>
</div>
<span class="tiny">{t('单季值由相邻累计值相减得到；相减的两期成分数不同时，该点标“成分口径有变”。', 'A single-quarter value is the difference of consecutive cumulative values; when the two periods have different member counts the point is marked "member set changed".')}</span>
</section>

<section class="card" aria-labelledby="d-val">
<div class="row"><h2 id="d-val" class="h2">{h('估值与分位', 'Valuation and percentiles')}</h2>{tag_fact()}{org_v()}{derived('pctile_own_history/1')}<span class="sp"></span>
<div class="seg" role="group" aria-label="{t('窗口', 'Window')}"><a href="#w">{t('5 年', '5y')}</a><a href="#w" class="on" aria-current="true">{t('10 年', '10y')}</a><a href="#w">{t('全部', 'All')}</a></div></div>
<div class="prow cap" style="border-bottom-color:rgba(255,255,255,.12)"><span>{t('倍数', 'Multiple')}</span><span style="text-align:right">{t('当前', 'Current')}</span><span>{t('在自身历史中的位置（0–100）', 'Position in own history (0–100)')}</span><span style="text-align:right">{t('分位', 'Percentile')}</span><span>{t('样本', 'Samples')}</span></div>
{vrow('PE (TTM)', None, None, None, t('负值无意义：分母无效', 'negative, so not meaningful: invalid denominator'))}
{vrow('PB (LF)', '1.8×', 34, 118)}
{vrow('PS (TTM)', '2.5×', 61, 118)}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">
<figure style="margin:0"><svg role="img" aria-label="{t('PB 月末序列小图，数值见旁边的表格', 'Small PB month-end series; values are in the table beside it')}" viewBox="0 0 600 110" style="width:100%;height:110px"><polyline fill="none" stroke="#fafafa" stroke-width="1.5" points="10,70 90,58 170,64 250,40 330,52 410,76 490,66 590,60"></polyline><line x1="10" y1="100" x2="590" y2="100" stroke="rgba(255,255,255,.12)"></line></svg><figcaption class="tiny">PB (LF) · {t('月末', 'month-end')} · 2016-01 → 2026-10</figcaption></figure>
<div class="tw"><table class="t"><thead><tr><th>{t('月末', 'Month-end')}</th><th class="r">PB</th><th class="r">{t('本站分位', 'Our percentile')}</th><th class="r">{t('供应商分位', 'Vendor percentile')}</th></tr></thead><tbody>
<tr><td class="m">2026-10</td><td class="r"><a href="{F('Cn-Drawer')}" class="src">1.8×</a></td><td class="r"><a href="{F('Cn-Drawer')}" class="src">P34</a></td><td class="r"><a href="{F('Cn-Drawer')}" class="src">P36</a></td></tr>
<tr><td class="m">2026-09</td><td class="r"><a href="{F('Cn-Drawer')}" class="src">1.7×</a></td><td class="r"><a href="{F('Cn-Drawer')}" class="src">P30</a></td><td class="r"><a href="{F('Cn-Drawer')}" class="src">P31</a></td></tr>
<tr><td class="m">2026-08</td><td class="r"><a href="{F('Cn-Drawer')}" class="src">1.9×</a></td><td class="r"><a href="{F('Cn-Drawer')}" class="src">P40</a></td><td class="r"><span class="st miss">{t('缺失 · 供应商未提供', 'Missing · not provided by vendor')}</span></td></tr>
</tbody></table></div></div>
<span class="tiny">{t('样本不足 36 个月末时不算分位，写“缺失 · 历史不足”。估值未服务时本节保留并写明状态，不整节隐藏。', 'With fewer than 36 month-end samples no percentile is computed and the row reads "Missing · not enough history". When valuation is not served the section stays and states so; it is not removed.')}</span>
</section>

<section class="card" aria-labelledby="d-pros">
<div class="row"><h2 id="d-pros" class="h2">{h('景气分项', 'Prosperity dimensions')}</h2>{tag_fact()}{org_v()}{derived('pctile_own_history/1')}<span class="sp"></span><div class="seg" role="group" aria-label="{t('显示', 'Display')}"><button type="button" class="on" aria-pressed="true">{t('条形', 'Bars')}</button><button type="button" aria-pressed="false">{t('表格', 'Table')}</button></div></div>
<div class="prow cap" style="border-bottom-color:rgba(255,255,255,.12)"><span>{t('分项', 'Dimension')}</span><span style="text-align:right">{t('最新值', 'Latest')}</span><span>{t('在自身历史中的位置（0–100）', 'Position in own history (0–100)')}</span><span style="text-align:right">{t('分位', 'Percentile')}</span><span>{t('窗口', 'Window')}</span></div>
{prosperity_rows()}
<span class="tiny">{t('五个分项各自是事实。缺失的分项画成虚线空条并写原因，不用别的指标顶替。综合景气是判断，在下面的判断区。', 'Each of the five dimensions is a fact. A missing dimension is drawn as an empty dashed bar with its reason; no other metric stands in for it. The composite is a judgment and sits in the judgment area below.')}</span>
</section>

<section class="card judg" aria-labelledby="d-j">
<div class="row">{tag_judg()}<h2 id="d-j" class="h2">{h('判断', 'Judgments')}</h2><span class="tiny">{t('以下不是数据商字段，是本站登记的方法给出的判断；每张卡写明方法、日期、输入和证伪条件。', 'These are not vendor fields; they are judgments from methods we register. Each card states its method, date, inputs and what would falsify it.')}</span></div>
<div class="g3">
{judg_card(t('生命周期阶段', 'Lifecycle stage'), t('成长后期', 'Late growth'), METHOD, t('待结算', 'Open'), f'[{t("方法文档中的条件句", "condition sentence from the method document")}]', f'<span class="tiny">{t("自 FY2023 年报起", "since the FY2023 report")}</span>')}
{judg_card(t('估值结论', 'Valuation verdict'), f'[{t("有序标签，例如：相对自身历史偏低", "ordered label, e.g. low against own history")}]', 'valuation_verdict@v1', t('待结算', 'Open'), f'[{t("条件句", "condition sentence")}]')}
{judg_card(t('综合景气', 'Composite prosperity'), t('上三分之一', 'Upper third'), 'industry_prosperity@v1', t('待结算 · 未校准', 'Open · not calibrated'), f'[{t("条件句", "condition sentence")}]', f'<span class="tiny">{t("未校准：只显示有序标签，不显示分数或百分比。", "Not calibrated: an ordered label only, no score and no percent.")}</span>')}
</div>
<div class="card in" style="border-style:dotted;border-color:rgba(255,255,255,.3)">
<div class="row">{tag_judg()}<span class="cap">{t('供应商判断 · 恒生聚源', 'Vendor judgment · Gildata')}</span><span class="sp"></span><span class="tiny">{t('不是本站的方法，不由本站结算或校准，不并入上面的卡片', 'not our method, not settled or calibrated by us, never merged into the cards above')}</span></div>
<div class="row"><span>{t('行业景气度', 'Industry prosperity index')}</span><a href="{F('Cn-Drawer')}" class="src">62.0</a><span class="tiny">{t('排名', 'rank')}</span><a href="{F('Cn-Drawer')}" class="src">9 / 31</a><span class="chip">{M('2026-10')}</span><span class="st miss">{t('定义：供应商未公布', 'Definition: not published by the vendor')}</span></div>
</div>
</section>

<section class="card" aria-labelledby="d-cons">
<div class="row"><h2 id="d-cons" class="h2">{h('成分预览', 'Constituents preview')}</h2>{tag_fact()}<span class="tiny">{M(121)} {t('家在册 · 快照', 'listed · snapshot')} {M('2026-11-10')}</span><span class="sp"></span><a href="{F('Cn-Constituents')}" class="btn">{t('全部成分', 'All constituents')}</a></div>
<div class="tw"><table class="t"><thead><tr><th>{t('公司', 'Company')}</th><th>{t('代码', 'Ticker')}</th><th>{t('首次观察日', 'First observed')}</th><th>{t('权重', 'Weight')}</th></tr></thead><tbody>{cons}</tbody></table></div>
<span class="tiny">{t('供应商不返回权重，所以不能按权重取前十；这里按代码顺序列前 5 家。', 'The vendor returns no weights, so a top ten by weight cannot be shown; the first 5 by ticker are listed.')}</span>
</section>
{foot()}
</main>'''
    doc('Cn-Detail', t('行业研究 申万 行业详情', 'Industries SW detail'), body, 1440, 2900,
        ctitle=t('中国行业 · 行业详情 · 管理员预览', 'CN industries · industry detail · admin preview · EN'))

# ---------- CONSTITUENTS ----------
def cons_page():
    n, c, m = ind(5)
    rows = ''
    for k in range(1, 11):
        tk = f'0000{k:02d}.SZ' if k % 3 else f'6000{k:02d}.SH'
        until = M('2026-11-17') if k == 4 else f'<span class="fog">{t("在册", "current")}</span>'
        av = f'<span class="st">{t("有证据", "Evidenced")}</span>' if k in (9, 10) else f'<span class="st miss">{t("假设", "Assumed")}</span>'
        since = M('2026-11-17') if k in (9, 10) else M('2026-11-03')
        rows += f'<tr{" class=\"off\"" if k == 4 else ""}><td>{t("公司", "Company")} {k:02d}</td><td class="m"><a href="Company.dc.html" style="color:#ca8a04">{tk}</a></td><td>{since}</td><td>{until}</td><td><span class="st miss">{t("供应商未提供", "not provided by vendor")}</span></td><td><a href="{F("Cn-Drawer")}" style="color:#ca8a04">{t("恒生聚源 · 成分快照", "Gildata · member snapshot")} ▸</a></td><td>{av}</td></tr>\n'
    body = f'''{top()}
<main class="wrap">
<div class="ph">
<div class="col" style="gap:2px">
<span class="tiny"><a href="{F('Cn-List')}">{t('行业研究', 'Industry research')}</a> / {t('申万 2021 · 一级', 'SW 2021 · level 1')} / <a href="{F('Cn-Detail')}">{c} {n}</a> / {t('成分', 'Constituents')}</span>
<h1 class="h1">{n} · {h('成分', 'Constituents')}</h1>
<span class="sub">{t('成分归属是事实，但历史只从首次观察日起。', 'Membership is a fact, but its history only starts at the first observation.')}</span>
</div>
<span class="sp"></span>
<label class="field">{t('截至日期', 'As on')}<input class="inp m" type="date" value="2026-11-10" min="2026-11-03"></label>
<span class="chip warn"><span class="dot w"></span>{t('成分', 'Membership')} {M('2026-11-10')} · {t('过期', 'stale')}</span>{tag_fact()}
</div>
{adm('申万 2021 分类与成分', 'SW 2021 classification and membership')}
<div class="note warn"><span class="row"><span class="st miss">{t('仅当前', 'Current only')}</span><b>{t('历史从 2026-11-03 起；此前没有成分历史', 'History starts on 2026-11-03; there is no membership history before it')}</b></span>
<span style="display:block;margin-top:4px">{t('供应商只返回当前成分，不返回纳入和剔除日期。纳入日按首次观察日假设；连续两次快照都不在名单里才记为剔除。日期选择器不能选到 2026-11-03 之前。', 'The vendor returns the current list only, with no entry or exit dates. Entry is assumed at the first observation; an exit is recorded after a stock is absent from two consecutive snapshots. The date picker cannot go before 2026-11-03.')}</span></div>
<div class="adm"><span class="row"><span class="st recon">{t('仅管理员', 'Admins only')}</span><b>{t('对账：与另一来源有 3 家不一致', 'Reconciliation: 3 companies differ from the second source')}</b></span><span style="display:block;margin-top:4px">{t('本次运行以恒生聚源为准；Tushare 申万成分只用于对账。不一致的公司见对账报告，不影响本页显示。', 'This run takes Gildata as authoritative; the Tushare Shenwan membership is used for reconciliation only. The differing companies are in the reconciliation report and do not change this page.')} <a href="#recon" style="color:#ca8a04">{t('对账报告', 'Reconciliation report')} ▸</a></span></div>
<section class="card" aria-labelledby="c-t">
<div class="row"><h2 id="c-t" class="h2">{h('成分', 'Constituents')}</h2><span class="tiny">{M(121)} {t('家在册', 'listed')} · {t('第 1–10 行', 'rows 1–10')}</span><span class="sp"></span><a href="#prev" class="btn dis" aria-disabled="true">{t('上一页', 'Previous')}</a><span class="m tiny">1 / 13</span><a href="#next" class="btn">{t('下一页', 'Next')}</a></div>
<div class="tw"><table class="t"><thead><tr><th>{t('公司', 'Company')}</th><th>{t('代码', 'Ticker')}</th><th>{t('纳入自', 'Member since')}</th><th>{t('至', 'Member until')}</th><th>{t('权重', 'Weight')}</th><th>{t('来源', 'Source')}</th><th>{t('日期依据', 'Date basis')}</th></tr></thead><tbody>
{rows}</tbody></table></div>
<span class="tiny">{t('“假设” = 纳入日取首次观察日；“有证据” = 在两次快照之间确实观察到纳入。代码链接到公司页。', '"Assumed" = entry taken as the first observation date; "Evidenced" = the entry was actually seen between two snapshots. A ticker links to the company page.')}</span>
</section>
<div class="g2">
<div class="note"><b>{t('空态：该行业尚无成分', 'Empty: no constituents for this industry yet')}</b><br>{t('成分同步尚未完成首次运行。完成后这里列出成分；现在可以先看行业数值。', 'The membership sync has not completed its first run. Constituents will be listed here afterwards; the industry’s figures are available now.')}</div>
<div class="note"><span class="st held">{t('受限', 'Withheld')}</span> <b>{t('非管理员：成分名单暂不显示', 'Non-admins: the member list is not shown')}</b><br>{t('申万分类的展示条款确认前，不显示成分名单。可以改看 SIC 方案。', 'Until the display terms for the Shenwan classification are confirmed the member list is not shown. The SIC scheme is available.')}</div>
</div>
{foot()}
</main>'''
    doc('Cn-Constituents', t('行业研究 申万 成分', 'Industries SW constituents'), body, 1440, 1250,
        ctitle=t('中国行业 · 成分页（仅当前 + 对账提示）', 'CN industries · constituents (current-only + reconciliation note) · EN'))

# ---------- DRAWER ----------
def sec(nn, zh, en, inner): return f'<div class="sec"><span class="cap">{nn} · {t(zh, en)}{"" if LANG == "en" else " " + en}</span>{inner}</div>'

def drawer_body(variant='ok', mobile=False):
    kvs = ' style="grid-template-columns:96px minmax(0,1fr)"' if mobile else ''
    def kv(*rows): return f'<dl class="kv"{kvs}>' + ''.join(kvrow(k, v) for k, v in rows) + '</dl>'
    val_dd = {'ok': f'{M("+12.3%")}', 'revised': f'{M("+1.5%")} <span class="st rev">{t("已修订", "Revised")}</span>',
              'withheld': f'<span class="st held">{t("受限 · 不显示数值", "Withheld · no value shown")}</span>', 'retracted': f'<span class="st retr">{t("已撤回 · 不显示数值", "Retracted · no value shown")}</span>'}[variant]
    ident = sec(1, '身份', 'Identity', kv((t('行业', 'Industry'), f'{ind(5)[0]} · {M(ind(5)[1])}'), (t('指标', 'Metric'), t('营收同比', 'Revenue YoY')), (t('期间', 'Period'), M('FY2025')), (t('值', 'Value'), val_dd)))
    if variant == 'withheld':
        return ident + sec(5, '许可', 'Licence', kv((t('状态', 'Status'), t('内部 · 未获准对外展示', 'Internal · not licensed for display')), (t('说明', 'Note'), t('数据来自商业数据服务。展示条款确认前，数值不离开服务器；这里只有身份和原因。', 'The figure comes from a commercial data service. Until its display terms are confirmed the value never leaves the server; only identity and reason are shown here.')))) + sec(6, '链接', 'Links', f'<div class="row"><a href="IndustrySic.dc.html" class="btn">{t("改看 SIC 方案", "Switch to the SIC scheme")}</a></div>')
    src = sec(2, '来源', 'Source', kv((t('发布机构', 'Publisher'), t('恒生聚源 Gildata', 'Gildata (恒生聚源)')), (t('产品', 'Product'), t('数据地图', 'Datamap')), (t('接口', 'Interface'), M('FinQuery')),
        (t('数据集 / 字段', 'Dataset / field'), f'<span class="fog">{t("供应商未提供；改记查询模板", "not supplied by the vendor; the query template is recorded instead")}</span> {M("sw_l1_financials/1")}'),
        (t('行定位', 'Row locator'), M(t('[结果块 n · 第 n 行 · 列名原文]', '[result block n · row n · column header as returned]'))),
        (t('响应 SHA-256', 'Response SHA-256'), f'{M("[12 位]…[12 位]" if LANG == "zh" else "[12 hex]…[12 hex]")} <button type="button" class="btn" style="min-height:24px;padding:0 8px">{t("复制", "Copy")}</button>'),
        ('URL', f'<span class="fog">{t("无公开网址", "no public URL")}</span>')))
    times_rows = [(t('期间', 'Period'), M('FY2025')), (t('供应商数据截至', 'Vendor as-of'), f'<span class="st miss">{t("供应商未提供", "not provided by vendor")}</span>'), (t('取数时间', 'Fetched at'), M('2026-11-20T18:02:11+08:00')), (t('可得时间（激活）', 'Available at (activation)'), M(ACT))]
    times = kv(*times_rows)
    if variant == 'revised':
        times += f'''<table class="t"><thead><tr><th>{t('版本', 'Version')}</th><th class="r">{t('值', 'Value')}</th><th>{t('可得', 'Available')}</th></tr></thead><tbody><tr><td>{t('第 3 代 · 现行', 'Generation 3 · current')}</td><td class="m r">+1.5%</td><td class="m">2026-11-21</td></tr><tr class="off"><td>{t('第 2 代 · 已被取代', 'Generation 2 · superseded')}</td><td class="m r">+2.5%</td><td class="m">2026-11-14</td></tr></tbody></table>'''
    if variant == 'retracted':
        times += f'<div class="note err"><b>{t("运行已撤回", "Run withdrawn")}</b><br>{t("管理员于 [日期] 撤回了这次运行（原因类别：[类别]）。数值不再显示，存档的原始响应仍在。", "An admin withdrew this run on [date] (reason class: [class]). The value is no longer shown; the archived raw response is kept.")}</div>'
    tm = sec(3, '时间', 'Times', times)
    tr = sec(4, '变换', 'Transform', kv((t('解析器', 'Parser'), M('gildata-fin/1')), (t('映射版本', 'Mapping version'), M('sw2021-gildata-codes/1')), (t('方法', 'Method'), M('vendor-reported/1') + ' → ' + M('yoy/1')), (t('代码版本', 'Code version'), M('[git sha]')), (t('聚合方法', 'Aggregation method'), f'<span class="st miss">{t("供应商未公布", "not published by the vendor")}</span>')))
    lic = sec(5, '许可', 'Licence', kv((t('状态', 'Status'), t('内部（仅管理员）', 'Internal (admins only)')), (t('署名', 'Attribution'), f'[{t("合同要求的措辞", "wording required by the contract")}]'), (t('说明', 'Note'), t('个人账户条款不允许向第三方提供数据。', 'The personal-account terms do not allow giving data to third parties.'))))
    links = sec(6, '链接', 'Links', f'''<div class="row"><a href="#replay" class="btn pri">{t('重放（原始响应）', 'Replay (original response)')}</a><a href="#run" class="btn">{t('本次运行', 'This run')}</a><a href="{F('Cn-Constituents')}" class="btn">{t('当日成分', 'Constituents on that date')}</a></div>
<div class="slot">{t('本站计算的对应值：尚无（第二期）。有了以后在这里并列显示两值与差额。', 'Our computed counterpart: none yet (release 2). When it exists both values and their difference are shown here.')}</div>
<span class="tiny">{t('重放只读存档的原始响应并重新解析，不再调用供应商。', 'Replay re-parses the archived raw response; it never calls the vendor again.')}</span>''')
    return ident + src + tm + tr + lic + links

def drawer_head(kind_zh, kind_en, title, tags):
    return f'''<div style="padding:14px 16px" class="row"><div class="col" style="gap:2px;min-width:0"><span class="cap">{t('来源', 'Source')} · {t(kind_zh, kind_en)}</span><h2 class="h2" style="font-size:16px">{title}</h2><span class="row" style="gap:6px">{tags}</span></div><span class="sp"></span><button type="button" class="ibtn" aria-label="{t('关闭抽屉', 'Close drawer')}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>'''

def drawer_page():
    n = ind(5)[0]
    def dr(variant, label):
        return f'''<aside class="drw" aria-label="{label}" style="border:1px solid rgba(255,255,255,.06);border-radius:6px;align-self:start">
{drawer_head('供应商观测 vendor_observation', 'vendor observation', f'{n} · {t("营收同比", "Revenue YoY")} {M("FY2025")}', tag_fact() + org_v() + f'<span class="chip">{label}</span>')}
{drawer_body(variant)}</aside>'''
    kv = lambda *rows: '<dl class="kv">' + ''.join(kvrow(k, v) for k, v in rows) + '</dl>'
    derived_d = f'''<aside class="drw" aria-label="{t('衍生统计抽屉', 'Derived statistic drawer')}" style="border:1px solid rgba(255,255,255,.06);border-radius:6px;align-self:start">
{drawer_head('衍生统计 derived', 'derived statistic', f'{n} · {t("营收 3 年复合增速", "Revenue 3-year CAGR")} {M("2022→25")}', tag_fact() + org_v() + derived('cagr_3y/1'))}
{sec(1, '身份', 'Identity', kv((t('值', 'Value'), M('+8.5%')), (t('窗口', 'Window'), M('FY2022 → FY2025')), (t('样本数', 'Samples'), M('n = 2') + ' ' + t('个端点', 'end points'))))}
{sec(4, '变换', 'Transform', kv((t('公式', 'Formula'), M('(V_end ÷ V_start)^(1/3) − 1')), (t('公式版本', 'Formula version'), M('cagr_3y/1')), (t('规则', 'Rule'), t('两个端点都有值才计算；否则写“缺失 · 历史不足”。', 'Computed only when both end points have values; otherwise "Missing · not enough history".'))))}
{sec(6, '输入', 'Inputs', f"""<table class="t"><thead><tr><th>{t('输入观测', 'Input observation')}</th><th class="r">{t('值', 'Value')}</th><th></th></tr></thead><tbody>
<tr><td>{t('营收（累计）', 'Revenue (cumulative)')} {M('FY2022')}</td><td class="r"><a href="#in" class="src">[{t('值', 'value')}]</a></td><td><a href="#in" style="color:#ca8a04">{t('来源', 'Source')} ▸</a></td></tr>
<tr><td>{t('营收（累计）', 'Revenue (cumulative)')} {M('FY2025')}</td><td class="r"><a href="#in" class="src">[{t('值', 'value')}]</a></td><td><a href="#in" style="color:#ca8a04">{t('来源', 'Source')} ▸</a></td></tr></tbody></table>
<span class="tiny">{t('每个输入点开它自己的供应商观测抽屉。许可与输入相同（内部）。', 'Each input opens its own vendor-observation drawer. Licence follows the inputs (internal).')}</span>""")}</aside>'''
    member_d = f'''<aside class="drw" aria-label="{t('成分归属抽屉', 'Membership drawer')}" style="border:1px solid rgba(255,255,255,.06);border-radius:6px;align-self:start">
{drawer_head('成分归属 industry_membership', 'industry membership', f'{t("公司", "Company")} 01 · {M("000001.SZ")} ∈ {n}', tag_fact())}
{sec(2, '来源', 'Source', kv((t('发布机构', 'Publisher'), t('恒生聚源 Gildata', 'Gildata (恒生聚源)')), (t('来源行', 'Source row'), M(t('[成分快照 · 第 n 行]', '[member snapshot · row n]'))), (t('响应 SHA-256', 'Response SHA-256'), M('[12]…[12]'))))}
{sec(3, '时间', 'Times', kv((t('纳入自', 'Member since'), M('2026-11-03') + f' <span class="st miss">{t("假设：首次观察日", "Assumed: first observation")}</span>'), (t('至', 'Member until'), t('在册', 'current')), (t('供应商纳入日', 'Vendor entry date'), f'<span class="st miss">{t("供应商未提供", "not provided by vendor")}</span>')))}
{sec(6, '链接', 'Links', f'<div class="row"><a href="{F("Cn-Constituents")}" class="btn">{t("成分页", "Constituents")}</a><a href="Company.dc.html" class="btn">{t("公司页", "Company page")}</a></div>')}</aside>'''
    body = f'''<div style="padding:28px;display:grid;grid-template-columns:520px minmax(0,1fr);gap:24px;align-items:start">
{dr('ok', t('正常', 'ok'))}
<div class="col" style="gap:18px;min-width:0">
<div class="col" style="gap:4px"><span class="cap">{t('供应商观测的来源抽屉', 'Source drawer for a vendor observation')}</span>
<span style="font-size:15px;color:#fafafa">{t('沿用统一抽屉外壳和六段顺序。供应商没告诉我们的事，逐项写出来（“供应商未提供”“未公布”），不留空白。没有网址，因为不存在公开网址。', 'Same drawer shell and six sections as everywhere. What the vendor did not tell us is stated item by item ("not provided", "not published"), never left blank. There is no URL because no public URL exists.')}</span>
<span class="tiny">{t('桌面右侧 520px；手机为全屏面板，各段可折叠，哈希与 id 用等宽字换行。', 'Desktop: 520px on the right. Phone: a full-height sheet with collapsible sections; hashes and ids wrap in mono.')}</span></div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start">
{dr('revised', t('变体：已修订', 'variant: revised'))}
<div class="col" style="gap:16px">{dr('withheld', t('变体：受限（非管理员）', 'variant: withheld (non-admin)'))}{derived_d}</div>
{dr('retracted', t('变体：已撤回', 'variant: retracted'))}
{member_d}
</div></div></div>'''
    doc('Cn-Drawer', t('来源抽屉 供应商观测', 'Source drawer vendor observation'), body, 1920, 2300, fixed=True,
        ctitle=t('中国行业 · 来源抽屉（供应商观测 4 变体 + 衍生统计 + 成分归属）', 'CN industries · source drawer (vendor observation ×4, derived statistic, membership) · EN'))

# ---------- STATES (zh + en side by side) ----------
def states_col():
    sk = ''.join('<div class="sk" style="height:24px;border-radius:3px"></div>' for _ in range(27))
    reasons = [(t('供应商未提供', 'not provided by vendor'), t('供应商的返回里没有这一项。', 'The vendor’s response does not contain this item.')),
               (t('解析失败', 'could not be read'), t('返回的格式和预期不一致，已隔离待查；不从文字里猜数字。', 'The response did not match the expected shape and is quarantined; no number is guessed from prose.')),
               (t('历史不足', 'not enough history'), t('样本数不够算这个统计量。', 'Too few samples to compute this statistic.')),
               (t('分母无效', 'invalid denominator'), t('分母为负或为零，比率没有意义（例如亏损时的市盈率）。', 'The denominator is negative or zero, so the ratio has no meaning (for example PE when earnings are negative).')),
               (t('无对比期', 'no prior period'), t('没有上年同期可比。', 'There is no year-earlier period to compare with.'))]
    rs = ''.join(f'<tr><td><span class="st miss">{t("缺失", "Missing")} · {a}</span></td><td class="dim">{b}</td></tr>' for a, b in reasons)
    return f'''<div class="col" style="gap:12px;min-width:0">
<span class="cap">{t('中文', 'English')}</span>
<div class="card"><span class="cap">{t('受限 · 非管理员落到申万方案（整页）', 'Withheld · a non-admin lands on the SW scheme (whole page)')}</span>
<div class="ph"><h1 class="h1">{t('行业研究', 'Industry research')}</h1><span class="sp"></span><div class="seg"><a href="IndustrySic.dc.html">{t('SIC · 美股（SEC）', 'SIC · US (SEC)')}</a><a href="#sw" class="on" aria-current="true">{t('申万 2021 · A 股 · 受限', 'SW 2021 · A-shares · withheld')}</a></div></div>
<div class="note"><span class="row"><span class="st held">{t('受限', 'Withheld')}</span><b>{t('中国行业数据授权待确认', 'China industry data: licence pending')}</b></span><span style="display:block;margin-top:4px">{t('这部分数据来自商业数据服务，展示条款确认前不对外显示任何数字、名单或图表。美股行业（SIC，SEC 公开数据）可以正常查看。', 'This data comes from a commercial data service. Until its display terms are confirmed no number, list or chart is shown. US industries (SIC, public SEC data) are available.')}</span>
<span class="row" style="margin-top:8px"><a href="IndustrySic.dc.html" class="btn pri">{t('切换到 SIC', 'Switch to SIC')}</a><a href="#lic" class="btn">{t('数据来源与授权说明', 'Sources and licensing')}</a></span></div>
<span class="tiny">{t('没有网格、没有骨架、没有行业名单。来源抽屉走“受限”变体。', 'No grid, no skeleton, no industry list. The source drawer uses its withheld variant.')}</span></div>

<div class="card"><span class="cap">{t('内部预览（管理员）', 'Internal preview (admins)')}</span>{adm('恒生聚源 · 行业财务（供应商口径）', 'Gildata · industry financials (vendor-reported)')}</div>

<div class="card"><span class="cap">{t('空态 · 尚无活跃运行', 'Empty · no active run yet')}</span>
<div class="note"><b>{t('尚无数据', 'No data yet')}</b><br>{t('中国行业数据还没有完成首次同步，所以没有可显示的数值。首次运行激活后这里出现网格。', 'The first sync of China industry data has not completed, so there is nothing to show. The grid appears once the first run is activated.')}<span class="row" style="margin-top:8px"><a href="IndustrySic.dc.html" class="btn">{t('先看 SIC 方案', 'See the SIC scheme')}</a></span></div></div>

<div class="card"><span class="cap">{t('加载 · 静态骨架，无转圈、无文字', 'Loading · static skeleton, no spinner, no text')}</span>
<div role="status" aria-busy="true" style="display:grid;grid-template-columns:120px repeat(8,minmax(0,1fr));gap:3px">{sk}</div></div>

<div class="card"><span class="cap">{t('读取失败', 'Read error')}</span>
<div class="note err" role="alert"><b>{t('读取失败', 'Could not load')}</b><br>{t('显示上次成功响应（[时刻]）。永不以 0 替代缺失。', 'Showing the last successful response ([time]). A missing value is never replaced by 0.')}<span class="row" style="margin-top:8px"><button type="button" class="btn">{t('重试', 'Retry')}</button></span></div></div>

<div class="card"><span class="cap">{t('过期 · 整页 / 单个数据集', 'Stale · page / single dataset')}</span>
<div class="note warn"><span class="row"><span class="st stale">{t('过期', 'Stale')}</span><b>{t('数据过期，数值照常显示', 'Data is stale; values stay visible')}</b></span><span style="display:block;margin-top:4px">{t('期望每周更新，已超出宽限。页面继续显示最近一次激活的运行（[时刻]）。', 'A weekly update is expected and the grace period has passed. The page keeps showing the most recently activated run ([time]).')}</span></div>
<div class="row"><span class="chip"><span class="dot"></span>{t('财务', 'Financials')} {M('2026-11-20')} · {t('正常', 'fresh')}</span><span class="chip warn"><span class="dot w"></span>{t('成分', 'Membership')} {M('2026-11-10')} · {t('过期', 'stale')}</span><span class="tiny">{t('只有一个数据集过期时，只变它的芯片，不出整页提示。', 'When only one dataset is stale only its chip changes; no page-level notice.')}</span></div>
<div class="note warn"><span class="row"><span class="st stale">{t('过期', 'Stale')}</span><b>{t('数据服务已停止更新', 'The data service has stopped updating')}</b></span><span style="display:block;margin-top:4px">{t('最后一次成功取数是 [日期]。页面保留最后一代数据并标为过期，直到管理员撤回。', 'The last successful fetch was on [date]. The page keeps the last generation, marked stale, until an admin withdraws it.')}</span></div></div>

<div class="card"><span class="cap">{t('部分覆盖', 'Partial coverage')}</span>
<div class="row"><span class="hc na" style="width:120px">{t('覆盖不足', 'Low coverage')}<small>0.62</small></span><span class="sub" style="flex:1;min-width:200px">{t('聚合覆盖低于 0.8 时不显示聚合值，只写覆盖率；抽屉里给分子、分母。', 'Below 0.8 coverage no aggregate value is shown, only the ratio; the drawer gives numerator and denominator.')}</span></div>
<div class="note"><b>{t('31 个行业中 27 个有值', '27 of 31 industries have a value')}</b><br>{t('其余 4 个为缺失或覆盖不足，照常列在网格里并写明原因。', 'The other 4 are missing or low coverage; they stay in the grid with their reason.')}</div></div>

<div class="card"><span class="cap">{t('未服务的小节（保留小节，写明状态）', 'A section that is not served (the section stays and says so)')}</span>
<div class="row"><h2 class="h2">{t('估值与分位', 'Valuation and percentiles')}</h2>{tag_fact()}</div>
<div class="note"><span class="st">{t('未服务', 'Not served')}</span> <b>{t('这个行业暂不提供估值', 'Valuation is not provided for this industry')}</b><br>{t('不显示任何估值，也不用其他来源的值顶替。', 'No valuation is shown and no other source stands in for it.')}</div>
<div class="row"><span class="hc na" style="width:220px;flex-direction:row;gap:6px">{t('未服务', 'Not served')}<small>{t('不适用于该行业', 'not applicable to this industry')}</small></span><span class="tiny">{t('例：金融类行业的毛利率', 'e.g. gross margin of a financial industry')}</span></div></div>

<div class="card"><span class="cap">{t('缺失格的原因（文案不含原始代码）', 'Reasons on a missing cell (copy holds no raw codes)')}</span>
<table class="t"><tbody>{rs}</tbody></table></div>

<div class="card"><span class="cap">{t('已撤回 · 运行被撤回', 'Retracted · the run was withdrawn')}</span>
<div class="note err"><span class="row"><span class="st retr">{t('已撤回', 'Retracted')}</span><b>{t('这次运行已被撤回', 'This run has been withdrawn')}</b></span><span style="display:block;margin-top:4px">{t('数值不再显示。若有上一代运行，页面回到上一代并标明代次；否则为空态。', 'Its values are no longer shown. If an earlier generation exists the page returns to it and names the generation; otherwise it is empty.')}</span></div></div>

<div class="card"><span class="cap">{t('阶段视图的三种不可用', 'Three ways the stages view is unavailable')}</span>
<div class="note"><span class="st">{t('无判断', 'No judgment')}</span> <b>{t('尚未发布阶段判断方法', 'No stage method published')}</b><br>{t('只列事实，不分组。', 'Facts only, no grouping.')}</div>
<div class="note"><span class="st held">{t('受限', 'Withheld')}</span> <b>{t('阶段分组暂不显示', 'Stage grouping is not shown')}</b><br>{t('分组所用的输入来自尚未获准展示的数据，所以这条判断不对外发布。', 'The grouping’s inputs come from data not yet licensed for display, so this judgment is not published.')}</div>
<div class="note"><b>{t('该行业暂无判断', 'No judgment for this industry')}</b><br>{t('该范围下没有已登记的判断。事实照常显示。', 'No registered judgment exists for this scope. Facts are shown as usual.')}</div></div>
</div>'''

def states_page():
    global LANG
    LANG = 'zh'; a = states_col()
    LANG = 'en'; b = states_col()
    LANG = 'zh'
    body = f'<div style="padding:28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;align-items:start">{a}{b}</div>'
    doc('Cn-States', '中国行业 状态汇总', body, 1920, 2700, fixed=True, both=False, ctitle='中国行业 · 状态汇总（中 / EN 并排）：受限、内部预览、空、加载、过期、部分覆盖、未服务、缺失原因、撤回')

# ---------- ENTRY + FUTURE + KIT ----------
def entry_page():
    global LANG
    cols = ''
    for lg in ('zh', 'en'):
        LANG = lg
        cols += f'''<div class="col" style="gap:12px;min-width:0"><span class="cap">{t('中文', 'English')}</span>
<div class="card"><span class="cap">{t('研究入口卡 · 受限（非管理员）', 'Hub card · withheld (non-admin)')}</span>
<div class="card in"><div class="row"><span class="h2">{t('行业研究 · 中国（申万 2021）', 'Industry research · China (SW 2021)')}</span><span class="sp"></span><span class="st held">{t('受限', 'Withheld')}</span></div><span class="sub">{t('数据授权待确认，暂不显示。美股行业（SIC）可以查看。', 'Licence pending; nothing is shown yet. US industries (SIC) are available.')}</span><div class="row"><a href="IndustrySic.dc.html" class="btn">{t('看 SIC 行业', 'See SIC industries')}</a></div></div></div>
<div class="card"><span class="cap">{t('研究入口卡 · 管理员预览', 'Hub card · admin preview')}</span>
<div class="card in" style="border-color:rgba(202,138,4,.4)"><div class="row"><span class="h2">{t('行业研究 · 中国（申万 2021）', 'Industry research · China (SW 2021)')}</span><span class="sp"></span><span class="st recon">{t('内部预览', 'Internal preview')}</span></div><span class="sub">{M(31)} {t('个一级行业 · 财务截至', 'level-1 industries · financials as of')} {M('2026-11-20')}</span><div class="row"><a href="{F('Cn-List')}" class="btn pri">{t('打开网格', 'Open the grid')}</a><a href="{F('Cn-Stages')}" class="btn">{t('阶段视图', 'Stages view')}</a></div></div></div>
<div class="card"><span class="cap">{t('研究入口卡 · 公开后', 'Hub card · once public')}</span>
<div class="card in"><div class="row"><span class="h2">{t('行业研究 · 中国（申万 2021）', 'Industry research · China (SW 2021)')}</span><span class="sp"></span>{tag_fact()}</div><span class="sub">{M(31)} {t('个一级行业 · 财务截至', 'level-1 industries · financials as of')} {M('[日期]' if lg == 'zh' else '[date]')} · {t('来源：恒生聚源', 'Source: Gildata')}</span><div class="row"><a href="{F('Cn-List')}" class="btn pri">{t('打开网格', 'Open the grid')}</a></div></div></div>
<div class="card"><span class="cap">{t('股票页的行业行 · A 股', 'Industry row on a stock page · A-share')}</span>
<div class="row"><span class="dim">{t('所属行业', 'Industry')}</span><a href="{F('Cn-Detail')}" class="chip on" style="min-height:32px">{t('申万一级', 'SW level 1')} · {ind(5)[0]}</a><span class="st recon">{t('内部预览', 'Internal preview')}</span></div>
<div class="row"><span class="dim">{t('所属行业', 'Industry')}</span><span class="st held">{t('受限 · 申万分类授权待确认', 'Withheld · Shenwan classification licence pending')}</span><span class="tiny">{t('非管理员：不显示行业名，不给链接', 'non-admin: no industry name, no link')}</span></div></div>
</div>'''
    LANG = 'zh'
    body = f'<div style="padding:28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;align-items:start">{cols}</div>'
    doc('Cn-Entry', '中国行业 入口', body, 1440, 760, fixed=True, both=False, ctitle='中国行业 · 入口：研究入口卡与股票页行业行（中 / EN）')

def future_page():
    global LANG
    cols = ''
    for lg in ('zh', 'en'):
        LANG = lg
        cols += f'''<div class="card in judg" style="opacity:.92"><div class="row">{tag_judg()}<span class="cap">{t('综合景气', 'Composite prosperity')}</span><span class="sp"></span><span class="chip">{t('已校准', 'Calibrated')}</span></div>
<span class="row"><span style="font-size:17px;font-weight:600">{t('上三分之一', 'Upper third')}</span><a href="#j" class="src" style="font-size:17px">[{t('分数', 'score')}]</a></span>
<dl class="kv" style="grid-template-columns:96px minmax(0,1fr)">{kvrow(t('方法', 'Method'), M('industry_prosperity@v[n]'))}{kvrow(t('校准', 'Calibration'), t('[样本数] 次已结算判断 · [命中情况]', '[n] settled judgments · [hit record]'))}{kvrow(t('证伪条件', 'Falsified if'), f'[{t("条件句", "condition sentence")}]')}</dl></div>'''
    LANG = 'zh'
    body = f'''<div style="padding:28px;display:flex;flex-direction:column;gap:14px">
<div class="note warn"><b>未来稿 · 现在不做 / Future, not built now</b><br>综合景气在校准完成之前只显示有序标签（见行业详情）。这块画板只说明校准完成后分数出现在哪里。<span class="tiny" style="display:block">EN: Until calibration the composite shows an ordered label only (see the detail page). This board only shows where a number would appear afterwards.</span></div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">{cols}</div></div>'''
    doc('Cn-Future', '中国行业 未来稿 已校准综合景气', body, 960, 420, fixed=True, both=False, ctitle='未来稿 · 已校准的综合景气卡（现在不做）')

def kit_page():
    def swrow(k, lab, a):
        return f'<tr><td><span class="hc {k}" style="width:92px">{lab}</span></td><td class="m">{k}</td><td class="m">{a}</td></tr>'
    ramp = ''.join([swrow('p4', '+128.4%', '--accent · α .60'), swrow('p3', '+20.0%', '--accent · α .44'), swrow('p2', '+12.3%', '--accent · α .28'), swrow('p1', '+4.5%', '--accent · α .14'),
                    swrow('n1', '−2.5%', '--text-secondary · α .08 + 1px α .45'), swrow('n2', '−4.5%', '--text-secondary · α .16 + 1px α .45'), swrow('n3', '−10.0%', '--text-secondary · α .26 + 1px α .45'), swrow('n4', '−14.0%', '--text-secondary · α .36 + 1px α .45')])
    def flow(*steps): return '<div class="flow">' + '<span class="arr">→</span>'.join(f'<a href="{u}" class="chip" style="min-height:32px">{s}</a>' for s, u in steps) + '</div>'
    body = f'''<div style="padding:28px;display:flex;flex-direction:column;gap:16px">
<div class="col" style="gap:4px"><span class="cap">中国行业研究 · 设计决定与流程 / China industry research · design decisions and flow</span>
<span style="font-size:15px;color:#fafafa">这一组画板把申万 2021 方案接到现有“行业研究”里，与美国 SIC 页同一外壳、同一状态词表。新增的只有下面几件；其余全部沿用共用件。数值全是示意，行业与公司用占位名。</span></div>
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start">
<section class="card"><h2 class="h2">1 · 带符号热力阶 <span class="en">Signed heat ramp</span></h2>
<table class="t"><thead><tr><th>格</th><th>类</th><th>令牌 + 透明度</th></tr></thead><tbody>{ramp}</tbody></table>
<div class="row"><span class="hc na" style="width:92px">缺失<small>无对比期</small></span><span class="hc na" style="width:92px">覆盖不足<small>0.62</small></span><span class="hc p2" style="width:110px">+1.5%<span class="rv">已修订</span></span></div>
<span class="sub">决定：正值用铜色填充，负值用中性灰填充加 1px 实线细框，符号始终印出。每侧 4 档；在卡面底色上相邻档差 ≥ 0.14（铜）/ ≥ 0.08（灰），再多就分不清。不用斜线纹（要靠渐变实现，违反令牌规则）。缺失是虚线空格，与负值的实线框区分。按固定阈值分档，不按当前屏幕重排。</span></section>
<section class="card"><h2 class="h2">2 · 口径标签与衍生标 <span class="en">Origin tag</span></h2>
<div class="row"><span class="org"><i></i>供应商口径</span><span class="org"><i></i>Vendor-reported</span></div>
<div class="row"><span class="org cmp"><i></i>本站计算</span><span class="org cmp"><i></i>Computed</span></div>
<div class="row"><span class="chip">本站推算 · <span class="m">yoy/1</span></span><span class="chip">Derived · <span class="m">cagr_3y/1</span></span></div>
<span class="sub">空心方块 = 数据商给的聚合值；实心方块 = 本站按自己的方法聚合（第二期）。放在列表表头、详情各小节标题和抽屉里，不放在每个格上。由供应商数值算出来的同比、复合增速、分位，沿用“供应商口径”，再加一枚写明公式版本的“本站推算”芯片。同一页混用两种口径时（第二期）：小节标题写默认口径，只有不同于默认的行另加标签。</span>
<h2 class="h2" style="margin-top:6px">3 · 口径与视图切换 <span class="en">Basis and view toggles</span></h2>
<div class="row"><span class="seg"><a href="#a" class="on">年度</a><a href="#q">单季</a></span><span class="seg"><a href="#g" class="on">网格</a><a href="#s">阶段</a></span></div>
<span class="sub">分段控件，每一段是链接（查询参数 basis、view），不是客户端状态。</span>
<h2 class="h2" style="margin-top:6px">4 · 内部预览条 <span class="en">Admin-only bar</span></h2>
<div class="adm"><span class="row"><span class="st recon">内部预览</span><b>仅管理员可见</b></span></div>
<span class="sub">所有用到供应商数据的页面，页头下第一块就是它；沿用现有 adminPreview 的铜色条。</span></section>
<section class="card"><h2 class="h2">5 · 阶段行与分位条 <span class="en">Stage row, percentile bar</span></h2>
<div class="row"><a href="#x" class="src">+12.3%</a><span class="cb"><i style="left:50%;width:20%"></i></span><a href="#x" class="src">−4.5%</a><span class="cb"><i class="neg" style="left:42%;width:8%"></i></span></div>
<div class="row"><span class="pb"><i style="width:72%"></i><b style="left:72%"></b></span><span class="m">P72</span></div>
<div class="row"><span class="pb na"></span><span class="st miss">缺失 · 历史不足</span></div>
<span class="sub">迷你条以 0 为中线，数值始终印出。景气分项只用条形，不画雷达：雷达上的缺口容易被读成 0。每组条形都有表格等价物。</span>
<h2 class="h2" style="margin-top:6px">6 · 判断与事实分开 <span class="en">Judgment apart from fact</span></h2>
<div class="card in judg" style="padding:8px 10px"><div class="row"><span class="tag judg">判断</span><b>成长后期</b><span class="chip">方法 <span class="m">{METHOD}</span></span><span class="chip">判断截至 <span class="m">{ASOF}</span></span></div></div>
<span class="sub">阶段不是数据商字段。分组标题、“进入该阶段”和阶段分布在铜色边的判断容器里，带方法、日期、输入、证伪条件；复合增速与 ROE 在另一张事实卡里，照样可点开来源。阶段标签不出现在网格和列表列里。阶段分布用带计数的芯片（兼作锚点），不用堆叠条。</span></section>
</div>
<section class="card"><h2 class="h2">流程（桌面与手机相同；手机上抽屉是全屏面板） <span class="en">Flow — same on desktop and phone; on a phone the drawer is a full-height sheet</span></h2>
<div class="col" style="gap:10px">
<div class="row"><span class="cap" style="width:36px">A</span>{flow(('列表 · 网格', 'Cn-List.dc.html'), ('点一个格', 'Cn-List.dc.html'), ('来源抽屉', 'Cn-Drawer.dc.html'), ('重放（原始响应）', 'Cn-Drawer.dc.html'))}</div>
<div class="row"><span class="cap" style="width:36px">B</span>{flow(('列表', 'Cn-List.dc.html'), ('点行名', 'Cn-List.dc.html'), ('行业详情', 'Cn-Detail.dc.html'), ('成分', 'Cn-Constituents.dc.html'), ('公司页', 'Company.dc.html'))}</div>
<div class="row"><span class="cap" style="width:36px">C</span>{flow(('列表', 'Cn-List.dc.html'), ('视图 = 阶段', 'Cn-Stages.dc.html'), ('阶段锚点', 'Cn-Stages.dc.html'), ('阶段行', 'Cn-Stages.dc.html'), ('行业详情', 'Cn-Detail.dc.html'), ('判断卡', 'Cn-Detail.dc.html'), ('方法文档', 'Cn-Detail.dc.html'))}</div>
<div class="row"><span class="cap" style="width:36px">D</span>{flow(('非管理员落到申万方案', 'Cn-States.dc.html'), ('“受限”整页提示', 'Cn-States.dc.html'), ('切换到 SIC', 'IndustrySic.dc.html'))}</div>
<div class="row"><span class="cap" style="width:36px">手机</span>{flow(('M 列表', 'M-Cn-List.dc.html'), ('M 抽屉', 'M-Cn-Drawer.dc.html'))}{flow(('M 阶段', 'M-Cn-Stages.dc.html'), ('M 详情', 'M-Cn-Detail.dc.html'), ('M 成分', 'M-Cn-Constituents.dc.html'))}{flow(('M 受限', 'M-Cn-Withheld.dc.html'), ('M SIC', 'M-Industry.dc.html'))}</div>
</div></section>
<section class="card"><h2 class="h2">手机 390px 的三个决定 <span class="en">Three phone decisions</span></h2>
<span class="sub">① 列表以表格为先：一次只显示一个指标、一个期间，行业名固定在左，用期间步进器前后翻；390px 放不下 31×10 的网格，所以不提供整幅热力图，只在这一列的格子上保留同一套带符号色阶。② 阶段分布条在自己的容器里横向滚动，页面本身不横向滚动；每个阶段是可折叠小节，阶段行变成两行卡。③ 详情各小节上下堆叠，图在上、表在开关后；分位条的标签在条的上方。</span></section>
</div>'''
    doc('Cn-Kit', '中国行业 设计决定与流程', body, 1920, 1250, fixed=True, both=False, ctitle='中国行业 · 设计决定与流程（色阶、口径标签、切换、判断分离、四条路径）')

# ---------- MOBILE ----------
def m_adm():
    return f'''<div class="adm" role="status"><span class="st recon">{t('内部预览', 'Internal preview')}</span> <b>{t('仅管理员可见', 'Admins only')}</b><details><summary style="min-height:32px;color:#a1a1aa">{t('为什么', 'Why')} <span class="car"></span></summary>{t('供应商数据尚未获准对外展示；其他用户看到“数据授权待确认”。', 'The vendor data is not yet licensed for display; other users see "data licence pending".')}</details></div>'''

def m_head(title_zh, title_en):
    return f'''<div class="col" style="gap:6px"><h1 class="h1">{h(title_zh, title_en)}</h1>
<div class="row"><a href="M-Industry.dc.html" class="chip" style="min-height:32px">SIC</a><span class="chip on" style="min-height:32px">{t('申万 2021 · 内部预览', 'SW 2021 · preview')}</span><span class="chip"><span class="dot"></span>{t('财务', 'Fin.')} {M('11-20')}</span><span class="chip warn"><span class="dot w"></span>{t('成分', 'Members')} {M('11-10')}</span></div></div>'''

def m_list():
    rows = ''
    for i in range(1, 32):
        n, c, m = ind(i)
        rows += f'<tr><td><a href="{F("M-Cn-Detail")}" style="color:#fafafa;display:block;min-height:44px"><span class="m tiny">{c}</span><br>{n}</a></td><td class="m r tiny">{m}</td><td>{cell(i, 9, drawer=F("M-Cn-Drawer"), mh=" style=\"min-height:44px\"")}</td></tr>\n'
    body = f'''{mshell_top()}
<main class="mbody" style="flex:1">
{m_head('行业研究', 'Industries')}
{m_adm()}
<div class="row"><label class="field" style="flex:1">{t('指标', 'Metric')}<select class="inp" style="min-height:44px"><option>{t('营收同比', 'Revenue YoY')}</option><option>{t('归母净利同比', 'Parent net profit YoY')}</option><option>{t('毛利率', 'Gross margin')}</option><option>ROE</option></select></label>
<div class="field">{t('口径', 'Basis')}<span class="seg"><a href="#a" class="on" style="min-height:44px">{t('年度', 'Annual')}</a><a href="#q" style="min-height:44px">{t('单季', 'Quarter')}</a></span></div></div>
<div class="row"><div class="field" style="flex:1">{t('视图', 'View')}<span class="seg"><a href="{F('M-Cn-List')}" class="on" style="min-height:44px;flex:1;justify-content:center">{t('网格', 'Grid')}</a><a href="{F('M-Cn-Stages')}" style="min-height:44px;flex:1;justify-content:center">{t('阶段', 'Stages')}</a></span></div></div>
<section class="card" style="padding:10px">
<div class="row"><span class="h2">{t('营收同比', 'Revenue YoY')}</span>{org_v()}</div>
<div class="row" role="group" aria-label="{t('期间', 'Period')}"><a href="#prev" class="btn" style="min-height:44px;min-width:44px" aria-label="{t('上一期', 'Previous period')}">‹</a><span class="m" style="flex:1;text-align:center">FY2025</span><a href="#next" class="btn dis" style="min-height:44px;min-width:44px" aria-disabled="true" aria-label="{t('下一期', 'Next period')}">›</a></div>
<table class="t" style="table-layout:fixed"><thead><tr><th>{t('行业', 'Industry')}</th><th class="r" style="width:48px">{t('成分', 'Mem.')}</th><th class="r" style="width:104px">FY2025</th></tr></thead><tbody>
{rows}</tbody></table>
<span class="tiny">{t('铜色 = 正，灰色加框 = 负，符号始终印出。点数值看来源；点行名进详情。一次一个期间，用上面的箭头翻。', 'Brass = positive, framed grey = negative; the sign is always printed. A value opens its source; a name opens the industry. One period at a time; step with the arrows above.')}</span>
</section>
<div class="disc">{t('本页内容不构成投资建议。', 'Nothing here is investment advice.')}</div>
</main>
{mtab()}'''
    doc('M-Cn-List', t('手机 中国行业 列表', 'Phone CN industries list'), body, 390, 2300, fixed=True, ctitle=t('手机 · 中国行业列表（表格为先）', 'Phone · CN list (table first) · EN'))

def m_stages():
    def card(i, since=True):
        n, c, m = ind(i)
        def cv(k):
            if (i, k) == (30, 0): return f'<span class="st miss">{t("缺失", "Missing")}</span>'
            return f'<a href="{F("M-Cn-Drawer")}" class="src">{sgn(cagr(i, k))}</a>'
        roe = f'<span class="st miss">{t("缺失", "Missing")}</span>' if i == 31 else f'<a href="{F("M-Cn-Drawer")}" class="src">{4 + (i * 5) % 17 + (i % 10) / 10:.1f}%</a>'
        return f'''<div class="mcard"><span class="row"><a href="{F('M-Cn-Detail')}" style="color:#fafafa;min-height:44px;display:inline-flex;align-items:center">{n}</a><span class="sp"></span><span class="tiny">ROE</span>{roe}</span>
<span class="row tiny" style="gap:10px"><span>16→19 {cv(0)}</span><span>19→22 {cv(1)}</span><span>22→25 {cv(2)}</span></span></div>'''
    groups, start = '', 1
    for k, (sid, z, e, n) in enumerate(STAGES):
        ids = list(range(start, start + n)); start += n
        inner = ''.join(card(i) for i in ids[:3]) + (f'<span class="tiny">{t(f"… 其余 {n - 3} 行同样式", f"… {n - 3} more rows, same layout")}</span>' if n > 3 else '')
        groups += f'''<details id="stage-{sid}" class="card judg" style="padding:6px 12px"{' open' if k == 0 else ''}><summary>{tag_judg()}<b>{t(z, e)}</b><span class="m dim">{n}</span><span class="sp"></span><span class="car"></span></summary>
<span class="tiny">{t('方法', 'Method')} {M(METHOD)} · {t('截至', 'as of')} {M(ASOF)} · {t('待结算', 'open')}</span>
<span class="sub">[{t('规则句', 'rule sentence')}] · [{t('证伪条件', 'falsified if')}]</span>
<div class="card in" style="padding:6px 10px;gap:0"><span class="row">{tag_fact()}{org_v()}<span class="tiny">{t('营收 CAGR 三段 · ROE', 'three revenue CAGRs · ROE')}</span></span>{inner}</div></details>
'''
    strip = ''.join(f'<a href="#stage-{sid}" class="chip on" style="min-height:44px;flex:none">{t(z, e)} {M(n)}</a>' for sid, z, e, n in STAGES)
    body = f'''{mshell_top()}
<main class="mbody" style="flex:1">
{m_head('行业研究 · 阶段', 'Industries · stages')}
{m_adm()}
<div class="row"><div class="field" style="flex:1">{t('视图', 'View')}<span class="seg"><a href="{F('M-Cn-List')}" style="min-height:44px;flex:1;justify-content:center">{t('网格', 'Grid')}</a><a href="{F('M-Cn-Stages')}" class="on" style="min-height:44px;flex:1;justify-content:center">{t('阶段', 'Stages')}</a></span></div></div>
<section class="card judg" style="padding:10px"><span class="row">{tag_judg()}<span class="h2">{t('阶段分布', 'Stage distribution')}</span></span>
<span class="tiny">{t('方法', 'Method')} {M(METHOD)} · {t('截至', 'as of')} {M(ASOF)}</span>
<nav style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px" aria-label="{t('阶段锚点', 'Stage anchors')}">{strip}<a href="#stage-abstained" class="chip" style="min-height:44px;flex:none">{t('未归类', 'Abstained')} {M(2)}</a><span class="chip" style="min-height:44px;flex:none;border-style:dashed">{t('导入期 0 · 不适用', 'Introduction 0 · n/a')}</span><span class="chip" style="min-height:44px;flex:none;border-style:dashed">{t('成长初期 0 · 不适用', 'Early growth 0 · n/a')}</span></nav>
<span class="tiny">{t('这条横向滚动只在自己的容器里，页面不横向滚动。', 'This strip scrolls sideways inside its own box; the page does not.')}</span></section>
{groups}
<details id="stage-abstained" class="card judg" style="padding:6px 12px"><summary>{tag_judg()}<b>{t('未归类', 'Abstained')}</b><span class="m dim">2</span><span class="sp"></span><span class="car"></span></summary><span class="sub">{t('输入不全，方法弃权。', 'Inputs incomplete; the method abstains.')}</span></details>
<div class="disc">{t('本页内容不构成投资建议。', 'Nothing here is investment advice.')}</div>
</main>
{mtab()}'''
    doc('M-Cn-Stages', t('手机 中国行业 阶段', 'Phone CN industries stages'), body, 390, 1500, fixed=True, ctitle=t('手机 · 阶段视图（可折叠分组）', 'Phone · stages (collapsible groups) · EN'))

def m_detail():
    n, c, m = ind(5)
    def lv(k, v, extra=''): return f'<div class="mcard"><span class="row"><span class="dim">{k}</span><span class="sp"></span><a href="{F("M-Cn-Drawer")}" class="src">{v}</a></span>{extra}</div>'
    def vr(k, cur, p, miss=None):
        if miss: return f'<div class="mcard"><span class="row"><span>{k}</span><span class="sp"></span><span class="st miss">{t("缺失", "Missing")}</span></span><span class="pb na" aria-hidden="true"></span><span class="tiny">{miss}</span></div>'
        return f'<div class="mcard"><span class="row"><span>{k}</span><span class="sp"></span><a href="{F("M-Cn-Drawer")}" class="src">{cur}</a></span><span class="pb" aria-hidden="true"><i style="width:{p}%"></i><b style="left:{p}%"></b></span><span class="row tiny">{t("分位", "Percentile")} <a href="{F("M-Cn-Drawer")}" class="src">P{p}</a><span class="sp"></span>n = {M(118)}</span></div>'
    def jc(title, label, method, note=''):
        return f'''<div class="card in judg" style="padding:10px"><span class="row">{tag_judg()}<span class="cap">{title}</span></span><b style="font-size:16px">{label}</b>{note}<span class="tiny">{M(method)} · {t('截至', 'as of')} {M(ASOF)} · {t('待结算', 'open')}</span><span class="sub">{t('证伪条件', 'Falsified if')}: [{t('条件句', 'condition')}]</span><span class="row"><a href="#m" class="btn" style="min-height:44px;flex:1">{t('方法文档', 'Method')}</a><a href="{F('M-Cn-Drawer')}" class="btn" style="min-height:44px;flex:1">{t('输入', 'Inputs')}</a></span></div>'''
    body = f'''{mshell_top()}
<main class="mbody" style="flex:1">
<div class="col" style="gap:4px"><span class="tiny"><a href="{F('M-Cn-List')}">{t('行业研究', 'Industries')}</a> / {t('申万一级', 'SW L1')}</span>
<h1 class="h1">{n}</h1><span class="m tiny">{c}</span>
<div class="row"><span class="chip"><span class="dot"></span>{t('财务', 'Fin.')} {M('11-20')}</span><span class="chip"><span class="dot"></span>{t('估值', 'Val.')} {M('11-21')}</span><span class="st recon">{t('重建口径', 'Reconstructed')}</span></div>
<div class="row"><a href="{F('M-Cn-Constituents')}" class="btn" style="min-height:44px;flex:1">{t('成分', 'Constituents')} {M(121)}</a></div></div>
{m_adm()}
<section class="card" style="padding:10px;gap:0"><span class="row"><span class="h2">{t('最新值', 'Latest values')}</span>{tag_fact()}{org_v()}</span>
{lv(t('营收同比', 'Revenue YoY') + ' FY2025', '+12.3%')}{lv(t('归母净利同比', 'Parent net profit YoY') + ' FY2025', '−4.5%', f'<span class="st rev" style="align-self:flex-start">{t("已修订", "Revised")}</span>')}{lv(t('毛利率', 'Gross margin') + ' FY2025', '24.0%')}{lv('ROE FY2025', '9.5%')}</section>
<section class="card" style="padding:10px"><span class="row"><span class="h2">{t('序列', 'Series')}</span><span class="sp"></span><span class="seg"><button type="button" class="on" aria-pressed="true" style="min-height:44px">{t('图', 'Chart')}</button><button type="button" aria-pressed="false" style="min-height:44px">{t('表', 'Table')}</button></span></span>
{series_svg()}
<span class="tiny">{t('断开处是缺失，不插值。方形点 = 已修订。', 'A break is a missing value. Square point = revised.')}</span></section>
<section class="card" style="padding:10px;gap:0"><span class="row"><span class="h2">{t('估值与分位', 'Valuation')}</span>{tag_fact()}</span>
{vr('PE (TTM)', None, None, t('负值无意义：分母无效', 'negative: invalid denominator'))}{vr('PB (LF)', '1.8×', 34)}{vr('PS (TTM)', '2.5×', 61)}</section>
<section class="card" style="padding:10px;gap:0"><span class="row"><span class="h2">{t('景气分项', 'Prosperity dimensions')}</span>{tag_fact()}</span>
{prosperity_rows(mobile=True)}</section>
<section class="card judg" style="padding:10px"><span class="row">{tag_judg()}<span class="h2">{t('判断', 'Judgments')}</span></span>
{jc(t('生命周期阶段', 'Lifecycle stage'), t('成长后期', 'Late growth'), METHOD)}
{jc(t('综合景气', 'Composite prosperity'), t('上三分之一', 'Upper third'), 'industry_prosperity@v1', f'<span class="tiny">{t("未校准：不显示分数", "Not calibrated: no score")}</span>')}
<div class="card in" style="padding:10px;border-style:dotted;border-color:rgba(255,255,255,.3)"><span class="cap">{t('供应商判断 · 恒生聚源', 'Vendor judgment · Gildata')}</span><span class="row">{t('行业景气度', 'Prosperity index')} <a href="{F('M-Cn-Drawer')}" class="src">62.0</a> <span class="tiny">{t('排名', 'rank')}</span> <a href="{F('M-Cn-Drawer')}" class="src">9 / 31</a></span><span class="st miss" style="align-self:flex-start">{t('定义：供应商未公布', 'Definition: not published')}</span></div>
</section>
<div class="disc">{t('本页内容不构成投资建议。', 'Nothing here is investment advice.')}</div>
</main>
{mtab()}'''
    doc('M-Cn-Detail', t('手机 中国行业 详情', 'Phone CN industries detail'), body, 390, 2600, fixed=True, ctitle=t('手机 · 行业详情', 'Phone · industry detail · EN'))

def m_drawer():
    n = ind(5)[0]
    secs = drawer_body('ok', mobile=True)
    # make sections collapsible on phone: sections 2..6 as <details>
    parts = secs.split('<div class="sec">')
    out = ''
    for k, p in enumerate(parts[1:]):
        p = p.rsplit('</div>', 1)[0]
        cap_end = p.index('</span>') + 7
        cap, rest = p[:cap_end], p[cap_end:]
        out += f'<details class="sec"{" open" if k < 3 else ""}><summary>{cap}<span class="sp"></span><span class="car"></span></summary>{rest}</details>'
    body = f'''<header class="mtop"><button type="button" class="ibtn" aria-label="{t('关闭来源抽屉', 'Close source drawer')}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"></path></svg></button><span class="h2">{h('来源', 'Source')}</span><span class="sp"></span>{tag_fact()}{org_v()}</header>
<div style="flex:1">
<div style="padding:14px 16px" class="col"><span class="cap">{t('供应商观测', 'Vendor observation')}</span><span style="font-size:17px;font-weight:600">{n} · {t('营收同比', 'Revenue YoY')} {M('+12.3%')} <span class="m dim" style="font-size:12px;font-weight:400">FY2025</span></span></div>
<div class="drw" style="border:0">{out}</div>
</div>
<div class="row" style="padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);background:#141417"><a href="#replay" class="btn pri" style="min-height:44px;flex:1">{t('重放（原始响应）', 'Replay (original)')}</a><button type="button" class="btn" style="min-height:44px">{t('复制哈希', 'Copy hash')}</button></div>'''
    doc('M-Cn-Drawer', t('手机 来源抽屉 供应商观测', 'Phone source drawer vendor observation'), body, 390, 1400, fixed=True, ctitle=t('手机 · 来源抽屉（全屏，可折叠）', 'Phone · source drawer (full sheet, collapsible) · EN'))

def m_cons():
    n, c, m = ind(5)
    rows = ''
    for k in range(1, 7):
        tk = f'0000{k:02d}.SZ' if k % 3 else f'6000{k:02d}.SH'
        av = f'<span class="st">{t("有证据", "Evidenced")}</span>' if k == 6 else f'<span class="st miss">{t("假设", "Assumed")}</span>'
        rows += f'<div class="mcard"><span class="row"><span>{t("公司", "Company")} {k:02d}</span><span class="sp"></span><a href="#co" class="m" style="color:#ca8a04;min-height:44px;display:inline-flex;align-items:center">{tk}</a></span><span class="row tiny">{t("纳入自", "since")} {M("2026-11-03")} {av}<span class="sp"></span><a href="{F("M-Cn-Drawer")}" style="color:#ca8a04">{t("来源", "Source")} ▸</a></span></div>'
    body = f'''{mshell_top()}
<main class="mbody" style="flex:1">
<div class="col" style="gap:4px"><span class="tiny"><a href="{F('M-Cn-Detail')}">{n}</a> / {t('成分', 'Constituents')}</span><h1 class="h1">{h('成分', 'Constituents')}</h1>
<label class="field">{t('截至日期', 'As on')}<input class="inp m" type="date" value="2026-11-10" style="min-height:44px"></label></div>
{m_adm()}
<div class="note warn"><span class="st miss">{t('仅当前', 'Current only')}</span> <b>{t('历史从 2026-11-03 起', 'History starts 2026-11-03')}</b><br>{t('供应商不返回纳入日；纳入日按首次观察日假设。', 'The vendor returns no entry dates; entry is assumed at first observation.')}</div>
<section class="card" style="padding:10px;gap:0"><span class="row"><span class="h2">{M(121)} {t('家在册', 'listed')}</span><span class="sp"></span><span class="tiny m">1 / 21</span></span>
{rows}
<span class="row" style="padding-top:10px"><a href="#prev" class="btn dis" style="min-height:44px;flex:1" aria-disabled="true">{t('上一页', 'Previous')}</a><a href="#next" class="btn" style="min-height:44px;flex:1">{t('下一页', 'Next')}</a></span></section>
</main>
{mtab()}'''
    doc('M-Cn-Constituents', t('手机 中国行业 成分', 'Phone CN industries constituents'), body, 390, 1150, fixed=True, ctitle=t('手机 · 成分（两行一条）', 'Phone · constituents (two-line rows) · EN'))

def m_withheld():
    body = f'''{mshell_top()}
<main class="mbody" style="flex:1">
<div class="col" style="gap:6px"><h1 class="h1">{h('行业研究', 'Industries')}</h1>
<div class="row"><a href="M-Industry.dc.html" class="chip" style="min-height:32px">SIC</a><span class="chip on" style="min-height:32px">{t('申万 2021 · 受限', 'SW 2021 · withheld')}</span></div></div>
<div class="note"><span class="st held">{t('受限', 'Withheld')}</span><br><b>{t('中国行业数据授权待确认', 'China industry data: licence pending')}</b><br>{t('这部分数据来自商业数据服务，展示条款确认前不显示任何数字、名单或图表。美股行业（SIC）可以正常查看。', 'This data comes from a commercial data service. Until its display terms are confirmed no number, list or chart is shown. US industries (SIC) are available.')}
<span class="col" style="margin-top:10px"><a href="M-Industry.dc.html" class="btn pri" style="min-height:44px">{t('切换到 SIC', 'Switch to SIC')}</a><a href="#lic" class="btn" style="min-height:44px">{t('数据来源与授权说明', 'Sources and licensing')}</a></span></div>
<span class="cap">{t('同一位置的另外两种状态', 'Two other states in the same place')}</span>
<div class="note"><b>{t('尚无数据', 'No data yet')}</b><br>{t('首次同步尚未完成。完成后这里出现表格。', 'The first sync has not completed. The table appears afterwards.')}</div>
<div class="card" style="padding:10px" role="status" aria-busy="true"><div class="sk" style="width:50%;height:20px"></div><div class="sk" style="height:44px"></div><div class="sk" style="height:44px"></div><div class="sk" style="height:44px"></div></div>
</main>
{mtab()}'''
    doc('M-Cn-Withheld', t('手机 中国行业 受限', 'Phone CN industries withheld'), body, 390, 844, fixed=True, ctitle=t('手机 · 非管理员：受限 / 空 / 加载', 'Phone · non-admin: withheld / empty / loading · EN'))

# ---------- run ----------
os.makedirs(os.path.join(OUT, 'project'), exist_ok=True)
for LANG in ('zh', 'en'):
    list_page(); stages_page(); stages_nomethod_page(); detail_page(); cons_page(); drawer_page()
    m_list(); m_stages(); m_detail(); m_drawer(); m_cons(); m_withheld()
LANG = 'zh'
states_page(); entry_page(); future_page(); kit_page()
json.dump(BOARDS, open(os.path.join(OUT, 'boards.json'), 'w'), ensure_ascii=False, indent=1)
print(len(BOARDS), 'boards')
