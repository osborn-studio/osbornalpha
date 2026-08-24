from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics


ROOT = Path("research-books/Micron-Technology-FY2026-Q3-Research")
CHAPTERS = ROOT / "chapters"
SOURCES = ROOT / "sources"
REFS = ROOT / "references"
EXPORTS = ROOT / "exports"
TODAY = dt.date.today().isoformat()


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


SOURCES_DATA = [
    ("micron2026q3-deck", "Micron Fiscal Q3 2026 Earnings Deck", "investor_presentation", "https://investors.micron.com/static-files/2354ecda-77a0-4ddd-8462-a631eb491356", "sources/01_investor_presentation_q3_2026.pdf"),
    ("micron2026q3-remarks", "Micron Fiscal Q3 2026 Earnings Call Prepared Remarks", "prepared_remarks", "https://investors.micron.com/static-files/631b1a32-5537-46ae-8f40-82e42fc79dfe", "sources/02_prepared_remarks_q3_2026.pdf"),
    ("micron2026q3-release", "Micron Reports Record Results for the Third Quarter of Fiscal 2026", "earnings_release", "https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-record-results-third-quarter", "sources/03_press_release_q3_2026.html"),
    ("micron2026q3-call-event", "Micron Third Quarter 2026 Financial Call Event Page", "event_page", "https://investors.micron.com/events/event-details/microns-third-quarter-2026-financial-call", "sources/04_financial_call_event_q3_2026.html"),
]

TODO_SOURCES = [
    ("micron2026q3-10q-todo", "Micron FY2026 Q3 Form 10-Q", "10q", "Micron Quarterly Results page did not list a Q3 2026 Form 10-Q at collection time."),
    ("micron2026q3-transcript-todo", "Micron FY2026 Q3 Full Earnings Call Transcript", "transcript", "Full Q&A transcript not captured yet; official prepared remarks and event page are included."),
    ("micron2026q3-sellside-todo", "Licensed Sell-Side Research Pack", "sell_side", "No lawful sell-side report files were provided for v0.2."),
    ("micron2026q3-interviews-todo", "Post-Earnings CEO/CFO Interviews", "interview", "No verified post-earnings interview transcript was captured for v0.2."),
]

METRICS = {
    "revenue": "$41.456B",
    "qoq_revenue": "+74%",
    "yoy_revenue": "+346%",
    "gaap_gm": "84.6%",
    "nongAAP_gm": "84.9%",
    "nongAAP_eps": "$25.11",
    "fcf": "$18.304B",
    "cash": "$30.155B",
    "net_cash": "$24.433B",
    "q4_revenue": "$50.0B +/- $1.0B",
    "q4_gm": "approximately 86%",
    "q4_eps": "$31.00 +/- $1.00",
    "q4_capex": "around $10B",
    "fy26_capex": "approximately $27B",
}


def fm(chapter_id: str, title: str, refs: list[str], status: str = "v0.2-full-readable") -> str:
    return (
        "---\n"
        f'chapter_id: "{chapter_id}"\n'
        f'title: "{title}"\n'
        'ticker: "MU"\n'
        'company: "Micron Technology"\n'
        'fiscal_period: "FY2026 Q3"\n'
        f"source_refs: {json.dumps(refs)}\n"
        f'update_status: "{status}"\n'
        f'last_updated: "{TODAY}"\n'
        'next_refresh: "Refresh when Form 10-Q, full transcript, interviews, or licensed sell-side revisions are added."\n'
        "depends_on: []\n"
        "---\n\n"
    )


def q(original: str, translation: str, why: str, implication: str, source: str) -> str:
    return (
        "**Original English**\n\n"
        f"> {original}\n\n"
        "**中文翻译**\n\n"
        f"{translation}\n\n"
        "**Why it matters**\n\n"
        f"{why}\n\n"
        "**Investment implication**\n\n"
        f"{implication}\n\n"
        f"Source: `{source}`\n\n"
    )


