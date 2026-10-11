/* Заливка строк в исходном Excel без изменения его содержимого.
   Меняются только стили: добавляется жёлтая заливка, у ячеек отмеченных строк — ссылка на стиль с ней.
   Значения, порядок строк, листы, ширины, фильтры и всё остальное остаются как были.
   Работает в браузере и в Node (для тестов). */
(function (root) {
  'use strict';
  const YELLOW = '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>';
  const colNum = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
  const setAttr = (tag, name, val) => new RegExp('\\s' + name + '="[^"]*"').test(tag)
    ? tag.replace(new RegExp('(\\s' + name + '=")[^"]*(")'), '$1' + val + '$2')
    : tag.replace(/^<(\w+)/, '<$1 ' + name + '="' + val + '"');

  // Пути листов по их названиям (workbook.xml + связи)
  function sheetPaths(files, td) {
    const wb = td.decode(files['xl/workbook.xml']), rels = td.decode(files['xl/_rels/workbook.xml.rels']);
    const target = {};
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(t => { target[attr(t, 'Id')] = attr(t, 'Target'); });
    const out = {};
    (wb.match(/<sheet\b[^>]*>/g) || []).forEach(t => {
      const name = attr(t, 'name').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      let p = target[attr(t, 'r:id')]; if (!p) return;
      p = p.startsWith('/') ? p.slice(1) : 'xl/' + p.replace(/^\.\//, '');
      out[name] = p;
    });
    return out;
  }

  /**
   * @param {Uint8Array} bytes  исходный .xlsx
   * @param {Object<string, number[]>} marks  { 'Название листа': [номера строк] }
   * @param {object} fflate  библиотека fflate (unzipSync/zipSync)
   * @returns {{bytes: Uint8Array, painted: number}}
   */
  function mark(bytes, marks, fflate) {
    const td = new TextDecoder(), te = new TextEncoder();
    const files = fflate.unzipSync(bytes);
    const paths = sheetPaths(files, td);

    // 1. Стили: новая заливка и копии используемых форматов ячеек с этой заливкой
    let st = td.decode(files['xl/styles.xml']);
    let fillId;
    if (/<fills\b[^>]*\/>/.test(st)) { st = st.replace(/<fills\b[^>]*\/>/, '<fills count="1">' + YELLOW + '</fills>'); fillId = 0; }
    else if (/<fills\b/.test(st)) {
      const inner = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(st)[1];
      fillId = (inner.match(/<fill\b/g) || []).length;
      st = st.replace(/(<fills\b[^>]*>)([\s\S]*?)(<\/fills>)/, (m, a, b, c) => setAttr(a, 'count', fillId + 1) + b + YELLOW + c);
    } else throw new Error('в файле нет таблицы заливок');
    const xfsM = /(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/.exec(st);
    if (!xfsM) throw new Error('в файле нет форматов ячеек');
    const xfs = xfsM[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];
    const added = [], memo = new Map();
    const yellowOf = s => {
      s = +s || 0;
      if (memo.has(s)) return memo.get(s);
      const src = xfs[s] || xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      const open = /^<xf\b[^>]*?\/?>/.exec(src)[0];
      let tag = setAttr(setAttr(open.replace(/\/>$/, '>').replace(/>$/, ''), 'fillId', fillId), 'applyFill', 1);
      const xf = src.endsWith('/>') ? tag + '/>' : tag + '>' + src.slice(open.length);
      const id = xfs.length + added.length; added.push(xf); memo.set(s, id); return id;
    };

    // 2. Листы: заливаем ячейки отмеченных строк в пределах ширины таблицы
    let painted = 0;
    for (const [name, rows] of Object.entries(marks)) {
      const p = paths[name]; if (!p || !files[p] || !rows.length) continue;
      const want = new Set(rows);
      let xml = td.decode(files[p]);
      const dim = /<dimension\b[^>]*ref="([A-Z]+)\d*(?::([A-Z]+)\d*)?"/.exec(xml);
      const c0 = dim ? colNum(dim[1]) : 1, c1 = dim ? colNum(dim[2] || dim[1]) : 1;
      xml = xml.replace(/<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, (m, ra, end, inner) => {
        const r = +attr(ra, 'r'); if (!want.has(r)) return m;
        painted++;
        const cells = new Map();
        (inner || '').replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, c => { cells.set(colNum(/\sr="([A-Z]+)/.exec(c)[1]), c); return c; });
        const lo = Math.min(c0, ...cells.keys()), hi = Math.max(c1, ...cells.keys());
        let out = '';
        for (let k = lo; k <= hi; k++) {
          const c = cells.get(k);
          if (c) {
            const open = /^<c\b[^>]*?(?=\/?>)/.exec(c)[0];
            out += setAttr(open, 's', yellowOf(attr(open, 's'))) + c.slice(open.length);
          } else out += `<c r="${colName(k)}${r}" s="${yellowOf(0)}"/>`;
        }
        return '<row' + ra + '>' + out + '</row>';
      });
      files[p] = te.encode(xml);
    }
    if (added.length) st = st.replace(xfsM[0], setAttr(xfsM[1], 'count', xfs.length + added.length) + xfsM[2] + added.join('') + xfsM[3]);
    files['xl/styles.xml'] = te.encode(st);
    return { bytes: fflate.zipSync(files, { level: 6 }), painted };
  }
  const api = { mark, sheetPaths, colNum, colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XlsxMark = api;
})(typeof window !== 'undefined' ? window : globalThis);
