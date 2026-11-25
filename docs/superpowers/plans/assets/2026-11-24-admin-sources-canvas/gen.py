#!/usr/bin/env python3
"""Generates the /admin/sources artboards (zh + en, desktop 1440 + phone 390) for the unified canvas.
usage: gen.py <outdir> [kit css href]"""
import sys, os, html

OUT = sys.argv[1]
KIT = sys.argv[2] if len(sys.argv) > 2 else "/_blob/e7f107c10d4c61a3e863b6510f7fab5c"
FONTS = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"

T = {
 "zh": dict(
  lang="zh-CN", title="数据源", en="Sources", admin="仅管理员", ro="只读",
  crumb="管理 / 数据源",
  lead="本页只读。主源和回退顺序直接读自代码里的路由表，和线上实际执行的一致；修改入口在下一期（P1）。",
  tiles=[("来源", "[n]", "目录登记的供应商"), ("数据类别", "[n]", "实时 + 入库 + 冻结"), ("过期数据集", "[n]", "新鲜度为“过期”或“缺失”"), ("许可未确认", "[n]", "三处合计")],
  a_h="A · 实时数据", a_en="Live, not stored", a_sub="报价、分时、图表 K 线。请求时逐个来源尝试，不入库。",
  a_cols=["数据类别", "市场", "来源顺序", "健康"],
  first="主", cond="带 * 的来源只在已配置时进入顺序。", cfg_on="已配置", cfg_off="未配置",
  gw="网关", gwi="网关分时", em="东方财富", sina="新浪", tx="腾讯", sole="唯一来源", only_verified="唯一已验证",
  health_na="未度量", health_note="来源健康（成功率、超时、熔断）目前只存在于单个进程的内存里，没有持久化，所以这里不显示。P1 接入后本列才有数。",
  rows_a=[("报价", "A · HK · US", ["gw*", "em", "sina", "tx"], ""), ("报价", "TW", ["gw*", "TWSE"], ""), ("报价", "JP · KR", ["gw*", "EODHD*"], ""),
          ("日 / 周 / 月线", "A · HK", ["em", "tx", "gw*"], ""), ("日 / 周 / 月线", "US", ["em", "sina", "gw*"], ""), ("日线", "TW", ["TWSE / TPEx", "gw*"], ""),
          ("日线", "JP · KR", ["gw*"], "sole"), ("后复权", "A · HK", ["em"], "only_verified"), ("分时", "A", ["gwi*", "em", "sina"], ""), ("分时", "HK · US", ["gwi*", "em"], ""),
          ("评分用日线", "A · HK", ["tx", "em"], ""), ("评分用日线", "US", ["tx", "sina", "em"], "")],
  b_h="B · 入库数据", b_en="Stored, replayable", b_sub="每个数据集一行。新鲜度和最近批次来自数据质量登记。",
  b_cols=["数据集", "来源", "生产者", "周期", "新鲜度", "最近成功", "许可"],
  rows_b=[("facts.us", "SEC", "facts-sync", "每日", "fresh", "[时刻]", "unv"), ("facts.cn", "Tushare", "facts-sync", "每日", "stale", "[时刻]", "unv"),
          ("macro.fred", "FRED", "ts-fred", "每日", "fresh", "[时刻]", "ok"), ("macro.akshare", "AKShare", "py-akshare", "每日", "fresh", "[时刻]", "ok"),
          ("industry.agg.sic", "SEC", "industry-agg", "事件", "fresh", "[时刻]", "ok"), ("industry.agg.sw2021", "Tushare", "industry-agg", "事件", "missing", "—", "pend"),
          ("entities.sec-submissions", "SEC", "sec-submissions", "事件", "fresh", "[时刻]", "na")],
  fresh=dict(fresh="新鲜", stale="过期", missing="缺失"), lic=dict(ok="已确认", unv="未核实", pend="待确认", na="不适用", on="已开启", off="已关闭"),
  more="其余 [n] 个数据集",
  c_h="C · 判断的冻结输入", c_en="Frozen judgment inputs", c_sub="只展示。来源是公式哈希的一部分，换来源等于发布新的方法版本，本页和下一期都不提供切换。",
  c_cols=["输入种类", "来源", "许可", "所属方法"],
  rows_c=[("macro_observation", "宏观工作台", "ok", "macro_regime@v2"), ("financial_fact", "SEC", "unv", "—"), ("financial_fact", "Tushare", "unv", "—"), ("price", "东方财富 · 网关", "unv", "—")],
  d_h="来源目录", d_en="Source catalogue", d_sub="代码里的单一描述。凭据只显示环境变量名和是否已配置，不显示值。",
  d_cols=["来源", "能力", "凭据", "限速", "许可登记处"],
  rows_d=[("东方财富", "报价 · K 线（前 / 后复权）· 分时", "—", "无", "—"), ("网关 DataGateway", "报价 · 日线（仅收盘价）· 分时", "[ENV_NAME] · on", "无", "—"),
          ("Tushare", "财务事实 · 证券主数据 · 申万行业 · 披露日历", "TUSHARE_TOKEN · on", "400 ms", "行业表 · 判断文件"),
          ("SEC", "submissions · companyfacts · 文档 · SIC", "EDGAR_USER_AGENT · on", "150 ms", "行业表 · 判断文件"),
          ("FRED", "美国宏观序列", "—", "[n] ms", "宏观目录"), ("EODHD", "报价（JP · KR）", "[ENV_NAME] · off", "无", "—")],
  l_h="许可汇总", l_en="Licences, three places", l_sub="三处各自保存，本页只做汇总，不改存储。",
  l_cols=["登记处", "键", "状态", "确认时间"],
  rows_l=[("行业表", "scheme:sw2021:2021", "off", "—"), ("行业表", "scheme:sic:sec-current", "on", "[时刻]"), ("判断文件", "macro_observation×macro_workbench", "ok", "[时刻]"),
          ("判断文件", "financial_fact×tushare", "unv", "—"), ("宏观目录", "public_domain · [n] 条序列", "ok", "—"), ("宏观目录", "第三方 · [n] 条序列", "pend", "—")],
  places=dict(ind="行业表", jud="判断文件", mac="宏观目录"),
  st_title="状态", st_denied_t="无权访问", st_denied_b="这个页面只对管理员开放。", st_err_t="部分数据读取失败", st_err_b="新鲜度暂时读不到。路由和目录来自代码，仍然显示；受影响的列写“读取失败”，不写 0，也不写“新鲜”。",
  st_empty="还没有任何批次记录。", st_load="加载中", st_fail="读取失败",
  nav=["宏观", "股票池", "研究", "我的投资", "分析", "工具", "设置"], navm=["宏观", "股票池", "研究", "我的投资", "更多"], search="搜索",
  m_order="顺序", m_src="来源", m_prod="生产者",
 ),
 "en": dict(
  lang="en", title="Sources", en="", admin="Admin only", ro="Read-only",
  crumb="Admin / Sources",
  lead="This page is read-only. Primary and fallback order are read from the routing tables in code, so they match what runs in production. Editing arrives in the next phase (P1).",
  tiles=[("Sources", "[n]", "vendors in the catalogue"), ("Data domains", "[n]", "live + stored + frozen"), ("Stale datasets", "[n]", "freshness is stale or missing"), ("Licences unconfirmed", "[n]", "across three places")],
  a_h="A · Live data", a_en="", a_sub="Quotes, intraday and chart bars. Sources are tried in order per request; nothing is stored.",
  a_cols=["Domain", "Market", "Source order", "Health"],
  first="1st", cond="Sources marked * join the order only when configured.", cfg_on="configured", cfg_off="not configured",
  gw="Gateway", gwi="Gateway intraday", em="Eastmoney", sina="Sina", tx="Tencent", sole="only source", only_verified="only verified source",
  health_na="not measured", health_note="Source health (success rate, timeouts, circuit state) lives only in each process's memory today and is not persisted, so it is not shown. This column fills in with P1.",
  rows_a=[("Quotes", "A · HK · US", ["gw*", "em", "sina", "tx"], ""), ("Quotes", "TW", ["gw*", "TWSE"], ""), ("Quotes", "JP · KR", ["gw*", "EODHD*"], ""),
          ("Daily / weekly / monthly", "A · HK", ["em", "tx", "gw*"], ""), ("Daily / weekly / monthly", "US", ["em", "sina", "gw*"], ""), ("Daily", "TW", ["TWSE / TPEx", "gw*"], ""),
          ("Daily", "JP · KR", ["gw*"], "sole"), ("Back-adjusted", "A · HK", ["em"], "only_verified"), ("Intraday", "A", ["gwi*", "em", "sina"], ""), ("Intraday", "HK · US", ["gwi*", "em"], ""),
          ("Daily for scoring", "A · HK", ["tx", "em"], ""), ("Daily for scoring", "US", ["tx", "sina", "em"], "")],
  b_h="B · Stored data", b_en="", b_sub="One row per dataset. Freshness and the latest batch come from the data-quality registry.",
  b_cols=["Dataset", "Source", "Producer", "Cadence", "Freshness", "Last success", "Licence"],
  rows_b=[("facts.us", "SEC", "facts-sync", "daily", "fresh", "[time]", "unv"), ("facts.cn", "Tushare", "facts-sync", "daily", "stale", "[time]", "unv"),
          ("macro.fred", "FRED", "ts-fred", "daily", "fresh", "[time]", "ok"), ("macro.akshare", "AKShare", "py-akshare", "daily", "fresh", "[time]", "ok"),
          ("industry.agg.sic", "SEC", "industry-agg", "event", "fresh", "[time]", "ok"), ("industry.agg.sw2021", "Tushare", "industry-agg", "event", "missing", "—", "pend"),
          ("entities.sec-submissions", "SEC", "sec-submissions", "event", "fresh", "[time]", "na")],
  fresh=dict(fresh="fresh", stale="stale", missing="missing"), lic=dict(ok="confirmed", unv="unverified", pend="pending", na="n/a", on="enabled", off="disabled"),
  more="[n] more datasets",
  c_h="C · Frozen judgment inputs", c_en="", c_sub="Display only. The source is part of the formula hash, so changing it means publishing a new method version. Neither this page nor the next phase offers a switch.",
  c_cols=["Input kind", "Source", "Licence", "Method"],
  rows_c=[("macro_observation", "Macro workbench", "ok", "macro_regime@v2"), ("financial_fact", "SEC", "unv", "—"), ("financial_fact", "Tushare", "unv", "—"), ("price", "Eastmoney · Gateway", "unv", "—")],
  d_h="Source catalogue", d_en="", d_sub="The single description in code. Credentials show the environment variable name and whether it is set, never the value.",
  d_cols=["Source", "Capabilities", "Credential", "Pacing", "Licence kept in"],
  rows_d=[("Eastmoney", "Quotes · bars (forward / back adjusted) · intraday", "—", "none", "—"), ("DataGateway", "Quotes · daily (close only) · intraday", "[ENV_NAME] · on", "none", "—"),
          ("Tushare", "Financial facts · security master · Shenwan industries · filing calendar", "TUSHARE_TOKEN · on", "400 ms", "Industry table · judgment file"),
          ("SEC", "Submissions · companyfacts · documents · SIC", "EDGAR_USER_AGENT · on", "150 ms", "Industry table · judgment file"),
          ("FRED", "US macro series", "—", "[n] ms", "Macro catalogue"), ("EODHD", "Quotes (JP · KR)", "[ENV_NAME] · off", "none", "—")],
  l_h="Licences", l_en="", l_sub="Kept in three places. This page only brings them together; storage is unchanged.",
  l_cols=["Kept in", "Key", "Status", "Confirmed"],
  rows_l=[("Industry table", "scheme:sw2021:2021", "off", "—"), ("Industry table", "scheme:sic:sec-current", "on", "[time]"), ("Judgment file", "macro_observation×macro_workbench", "ok", "[time]"),
          ("Judgment file", "financial_fact×tushare", "unv", "—"), ("Macro catalogue", "public_domain · [n] series", "ok", "—"), ("Macro catalogue", "third party · [n] series", "pend", "—")],
  places=dict(ind="Industry table", jud="Judgment file", mac="Macro catalogue"),
  st_title="States", st_denied_t="No access", st_denied_b="This page is open to administrators only.", st_err_t="Some data could not be read", st_err_b="Freshness is unavailable right now. Routing and the catalogue come from code and still show; affected columns say “could not be read”, never 0 and never “fresh”.",
  st_empty="No batches recorded yet.", st_load="Loading", st_fail="could not be read",
  nav=["Macro", "Watchlist", "Research", "Portfolio", "Analysis", "Tools", "Settings"], navm=["Macro", "Watchlist", "Research", "Portfolio", "More"], search="Search",
  m_order="Order", m_src="Source", m_prod="Producer",
 ),
}

