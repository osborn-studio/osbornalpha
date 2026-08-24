from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
from textwrap import dedent

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


def file_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


TODAY = dt.date.today().isoformat()

SOURCE_ITEMS = [
    {
        "id": "micron2026q3-deck",
        "title": "Micron Fiscal Q3 2026 Earnings Deck",
        "source_type": "investor_presentation",
        "url": "https://investors.micron.com/static-files/2354ecda-77a0-4ddd-8462-a631eb491356",
        "local_path": "sources/01_investor_presentation_q3_2026.pdf",
    },
    {
        "id": "micron2026q3-remarks",
        "title": "Micron Fiscal Q3 2026 Earnings Call Prepared Remarks",
        "source_type": "prepared_remarks",
        "url": "https://investors.micron.com/static-files/631b1a32-5537-46ae-8f40-82e42fc79dfe",
        "local_path": "sources/02_prepared_remarks_q3_2026.pdf",
    },
    {
        "id": "micron2026q3-release",
        "title": "Micron Reports Record Results for the Third Quarter of Fiscal 2026",
        "source_type": "earnings_release",
        "url": "https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-record-results-third-quarter",
        "local_path": "sources/03_press_release_q3_2026.html",
    },
    {
        "id": "micron2026q3-call-event",
        "title": "Micron Third Quarter 2026 Financial Call Event Page",
        "source_type": "event_page",
        "url": "https://investors.micron.com/events/event-details/microns-third-quarter-2026-financial-call",
        "local_path": "sources/04_financial_call_event_q3_2026.html",
    },
    {
        "id": "micron2026q3-10q-todo",
        "title": "Micron FY2026 Q3 Form 10-Q",
        "source_type": "10q",
        "url": "",
        "status": "todo",
        "retrieval_error": "Micron Quarterly Results page did not list a Q3 2026 Form 10-Q at collection time.",
    },
    {
        "id": "micron2026q3-transcript-todo",
        "title": "Micron FY2026 Q3 Full Earnings Call Transcript",
        "source_type": "transcript",
        "url": "",
        "status": "todo",
        "retrieval_error": "Full third-party transcript not captured yet; official prepared remarks and event page are included.",
    },
]


def references() -> list[dict]:
    out = []
    for item in SOURCE_ITEMS:
        ref = {
            "id": item["id"],
            "company": "Micron Technology",
            "ticker": "MU",
            "fiscal_period": "FY2026 Q3",
            "title": item["title"],
            "source_type": item["source_type"],
            "url": item.get("url", ""),
            "accessed": TODAY,
            "language": "en",
            "rights": "Official public-company material unless otherwise noted; confirm rights before redistribution.",
            "status": item.get("status", "downloaded"),
        }
        if "local_path" in item:
            ref["local_path"] = item["local_path"]
            ref["sha256"] = file_sha(ROOT / item["local_path"])
        if "retrieval_error" in item:
            ref["retrieval_error"] = item["retrieval_error"]
        out.append(ref)
    return out


def frontmatter(chapter_id: str, title: str, source_refs: list[str], status: str = "v0.1") -> str:
    return dedent(
        f"""\
        ---
        chapter_id: "{chapter_id}"
        title: "{title}"
        ticker: "MU"
        company: "Micron Technology"
        fiscal_period: "FY2026 Q3"
        source_refs: {json.dumps(source_refs)}
        update_status: "{status}"
        last_updated: "{TODAY}"
        next_refresh: "Refresh when Form 10-Q, full transcript, interviews, or sell-side revisions are added."
        depends_on: []
        ---
        """
    )


def quote_block(original: str, translation: str, why: str, implication: str, source: str) -> str:
    return dedent(
        f"""\
        **Original English**

        > {original}

        **中文翻译**

        {translation}

        **Why it matters**

        {why}

        **Investment implication**

        {implication}

        Source: `{source}`
        """
    )


chapters: list[tuple[str, str, str]] = []

