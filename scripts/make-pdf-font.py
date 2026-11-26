"""
Builds the two fonts the schedule PDF uses (assets/fonts/NotoSansSC-Regular-subset.ttf and -Bold-subset.ttf).

Source: Noto Sans SC (SIL Open Font License, see assets/fonts/OFL.txt), the variable TrueType file from
https://github.com/google/fonts/tree/main/ofl/notosanssc , saved as scripts/NotoSansSC-var.ttf (not committed).
Run after adding Chinese text to lib/i18n.ts:   pip install fonttools brotli   then   python scripts/make-pdf-font.py
The unit test tests/unit/schedule-pdf.test.ts fails if a Chinese string needs a character the fonts lack.
"""
import os
import re
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, 'scripts') + os.sep
OUT = os.path.join(ROOT, 'assets', 'fonts') + os.sep

chars = set()
# Latin, punctuation, symbols, CJK punctuation, fullwidth forms
for lo, hi in [(0x20, 0x7E), (0xA0, 0x24F), (0x2000, 0x206F), (0x2190, 0x21FF), (0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2460, 0x24FF)]:
    chars.update(range(lo, hi + 1))
chars.update(ord(c) for c in '\u00a9\u2713\u2717\u00b7\u2013\u2014\u2026')
# every character used by the app's Chinese strings
src = open(os.path.join(ROOT, 'lib', 'i18n.ts'), encoding='utf-8').read()
chars.update(ord(c) for c in src if ord(c) > 0x2E80)
# Simplified: GB2312 level 1 (3755 common hanzi); Traditional: Big5 level 1 (5401 common hanzi)
for codec, lead_lo, lead_hi in [('gb2312', 0xB0, 0xD7), ('big5', 0xA4, 0xC6)]:
    for a in range(lead_lo, lead_hi + 1):
        for b in range(0xA1 if codec == 'gb2312' else 0x40, 0xFF):
            try:
                ch = bytes([a, b]).decode(codec)
            except UnicodeDecodeError:
                continue
            if len(ch) == 1 and 0x4E00 <= ord(ch) <= 0x9FFF:
                chars.add(ord(ch))
print('characters to keep:', len(chars))

for weight, name in [(400, 'Regular'), (700, 'Bold')]:
    font = TTFont(HERE + 'NotoSansSC-var.ttf')
    inst = instancer.instantiateVariableFont(font, {'wght': weight}, inplace=False)
    opts = subset.Options()
    opts.layout_features = []          # no ligatures or alternates needed
    opts.hinting = False
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.name_IDs = [1, 2, 3, 4, 6]
    opts.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'DSIG', 'STAT', 'vhea', 'vmtx']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted(chars))
    sub.subset(inst)
    path = OUT + f'NotoSansSC-{name}-subset.ttf'
    inst.save(path)
    f2 = TTFont(path)
    print(name, 'glyphs', len(f2.getGlyphOrder()), 'cmap', len(f2.getBestCmap()), 'bytes', __import__('os').path.getsize(path), 'has glyf', 'glyf' in f2, 'has CFF', 'CFF ' in f2)