e = html.escape

def en(t, k):
    return f' <span class="en">{e(t[k])}</span>' if t.get(k) else ""

def src_name(t, s):
    star = s.endswith("*"); s = s.rstrip("*")
    return e(t.get(s, s)) + ("<sup>*</sup>" if star else "")

def route(t, srcs, tag=""):
    out = []
    for i, s in enumerate(srcs):
        if i == 0:
            out.append(f'<span class="chip on"><span class="m">{e(t["first"])}</span>&nbsp;{src_name(t, s)}</span>')
        else:
            out.append(f'<span class="fog" aria-hidden="true">→</span><span class="chip"><span class="m">{i+1}</span>&nbsp;{src_name(t, s)}</span>')
    if tag:
        out.append(f'<span class="tiny">{e(t[tag])}</span>')
    return '<span class="row" style="gap:6px;flex-wrap:wrap">' + "".join(out) + "</span>"

def fresh(t, k):
    cls = {"fresh": "", "stale": " warn", "missing": ""}[k]
    dot = '<span class="dot"></span>' if k == "fresh" else ""
    style = ' style="color:#8b8b94"' if k == "missing" else ""
    return f'<span class="chip{cls}"{style}>{dot}{e(t["fresh"][k])}</span>'

def lic(t, k):
    cls = {"ok": "", "on": "", "unv": " warn", "pend": " warn", "off": "", "na": ""}[k]
    dot = '<span class="dot"></span>' if k in ("ok", "on") else ""
    style = ' style="color:#8b8b94"' if k in ("na", "off") else ""
    return f'<span class="chip{cls}"{style}>{dot}{e(t["lic"][k])}</span>'