chapters.append(
    (
        "01_Executive_Summary.md",
        "Executive Summary",
        frontmatter("01_executive_summary", "Executive Summary", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"])
        + dedent(
            """\
            # Executive Summary

            ## 一句话结论

            Micron FY2026 Q3 不是普通的周期上行季度，而是管理层用极端强劲的收入、毛利率、自由现金流和战略客户协议（SCA）向市场宣告：AI 时代的内存供需正在从传统 commodity cycle 进入“长期供应权 + 定价可见性 + 客户预付款”的新商业模式。

            ## Why did the stock move?

            股价反应的核心不是单季 beat，而是三件事同时发生：

            1. **Q3 全面高于指引上沿**：Revenue $41.46B，Non-GAAP gross margin 84.9%，Non-GAAP EPS $25.11。
            2. **Q4 指引继续上修到历史级别**：Revenue $50.0B ± $1.0B，gross margin approximately 86.0%，EPS $31.00 ± $1.00。
            3. **SCA 把“周期股估值”问题重新打开**：16 个已签战略客户协议，14 个 SCA 的最低合同收入约 $100B，相关现金 deposits/commitments 预计 $22B。

            """
        )
        + quote_block(
            "Micron’s record fiscal Q3 financial results and even stronger outlook for Q4 reflect the strategic value of memory in the AI era.",
            "Micron 创纪录的 FY2026 Q3 财务结果以及更强的 Q4 展望，反映了 AI 时代内存的战略价值。",
            "这句话把单季业绩和产业结构变化绑定在一起。管理层不是说“价格涨了一个季度”，而是说 memory 的角色被 AI 重定价。",
            "如果市场接受这个叙事，Micron 的估值框架会从低倍数周期股向更高可见性的 AI 基础设施供应商迁移；如果不接受，当前超高毛利会被视为周期顶部。",
            "micron2026q3-release",
        )
        + dedent(
            """\

            ## What surprised Wall Street?

            **第一，规模。** Q3 revenue $41.46B，相比 Q2 的 $23.86B 环比增长 74%，相比去年同期 $9.30B 同比增长 346%。这种体量已经不是“复苏”，而是 AI 内存短缺下的价格与 mix 共振。

            **第二，毛利率。** Non-GAAP gross margin 84.9%，环比提升 10 个百分点。这个水平远高于历史内存周期中投资人熟悉的 peak margin 想象。

            **第三，合约化。** SCA 的 take-or-pay、floor/ceiling price、customer deposits 让客户行为从 spot procurement 走向 strategic capacity reservation。

            ## What changed compared to last quarter?

            - Q2 管理层说 Q3 会创纪录；Q3 实际交付进一步超过高端指引。
            - Q2 的主线是 AI demand + tight supply；Q3 新增主线是 SCA 商业模式转型。
            - Q2 的客户承诺还主要是方向性叙事；Q3 披露了 16 个已签协议、约 $100B RPO/minimum revenue、$22B deposits/commitments。

            ## Single biggest takeaway

            最大投资含义：**Micron 正试图把 DRAM/NAND 从“价格周期”卖成“AI 供应权”。** 这能否持续，取决于 AI demand 是否真的穿越 2027、以及 2028 后 greenfield supply 是否仍无法追上需求。
            """
        ),
    )
)

chapters.append(
    (
        "02_Investment_Thesis.md",
        "Investment Thesis",
        frontmatter("02_investment_thesis", "Investment Thesis", ["micron2026q3-remarks", "micron2026q3-deck"])
        + dedent(
            """\
            # Investment Thesis

            ## Bull Case

            牛市情景下，Micron 的核心逻辑是：

            - AI infrastructure 把 memory bandwidth、capacity、latency、power 变成系统性能瓶颈。
            - HBM、server DRAM、data center SSD 同时进入高价值 mix。
            - Greenfield fab、EUV、先进封装、HBM trade ratio 共同限制有效供给。
            - SCA 让客户为未来供应确定性付出长期承诺，降低 Micron 收入/现金流的周期性。

            """
        )
        + quote_block(
            "DRAM and NAND industry demand continues to significantly exceed industry supply. We expect tight conditions to persist beyond calendar 2027 as a result of AI-driven demand across all segments coupled with structural supply constraints.",
            "DRAM 和 NAND 的行业需求继续显著超过行业供给。由于各终端领域的 AI 驱动需求叠加结构性供给约束，公司预计紧张状态将持续到 2027 年之后。",
            "这给投资人一个明确时间框架：不是一个季度 tight，而是至少跨越 2027 的 tight。",
            "Bull case 会把 FY2026 的高毛利外推得更久；bear case 则会质疑 2028 后供给扩张和需求弹性。",
            "micron2026q3-remarks",
        )
        + dedent(
            """\

            ## Base Case

            基准情景下，FY2026 Q4 继续创纪录，FY2027 仍受 tight supply 支撑，但价格涨幅开始边际放缓。管理层已经提示 Q4 gross margin outlook reflects a meaningful moderation in the rate of price increases，这意味着投资人要从“涨价速度”转向“高价持续时间”。

            ## Bear Case

            熊市情景集中在四点：

            1. AI capex 预期过热，最终客户削减订单。
            2. SCA 的 floor/ceiling 结构限制了上行弹性，且 deposits 未来要返还客户。
            3. FY2027 capex 大幅上升，市场提前担心 2028+ 供给过剩。
            4. 贸易/地缘因素未纳入指引，可能改变客户、供应链或成本结构。

            ## Valuation Frame

            本报告 v0.1 暂不做目标价，因为尚未纳入完整 sell-side revisions 和 Form 10-Q。建议估值框架分三层：

            - **Cycle P/E**：把 FY2026/FY2027 EPS 视为周期峰值，给低倍数。
            - **Structural AI supplier P/E**：若 SCA 提升可见性，可给高于传统 memory 周期的倍数。
            - **FCF yield / capital return**：若 free cash flow 持续并加大回购/分红，市场可能用现金回报重估。
            """
        ),
    )
)

chapters.append(
    (
        "03_Earnings_Release.md",
        "Official Earnings Release",
        frontmatter("03_earnings_release", "Official Earnings Release", ["micron2026q3-release"])
        + dedent(
            """\
            # Official Earnings Release

            ## Core Numbers

            | Metric | FY2026 Q3 | FY2026 Q2 | FY2025 Q3 | Interpretation |
            |---|---:|---:|---:|---|
            | Revenue | $41.46B | $23.86B | $9.30B | 环比 +74%，同比 +346%，AI 内存价格/mix 爆发 |
            | GAAP net income | $28.74B | $13.81B | $1.89B | 经营杠杆极强 |
            | Non-GAAP EPS | $25.11 | $12.21 | $1.91 | 环比 +106% |
            | Operating cash flow | $25.4B | n/a | n/a | 单季现金生成能力重写历史 |
            | Free cash flow | $18.3B | n/a | n/a | capex 后仍极强 |

            """
        )
        + quote_block(
            "Revenue of $41.46 billion versus $23.86 billion for the prior quarter and $9.30 billion for the same period last year",
            "收入为 414.6 亿美元，上季度为 238.6 亿美元，去年同期为 93.0 亿美元。",
            "这是本季最重要的 headline：收入规模在一个季度内增加 $17.6B。",
            "投资人要判断这是否是 supply shortage 下的暂时 ASP spike，还是 AI demand 驱动的新 run-rate。",
            "micron2026q3-release",
        )
        + quote_block(
            "The following table presents Micron’s guidance for the fourth quarter of 2026",
            "下表展示 Micron 对 2026 财年第四季度的指引。",
            "Q4 指引是股价反应的第二驱动：市场买的是下一季继续加速，而非仅看 Q3 beat。",
            "Q4 revenue $50B 和 EPS $31 使 FY2026 exit run-rate 极高，也会拉高 FY2027 consensus。",
            "micron2026q3-release",
        )
        + dedent(
            """\

            ## Product Highlights

            - HBM4 已在 lead customer's platform high-volume shipments。
            - HBM4E 基于 1-gamma DRAM，预计 calendar 2027 volume production。
            - 256GB DDR5 RDIMM qualification samples 已交付关键 server ecosystem enablers。
            - Data center SSD 与 G9 NAND 继续推进。

            ## Investment Reading

            Earnings release 的关键词不是单独的 HBM，而是“全栈 tight”：DRAM、NAND、data center SSD、mobile/client、auto/embedded 都受益。市场通常担心内存公司一个产品线强、另一个产品线拖累；这次披露显示 NAND ASP 环比 mid-80s% 上升，比 DRAM 还强。
            """
        ),
    )
)

chapters.append(
    (
        "04_Prepared_Remarks.md",
        "Prepared Remarks",
        frontmatter("04_prepared_remarks", "Prepared Remarks", ["micron2026q3-remarks"])
        + dedent(
            """\
            # Prepared Remarks

            ## Management Narrative

            Sanjay 的叙事分三段：

            1. AI 让 memory 从 commodity component 变成 strategic asset。
            2. Supply 受 greenfield fab、cleanroom、EUV、HBM trade ratio、advanced packaging 约束。
            3. Customers 为长期供应安全签 SCA，Micron 商业模式变得更可预测。

            """
        )
        + quote_block(
            "AI system performance is architecturally dependent on memory subsystem performance and capacity.",
            "AI 系统性能在架构上依赖内存子系统的性能和容量。",
            "这句话直接解释为什么 AI capex 不只利好 GPU，也利好 HBM、server DRAM 和 SSD。",
            "Micron 的长期投资故事不再只是卖更多 bits，而是卖系统级瓶颈资源。",
            "micron2026q3-remarks",
        )
        + quote_block(
            "These SCAs are structured as take-or-pay agreements, with binding commitments to purchase specific volumes over this multi-year term.",
            "这些战略客户协议采用 take-or-pay 结构，客户在多年期限内对特定采购量有绑定承诺。",
            "Take-or-pay 是本季最重要的新商业条款，意味着客户承担一部分供应安全成本。",
            "这可能降低 revenue volatility，提高经营可见性，但也需要关注 price ceiling 对上行的限制。",
            "micron2026q3-remarks",
        )
        + quote_block(
            "For our SCAs with price bands, the floor price enables a very robust gross margin for Micron, well above our peak quarterly margins in any past cycle.",
            "对于带价格区间的 SCA，floor price 使 Micron 获得非常强劲的毛利率，远高于过去任何周期的季度峰值毛利率。",
            "管理层明确说 floor price 本身就能支撑高于历史 peak 的 margin，这是估值重估的关键证据。",
            "若投资人相信合同可执行且客户需求持续，Micron 的 trough earnings 可能被上修。",
            "micron2026q3-remarks",
        ),
    )
)

chapters.append(
    (
        "05_Earnings_Call.md",
        "Earnings Call",
        frontmatter("05_earnings_call", "Earnings Call", ["micron2026q3-remarks", "micron2026q3-call-event"], "partial")
        + dedent(
            """\
            # Earnings Call

            ## Status

            v0.1 已收录官方 prepared remarks 和财报电话会事件页。完整 Q&A transcript 尚未纳入，原因是 collection time 未取得可验证的完整官方 transcript。后续应补充 Quartr/Yahoo/Morningstar/FactSet/AlphaSense 等 lawful source，并更新 `references.json`。

            ## Call Structure Captured

            - Satya Kumar: opening, safe harbor, non-GAAP reconciliation notice。
            - Sanjay Mehrotra: industry transformation, SCA, technology/product leadership, end markets, supply outlook。
            - Mark Murphy: financial results, SCA RPO/deposits, revenue by technology/business unit, gross margin, EPS, cash flow, balance sheet, guidance。
            - Q&A: pending full transcript.

            ## What the call was really about

            管理层不是只解释 Q3，而是在重塑 Micron 的投资者教育：

            - Memory is strategic infrastructure, not just cyclical inventory.
            - Customers now sign long-term supply contracts.
            - Supply cannot respond quickly because leading-edge memory and advanced packaging are bottlenecked.
            - High margins may persist because floor prices are above prior-cycle peak margins.
            """
        ),
    )
)

chapters.append(
    (
        "06_QA.md",
        "Q&A By Topic",
        frontmatter("06_qa", "Q&A By Topic", ["micron2026q3-remarks"], "pending-transcript")
        + dedent(
            """\
            # Q&A By Topic

            ## Status

            Full Q&A transcript not yet captured. This chapter is structured for incremental update once transcript arrives.

            ## Expected Investor Question Map

            ### HBM

            Investors will ask whether HBM4 revenue over $1B reflects one customer or broadening demand, and whether HBM4E changes share dynamics against SK Hynix and Samsung.

            ### AI Capacity

            Investors will ask whether customers are double-ordering or committing real long-term volume. The SCA deposits and take-or-pay terms are the key evidence to test.

            ### Pricing

            Investors will ask if Q4 price-increase moderation signals a peak. Management already guided that Q4 gross margin reflects moderation in the rate of price increases, not necessarily price declines.

            ### CapEx

            Investors will ask whether FY2027 capex above Q4 levels creates future oversupply. Management’s answer is likely to emphasize long lead times, customer commitments, and greenfield constraints.

            ### China / Export Control

            Management explicitly says trade/geopolitical impacts are not included in guidance. This is a risk disclosure gap investors should monitor.
            """
        ),
    )
)

chapters.append(
    (
        "07_CEO_Interviews.md",
        "CEO Interviews",
        frontmatter("07_ceo_interviews", "CEO Interviews", [], "todo")
        + dedent(
            """\
            # CEO Interviews

            No post-earnings CEO interview transcript has been captured in v0.1. The chapter is intentionally left as a source TODO rather than filled with unsourced media paraphrase.

            ## Collection Targets

            - CNBC
            - Bloomberg TV
            - Reuters
            - Yahoo Finance
            - MarketWatch
            - Fox Business
            - Podcasts/webcasts

            ## Update Rule

            Each interview must include original English, Chinese translation, context, and investment implication. Do not summarize from headlines alone.
            """
        ),
    )
)

chapters.append(
    (
        "08_Investor_Presentation.md",
        "Investor Presentation",
        frontmatter("08_investor_presentation", "Investor Presentation", ["micron2026q3-deck"])
        + dedent(
            """\
            # Investor Presentation

            ## Slide-Level Themes

            The Q3 2026 deck is organized around four messages:

            1. Exceptional Q3 results across revenue, gross margin and EPS.
            2. Structural AI demand and constrained memory supply.
            3. Strategic customer agreements as a business-model change.
            4. Q4 guidance extending the record trajectory.

            ## Key Deck Data

            - Revenue: $41.456B.
            - Revenue by technology: DRAM $31.328B / NAND $9.943B.
            - DRAM revenue: +67% Q/Q, +343% Y/Y.
            - NAND revenue: +99% Q/Q, +361% Y/Y.
            - Business units: CMBU $13.769B, CDBU $11.524B, MCBU $11.521B, AEBU $4.634B.
            - FQ4 guidance: revenue $50.0B ± $1.0B; gross margin approximately 86%; EPS $31.00 ± $1.00.

            """
        )
        + quote_block(
            "HBM4 12-high volume ramp is tracking twice as fast as HBM3E 12-high, and we have already shipped over $1 billion in HBM4 revenue.",
            "HBM4 12-high 的量产爬坡速度是 HBM3E 12-high 的两倍，公司已经实现超过 10 亿美元 HBM4 收入。",
            "HBM4 是 Micron 能否在 AI accelerator memory 中持续拿份额的核心证据。",
            "如果 HBM4 ramp 的良率和客户认证继续推进，Micron 的 mix 和毛利率有更强支撑。",
            "micron2026q3-deck",
        ),
    )
)

chapters.append(
    (
        "09_Wall_Street_Research.md",
        "Wall Street Research",
        frontmatter("09_wall_street_research", "Wall Street Research", [], "todo")
        + dedent(
            """\
            # Wall Street Research

            ## Status

            Sell-side reports are not included in v0.1 because no lawful source files were provided. This chapter should be updated only with user-provided reports or licensed data.

            ## Required Table For Next Update

            | Firm | Rating | Target Price | EPS Revision | Revenue Revision | Bull Thesis | Bear Thesis | Key Quote |
            |---|---|---:|---:|---:|---|---|---|
            | Goldman Sachs | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Morgan Stanley | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | JP Morgan | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | UBS | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Citi | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Evercore | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Bernstein | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Mizuho | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Needham | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | KeyBanc | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | TD Cowen | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Bank of America | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
            | Jefferies | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

            ## Initial Expected Revision Direction

            Given Q4 revenue and EPS guidance materially above pre-print consensus reported by financial media, EPS and revenue revisions should be strongly upward. Exact revision numbers require licensed sell-side data.
            """
        ),
    )
)

chapters.append(
    (
        "10_Key_Quotes.md",
        "Key Quotes",
        frontmatter("10_key_quotes", "Key Quotes", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"])
        + dedent(
            """\
            # Key Quotes

            """
        )
        + quote_block(
            "The memory industry has been structurally transformed by the proliferation of AI.",
            "AI 的扩散已经从结构上改变了内存行业。",
            "这是管理层最浓缩的产业判断。",
            "如果这句话被证明正确，市场会降低对传统内存周期均值回归的权重。",
            "micron2026q3-remarks",
        )
        + quote_block(
            "Memory industry supply growth is dependent on significant greenfield fab expansions.",
            "内存行业供给增长依赖重大的 greenfield fab 扩张。",
            "这解释为什么高价格不会迅速带来高供给。",
            "供给反应时间越长，当前高盈利窗口越长。",
            "micron2026q3-remarks",
        )
        + quote_block(
            "We expect FQ4 revenue to be a record $50.0 billion, plus or minus $1.0 billion.",
            "公司预计 FY2026 Q4 收入将达到创纪录的 500 亿美元，上下浮动 10 亿美元。",
            "Q4 指引把 Q3 视为通往更高 run-rate 的中途站，而非终点。",
            "FY2027 consensus 大概率继续上修；风险是市场提前担心 peak earnings。",
            "micron2026q3-remarks",
        ),
    )
)

chapters.append(
    (
        "11_Competitive_Analysis.md",
        "Competitive Analysis",
        frontmatter("11_competitive_analysis", "Competitive Analysis", ["micron2026q3-remarks"])
        + dedent(
            """\
            # Competitive Analysis

            ## Micron vs SK Hynix vs Samsung

            v0.1 只基于 Micron 官方材料，不引入未核验竞争对手数据。竞争比较的可验证起点如下：

            - Micron 强调 HBM4 12-high ramp twice as fast as HBM3E 12-high。
            - Micron 披露已出货超过 $1B HBM4 revenue。
            - Micron 强调 1-gamma DRAM 与 G9 NAND ramp。
            - Micron 的 SCA 涵盖 data center、consumer、auto，试图锁定跨市场长期供应关系。

            ## Where Micron appears strongest

            - U.S. supply plans 对客户有价值，并反映在 SCA 中。
            - Data center revenue annualized run-rate over $100B。
            - Data center SSD revenue exceeded $5B and more than doubled sequentially。

            ## Where more evidence is needed

            - HBM market share by generation.
            - NVIDIA / AMD / Broadcom / cloud ASIC exact customer exposure.
            - SK Hynix and Samsung HBM4E qualification status.
            - Advanced packaging capacity comparison.

            ## Investment Implication

            Micron 正在把竞争优势从“节点/成本”扩展到“客户供应安全”。这比传统 DRAM cycle 更有战略含义，但也更依赖少数大客户和长期 capex execution。
            """
        ),
    )
)

chapters.append(
    (
        "12_My_Analysis.md",
        "My Analysis",
        frontmatter("12_my_analysis", "My Analysis", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck"])
        + dedent(
            """\
            # My Analysis

            ## The real story: memory becomes capacity insurance

            这份财报最重要的变化，是客户开始把 Micron 的产品当成 capacity insurance，而不是普通元器件采购。SCA 的 take-or-pay、floor/ceiling price 和 deposits 共同说明：客户愿意牺牲一部分价格灵活性，换取长期 supply assurance。

            ## What the market may underappreciate

            1. **NAND 也很强。** 市场容易只盯 HBM/DRAM，但 NAND revenue 环比 +99%，ASP mid-80s% 上升，说明 AI context storage、SSD/HDD displacement 也在进入上行周期。
            2. **客户预付款是信号，不是免费现金。** $22B deposits/commitments 证明客户承诺强，但 deposits 未来会返还，应看作供应关系质量证据，而非永久性 cash windfall。
            3. **Q4 price-increase moderation 是关键转折词。** 当价格涨速放慢，市场焦点会切换到 volume、mix、contract durability 和 capex。

            ## The biggest risk

            最大风险不是 Q4，而是市场在 FY2027 中期开始定价 2028 supply response。管理层说 tight beyond calendar 2027，但同时又在加大 greenfield and cleanroom investment。只要投资人开始相信 supply catch-up，估值倍数会先于业绩压缩。

            ## What would make this a ten-star research program

            - 把 Q&A transcript 补齐，按 HBM / SCA / pricing / capex / customer concentration 分类。
            - 接入 sell-side revisions，生成 EPS/revenue revision waterfall。
            - 把 Micron、SK Hynix、Samsung 的 HBM4/HBM4E/advanced packaging timeline 做成季度更新表。
            - 建立 SCA tracker：客户类别、volume coverage、price band、deposit、duration、RPO。
            """
        ),
    )
)

chapters.append(
    (
        "13_Appendix.md",
        "Appendix",
        frontmatter("13_appendix", "Appendix", ["micron2026q3-release", "micron2026q3-remarks", "micron2026q3-deck", "micron2026q3-call-event"])
        + dedent(
            """\
            # Appendix

            ## Source Inventory

            | Source | Status | Local File |
            |---|---|---|
            | Earnings deck | downloaded | `sources/01_investor_presentation_q3_2026.pdf` |
            | Prepared remarks | downloaded | `sources/02_prepared_remarks_q3_2026.pdf` |
            | Press release | downloaded | `sources/03_press_release_q3_2026.html` |
            | Financial call event page | downloaded | `sources/04_financial_call_event_q3_2026.html` |
            | Form 10-Q | TODO | not posted on Micron Quarterly Results page at collection time |
            | Full transcript | TODO | not yet captured |
            | CEO interviews | TODO | not yet captured |
            | Sell-side research | TODO | requires lawful source files |

            ## Incremental Update Plan

            - Add Form 10-Q when posted.
            - Add full call transcript and update Chapters 5-6.
            - Add CEO interviews and update Chapter 7.
            - Add licensed sell-side notes and update Chapter 9.
            - Rebuild PDF from Markdown after every chapter refresh.

            ## Disclaimer

            This research book is based on public sources and is for research workflow development. It is not personalized investment advice or a recommendation to buy or sell securities.
            """
        ),
    )
)


def write_references() -> None:
    REFS.mkdir(parents=True, exist_ok=True)
    refs = references()
    payload = {
        "schema_version": "1.0",
        "company": "Micron Technology",
        "ticker": "MU",
        "fiscal_period": "FY2026 Q3",
        "created": TODAY,
        "updated": TODAY,
        "references": refs,
    }
    (REFS / "references.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bib = []
    for r in refs:
        bib.append(
            "\n".join(
                [
                    f"@misc{{{r['id']},",
                    f"  title = {{{r['title']}}},",
                    "  author = {Micron Technology},",
                    f"  year = {{{TODAY[:4]}}},",
                    f"  url = {{{r['url']}}},",
                    f"  note = {{Accessed {TODAY}; status: {r['status']}; type: {r['source_type']}}}",
                    "}",
                ]
            )
        )
    (REFS / "references.bib").write_text("\n\n".join(bib) + "\n", encoding="utf-8")


def write_chapters() -> str:
    CHAPTERS.mkdir(parents=True, exist_ok=True)
    combined = [
        "# Micron Technology FY2026 Q3 Earnings Deep Research Book",
        "",
        f"Version: 0.1",
        f"Generated: {TODAY}",
        "",
        "Primary language: Chinese. Original English quotations are preserved in quote ledgers.",
        "",
        "> Status: v0.1 readable report. Complete 10-Q, full transcript, CEO interviews and sell-side notes remain incremental update tasks.",
        "",
    ]
    for filename, title, body in chapters:
        (CHAPTERS / filename).write_text(body, encoding="utf-8")
        combined.extend([f"\n\n# {title}\n", body])
    text = "\n".join(combined)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    (EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.1.md").write_text(text, encoding="utf-8")
    return text


def write_readme() -> None:
    ROOT.joinpath("README.md").write_text(
        dedent(
            f"""\
            # Micron Technology FY2026 Q3 Earnings Deep Research Book

            Version: 0.1
            Generated: {TODAY}

            ## Read First

            - Main Markdown: `exports/Micron_FY2026_Q3_Research_Book_v0.1.md`
            - Reading PDF: `exports/Micron_FY2026_Q3_Research_Book_v0.1.pdf`
            - Chapters: `chapters/`
            - Original sources: `sources/`
            - References: `references/references.json`, `references/references.bib`

            ## Current Completeness

            This version includes official earnings release, earnings deck, prepared remarks, and financial call event page. It does not yet include Form 10-Q, full Q&A transcript, CEO interviews, or licensed sell-side research.
            """
        ),
        encoding="utf-8",
    )


def write_pdf(markdown_text: str) -> None:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("CN", parent=styles["BodyText"], fontName="STSong-Light", fontSize=9.5, leading=13)
    h1 = ParagraphStyle("H1CN", parent=styles["Heading1"], fontName="STSong-Light", fontSize=16, leading=20, spaceAfter=8)
    h2 = ParagraphStyle("H2CN", parent=styles["Heading2"], fontName="STSong-Light", fontSize=13, leading=17, spaceBefore=8, spaceAfter=5)
    code = ParagraphStyle("CodeCN", parent=normal, fontName="Courier", fontSize=8, leading=10, leftIndent=12)
    story = []
    for raw in markdown_text.splitlines():
        line = raw.strip()
        if not line or line == "---":
            story.append(Spacer(1, 5))
            continue
        if line.startswith("# "):
            if story:
                story.append(PageBreak())
            story.append(Paragraph(line[2:], h1))
        elif line.startswith("## "):
            story.append(Paragraph(line[3:], h2))
        elif line.startswith("> "):
            story.append(Paragraph(line[2:], code))
        elif line.startswith("|"):
            story.append(Paragraph(line.replace("|", " | "), code))
        elif line.startswith("- "):
            story.append(Paragraph("• " + line[2:], normal))
        else:
            story.append(Paragraph(line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), normal))
    doc = SimpleDocTemplate(str(EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.1.pdf"), pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    doc.build(story)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    write_references()
    md = write_chapters()
    write_readme()
    write_pdf(md)
    print(json.dumps({"status": "ok", "root": str(ROOT), "markdown": str(EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.1.md"), "pdf": str(EXPORTS / "Micron_FY2026_Q3_Research_Book_v0.1.pdf")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
