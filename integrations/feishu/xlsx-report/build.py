"""Build the Feishu simulated-fund workbook, laid out after the fund summary sheet (report(9).xlsm).

Usage: build.py <data.json> <out.xlsx>
Cost basis follows the formal system (ingest_feishu_simulation): moving average including fees on buys;
a sell realizes (price - average cost) x quantity - fee and leaves the average unchanged.
Every number in summary is a formula over the Trade and 建议台账 sheets; evaluate.py caches the values.
"""
from __future__ import annotations

import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.utils import column_index_from_string, get_column_letter

import model

AUTHOR = 'osbornalpha'
FONT, BOLD = Font(name='Calibri', size=11), Font(name='Calibri', size=11, bold=True)
RED, GREY = Font(name='Calibri', size=11, color='FFFF0000'), Font(name='Calibri', size=9, color='FF808080')
WARN = Font(name='Calibri', size=11, bold=True, color='FFFF0000')
QTY = '_ * #,##0_ ;_ * \\-#,##0_ ;_ * "-"??_ ;_ @_ '
PX = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)'
PCT = '0.00%;\\-0.00%;"-"'
EXP = '0.0000%;\\-0.0000%;"-"'  # small simulated positions against a fund NAV need four decimals
FXF, DATE, DTM = '0.0000', 'yyyy-mm-dd', 'yyyy-mm-dd hh:mm'
LINE = Border(bottom=Side(style='thin', color='FF000000'))
RIGHT = Alignment(horizontal='right')
TR, LG = 'Trade', '建议台账'
def header(ws, row, names):
    for i, h in enumerate(names, 1):
        c = ws.cell(row, i, h); c.font = BOLD; c.border = LINE
def widths(ws, spec):
    for col, w in spec.items(): ws.column_dimensions[col].width = w
dash = lambda v: '-' if v is None else v


def layout(analysts):
    """Summary columns: 全组 (I–L), then four columns per analyst from M; a spacer, then the check column.

    Each group is (label, key, avg-cost, quantity, notional, exp); key is None for 全组.
    """
    groups = [('全组', None, 'I', 'J', 'K', 'L')]
    for k, an in enumerate(analysts):
        first = column_index_from_string('M') + 4 * k
        groups.append((an, an, *(get_column_letter(first + j) for j in range(4))))
    spacer = get_column_letter(column_index_from_string(groups[-1][5]) + 1)
    return groups, spacer, get_column_letter(column_index_from_string(spacer) + 1)