def cred(t, v):
    if "·" not in v:
        return e(v)
    name, st = [x.strip() for x in v.split("·")]
    chip = f'<span class="chip"><span class="dot"></span>{e(t["cfg_on"])}</span>' if st == "on" else f'<span class="chip" style="color:#8b8b94">{e(t["cfg_off"])}</span>'
    return f'<span class="m">{e(name)}</span> {chip}'

def table(cols, rows, minw=560):
    th = "".join(f"<th>{e(c)}</th>" for c in cols)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tw" style="overflow-x:auto"><table class="t" style="min-width:{minw}px"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'

def head(t, title, w, h, body, extra_root=""):
    return f'''<!doctype html>
<html lang="{t["lang"]}">
<head>
<meta charset="utf-8">
<title>{e(title)}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="{KIT}">
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="{FONTS}">
<style>
body{{margin:0;background:#0a0a0b}}
a{{color:#a1a1aa}}a:hover{{color:#fafafa}}
</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def section(t, hid, hk, ek, sk, inner, chips=""):
    return f'''<section class="card" aria-labelledby="{hid}">
  <div class="row"><h2 id="{hid}" class="h2">{e(t[hk])}{en(t, ek)}</h2>{chips}</div>
  <span class="sub">{e(t[sk])}</span>
  {inner}
