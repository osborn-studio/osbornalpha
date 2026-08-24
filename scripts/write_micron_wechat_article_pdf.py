from __future__ import annotations

import datetime as dt
import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfbase.ttfonts import TTFont


ROOT = Path("research-books/Micron-Technology-FY2026-Q3-Research")
EXPORTS = ROOT / "exports"
TODAY = dt.date.today().isoformat()


ARTICLE = """# Micron 这份财报，真正炸裂的不是利润

## AI 时代，内存从零件变成了战略资源

Micron FY2026 Q3 的数字很夸张：收入 414.6 亿美元，环比增长 74%，同比增长 346%；non-GAAP 毛利率 84.9%；non-GAAP EPS 25.11 美元；自由现金流 183 亿美元。

但如果只看这些数字，反而会错过重点。

这份财报真正重要的地方，是 Micron 在告诉市场：内存不再只是一个周期性零部件，而正在变成 AI 基础设施里的战略资源。

原文里最关键的一句是：

> Micron's record fiscal Q3 financial results and even stronger outlook for Q4 reflect the strategic value of memory in the AI era.

翻译成人话就是：AI 时代，内存的价值被重新定价了。

## 1. 为什么市场会兴奋？

第一，Q3 已经不是普通 beat。

收入从上一季度的 238.6 亿美元跳到 414.6 亿美元，单季多出来 176 亿美元。毛利率 84.9%，经营利润率 81.2%。这不是传统意义上的“复苏”，更像是 AI 需求和供应短缺共同推出来的极端盈利窗口。

第二，Q4 指引还在继续往上。

Micron 给出的 Q4 指引是收入 500 亿美元，上下浮动 10 亿美元；non-GAAP EPS 31 美元，上下浮动 1 美元；毛利率约 86%。也就是说，公司没有把 Q3 描述成高点，而是说下一季还会更高。

第三，也是最重要的：客户开始签长期战略协议。

Micron 披露已经签了 16 个 Strategic Customer Agreements，简称 SCA。这些协议有 take-or-pay 结构，有价格下限，有客户保证金。14 个协议的最低合同收入约 1000 亿美元，相关现金保证金和承诺预计 220 亿美元。

这意味着客户不是在“临时买芯片”，而是在抢未来几年的内存供应权。

## 2. SCA 为什么重要？

传统内存行业最麻烦的问题是周期性。

价格上涨，利润暴涨，然后大家扩产；几年后供应上来，价格下跌，利润崩掉。投资人因此很难给内存公司高估值。

但 SCA 改变了这个故事。

Micron 管理层说：

> These SCAs are structured as take-or-pay agreements.

也就是说，客户承诺未来多年购买特定量的产品。更关键的是：

> The floor price enables a very robust gross margin for Micron.

也就是说，价格下限本身就能支持很强的毛利率。

如果这些协议真的稳定执行，Micron 的一部分收入就不再完全跟着 spot market 上下波动，而是变成更可预测的长期供应合同。

这就是市场重新估值的原因。

## 3. 这不是只有 HBM 的故事

很多人看 Micron 会直接想到 HBM，确实，HBM4 是亮点。公司说 HBM4 12-high 的爬坡速度是 HBM3E 12-high 的两倍，并且 HBM4 收入已经超过 10 亿美元。

但这份财报更有意思的地方是：NAND 也很强。

DRAM 收入 313 亿美元，环比增长 67%；NAND 收入 99 亿美元，环比增长 99%。NAND 的 ASP 环比上涨 mid-80s%，比 DRAM 还猛。

这说明 AI 的影响不只是 HBM。AI 数据中心需要更大的内存、更高带宽，也需要更多 SSD、更多 context storage。Micron 的受益面比“HBM 概念股”更宽。

## 4. 最大的风险是什么？

风险也很清楚：资本开支。

Micron 预计 Q4 capex 约 100 亿美元，FY2026 全年约 270 亿美元，并且 FY2027 每季度 capex 会高于 Q4。

如果 AI 需求继续强，这些投资是必要的；如果 2028 年以后供应追上来，今天的高毛利就可能变成未来的过剩风险。

所以这家公司现在最关键的问题不是“Q3 好不好”，而是：

未来三到五年，多少收入能被 SCA 锁定？价格下限有多强？客户保证金能不能真正约束需求？capex 会不会重新制造下一个下行周期？

## 5. 一句话总结

Micron 这份财报，不只是一个盈利爆炸的季度。

它更像是内存行业给 AI 时代交出的一份新定价说明书：

内存不再只是零件，而是算力基础设施里的供应权。

如果这个判断成立，Micron 的估值逻辑会被重写；如果这个判断只是周期顶部的幻觉，那这份财报就是一个非常漂亮、也非常危险的 peak earnings。

这就是这份财报真正值得看的地方。

---

注：本文基于 Micron FY2026 Q3 官方 earnings release、prepared remarks 和 investor presentation 整理，不构成投资建议。
"""


