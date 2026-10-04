(() => {
  const f = document.getElementById('proto-frame');
  if (!f) return { error: 'no proto-frame in the host document' };
  const chain = [];
  let n = f;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    chain.push({
      tag: n.tagName.toLowerCase(),
      id: n.id || null,
      cls: (typeof n.className === 'string' ? n.className : '') || null,
      box: [Math.round(r.width), Math.round(r.height)],
      display: cs.display,
      flex: cs.flex,
      flexGrow: cs.flexGrow,
      height: cs.height,
      minHeight: cs.minHeight,
      overflow: cs.overflow,
    });
    n = n.parentElement;
  }
  return {
    viewport: [innerWidth, innerHeight],
    hasProtoFrameCss: [...document.styleSheets].some(s => {
      try { return [...s.cssRules].some(r => (r.selectorText || '').includes('.proto-frame')); }
      catch (e) { return false; }
    }),
    src: f.getAttribute('src'),
    chain,
  };
})()