</section>'''

def desktop(lang):
    t = T[lang]
    nav = "".join(f'<a href="#n{i}">{e(n)}</a>' for i, n in enumerate(t["nav"]))
    tiles = "".join(f'<div class="card in"><span class="cap">{e(a)}</span><span class="m" style="font-size:22px;font-weight:600">{e(b)}</span><span class="tiny">{e(c)}</span></div>' for a, b, c in t["tiles"])
    na = f'<span class="tiny">{e(t["health_na"])}</span>'
    a = table(t["a_cols"], [(e(d), f'<span class="m">{e(m)}</span>', route(t, s, tag), na) for d, m, s, tag in t["rows_a"]], 720)
    a += f'<span class="tiny"><sup>*</sup> {e(t["cond"])}　{e(t["gw"])} <span class="chip"><span class="dot"></span>{e(t["cfg_on"])}</span>　EODHD <span class="chip" style="color:#8b8b94">{e(t["cfg_off"])}</span></span>'
    a += f'<div class="note">{e(t["health_note"])}</div>'
    b = table(t["b_cols"], [(f'<span class="m">{e(d)}</span>', e(s), f'<span class="m dim">{e(p)}</span>', e(c), fresh(t, f), f'<span class="m">{e(ls)}</span>', lic(t, l)) for d, s, p, c, f, ls, l in t["rows_b"]], 860)
    b += f'<span class="tiny">{e(t["more"])}</span>'
    c = table(t["c_cols"], [(f'<span class="m">{e(k)}</span>', e(s), lic(t, l), f'<span class="m dim">{e(m)}</span>') for k, s, l, m in t["rows_c"]])
    d = table(t["d_cols"], [(f"<b>{e(n)}</b>", e(cap), cred(t, cr), f'<span class="m">{e(p)}</span>', e(lp)) for n, cap, cr, p, lp in t["rows_d"]], 860)
    l = table(t["l_cols"], [(e(p), f'<span class="m">{e(k)}</span>', lic(t, s), f'<span class="m">{e(at)}</span>') for p, k, s, at in t["rows_l"]])
    body = f'''<div class="oa" style="min-height:100vh;display:flex;flex-direction:column">
  <header class="top">
    <a href="MacroLanding.dc.html" class="logo">Osborn<b>Alpha</b></a>
    <nav class="topnav" aria-label="Main">{nav}</nav>
    <span class="sp"></span>
    <label class="row" style="gap:6px"><span class="tiny">{e(t["search"])}</span><input class="inp" type="search" style="width:240px"></label>
  </header>
  <main class="wrap">
    <div class="ph">
      <div class="col" style="gap:2px">
        <span class="tiny">{e(t["crumb"])}</span>
        <h1 class="h1">{e(t["title"])}{en(t, "en")} <span class="chip">{e(t["admin"])}</span> <span class="chip">{e(t["ro"])}</span></h1>
      </div>
    </div>
    <span class="sub" style="max-width:900px">{e(t["lead"])}</span>
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">{tiles}</div>
    {section(t, "s-a", "a_h", "a_en", "a_sub", a)}
    {section(t, "s-b", "b_h", "b_en", "b_sub", b)}
    <div class="g2">
      {section(t, "s-c", "c_h", "c_en", "c_sub", c)}
      {section(t, "s-l", "l_h", "l_en", "l_sub", l)}
    </div>
    {section(t, "s-d", "d_h", "d_en", "d_sub", d)}
  </main>
