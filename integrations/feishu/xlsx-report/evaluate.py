"""Evaluate every formula and store the results as the cells' cached values.

Usage: evaluate.py <built.xlsx> <out.xlsx>
openpyxl writes formulas without values; Feishu's previewer (and anything else that does not
recalculate) would show blank cells. The `formulas` engine computes them and each <v> is filled in.
The formulas stay, and Excel still recalculates on open (fullCalcOnLoad).
"""
from __future__ import annotations

import re
import sys
import zipfile
from xml.sax.saxutils import escape

import formulas
import numpy as np

_ref = re.compile(r"'\[(.+?)\](.+?)'!([A-Z]+)(\d+)$")
_cell = re.compile(r'<c( [^>]*)>(<f>.*?</f>)(?:<v>.*?</v>|<v ?/>)?</c>')


def _values(src):
    solution = formulas.ExcelModel().loads(src).finish().calculate()
    values = {}
    for key, value in solution.items():
        m = _ref.match(str(key).upper())
        if m:
            x = value.value[0][0] if hasattr(value, 'value') else value
            values[(m.group(2), m.group(3) + m.group(4))] = x.item() if isinstance(x, np.generic) else x
    return values


def evaluate(src, dst):
    """Returns (cells written, error cells as [(sheet, ref, value)])."""
    values = _values(src)
    errors = [(sh, ref, v) for (sh, ref), v in values.items()
              if (isinstance(v, str) and v.startswith('#')) or 'Error' in type(v).__name__]
    zin = zipfile.ZipFile(src)
    names = re.findall(r'<sheet [^>]*name="([^"]+)"', zin.read('xl/workbook.xml').decode())
    written = 0
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            m = re.match(r'xl/worksheets/sheet(\d+)\.xml$', item.filename)
            if m:
                sheet = names[int(m.group(1)) - 1].upper()

                def fill(mc):
                    nonlocal written
                    attrs, f = mc.group(1), mc.group(2)
                    ref = re.search(r'r="([A-Z]+\d+)"', attrs).group(1)
                    v = values.get((sheet, ref))
                    if v is None or (isinstance(v, str) and v.startswith('#')) or 'Error' in type(v).__name__:
                        return mc.group(0)
                    written += 1
                    if isinstance(v, bool):
                        return f'<c{attrs} t="b">{f}<v>{int(v)}</v></c>'
                    if isinstance(v, str):
                        attrs = re.sub(r' t="\w+"', '', attrs) + ' t="str"'
                        return f'<c{attrs}>{f}<v>{escape(v)}</v></c>'
                    return f'<c{attrs}>{f}<v>{float(v)!r}</v></c>'

                data = _cell.sub(fill, data.decode()).encode()
            zout.writestr(item, data)
    return written, errors


if __name__ == '__main__':
    count, errs = evaluate(sys.argv[1], sys.argv[2])
    print('cached values written:', count, '| formula errors:', len(errs), errs[:10])
    sys.exit(1 if errs else 0)