def write_markdown() -> Path:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    path = EXPORTS / "Micron_FY2026_Q3_WeChat_Article_v0.1.md"
    path.write_text(ARTICLE + f"\n\n生成日期：{TODAY}\n", encoding="utf-8")
    return path


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(html.escape(text), style)


def write_pdf() -> Path:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    font_path = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    pdfmetrics.registerFont(TTFont("ArticleCN", font_path))
    pdf_path = EXPORTS / "Micron_FY2026_Q3_WeChat_Article_v0.1.pdf"

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=21 * mm,
        rightMargin=21 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Micron FY2026 Q3 WeChat Article",
        author="OsbornAlpha Research Library",
    )

    base = {
        "fontName": "ArticleCN",
    }
    title = ParagraphStyle(
        "TitleCN",
        **base,
        fontSize=24,
        leading=31,
        textColor=colors.HexColor("#202124"),
        alignment=1,
        spaceAfter=10,
    )
    subtitle = ParagraphStyle(
        "SubtitleCN",
        **base,
        fontSize=11,
        leading=16,
        alignment=1,
        textColor=colors.HexColor("#6B7280"),
        spaceAfter=16,
    )
    h2 = ParagraphStyle(
        "H2CN",
        **base,
        fontSize=15,
        leading=20,
        textColor=colors.HexColor("#111827"),
        spaceBefore=14,
        spaceAfter=7,
    )
    body = ParagraphStyle(
        "BodyCN",
        **base,
        fontSize=10.8,
        leading=17,
        textColor=colors.HexColor("#202124"),
        firstLineIndent=18,
        spaceAfter=7,
    )
    quote = ParagraphStyle(
        "QuoteCN",
        **base,
        fontSize=9.8,
        leading=14,
        leftIndent=14,
        rightIndent=8,
        textColor=colors.HexColor("#374151"),
        backColor=colors.HexColor("#F3F4F6"),
        borderPadding=7,
        spaceBefore=4,
        spaceAfter=9,
    )
    note = ParagraphStyle(
        "NoteCN",
        **base,
        fontSize=8.6,
        leading=12,
        textColor=colors.HexColor("#6B7280"),
        spaceBefore=12,
    )

    story = []
    lines = ARTICLE.splitlines()
    first_title = True
    for raw in lines:
        line = raw.strip()
        if not line:
            story.append(Spacer(1, 4))
            continue
        if line.startswith("# "):
            if first_title:
                story.append(para(line[2:], title))
                story.append(para("一篇适合朋友圈 / 公众号发布的短版读财报", subtitle))
                first_title = False
            else:
                story.append(para(line[2:], h2))
        elif line.startswith("## "):
            story.append(para(line[3:], h2))
        elif line.startswith("> "):
            story.append(para(line[2:], quote))
        elif line == "---":
            story.append(Spacer(1, 10))
        elif line.startswith("注："):
            story.append(para(line, note))
        else:
            story.append(para(line, body))

    story.append(Spacer(1, 10))
    story.append(para(f"生成日期：{TODAY}", note))
    doc.build(story)
    return pdf_path


def main() -> None:
    md = write_markdown()
    pdf = write_pdf()
    print({"markdown": str(md), "pdf": str(pdf)})


if __name__ == "__main__":
    main()