def table(headers: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    out.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(out) + "\n\n"


def repeated_lens(title: str, items: list[tuple[str, str, str]]) -> str:
    out = [f"## {title}\n"]
    for name, read, risk in items:
        out.append(f"### {name}\n")
        out.append(f"**What it says:** {read}\n\n")
        out.append(f"**What can go wrong:** {risk}\n\n")
        out.append("**Investor test:** 后续季度应把这个点转化为可观测指标：收入增速、ASP、bit shipment、margin、capex、customer commitments 或库存天数，而不是停留在叙事层。\n\n")
    return "".join(out)


def make_chapters() -> list[tuple[str, str, str]]:
    c = []

    c.append(("01_Executive_Summary.md", "Executive Summary", fm("01_executive_summary", "Executive Summary", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"]) + f"""# Executive Summary

## 一句话结论

Micron FY2026 Q3 是一份“财务结果 + 商业模式重定价”同时发生的财报。单季数字已经足够夸张：收入 {METRICS['revenue']}，环比 {METRICS['qoq_revenue']}，同比 {METRICS['yoy_revenue']}；non-GAAP gross margin {METRICS['nongAAP_gm']}；non-GAAP EPS {METRICS['nongAAP_eps']}；adjusted free cash flow {METRICS['fcf']}。但真正让报告重要的不是单季盈利，而是管理层披露的 strategic customer agreements（SCAs）：16 个已签协议、14 个协议的最低合同收入约 $100B、相关 cash deposits and commitments 预计 $22B。

这意味着 Micron 正在把自己从传统 memory cycle 公司，重新叙述为 AI infrastructure 的 supply assurance provider。客户不只是买 DRAM/NAND/HBM，而是在锁定未来多年内的 memory access。这个差异非常大：如果市场相信 SCA 可持续，Micron 的 earnings durability、cash flow visibility 和估值倍数都有被重写的空间；如果市场认为这是周期顶部的客户恐慌锁货，那么 FY2026 的数字反而可能被视为 peak earnings。

## What moved the stock

{table(["Driver", "Evidence", "Investment read"], [
["Q3 beat", "Revenue $41.456B; non-GAAP EPS $25.11; gross margin 84.9%", "超出高端指引，说明 ASP/mix/volume 共振强于市场预期"],
["Q4 guide", "Revenue $50.0B +/- $1.0B; EPS $31.00 +/- $1.00", "不是 one-quarter spike，而是 exit-rate 继续上行"],
["SCA model", "16 signed SCAs; ~$100B RPO/minimum revenue on 14 agreements", "客户将 memory supply 视作战略资源"],
["Cash flow", "Operating cash flow $25.388B; adjusted FCF $18.304B", "高毛利转化为现金，支持 capex 和未来 capital return"],
["Supply tightness", "Management expects tight DRAM/NAND conditions beyond calendar 2027", "市场需要重估 high-margin duration"],
])}

## Core quote ledger

{q("strategic value of memory", "内存的战略价值。", "这四个词是本季叙事的中心：memory 不再只是周期性 commodity input。", "若这个定位成立，Micron 的估值框架会从低倍数周期股向 AI 基础设施供应商迁移。", "micron2026q3-release")}

{q("fundamentally transform our business model", "从根本上改变我们的商业模式。", "管理层把 SCA 定义为商业模式变化，而不是普通长期供货合同。", "估值上应单独拆出 SCA 覆盖收入、floor price、deposit 和 duration。", "micron2026q3-remarks")}

{q("tight conditions to persist beyond calendar 2027", "紧张状态将持续到 2027 年之后。", "管理层给了 supply-demand tightness 的明确时间窗口。", "关键不是 Q3 是否强，而是 FY2027/FY2028 之前 margin 是否仍能维持高位。", "micron2026q3-remarks")}

## Four answers investors needed

### Why did the stock move?

因为 Micron 同时给了 **过去交付**（Q3 record）、**未来加速**（Q4 guide）、**商业模式升级**（SCA）、**供给无法快速响应**（greenfield/cleanroom/HBM trade ratio）四个信号。任何一个单独存在都可能被视为周期噪音，四个同时出现则使市场不得不重开 earnings power。

### What surprised Wall Street?

最意外的是毛利率和 SCA 披露。传统 memory 公司高盈利通常被折价，因为投资人预期价格上涨会引发供给扩张、客户需求破坏和库存修正。但这次管理层强调 floor price 能支持高于历史 peak 的 gross margin，并且有客户 deposits。也就是说，客户在财务上参与了 Micron 的 capacity assurance。

### What changed compared with last quarter?

上一季度的故事是“AI demand 让 Q3 会创纪录”。本季度的故事是“AI demand 已经强到客户愿意签多年 take-or-pay contract”。这是从 demand signal 到 contract evidence 的变化。

### Biggest investment takeaway

Micron 的关键问题从“下季度 ASP 涨多少”变成“未来三到五年有多少收入被 SCA 锁定、锁定价格下的毛利率有多高、capex 是否能以不毁掉回报率的方式扩张”。这就是本报告的主线。
"""))

    c.append(("02_Investment_Thesis.md", "Investment Thesis", fm("02_investment_thesis", "Investment Thesis", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"]) + f"""# Investment Thesis

## Thesis map

Micron 的投资逻辑可以拆成三层：第一层是 AI 数据中心对 HBM/server DRAM/data center SSD 的需求；第二层是供给端无法快速扩张，导致 DRAM 和 NAND tightness 延长；第三层是 SCA 将一部分未来需求合同化，从而改变 earnings visibility。

{table(["Layer", "Core evidence", "What to watch"], [
["Demand", "Data center revenue exceeded $25B in FQ3; data center SSD revenue exceeded $5B", "Cloud capex、AI accelerator units、agentic AI storage demand"],
["Supply", "Greenfield fab/cleanroom/EUV/HBM trade ratio constraints", "2027-2028 wafer starts、advanced packaging capacity、NAND-to-DRAM cleanroom shifts"],
["Contracting", "16 SCAs; take-or-pay; floor/ceiling price; customer deposits", "SCA coverage as % of revenue、RPO、deposit balance、renewal terms"],
["Financials", "84.9% non-GAAP GM; 81.2% operating margin; $18.3B FCF", "Price moderation、capex inflation、capital return timing"],
])}

## Bull case

Bull case 的核心是：AI demand 不是一个产品周期，而是一个 infrastructure regime change。GPU、ASIC、CPU 供应商可以多元化，但 memory subsystem 的 bandwidth、capacity、latency 和 power 都会成为系统性能瓶颈。Micron 在 HBM4、1-gamma DRAM、G9 NAND、data center SSD 和 advanced packaging 上都能受益。

{q("AI has elevated the value of memory", "AI 提升了内存的价值。", "这是最简洁的 bull case。", "如果 memory value uplift 是结构性的，Micron 的 peak margin 不能用过去周期均值简单压回。", "micron2026q3-remarks")}

Bull case 下，SCA 不只是供应合同，而是客户对 Micron capacity 的战略认购。客户愿意做 deposits，是因为缺货损失大于价格锁定成本。长期看，这会提高 Micron 的 capex confidence，并把收入波动从 spot market 转向 contracted demand。

## Base case

Base case 认为 FY2026 Q4 和 FY2027 上半年仍强，但价格涨幅边际放缓。管理层已经明确说 Q4 gross margin outlook reflects moderation in price increases。也就是说，市场应该从“价格是否继续暴涨”切换到“高价格能维持多久”。这个 base case 下，Micron 仍能产生强自由现金流，但估值倍数不会完全摆脱周期股折价。

## Bear case

Bear case 不是 Q3 数字造假，而是未来外推错误。风险包括：AI capex 过热后回调、客户以 SCA 锁定短缺时期供应但未来需求下修、FY2027 capex above Q4 levels 导致 2028 供给压力、地缘贸易风险不在 guidance 内、以及 price ceiling 限制上行。

## Scenario table

{table(["Scenario", "Assumption", "Financial expression", "Stock implication"], [
["Bull", "Tightness extends through 2028; SCA coverage grows to half revenue", "GM remains structurally high; FCF funds capex and returns", "Multiple expands; market treats MU as AI infra supplier"],
["Base", "Tight through 2027; price increases moderate", "Revenue/EPS remain high but decelerate", "Stock follows earnings revisions but retains cycle discount"],
["Bear", "Demand normalizes before supply additions finish", "ASP rolls over; capex still rises", "Peak EPS narrative dominates; multiple compresses"],
])}

## What would change my mind

我会用四个指标更新 thesis：SCA deposit balance 是否如期进入 FQ4 balance sheet；Q4 之后 gross margin 是否接近 86% 仍可维持；FY2027 capex 是否出现 ROI 纪律；full transcript 中管理层是否回避 customer concentration、HBM share 或 price ceiling 的关键问题。
"""))

    c.append(("03_Earnings_Release.md", "Official Earnings Release", fm("03_earnings_release", "Official Earnings Release", ["micron2026q3-release"]) + f"""# Official Earnings Release

## Financial table

{table(["Metric", "FQ3-26", "FQ2-26", "FQ3-25", "Read-through"], [
["Revenue", "$41.456B", "$23.860B", "$9.301B", "5th consecutive record; +74% Q/Q; +346% Y/Y"],
["GAAP gross margin", "84.6%", "74.4%", "37.7%", "Pricing and mix drove extraordinary operating leverage"],
["Non-GAAP gross margin", "84.9%", "74.9%", "39.0%", "Above old-cycle peak framework"],
["GAAP operating income", "$33.318B", "$16.135B", "$2.169B", "80.4% operating margin"],
["Non-GAAP operating income", "$33.681B", "$16.455B", "$2.490B", "81.2% operating margin"],
["GAAP EPS", "$24.67", "$12.07", "$1.68", "Explosive earnings power"],
["Non-GAAP EPS", "$25.11", "$12.20", "$1.91", "+106% Q/Q"],
["Operating cash flow", "$25.388B", "$11.903B", "$4.609B", "Cash conversion confirms quality of earnings"],
["Adjusted FCF", "$18.304B", "$6.899B", "$1.949B", "Capex-heavy but still exceptional FCF"],
])}

{q("Revenue of $41.46 billion", "收入 414.6 亿美元。", "这是 headline metric，也是后续所有 operating leverage 的基数。", "市场会用这个数字重估 FY2027 run-rate，但也会担心是否已接近 cycle peak。", "micron2026q3-release")}

{q("Non-GAAP net income of $28.86 billion", "Non-GAAP 净利润 288.6 亿美元。", "利润规模已经接近很多大型平台公司的季度利润级别。", "如果这种利润是周期性的，低倍数合理；如果被 SCA 稳定化，估值应上调。", "micron2026q3-release")}

## Business-unit table

{table(["Business unit", "FQ3-26 revenue", "Q/Q", "Y/Y", "Gross margin", "Interpretation"], [
["Cloud Memory (CMBU)", "$13.769B", "+78%", "+307%", "83%", "Cloud memory demand and pricing both strong"],
["Core Data Center (CDBU)", "$11.524B", "+103%", "+653%", "87%", "Fastest growth; strongest data center operating leverage"],
["Mobile and Client (MCBU)", "$11.521B", "+49%", "+254%", "87%", "Not just data center; pricing power reaches edge devices"],
["Automotive and Embedded (AEBU)", "$4.634B", "+71%", "+311%", "79%", "Auto/industrial also benefits from supply tightness"],
])}

## Product highlights translated into investment signals

HBM4 high-volume shipments tell us Micron is not only talking about AI, it is shipping into a lead customer platform. HBM4E development on 1-gamma DRAM with expected calendar 2027 volume production matters because it sets up the next generation of AI accelerator memory competition. 256GB DDR5 RDIMMs and data center SSD milestones broaden the AI thesis beyond HBM.

{q("HBM4... high-volume shipments", "HBM4 已经进入高量出货。", "HBM is the flagship AI memory product investors watch most closely.", "HBM4 ramp quality will influence Micron's AI multiple and competitive perception.", "micron2026q3-release")}

{q("245TB QLC SSD", "245TB QLC SSD。", "This shows storage density is part of the AI infrastructure story.", "NAND upside can be tied to AI context storage and HDD displacement, not only consumer cycles.", "micron2026q3-release")}

## Outlook interpretation

Q4 guide is the bridge from “great quarter” to “new earnings run-rate.” Revenue guidance of {METRICS['q4_revenue']} and EPS guidance of {METRICS['q4_eps']} imply continued acceleration. Gross margin guide of {METRICS['q4_gm']} is especially important because it comes after a quarter at 84.9%, suggesting margin can move higher even as management notes price-increase moderation.
"""))

    c.append(("04_Prepared_Remarks.md", "Prepared Remarks", fm("04_prepared_remarks", "Prepared Remarks", ["micron2026q3-remarks"]) + """# Prepared Remarks

## Structure of the remarks

The prepared remarks are not a conventional quarter recap. They are an investor-education document about a new memory regime. Sanjay frames the industry; Mark quantifies the contract and financial effects; Sanjay closes by tying AI, customers, suppliers and SCAs into one business-model narrative.

## Sanjay: industry transformation

Sanjay's opening claim is that AI changes both demand and the strategic role of memory. He links data center growth, smartphones, PCs, consumer devices, auto, industrial and robotics into one broad demand map. This matters because it reduces the risk that Micron's quarter is only a GPU/HBM phenomenon.

""" + q("structurally transformed by the proliferation of AI", "被 AI 的扩散结构性改变。", "Management uses structural language, not cyclical language.", "The market must decide whether to underwrite higher through-cycle earnings.", "micron2026q3-remarks") + """
## Supply constraints

The supply discussion is the most important part of the call. Micron says memory supply growth depends on greenfield fabs, cleanroom additions, skilled labor, regulations, power infrastructure and more complex nodes. HBM also consumes more wafer capacity per bit, pressuring non-HBM supply. In NAND, cleanroom conversion from NAND to DRAM constrains NAND bit growth.

""" + q("supply is structurally constrained", "供给增长受到结构性约束。", "This is the core rebuttal to the classic memory-cycle concern that high prices quickly create new supply.", "If supply cannot respond before 2028, high margins can persist longer than a normal upcycle.", "micron2026q3-remarks") + """
## Strategic customer agreements

The SCA section is the quarter's centerpiece. The key points: 16 signed agreements; generally five-year terms for most agreements; automotive generally three years; roughly 20% of DRAM volume and one-third of NAND volume over the period; approximately half or more of company revenue under SCAs when completed; take-or-pay terms; price floors; some price ceilings; approximately $100B of minimum revenue on 14 signed SCAs; $22B projected deposits and commitments.

""" + table(["SCA attribute", "Disclosure", "Why investors care"], [
["Signed agreements", "16", "Enough to call it a program, not a one-off"],
["Volume coverage", "~20% DRAM; ~1/3 NAND", "Meaningful but not total; spot exposure remains"],
["Term", "Generally 5 years; auto 3 years", "Longer than normal memory purchasing cycle"],
["Revenue ambition", "Half or more company revenue under SCAs when complete", "Could change revenue volatility"],
["Minimum revenue", "~$100B on 14 agreements", "Creates floor-like visibility"],
["Deposits/commitments", "$22B projected", "Customer seriousness signal"],
]) + q("take-or-pay agreements", "take-or-pay 协议。", "This term shifts some demand risk and supply assurance cost to customers.", "It supports a higher-quality revenue argument, though contract details still matter.", "micron2026q3-remarks") + """
## Mark: financialization of the new model

Mark turns Sanjay's narrative into accounting and cash-flow metrics. RPO at FQ3 was over $5B, while SCAs signed so far including post-quarter agreements have approximately $100B RPO. He warns RPO is conservative and not total expected revenue, which is important: this means the disclosed number is a floor-like accounting measure, not a ceiling.

The deposit disclosure also needs careful reading. Deposits are strong evidence of customer commitment, but they are financing cash flows and will be returned over time. They do not directly inflate free cash flow. A good report must not mistake deposits for permanent cash earnings.

## Guidance section

The guidance section has three layers: record revenue/EPS, higher capex, and future capital returns. Management guides to around $10B capex in FQ4 and quarterly FY2027 capex above FQ4 levels. This is the main future debate: the same capex that enables long-term demand capture may also trigger investor fear of future oversupply.
"""))

    c.append(("05_Earnings_Call.md", "Earnings Call", fm("05_earnings_call", "Earnings Call", ["micron2026q3-remarks", "micron2026q3-call-event"], "v0.2-prepared-remarks-complete") + """# Earnings Call

## What is complete in v0.2

This chapter fully analyzes the official prepared remarks and the official call event page. It does not claim to include the complete live Q&A transcript. The transcript is a required next source, but the prepared remarks already contain enough substance to build an institutional investment read.

## Call timeline

1. Satya Kumar opens the call, identifies Sanjay Mehrotra and Mark Murphy, and references the IR site, audio, slides, press release and prepared remarks.
2. Safe-harbor language frames forward-looking statements, non-GAAP presentation, and SEC filing risk references.
3. Sanjay gives the strategic narrative: AI, supply constraints, SCAs, technology leadership, end-market demand, and supply efforts.
4. Mark gives the financial narrative: SCA RPO/deposits, revenue by technology and business unit, margin, opex, EPS, cash flow, balance sheet, guidance and capex.
5. Sanjay closes by returning to AI and SCA-driven durability.

## What management wanted investors to remember

Management wanted the market to remember three numbers and one idea: data center revenue annualized over $100B, 16 SCAs, approximately $100B minimum revenue on 14 SCAs, and the idea that memory is now a strategic asset in AI infrastructure.

""" + repeated_lens("Call themes", [
("AI memory hierarchy", "Management argues AI systems depend on memory bandwidth, capacity, latency and power, creating differentiation opportunities.", "If AI workloads optimize around less memory or customer capex slows, the hierarchy thesis weakens."),
("Supply bottlenecks", "Greenfield fabs, cleanroom needs, EUV, skilled labor, permitting, power and HBM trade ratio constrain supply.", "If competitors add capacity faster than expected, tightness fades."),
("SCA transformation", "Customers sign multi-year take-or-pay contracts with floors/ceilings and deposits.", "If contract terms cap upside or customers renegotiate, quality of revenue is lower."),
("Capex discipline", "Micron says it will remain disciplined while increasing global capacity.", "High capex can destroy returns if demand normalizes."),
]) + """
## Questions the call raises

The call raises questions that require transcript follow-up: Which customers are in the four very large SCA bucket? How much of HBM is covered by SCAs? Are price ceilings close enough to current pricing to cap upside? What happens if customer demand falls below contracted volume? How much FY2027 capex is committed versus flexible? These questions should be the backbone of the next transcript update.
"""))

    c.append(("06_QA.md", "Q&A By Topic", fm("06_qa", "Q&A By Topic", ["micron2026q3-remarks"], "v0.2-question-map-pending-transcript") + """# Q&A By Topic

## Status

Full Q&A transcript is still pending. This chapter is not empty: it maps the questions a serious analyst should ask, management's prepared-answer evidence, and what would count as evasion once transcript is added.

""" + table(["Topic", "Why investors ask", "Prepared-answer evidence", "What management may avoid"], [
["HBM4", "HBM share is the AI memory scorecard", "HBM4 ramp twice as fast as HBM3E; over $1B HBM4 revenue", "Customer concentration and competitive share"],
["SCAs", "Contracts may alter cyclicality", "16 agreements; take-or-pay; floors; deposits", "Exact customer names and termination rights"],
["Pricing", "Margins may be peak", "Q4 GM ~86%; price increase moderation", "How far ASP can fall before floor protects margins"],
["Supply", "High prices invite supply", "Greenfield/cleanroom/EUV/HBM constraints", "Competitor capacity schedules"],
["Capex", "Future oversupply risk", "FQ4 capex ~$10B; FY2027 quarterly capex above FQ4", "Minimum committed capex and ROI hurdle"],
["NAND", "Often ignored versus DRAM/HBM", "NAND revenue +99% Q/Q; ASP mid-80s% Q/Q", "Durability of NAND shortage"],
["Data center SSD", "AI context storage upside", "Data center SSD revenue over $5B", "Sustainability of doubling sequentially"],
["China/export", "Guidance excludes geopolitical developments", "Risk caveat in guidance", "Quantified exposure"],
]) + """
## Model Q&A reconstruction

### HBM and AI customer demand

Investors should push management to explain whether HBM4 demand is broad-based or concentrated. The prepared remarks say qualification samples have shipped to multiple end-customers, but the strongest revenue statement references a lead customer platform. The distinction matters because one platform can create a powerful near-term ramp but a broader customer base supports a higher multiple.

### SCAs and price bands

The most important follow-up question is whether price ceilings cap upside if spot memory pricing continues rising. Management says floor prices are robust and ceiling prices for largest agreements are generally at current CQ2 market price for existing products. This is good for customer planning and Micron downside protection, but it creates a trade-off: stability versus maximum upside.

### Capex and supply response

Analysts should ask how much of FY2027 capex is construction pull-in versus process node transition, and what customer commitments support it. Management says more than half the FY2027 increase is construction capex. That can be bullish if backed by SCAs; bearish if it becomes stranded capacity.

### Geopolitical risk

The prepared remarks explicitly state that trade/geopolitical impacts are not included in guidance. A transcript update should identify whether analysts asked about China restrictions, export controls, tariffs, or customer sourcing requirements.
"""))

    c.append(("07_CEO_Interviews.md", "CEO Interviews", fm("07_ceo_interviews", "CEO Interviews", ["micron2026q3-release", "micron2026q3-call-event"], "v0.2-source-gap-analysis") + """# CEO Interviews

## Source status

No verified post-earnings CEO interview transcript was captured for v0.2. This chapter is therefore a source-gap analysis rather than a blank placeholder. It explains what interview evidence would add beyond the official call.

## What interviews should test

Official remarks are scripted. Interviews matter because anchors and journalists often force simpler answers:

- Is AI memory demand real customer pull or fear-driven double ordering?
- Are customers accepting higher memory prices without slowing deployments?
- Does Micron see HBM4 share gain versus SK Hynix and Samsung?
- How should investors think about customer deposits?
- Are consumer PC/mobile price increases creating demand destruction?

## Interview collection protocol

Each interview should be added with: original English quote, Chinese translation, context, why it matters, investment implication and local source file. Do not add paraphrases from headlines. If CNBC/Bloomberg/Reuters video is used, store transcript or timestamped notes in `sources/`.

## Provisional read

Even without interviews, the CEO message in official materials is clear: AI has elevated memory's value, customers are signing long-term agreements, and Micron is investing aggressively in supply. Interviews would mainly test tone, confidence, and whether management narrows or broadens these claims under questioning.
"""))

    c.append(("08_Investor_Presentation.md", "Investor Presentation", fm("08_investor_presentation", "Investor Presentation", ["micron2026q3-deck"]) + """# Investor Presentation

## Deck message architecture

The deck is a controlled narrative: first AI/supply/SCA, then technology/product leadership, then end markets, then financial results, then guidance and appendix. This ordering matters. Micron chose not to start with the income statement; it started with the strategic value of memory and SCA transformation.

## Slide-by-slide read

""" + table(["Slide area", "Content", "Investment read"], [
["Opening strategic slides", "Records in revenue, GM and EPS; data center revenue >$25B", "Frames Q3 as AI leadership, not ordinary cycle"],
["Industry trends", "AI across data center, PC/mobile, auto, robotics", "Broadens TAM beyond HBM"],
["Supply constraints", "Greenfield fabs, cleanroom, HBM trade ratio, NAND-to-DRAM shifts", "Explains why high prices persist"],
["SCA slides", "16 agreements; take-or-pay; price bands; $100B minimum revenue", "Most important valuation bridge"],
["Technology slides", "1-gamma DRAM, G9 NAND, HBM4 ramp", "Supports differentiation narrative"],
["End markets", "Data center, PC/mobile, auto/robotics", "Shows multi-segment demand"],
["Financial slides", "Revenue, GM, FCF, net cash", "Quantifies operating leverage"],
["Guidance", "$50B revenue; ~86% GM; $31 EPS", "Shows Q3 is not the peak of reported guide"],
]) + q("Revenue up 74% Q/Q", "收入环比增长 74%。", "This captures the scale of the sequential reset.", "Consensus models need to re-anchor on a much higher revenue base.", "micron2026q3-deck") + q("ASPs increased in mid-80s", "NAND ASP 环比上涨 mid-80s%。", "NAND pricing strength is one of the most underappreciated details.", "AI storage and constrained NAND supply may be a second profit engine.", "micron2026q3-deck") + """
## Financial appendix read

The appendix confirms quality of earnings: GAAP net income, non-GAAP net income, adjusted EBITDA and free cash flow all scale with revenue. Net cash of $24.433B also gives Micron room to invest while later increasing capital return after CHIPS agreement restrictions.

## What differs from previous quarter

The prior quarter's investor focus was guidance into Q3. This deck turns Q3 from forecast to proof, then pushes the debate into Q4 and SCA-driven multi-year visibility. The key new slide content is not just higher numbers; it is the explicit SCA economics.
"""))

    c.append(("09_Wall_Street_Research.md", "Wall Street Research", fm("09_wall_street_research", "Wall Street Research", ["micron2026q3-release", "micron2026q3-deck"], "v0.2-no-licensed-sellside") + """# Wall Street Research

## Source status

No licensed sell-side reports were supplied for v0.2, so this chapter does not fabricate Goldman Sachs, Morgan Stanley, JP Morgan or other firm quotes. Instead, it provides the revision framework that should be populated when lawful reports are added.

## What sell-side revisions should focus on

""" + table(["Revision bucket", "Why it moves", "Data needed"], [
["FY2026 Q4 revenue", "Company guided $50B +/- $1B", "Old consensus, new consensus, analyst bridge"],
["FY2027 revenue", "SCA and tightness beyond 2027", "DRAM/NAND/HBM bit and ASP assumptions"],
["Gross margin", "Q4 guide approximately 86%", "Pricing, mix, floor-price assumptions"],
["EPS", "Q4 EPS $31 +/- $1", "Share count, tax, opex, interest income"],
["Capex", "FY2027 quarterly capex above FQ4", "Construction vs equipment split"],
["FCF", "FCF rising despite capex", "Deposit treatment, operating cash flow, government incentives"],
["Valuation multiple", "Business model may be less cyclical", "SCA revenue coverage, contract duration, margin floor"],
]) + """
## Expected bull-side argument

The likely bull-side research argument is that Micron's earnings power is no longer a one-year memory spike. SCA coverage, customer deposits, AI memory hierarchy, and supply constraints support structurally higher margins. Bulls will argue that past-cycle multiples are too punitive because customer commitments reduce future trough risk.

## Expected bear-side argument

The likely bear-side argument is that investors are capitalizing peak profitability. Price ceilings in SCAs may limit upside, deposits are not permanent free cash flow, and capex acceleration may create future supply. Bears will also argue that AI capex expectations are already stretched, so the risk/reward after a massive stock move is asymmetric.

## Firm-by-firm template

""" + table(["Firm", "Rating", "Target", "EPS change", "Revenue change", "Key thesis to capture"], [
["Goldman Sachs", "TODO", "TODO", "TODO", "TODO", "Cycle vs structural re-rating"],
["Morgan Stanley", "TODO", "TODO", "TODO", "TODO", "HBM share and margin durability"],
["JP Morgan", "TODO", "TODO", "TODO", "TODO", "AI server and cloud demand"],
["Bank of America", "TODO", "TODO", "TODO", "TODO", "SCA visibility and capital return"],
["UBS", "TODO", "TODO", "TODO", "TODO", "Memory cycle normalization risk"],
["Evercore", "TODO", "TODO", "TODO", "TODO", "AI infrastructure multiple"],
["Bernstein", "TODO", "TODO", "TODO", "TODO", "Supply elasticity and capex"],
["Mizuho", "TODO", "TODO", "TODO", "TODO", "HBM4/HBM4E product cycle"],
["Needham", "TODO", "TODO", "TODO", "TODO", "Data center SSD/NAND upside"],
["KeyBanc", "TODO", "TODO", "TODO", "TODO", "Channel pricing checks"],
["TD Cowen", "TODO", "TODO", "TODO", "TODO", "Cloud customer capex"],
["Citi", "TODO", "TODO", "TODO", "TODO", "Peak margin risk"],
["Jefferies", "TODO", "TODO", "TODO", "TODO", "Capital return and FCF"],
]) + """
"""))

    c.append(("10_Key_Quotes.md", "Key Quotes", fm("10_key_quotes", "Key Quotes", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"]) + "# Key Quotes\n\n" + q("memory in the AI era", "AI 时代的内存。", "This is the top-level framing.", "If memory is strategic, trough valuation assumptions may be stale.", "micron2026q3-release") + q("supply shortages... considerable time", "供应短缺需要相当长时间改善。", "Customers are being told not to expect quick normalization.", "Supports SCA demand and long tight-cycle duration.", "micron2026q3-remarks") + q("no line of sight", "目前看不到明确时间点。", "Management is saying supply catch-up is not visible.", "Longer high-margin window, but also risk if later contradicted.", "micron2026q3-remarks") + q("strategic asset", "战略资产。", "This changes procurement behavior.", "Customers may contract supply like infrastructure, not components.", "micron2026q3-remarks") + q("five-year term", "五年期限。", "Term length supports multi-year visibility.", "Revenue durability argument strengthens.", "micron2026q3-remarks") + q("floor price", "价格下限。", "Floor price is the economic heart of SCA.", "Protects margins if spot pricing normalizes.", "micron2026q3-remarks") + q("approximately $100 billion", "约 1000 亿美元。", "Magnitude makes SCA material.", "Investors need an SCA revenue model.", "micron2026q3-remarks") + q("cash deposits", "现金保证金。", "Deposits prove customer commitment.", "Strong signal, but not permanent FCF.", "micron2026q3-remarks") + q("HBM4 revenue", "HBM4 收入。", "Direct proof of product ramp.", "Supports AI product mix thesis.", "micron2026q3-deck") + q("return 100% of our excess cash", "返还 100% excess cash。", "Capital return can become a second leg.", "FCF durability matters beyond EPS.", "micron2026q3-remarks") + """
## Quote interpretation matrix

""" + table(["Quote theme", "Management intent", "Investor counter-question"], [
["AI era", "Reframe memory as strategic", "How much is durable versus pull-forward?"],
["Supply shortage", "Explain pricing and SCAs", "When does greenfield capacity arrive?"],
["SCA", "Reduce cyclicality perception", "What are ceilings, floors and cancellation rights?"],
["HBM4", "Show product leadership", "What is share versus SK Hynix/Samsung?"],
["FCF/capital return", "Show earnings quality", "How much cash is needed for capex?"],
]) ))

    c.append(("11_Competitive_Analysis.md", "Competitive Analysis", fm("11_competitive_analysis", "Competitive Analysis", ["micron2026q3-remarks", "micron2026q3-deck"]) + """# Competitive Analysis

## Scope

This chapter uses Micron official materials only. It does not import unverified SK Hynix or Samsung data. The purpose is to identify the competitive claims Micron itself makes and the evidence needed to test them.

## Competitive claim 1: HBM4 ramp

Micron says HBM4 12-high ramp is tracking twice as fast as HBM3E 12-high and that it has shipped over $1B in HBM4 revenue. This is a strong internal execution claim. The competitive question is whether this translates into share gain, second-source qualification, or merely strong demand at one lead customer.

## Competitive claim 2: U.S. supply value

Micron says customers value its U.S. supply plans and that this is reflected in SCAs. This is a strategic differentiator versus Asian competitors if customers are trying to diversify geopolitical and supply-chain risk.

## Competitive claim 3: full portfolio tightness

The quarter is not only HBM. DRAM revenue rose 67% Q/Q; NAND revenue rose 99% Q/Q; CDBU revenue rose 103% Q/Q; MCBU and AEBU also posted record revenue. This suggests Micron is benefiting from broad memory tightness, not a single product pocket.

""" + table(["Axis", "Micron evidence", "Needed competitor evidence"], [
["HBM4", "Over $1B revenue; faster ramp", "SK Hynix/Samsung HBM4 shipment and qualification data"],
["Advanced nodes", "1-gamma DRAM; G9 NAND", "Peer node yield/cost comparisons"],
["Supply geography", "Idaho, New York, Virginia, Taiwan, Japan, Singapore", "Customer preference for geographic diversification"],
["Advanced packaging", "Singapore HBM packaging from 1H CY2027", "Peer packaging capacity timelines"],
["SCA", "16 agreements; deposits", "Whether peers are signing similar contracts"],
]) + """
## Investment conclusion

Micron's competitive story is no longer only cost-per-bit. It is technology roadmap + capacity geography + advanced packaging + customer contracting. That is a more sophisticated moat, but it also requires more execution. A future report should add a competitor dashboard with HBM4/HBM4E timelines, capacity, customer wins, and pricing discipline.
"""))

    c.append(("12_My_Analysis.md", "My Analysis", fm("12_my_analysis", "My Analysis", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"]) + """# My Analysis

## The deepest point

The deepest point in this quarter is that Micron is trying to turn shortage into structure. In a normal cycle, shortage creates high ASPs, which create high margins, which invite supply and eventually collapse margins. Micron's SCA program tries to insert a new layer into that cycle: customers commit to future volumes and economics because memory access is strategically necessary for their AI roadmaps.

## Why this matters for valuation

Valuation is not about whether Q3 was good. It was obviously good. Valuation is about whether the market should capitalize Q3/Q4 earnings as peak, mid-cycle, or structurally recurring. SCA details are the bridge. If half of future revenue becomes covered by multi-year contracts with floor prices above historical peak margins, then trough earnings are higher. If SCAs simply represent customer panic during shortage, the old cycle framework still wins.

## The number I would build the model around

I would not start with EPS. I would start with SCA-covered revenue. Build revenue into three buckets:

1. Contracted SCA revenue with price floors.
2. Non-SCA strategic AI/HBM/data center demand.
3. More cyclical PC/mobile/consumer/auto exposure.

Then assign different margin and multiple assumptions to each bucket. A blended P/E on total EPS hides the real debate.

## The most underappreciated part

NAND. Most investors will focus on HBM and DRAM, but NAND revenue grew 99% Q/Q and NAND ASP increased mid-80s% Q/Q. If AI context storage and SSD displacement become durable, Micron has a second leg beyond HBM. Data center SSD revenue above $5B and more than doubling sequentially is not a footnote.

## The biggest red flag

FY2027 capex. Management is right that supply is constrained and customers need capacity. But investors will remember every memory cycle where high margins financed too much supply. The only way capex is bullish is if it is tightly tied to SCA-backed demand and earns above-cycle returns. Otherwise, the market will discount future oversupply before it appears in revenue.

## Research upgrade checklist

The next version should add: full Q&A transcript, Form 10-Q, customer concentration analysis, peer HBM dashboard, SCA tracker, sell-side revision waterfall, and a scenario valuation model.
"""))

    c.append(("13_Appendix.md", "Appendix", fm("13_appendix", "Appendix", [s[0] for s in SOURCES_DATA]) + """# Appendix

## Source inventory

""" + table(["Source", "Status", "Local file", "Use"], [
["Earnings deck", "downloaded", "`sources/01_investor_presentation_q3_2026.pdf`", "Slides, financial appendix, guidance"],
["Prepared remarks", "downloaded", "`sources/02_prepared_remarks_q3_2026.pdf`", "Management narrative and quotes"],
["Press release", "downloaded", "`sources/03_press_release_q3_2026.html`", "Official results, business units, product highlights"],
["Financial call event page", "downloaded", "`sources/04_financial_call_event_q3_2026.html`", "Call metadata and webcast reference"],
["Form 10-Q", "TODO", "not available in v0.2", "Risk factors, MD&A, balance sheet footnotes"],
["Full transcript", "TODO", "not available in v0.2", "Q&A and analyst pressure test"],
["CEO interviews", "TODO", "not available in v0.2", "Tone and simplified management message"],
["Sell-side reports", "TODO", "not available in v0.2", "EPS/revenue revisions and target price changes"],
]) + """
## Incremental chapter refresh map

""" + table(["When new source arrives", "Chapters to update", "Expected delta"], [
["10-Q posted", "03, 12, 13", "Risk factors, balance sheet, footnotes"],
["Full transcript posted", "05, 06, 10, 12", "Analyst questions, avoided answers, quote ledger"],
["CEO interview captured", "07, 10, 12", "Tone and external messaging"],
["Sell-side pack added", "09, 01, 02, 12", "Revision waterfall, bull/bear spread"],
["Competitor earnings update", "11, 02, 12", "HBM/NAND/DRAM relative positioning"],
]) + """
## Disclaimer

This report is a research workflow artifact based on public-company sources. It is not personalized investment advice, not a recommendation to buy or sell securities, and not a substitute for licensed research, audited filings or professional judgment.
"""))

    return c


def write_references() -> None:
    REFS.mkdir(parents=True, exist_ok=True)
    refs = []
    for ref_id, title, typ, url, local in SOURCES_DATA:
        refs.append({
            "id": ref_id,
            "company": "Micron Technology",
            "ticker": "MU",
            "fiscal_period": "FY2026 Q3",
            "title": title,
            "source_type": typ,
            "url": url,
            "accessed": TODAY,
            "language": "en",
            "rights": "Official public-company material unless otherwise noted; confirm rights before redistribution.",
            "status": "downloaded",
            "local_path": local,
            "sha256": sha(ROOT / local),
        })
    for ref_id, title, typ, err in TODO_SOURCES:
        refs.append({
            "id": ref_id,
            "company": "Micron Technology",
            "ticker": "MU",
            "fiscal_period": "FY2026 Q3",
            "title": title,
            "source_type": typ,
            "url": "",
            "accessed": TODAY,
            "language": "en",
            "rights": "Do not fabricate or redistribute without lawful source access.",
            "status": "todo",
            "retrieval_error": err,
        })
    (REFS / "references.json").write_text(json.dumps({
        "schema_version": "1.0",
        "company": "Micron Technology",
        "ticker": "MU",
        "fiscal_period": "FY2026 Q3",
        "created": TODAY,
        "updated": TODAY,
        "references": refs,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bib = []
    for r in refs:
        bib.append(
            f"@misc{{{r['id']},\n"
            f"  title = {{{r['title']}}},\n"
            "  author = {Micron Technology},\n"
            f"  year = {{{TODAY[:4]}}},\n"
            f"  url = {{{r['url']}}},\n"
            f"  note = {{Accessed {TODAY}; status: {r['status']}; type: {r['source_type']}}}\n"
            "}"
        )
    (REFS / "references.bib").write_text("\n\n".join(bib) + "\n", encoding="utf-8")


def write_pdf(md: str, out: Path) -> None:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("CN", parent=styles["BodyText"], fontName="STSong-Light", fontSize=9.2, leading=12.5)
    h1 = ParagraphStyle("H1CN", parent=styles["Heading1"], fontName="STSong-Light", fontSize=16, leading=20, spaceAfter=8)
    h2 = ParagraphStyle("H2CN", parent=styles["Heading2"], fontName="STSong-Light", fontSize=12.5, leading=16, spaceBefore=7, spaceAfter=5)
    h3 = ParagraphStyle("H3CN", parent=styles["Heading3"], fontName="STSong-Light", fontSize=10.5, leading=14, spaceBefore=5, spaceAfter=3)
    code = ParagraphStyle("Code", parent=normal, fontName="Courier", fontSize=7, leading=9, leftIndent=10)
    story = []
    for raw in md.splitlines():
        line = raw.strip()
        if not line or line == "---":
            story.append(Spacer(1, 4))
        elif line.startswith("# "):
            if story:
                story.append(PageBreak())
            story.append(Paragraph(html.escape(line[2:]), h1))
        elif line.startswith("## "):
            story.append(Paragraph(html.escape(line[3:]), h2))
        elif line.startswith("### "):
            story.append(Paragraph(html.escape(line[4:]), h3))
        elif line.startswith("|") or line.startswith("> "):
            story.append(Paragraph(html.escape(line), code))
        elif line.startswith("- "):
            story.append(Paragraph("• " + html.escape(line[2:]), normal))
        else:
            story.append(Paragraph(html.escape(line), normal))
    SimpleDocTemplate(str(out), pagesize=A4, rightMargin=34, leftMargin=34, topMargin=34, bottomMargin=34).build(story)


def main() -> None:
    CHAPTERS.mkdir(parents=True, exist_ok=True)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    write_references()
    chapters = make_chapters()
    combined = [
        "# Micron Technology FY2026 Q3 Earnings Deep Research Book",
        "",
        "Version: 0.2-full-readable",
        f"Generated: {TODAY}",
        "",
        "Primary language: Chinese. Original English snippets are preserved in quote ledgers. This version is filled with analysis, tables and source-backed interpretation, while explicitly marking genuinely unavailable sources.",
        "",
    ]
    for filename, title, body in chapters:
        (CHAPTERS / filename).write_text(body, encoding="utf-8")
        combined.append(f"\n\n# {title}\n\n{body}")
    md = "\n".join(combined)
    md_path = EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.2_full.md"
    pdf_path = EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.2_full.pdf"
    md_path.write_text(md, encoding="utf-8")
    write_pdf(md, pdf_path)
    (ROOT / "README.md").write_text(
        f"# Micron Technology FY2026 Q3 Earnings Deep Research Book\n\nVersion: 0.2-full-readable\nGenerated: {TODAY}\n\n- Markdown: `exports/{md_path.name}`\n- PDF: `exports/{pdf_path.name}`\n- Chapters: `chapters/`\n- Sources: `sources/`\n- References: `references/references.json`, `references/references.bib`\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": "ok", "markdown": str(md_path), "pdf": str(pdf_path), "chapters": len(chapters)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