def build(X, out):
    N = max(500, len(X.TRADES) + len(X.RECS) + 10)
    def rng(sheet, col): return f"{sheet}!${col}$2:${col}${N}"
    fxm = dict(X.FX)
    nfx = len(X.FX)
    FXR = f'$B$2:$B${1 + nfx}', f'$D$2:$D${1 + nfx}'
    wb = Workbook()
    # ------------------------------------------------------------------ Trade: A–N follow Trade1; O onward link the recommendation and carry the cost basis
    t = wb.active; t.title = TR
    header(t, 1, ['Date', 'Ticker', 'Wind', 'Direction', 'Quantity', 'Lcl Notional', 'RMB Notional', 'Fill Price', 'Closing Price',
                  'Currency', 'FX', 'Broker', '存量计算', '当天收盘偏离度', 'Analyst', '建议编号', '审批人', '审批时间', '成交编号',
                  '手续费', '分析师·前持仓', '分析师·前均价', '分析师·后均价', '分析师·已实现（RMB）',
                  '全组·前持仓', '全组·前均价', '全组·后均价', '全组·已实现（RMB）'])
    appr = {r[0]: r[15] for r in X.RECS}
    for i, (tid, when, tk, di, q, fill, close, fee, an, rid, approver) in enumerate(sorted(X.TRADES, key=lambda r: r[1]), 2):
        wind, _, ccy, _ = X.SEC[tk]
        p = i - 1  # previous rows only (header row 1 is ignored by the criteria)
        buy = f'OR(D{i}="Buy",D{i}="Cover")'
        t.append([when, tk, wind, di, q, f'=E{i}*H{i}', f'=F{i}*K{i}', fill, close, ccy,
                  f'=IFERROR(INDEX(summary!{FXR[1]},MATCH(J{i},summary!{FXR[0]},0)),"")', '飞书模拟账户',
                  f'=IF({buy},E{i},-E{i})', f'=IFERROR(H{i}/I{i}-1,"")', an, rid, approver, appr.get(rid), tid, fee,
                  f'=SUMIFS($M$1:$M${p},$B$1:$B${p},B{i},$O$1:$O${p},O{i})',
                  f'=IF(U{i}=0,0,LOOKUP(2,1/(($B$1:$B${p}=B{i})*($O$1:$O${p}=O{i})),$W$1:$W${p}))',
                  f'=IF({buy},(U{i}*V{i}+E{i}*H{i}+T{i})/(U{i}+E{i}),IF(U{i}-E{i}=0,0,V{i}))',
                  f'=IF({buy},0,((H{i}-V{i})*E{i}-T{i})*K{i})',
                  f'=SUMIFS($M$1:$M${p},$B$1:$B${p},B{i})',
                  f'=IF(Y{i}=0,0,LOOKUP(2,1/($B$1:$B${p}=B{i}),$AA$1:$AA${p}))',
                  f'=IF({buy},(Y{i}*Z{i}+E{i}*H{i}+T{i})/(Y{i}+E{i}),IF(Y{i}-E{i}=0,0,Z{i}))',
                  f'=IF({buy},0,((H{i}-Z{i})*E{i}-T{i})*K{i})'])
    fmt = {'A': DTM, 'E': QTY, 'F': PX, 'G': QTY, 'H': PX, 'I': PX, 'K': FXF, 'M': QTY, 'N': PCT, 'R': DTM, 'T': PX,
           'U': QTY, 'V': PX, 'W': PX, 'X': QTY, 'Y': QTY, 'Z': PX, 'AA': PX, 'AB': QTY}
    for row in t.iter_rows(min_row=2, max_row=t.max_row):
        for c in row:
            c.font = FONT
            if c.column_letter in fmt: c.number_format = fmt[c.column_letter]
    t['W1'].comment = Comment('与正式系统一致：买入后均价 =（前持仓×前均价 + 股数×成交价 + 手续费）÷ 新持仓；卖出不改均价，清仓归零。分析师口径按本人成交计算。', AUTHOR)
    t['AA1'].comment = Comment('全组口径不分分析师，按账户合并计算，对应正式系统 positions 表的 avg_cost / realized_pnl。', AUTHOR)
    widths(t, dict(zip(['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB'],
                       [17, 11, 11, 10, 10, 13, 14, 11, 12, 9, 8, 13, 10, 13, 15, 11, 12, 17, 11, 8, 12, 12, 12, 16, 12, 12, 12, 16])))
    t.freeze_panes = 'C2'

    # ------------------------------------------------------------------ 建议台账
    g = wb.create_sheet(LG)
    header(g, 1, ['提交时间', '分析师', 'Ticker', 'Wind', 'Name', '动作', '执行方式', '参考价', '目标价', '止损', '信心', '期限', '理由',
                  '状态', '已采纳', '审批人', '审批时间', '撤回时间', '关联成交', '5日收益', '20日收益', '60日收益', '命中', '评分', '建议编号'])
    trade_of = {}
    for tr in X.TRADES: trade_of.setdefault(tr[9], tr[0])
    for (rid, when, an, tk, act, mode, ref, tgt, stop, conf, hz, why, st, adopted, approver, apt, wd, r5, r20, r60, hit, score) in sorted(X.RECS, key=lambda r: r[1]):
        wind, name, _, _ = X.SEC[tk]
        g.append([when, an, tk, wind, name, act, mode, dash(ref), dash(tgt), dash(stop), dash(conf), dash(hz), dash(why), st, adopted,
                  dash(approver), apt, dash(wd), trade_of.get(rid, '-'), dash(r5), dash(r20), dash(r60), dash(hit), dash(score), rid])
    fmt = {'A': DTM, 'H': PX, 'I': PX, 'J': PX, 'Q': DTM, 'R': DTM, 'T': PCT, 'U': PCT, 'V': PCT, 'X': '0.0'}
    for row in g.iter_rows(min_row=2, max_row=g.max_row):
        for c in row:
            c.font = FONT
            if c.column_letter in fmt: c.number_format = fmt[c.column_letter]
            if c.value == '-': c.alignment = RIGHT
    widths(g, dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXY', [17, 15, 11, 11, 11, 6, 26, 9, 9, 9, 11, 6, 16, 7, 7, 12, 17, 17, 11, 9, 9, 9, 6, 6, 11])))
    g.freeze_panes = 'C2'

    # ------------------------------------------------------------------ summary
    s = wb.create_sheet('summary', 0)
    s['B1'] = 'Trade date'; s['D1'] = X.TRADE_DATE; s['D1'].number_format = DATE; s['B1'].font = BOLD
    s['F1'] = X.BANNER; s['F1'].font = WARN
    for r, (ccy, rate) in enumerate(X.FX, 2):
        s[f'B{r}'], s[f'D{r}'] = ccy, rate; s[f'D{r}'].number_format = FXF; s[f'B{r}'].font = FONT
    s['D3'].comment = Comment(X.FX_NOTE, AUTHOR)
    GROUPS, SPACER, CHECK = layout(X.ANALYSTS)
    AN = [grp for grp in GROUPS if grp[1]]
    net, holders = {}, {}
    for _, _, tk, di, q, _, _, _, an, _, _ in X.TRADES:
        net[tk] = net.get(tk, 0) + (q if di in ('Buy', 'Cover') else -q)
        holders.setdefault(tk, [])
        if an not in holders[tk]: holders[tk].append(an)
    order = sorted(net, key=lambda tk: -net[tk] * (X.SEC[tk][3] or 0) * fxm[X.SEC[tk][2]])
    for lab, key, a, q, n, e in GROUPS:
        s[f'{a}3'] = lab; s[f'{a}3'].font = BOLD
        if key: s[f'{e}19'] = key; s[f'{e}19'].font = GREY
    s['L19'] = '筛选键 →'; s['L19'].font = GREY; s['L19'].alignment = RIGHT
    s[f'{CHECK}3'] = 'check'; s[f'{CHECK}3'].font = BOLD

    LONG0 = 21
    LONG1 = LONG0 + max(20, len(order)) - 1
    SHORT_LABEL, SHORT0 = LONG1 + 1, LONG1 + 2
    SHORT1 = SHORT0 + 9
    LABELS = {4: 'NAV', 5: 'Long', 6: 'Short', 7: 'Gross', 8: 'Net', 9: '持仓只数', 10: '持仓名义（RMB）',
              11: '未实现盈亏（RMB）', 12: '已实现盈亏（RMB）', 13: '有效建议', 14: '已采纳', 15: '已撤回',
              16: '模拟成交笔数', 17: '命中率', 18: '平均评分'}
    for r, lab in LABELS.items(): s[f'H{r}'] = lab; s[f'H{r}'].font = BOLD if r <= 8 else FONT
    s['K4'] = X.NAV; s['K4'].number_format = QTY
    s['K4'].comment = Comment(X.NAV_NOTE, AUTHOR)
    for lab, key, a, q, n, e in GROUPS:
        s[f'{e}5'] = f'=SUM({e}{LONG0}:{e}{LONG1})'
        s[f'{e}6'] = f'=SUM({e}{SHORT0}:{e}{SHORT1})'
        s[f'{e}7'] = f'={e}5-{e}6'
        s[f'{e}8'] = f'={e}5+{e}6'
        s[f'{e}9'] = f'=SUMPRODUCT(({q}{LONG0}:{q}{SHORT1}<>0)*ISNUMBER({q}{LONG0}:{q}{SHORT1}))'
        s[f'{e}10'] = f'=SUM({n}{LONG0}:{n}{SHORT1})'
        s[f'{e}11'] = f'=SUMPRODUCT(($F{LONG0}:$F{SHORT1}-{a}{LONG0}:{a}{SHORT1})*{q}{LONG0}:{q}{SHORT1}*$H{LONG0}:$H{SHORT1})'
        if key:
            s[f'{e}12'] = f'=SUMIFS({rng(TR, "X")},{rng(TR, "O")},{e}$19)'
            s[f'{e}13'] = f'=COUNTIFS({rng(LG, "B")},{e}$19,{rng(LG, "N")},"有效")'
            s[f'{e}14'] = f'=COUNTIFS({rng(LG, "B")},{e}$19,{rng(LG, "O")},"是")'
            s[f'{e}15'] = f'=COUNTIFS({rng(LG, "B")},{e}$19,{rng(LG, "N")},"已撤回")'
            s[f'{e}16'] = f'=SUMPRODUCT(({rng(TR, "O")}={e}$19)*({rng(TR, "D")}<>""))'
            hit = lambda v: f'COUNTIFS({rng(LG, "B")},{e}$19,{rng(LG, "W")},"{v}")'
            s[f'{e}18'] = f'=IFERROR(AVERAGEIFS({rng(LG, "X")},{rng(LG, "B")},{e}$19),"-")'
        else:
            s[f'{e}12'] = f'=SUM({rng(TR, "AB")})'
            for rr in (13, 14, 15, 16): s[f'{e}{rr}'] = '=' + '+'.join(f'{x[5]}{rr}' for x in AN)
            hit = lambda v: f'COUNTIF({rng(LG, "W")},"{v}")'
            s[f'{e}18'] = f'=IFERROR(AVERAGE({rng(LG, "X")}),"-")'
        s[f'{e}17'] = f'=IFERROR({hit("是")}/({hit("是")}+{hit("否")}),"-")'
        for r, f in [(5, EXP), (6, EXP), (7, EXP), (8, EXP), (9, QTY), (10, QTY), (11, QTY), (12, QTY), (13, QTY),
                     (14, QTY), (15, QTY), (16, QTY), (17, PCT), (18, '0.0')]:
            s[f'{e}{r}'].number_format = f; s[f'{e}{r}'].alignment = RIGHT; s[f'{e}{r}'].font = FONT
    s['L12'].comment = Comment('全组按账户合并口径（正式系统 positions.realized_pnl）；分析师按本人成交计算。同一标的有多位分析师交易时，两者可能不相等。', AUTHOR)
    s['L14'].comment = Comment('已采纳 = 正式系统中已有 PM 决策（未取消）的建议，含之后撤回的。', AUTHOR)
    s['L17'].comment = Comment('命中 ÷（命中 + 未命中）；未到判定日的建议不计入。', AUTHOR)

    for i, h in enumerate(['合计股数', 'Ticker', 'Wind', 'Name', 'Analyst', 'Price', 'Currency', 'FX'], 1): s.cell(20, i, h)
    for lab, key, a, q, n, e in GROUPS:
        for col, h in zip((a, q, n, e), ('Avg Cost', 'Quantity', 'RMB Notional', 'Exp')): s[f'{col}20'] = h
    s[f'{CHECK}20'] = 'Quantity 差'
    for c in s[20]: c.font = BOLD; c.border = LINE
    s[f'B{SHORT_LABEL}'] = 'Short'; s[f'B{SHORT_LABEL}'].font = BOLD

    for r, tk in enumerate(order, LONG0):
        wind, name, ccy, close = X.SEC[tk]
        s[f'A{r}'] = f'=J{r}'
        s[f'B{r}'], s[f'C{r}'], s[f'D{r}'], s[f'E{r}'], s[f'F{r}'], s[f'G{r}'] = tk, wind, name, '/'.join(holders[tk]), close, ccy
        s[f'H{r}'] = f'=IFERROR(INDEX({FXR[1]},MATCH(G{r},{FXR[0]},0)),"")'
        for lab, key, a, q, n, e in GROUPS:
            if key:
                s[f'{q}{r}'] = f'=SUMIFS({rng(TR, "M")},{rng(TR, "B")},$B{r},{rng(TR, "O")},{e}$19)'
                s[f'{a}{r}'] = f'=IF({q}{r}=0,0,LOOKUP(2,1/(({rng(TR, "B")}=$B{r})*({rng(TR, "O")}={e}$19)),{rng(TR, "W")}))'
            else:
                s[f'{q}{r}'] = '=' + '+'.join(f'{x[3]}{r}' for x in AN)
                s[f'{a}{r}'] = f'=IF({q}{r}=0,0,LOOKUP(2,1/({rng(TR, "B")}=$B{r}),{rng(TR, "AA")}))'
            s[f'{n}{r}'] = f'={q}{r}*$F{r}*$H{r}'
            s[f'{e}{r}'] = f'=IFERROR({n}{r}/$K$4,0)'
        s[f'{CHECK}{r}'] = f'=J{r}-(' + '+'.join(f'{x[3]}{r}' for x in AN) + ')'
    if order: s[f'F{LONG0}'].comment = Comment(X.PRICE_NOTE, AUTHOR)
    qcols = [x[3] for x in GROUPS] + [x[4] for x in GROUPS] + ['A', CHECK]
    for r in range(LONG0, SHORT1 + 1):
        for c in s[r]:
            if c.row == SHORT_LABEL and c.column_letter == 'B': continue
            L = c.column_letter
            c.font = RED if L == CHECK else FONT
            if L in qcols: c.number_format = QTY
            elif L == 'F' or L in [x[2] for x in GROUPS]: c.number_format = PX
            elif L in [x[5] for x in GROUPS]: c.number_format = EXP
            elif L == 'H': c.number_format = FXF
    w = {'A': 11, 'B': 12, 'C': 11, 'D': 12, 'E': 15, 'F': 10, 'G': 9, 'H': 17, SPACER: 3, CHECK: 12}
    for lab, key, a, q, n, e in GROUPS: w.update({a: 10, q: 10, n: 13, e: 10})
    widths(s, w)
    s.column_dimensions['C'].hidden = True; s.column_dimensions['C'].outlineLevel = 1
    s.freeze_panes = 'I21'
    s.page_setup.orientation = 'landscape'; s.page_setup.fitToWidth = 1; s.page_setup.fitToHeight = 0
    s.sheet_properties.pageSetUpPr.fitToPage = True

    # ------------------------------------------------------------------ 说明
    d = wb.create_sheet('说明')
    notes = [('数据', X.BANNER)] + X.NOTES + [
        ('前提', '所有分析师在同一只基金内做模拟交易；各分析师与全组的 Exp 都以该基金 NAV 为分母，可直接相加。'),
        ('NAV', X.NAV_NOTE),
        ('价格与汇率', X.PRICE_NOTE + ' ' + X.FX_NOTE),
        ('持仓', 'Quantity = Trade 表「存量计算」按 Ticker 与分析师汇总；RMB Notional = Quantity × Price × FX；Exp = RMB Notional ÷ NAV。'),
        ('均价与盈亏', '与正式系统一致：买入按移动平均计成本并计入手续费，卖出不改均价、清仓归零；已实现 =（卖出价 − 当时均价）× 股数 − 手续费，再按 FX 折人民币；未实现 =（Price − Avg Cost）× Quantity × FX。全组按账户合并，分析师按本人成交。'),
        ('排序', '多头按全组 Exp 从大到小排列；已清仓的标的留在最后，Quantity 显示「-」。'),
        ('业绩', '有效 / 已撤回取自「建议台账」状态；已采纳 = 正式系统中已有 PM 决策（未取消）的建议，含之后撤回的；命中率 = 命中 ÷（命中 + 未命中），只算已判定的；平均评分只统计已有评分。'),
        ('核对', f'summary 的 {CHECK} 列核对「全组 Quantity = 各分析师之和」，非零标红。'),
        ('范围', '只统计群内已绑定分析师、经 PM 确认并登记到正式系统的建议与模拟成交。'),
        ('暂不包含', 'HC、Sector 及分国家净敞口；做空（Short 段已留位置）。'),
    ]
    for r, (k, v) in enumerate(notes, 1):
        d.cell(r, 1, k).font = BOLD
        c = d.cell(r, 2, v); c.font = WARN if r == 1 else FONT; c.alignment = Alignment(wrap_text=True, vertical='top')
    widths(d, {'A': 12, 'B': 110})

    wb.calculation.fullCalcOnLoad = True
    wb.save(out)
    return out

if __name__ == '__main__':
    print('saved', build(model.load(sys.argv[1]), sys.argv[2]))
