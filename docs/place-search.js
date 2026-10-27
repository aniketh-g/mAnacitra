(function (root) {
  // Preserve Devanagari vowel signs. Ignore only presentation joiners and case.
  const normalize = text => String(text).normalize('NFC').replace(/[\u200c\u200d]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
  function match(entries, query) {
    const q = normalize(query);
    if (!q) return [];
    return entries.flatMap(entry => {
      let best;
      for (const name of entry.aliases) {
        const value = normalize(name), at = value.indexOf(q);
        if (at < 0) continue;
        const score = value === q ? 0 : at === 0 ? 1 : 2;
        if (!best || score < best.score) best = {name, score};
      }
      return best ? [{...entry, ...best}] : [];
    }).sort((a, b) => a.score - b.score || a.title.localeCompare(b.title)).slice(0, 20);
  }
  function marked(element, text, query) {
    text = String(text);
    // Map normalized offsets back to original graphemes (including vowel signs).
    const chunks = Array.from(new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(text));
    let normalized = '', offsets = [];
    for (const chunk of chunks) {
      const part = chunk.segment.normalize('NFC').replace(/[\u200c\u200d]/g, '').toLocaleLowerCase();
      for (const char of part) {
        if (/\s/.test(char) && normalized.endsWith(' ')) { offsets[offsets.length-1][1] = chunk.index + chunk.segment.length; continue; }
        const value = /\s/.test(char) ? ' ' : char;
        normalized += value;
        for (let i=0;i<value.length;i++) offsets.push([chunk.index, chunk.index + chunk.segment.length]);
      }
    }
    const q = normalize(query); let cursor = 0, at = q ? normalized.indexOf(q) : -1;
    while (at >= 0) {
      const start = offsets[at][0], end = offsets[at+q.length-1][1];
      if (start >= cursor) {
        element.append(document.createTextNode(text.slice(cursor,start)));
        const mark = document.createElement('mark'); mark.textContent = text.slice(start,end); element.append(mark); cursor=end;
      }
      at = normalized.indexOf(q,at+q.length);
    }
    element.append(document.createTextNode(text.slice(cursor)));
  }
  function init(onSelect) {
    const box = document.getElementById('place-search');
    const input = document.getElementById('place-search-input');
    const list = document.getElementById('place-search-results');
    const clear = document.getElementById('place-search-clear');
    const status = document.getElementById('place-search-status');
    const kinds = {cities:'नगरम्', countries:'देशः', rivers:'नदी'};
    let entries = [], results = [], active = -1, pending = 3, failures = 0, generation = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    function highlight(index) {
      active = index;
      [...list.children].forEach((item, i) => item.setAttribute('aria-selected', String(i === active)));
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', list.children[active].id);
        list.children[active].scrollIntoView({block:'nearest'});
      }
    }
    async function choose(entry) {
      const token = ++generation;
      close(); input.value = entry.name; clear.hidden = !input.value; status.textContent = 'स्थानं उद्घाट्यते…';
      try { await onSelect(entry, () => token === generation); if (token === generation) status.textContent = ''; }
      catch { if (token === generation) {status.textContent = 'स्थानं न उद्घाटितम्। पुनः प्रयतस्व।';window.retryPlaceLoad?.(()=>choose(entry));} }
    }
    function render() {
      clear.hidden = !input.value;
      results = match(entries, input.value); list.replaceChildren(); active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!normalize(input.value)) { status.textContent = ''; close(); return; }
      status.textContent = pending ? 'नामानि आनीयन्ते…' : failures ? 'केचन नामसङ्ग्रहाः न प्राप्ताः।' : results.length ? '' : 'नाम न लब्धम्।';
      results.forEach((entry, i) => {
        const item = document.createElement('li'); item.id = `place-result-${i}`;
        item.setAttribute('role','option'); item.setAttribute('aria-selected','false');
        const title = document.createElement('span'); marked(title, entry.title, input.value);
        const description = document.createElement('small');
        if (entry.name !== entry.title) {
          marked(description, entry.name, input.value);
          description.append(document.createTextNode(' · '));
        }
        description.append(document.createTextNode(kinds[entry.dataset] || ''));
        item.append(title, description); item.addEventListener('pointerdown', e => e.preventDefault());
        item.addEventListener('click', () => choose(entry)); list.append(item);
      });
      list.hidden = !results.length; input.setAttribute('aria-expanded',String(Boolean(results.length)));
    }
    clear.addEventListener('click', () => {
      ++generation; input.value = ''; render(); input.focus();
    });
    input.addEventListener('input', () => { ++generation; render(); });
    input.addEventListener('focus', render);
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { ++generation; close(); status.textContent=''; event.stopPropagation(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (list.hidden) render();
        if (results.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
      }
      if (event.key === 'Enter' && results.length && !list.hidden) { event.preventDefault(); choose(results[Math.max(active,0)]); }
    });
    box.addEventListener('focusout', event => { if (!box.contains(event.relatedTarget)) close(); });
    document.addEventListener('pointerdown', event => { if (!box.contains(event.target)) { close(); status.textContent=''; } });
    for (const dataset of Object.keys(kinds)) {
      fetch(`data/search/${dataset}.json`).then(response => {
        if (!response.ok) throw Error('Index unavailable'); return response.json();
      }).then(data => entries.push(...data)).catch(() => ++failures).finally(() => {
        --pending; if (document.activeElement === input) render();
      });
    }
  }
  root.PlaceSearch = {init, match, normalize};
  if (typeof module !== 'undefined') module.exports = {match, normalize};
})(globalThis);