</div>'''
    return head(t, t["title"] + " /admin/sources", 1440, 2300, body)

def mrow(top, bottom):
    return f'<li style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid #27272a"><span class="row" style="gap:8px;flex-wrap:wrap">{top}</span><span class="row" style="gap:6px;flex-wrap:wrap">{bottom}</span></li>'

def mlist(rows):
    return '<ul style="list-style:none;margin:0;padding:0">' + "".join(rows) + "</ul>"

def mobile(lang):
    t = T[lang]
    ON = " class=\"on\""
    tab = "".join(f"<a href=\"#t{i}\"{ON if i == 4 else str()}>{e(n)}</a>" for i, n in enumerate(t["navm"]))
    tiles = "".join(f'<div class="card in" style="padding:10px"><span class="cap">{e(a)}</span><span class="m" style="font-size:20px;font-weight:600">{e(b)}</span></div>' for a, b, c in t["tiles"])
    a = mlist([mrow(f'<b>{e(d)}</b><span class="m dim">{e(m)}</span>', route(t, s, tag)) for d, m, s, tag in t["rows_a"]])
    b = mlist([mrow(f'<span class="m" style="word-break:break-all">{e(d)}</span><span class="sp"></span>{fresh(t, f)}', f'<span class="tiny">{e(t["m_src"])} {e(s)} · {e(c)} · <span class="m">{e(ls)}</span></span>{lic(t, l)}') for d, s, p, c, f, ls, l in t["rows_b"]])
    c = mlist([mrow(f'<span class="m">{e(k)}</span><span class="sp"></span>{lic(t, l)}', f'<span class="tiny">{e(s)} · <span class="m">{e(m)}</span></span>') for k, s, l, m in t["rows_c"]])
    d = mlist([mrow(f'<b>{e(n)}</b><span class="sp"></span><span class="m dim">{e(p)}</span>', f'<span class="tiny">{e(cap)}</span>' + (f'<span class="tiny">{cred(t, cr)}</span>' if cr != "—" else "")) for n, cap, cr, p, lp in t["rows_d"]])
    l = mlist([mrow(f'<span class="tiny">{e(p)}</span><span class="sp"></span>{lic(t, s)}', f'<span class="m" style="word-break:break-all">{e(k)}</span>') for p, k, s, at in t["rows_l"]])
    def sec(hid, hk, sk, inner):
        return f'<section class="card" style="padding:12px" aria-labelledby="{hid}"><h2 id="{hid}" class="h2">{e(t[hk])}</h2><span class="tiny">{e(t[sk])}</span>{inner}</section>'
    body = f'''<div class="oa" style="width:390px;min-height:844px;display:flex;flex-direction:column">
<header class="mtop"><a href="MacroLanding.dc.html" class="logo">Osborn<b>Alpha</b></a><span class="sp"></span><span class="chip">{e(t["admin"])}</span></header>
<main class="mbody" style="flex:1">
<div class="col" style="gap:6px"><span class="tiny">{e(t["crumb"])}</span><h1 class="h1">{e(t["title"])} <span class="chip">{e(t["ro"])}</span></h1><span class="tiny">{e(t["lead"])}</span></div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">{tiles}</div>
{sec("m-a", "a_h", "a_sub", a + f'<span class="tiny"><sup>*</sup> {e(t["cond"])}</span><div class="note">{e(t["health_note"])}</div>')}
{sec("m-b", "b_h", "b_sub", b + f'<span class="tiny">{e(t["more"])}</span>')}
{sec("m-c", "c_h", "c_sub", c)}
{sec("m-l", "l_h", "l_sub", l)}
{sec("m-d", "d_h", "d_sub", d)}
</main>
<nav class="tabbar" aria-label="Main">{tab}</nav>
</div>'''
    return head(t, t["title"] + " 390", 390, 3600, body)

def states():
    cols = []
    for lang in ("zh", "en"):
        t = T[lang]
        cols.append(f'''<div class="col" style="gap:12px;flex:1;min-width:0">
<span class="cap">{e(t["st_title"])} · {lang.upper()}</span>
<section class="card"><h2 class="h2">{e(t["st_denied_t"])}</h2><span class="sub">{e(t["st_denied_b"])}</span></section>
<section class="card"><div class="note warn"><b>{e(t["st_err_t"])}</b><br>{e(t["st_err_b"])}</div>
{table(t["b_cols"][:5], [(f'<span class="m">facts.us</span>', "SEC", '<span class="m dim">facts-sync</span>', e(t["rows_b"][0][3]), f'<span class="chip err">{e(t["st_fail"])}</span>')])}</section>
<section class="card"><h2 class="h2">{e(t["b_h"])}</h2><div class="note">{e(t["st_empty"])}</div></section>
<section class="card" role="status" aria-busy="true"><span class="tiny">{e(t["st_load"])}</span><div class="sk" style="width:40%;height:20px"></div><div class="sk" style="height:36px"></div><div class="sk" style="height:36px"></div></section>
</div>''')
    body = f'<div class="oa" style="width:1440px;min-height:760px;box-sizing:border-box;padding:24px;display:flex;gap:24px">{"".join(cols)}</div>'
    return head(T["zh"], "数据源 状态", 1440, 760, body)

os.makedirs(OUT, exist_ok=True)
files = {"Adm-Sources.dc.html": desktop("zh"), "Adm-Sources-en.dc.html": desktop("en"), "M-Adm-Sources.dc.html": mobile("zh"), "M-Adm-Sources-en.dc.html": mobile("en"), "Adm-Sources-States.dc.html": states()}
for n, s in files.items():
    open(os.path.join(OUT, n), "w", encoding="utf-8").write(s)
    print(n, len(s))
