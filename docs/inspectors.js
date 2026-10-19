/* Uses the existing markdown(), addProse(), and addCitations() helpers. */
(function () {
  const states = {}, tabs = ['व्युत्पत्तिः', 'अपभ्रंशाः', 'प्रयोगाः'];
  let serial = 0;
  let openingOrder = 0;
  const mobilePanels = matchMedia('(max-width: 999px)');
  let ruleCatalogue = {};
  let catalogueError = '';

  Promise.allSettled(['ashtadhyayi', 'foreign'].map(async name => {
    const response = await fetch(`data/rules/${name}.json`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }))
    .then(results => {
      for (const result of results) {
        if (result.status === 'fulfilled') Object.assign(ruleCatalogue, result.value);
        else catalogueError += `${result.reason.message}; `;
      }
    })
    .finally(() => {
      for (const state of Object.values(states)) {
        if (!state.open || state.tab === 2) continue;
        const scroll = state.body.scrollTop;
        const focused = state.body.contains(document.activeElement);
        render(state);
        state.body.scrollTop = scroll;
        if (focused) state.body.focus({ preventScroll: true });
      }
    });

  function stepsToGraph(steps) {
    const nodes = steps.map((step, i) => ({
      ...step,
      id: `step-${i}`
    }));
    const edges = [];

    function connect(from, to) {
      edges.push({
        from: from.id,
        to: to.id,
        kind: to.kind || 'morphology',
        rules: to.rules || [],
        rule: to.rule || '',
        notes: to.rule_notes,
        citations: to.rule_citations || []
      });
    }

    function chain(items, start = null) {
      let previous = start;

      for (const item of items) {
        if (previous) connect(previous, item);
        previous = item;
      }

      return previous;
    }

    const branched = nodes.some(
      node => ['foreign', 'sanskrit'].includes(node.branch)
    );

    if (!branched) {
      chain(nodes);
      return { nodes, edges };
    }

    const common = nodes.filter(
      node => !node.branch || node.branch === 'common'
    );
    const foreign = nodes.filter(node => node.branch === 'foreign');
    const sanskrit = nodes.filter(node => node.branch === 'sanskrit');

    const sharedEnd = chain(common);

    chain(foreign, sharedEnd);
    chain(sanskrit, sharedEnd);

    // Keep the foreign branch left of the Sanskrit branch.
    return {
      nodes: [...common, ...foreign, ...sanskrit],
      edges
    };
  }
  const el = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function citations(parent, items) {
    // Existing inline citations work unchanged. A future bibliography may resolve source_id here.
    addCitations(parent, items || []);
  }
  function detail(data, type) {
    const box = el('div', type === 'node' ? 'mi-node' : 'mi-rule');
    const summary = el('div', type === 'node' ? 'mi-form' : 'mi-rule-content');
    if (type === 'node') {
      if (data.parts?.length) {
        const parts = el('span', 'mi-parts');
        data.parts.forEach((part, i) => {
          if (i) parts.append(el('span', 'mi-plus', '+'));
          const component = el('span', 'mi-part');
          component.append(el('span', part.highlight ? 'mi-changed' : '', part.text));
          if (part.meaning) component.append(el('span', 'mi-meaning', part.meaning));
          parts.append(component);
        });
        summary.append(parts);
      } else {
        summary.append(document.createTextNode(data.form || data.label || 'Unnamed form'));
      }
      summary.append(el('span', 'mi-meta', [data.language, data.status].filter(Boolean).join(' · ')));
    } else {
      box.dataset.kind = data.kind;
      // Accept a single reference too, without splitting it into characters.
      const references = Array.isArray(data.rules) ? data.rules : data.rules ? [data.rules] : [];
      if (references.length) {
        for (const reference of references) {
          const rule = ruleCatalogue[reference];
          if (!rule) {
            const missing = el('span', 'mi-rule-reference', `${reference} — rule text unavailable`);
            missing.title = catalogueError || 'This rule is not in the local catalogue.';
            summary.append(missing);
            continue;
          }
          let url;
          try {
            const parsed = new URL(rule.url);
            if (['https:', 'http:'].includes(parsed.protocol)) url = parsed.href;
          } catch {}
          const label = [rule.text, rule.number].filter(Boolean).join(' · ') || reference;
          const link = el(url ? 'a' : 'span', 'mi-rule-reference', label);
          if (url) {
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          }
          summary.append(link);
        }
      } else {
        summary.textContent = [data.sutra, data.rule].filter(Boolean).join(' — ');
      }
    }
    box.append(summary);
    return box;
  }
  function tree(parent, graph, state) {
    if (Array.isArray(graph)) graph = stepsToGraph(graph);
    if (!graph?.nodes?.length) {
      parent.append(el('p', 'mi-empty', 'प्रक्रिया न लभ्या।'));
      return;
    }
    let model;
    try { model = InspectorGraph.layout(graph); }
    catch (error) { parent.append(el('p', 'mi-empty', `Unable to display this tree: ${error.message}`)); return; }
    const scroll = el('div', 'mi-graph-scroll');
    const diagram = el('div', 'mi-graph');
    diagram.setAttribute('aria-label', graph.label || 'Derivation tree, read from top to bottom');
    const slots = new Map(), links = [];
    const maxColumns = Math.max(...model.rows.map(r => r.length), ...model.bands.map(r => r.length), 1);
    diagram.style.minWidth = `${maxColumns * 110 + (maxColumns - 1) * 16}px`;
    model.rows.forEach((row, index) => {
      const line = el('div', 'mi-row');
      line.style.gridTemplateColumns = `repeat(${row.length}, minmax(0, 1fr))`;
      row.forEach(item => {
        const cell = item.node ? detail(item.node, 'node') : el('div', 'mi-route');
        if (!item.node) cell.setAttribute('aria-hidden', 'true');
        slots.set(item.key, cell); line.append(cell);
      });
      diagram.append(line);
      const band = model.bands[index];
      if (!band?.length) return;
      const edgeRow = el('div', 'mi-edge-row');
      edgeRow.style.gridTemplateColumns = `repeat(${band.length}, minmax(0, 1fr))`;
      let hasLabels = false;
      band.forEach(segment => {
        const showLabel = Boolean(segment.label && (
          segment.edge.rules?.length || segment.edge.rule?.trim() || segment.edge.sutra
        ));
        hasLabels ||= showLabel;
        const label = showLabel ? detail(segment.edge, 'edge') : el('div', 'mi-route');
        if (!showLabel) label.setAttribute('aria-hidden', 'true');
        edgeRow.append(label); links.push({...segment, label, showLabel});
      });
      if (!hasLabels) edgeRow.classList.add('mi-unlabelled');
      diagram.append(edgeRow);
    });
    scroll.append(diagram); parent.append(scroll);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const markerId = `mi-arrow-${++serial}`;
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    Object.entries({id:markerId, viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'6', markerHeight:'6', orient:'auto-start-reverse'}).forEach(([k,v]) => marker.setAttribute(k,v));
    const triangle = document.createElementNS(ns, 'path');
    triangle.setAttribute('d','M 0 0 L 10 5 L 0 10 z'); triangle.setAttribute('fill','#9b8c71');
    marker.append(triangle); defs.append(marker); svg.append(defs); diagram.prepend(svg);
    function draw() {
      svg.querySelectorAll(':scope > path').forEach(p => p.remove());
      const base = diagram.getBoundingClientRect();
      const port = (element, bottom) => {
        const r = element.getBoundingClientRect();
        return [r.left + r.width / 2 - base.left, (bottom ? r.bottom : r.top) - base.top];
      };
      const connect = (a, b, arrow, kind) => {
        const path = document.createElementNS(ns, 'path');
        const mid = (a[1] + b[1]) / 2;
        path.setAttribute('d', `M ${a} C ${a[0]},${mid} ${b[0]},${mid} ${b}`);
        path.setAttribute('fill','none'); path.setAttribute('stroke','#9b8c71');
        path.setAttribute('stroke-width','1.3');
        if (kind === 'borrowing') path.setAttribute('stroke-dasharray','4 3');
        if (arrow) path.setAttribute('marker-end',`url(#${markerId})`);
        svg.append(path);
      };
      links.forEach(link => {
        const start = port(slots.get(link.from), true);
        const end = port(slots.get(link.to), false);
        if (link.showLabel) {
          connect(start, port(link.label, false), false, link.edge.kind);
          connect(port(link.label, true), end, true, link.edge.kind);
        } else {
          connect(start, end, true, link.edge.kind);
        }
      });
    }
    const observer = new ResizeObserver(draw);
    observer.observe(diagram);
    state.cleanups.push(() => observer.disconnect());
    requestAnimationFrame(draw);
  }
  function updateTabIndicator(state) {
    const button = state.buttons[state.tab];
    state.indicator.style.width = `${button.offsetWidth}px`;
    state.indicator.style.transform = `translateX(${button.offsetLeft}px)`;
    if (!state.tablist.classList.contains('mi-indicator-ready')) {
      void state.indicator.offsetWidth;
      state.tablist.classList.add('mi-indicator-ready');
    }
  }
  function markTrigger(trigger, selected) {
    if (!trigger) return;
    const foreign = trigger.matches('.family-pill');
    const sanskrit = trigger.matches('.sanskrit-name button');
    if (!foreign && !sanskrit) return;
    trigger.classList.toggle('mi-selected', selected);
    trigger.setAttribute('aria-expanded', String(selected));
    trigger.setAttribute('aria-controls', foreign ? 'mi-foreign' : 'mi-sanskrit');
  }
  function render(state) {
    state.cleanups.forEach(fn => fn()); state.cleanups = [];
    const body = state.body; body.replaceChildren(); body.scrollTop = 0;
    state.buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === state.tab));
      button.tabIndex = i === state.tab ? 0 : -1;
    });
    updateTabIndicator(state);
    body.setAttribute('aria-labelledby', state.buttons[state.tab].id);
    const record = state.record;
    if (state.tab === 1 && state.type === 'sanskrit') return;
    if (state.tab === 2) {
      if (record.attestation_status === 'newly_proposed') {
        body.append(el('p', 'mi-empty', 'Newly proposed name; no known historical attestation.'));
      }
      const attestations = [...(record.attestations || [])].sort((a,b) => (a.sort_year ?? Infinity) - (b.sort_year ?? Infinity));
      if (!attestations.length && record.attestation_status !== 'newly_proposed') body.append(el('p', 'mi-empty', 'सद्यः प्रयोगा न लभ्याः'));
      attestations.forEach(a => {
        const item = el('section', 'mi-attestation');
        const heading = el('div', 'mi-attestation-heading');

        citations(heading, a.citations);
        heading.append(
          el('span', 'mi-meta',
            [a.language, a.date].filter(Boolean).join(' · ')
          )
        );

        item.append(heading);
        
        if (a.quote) { const quote = el('blockquote', 'prose'); quote.innerHTML = markdown(a.quote); item.append(quote); }
        addProse(item, a.notes);
        body.append(item);
      });
      return;
    }
    const etymologies = record.etymologies || [];
    if (!etymologies.length) { body.append(el('p', 'mi-empty', 'सद्यः प्रक्रिया न लभ्या।')); return; }
    const etymology = etymologies[state.etymology];
    const etymHeading = el('div', 'mi-etym-heading');
    if (state.tab === 0) addProse(etymHeading, etymology.derivation, 'derivation');
    if (etymologies.length > 1) {
      const choices = el('div', 'mi-etym-choices');
      choices.setAttribute('role', 'group');
      choices.setAttribute('aria-label', 'Etymology selection');

      etymologies.forEach((etymology, i) => {
        const number = String(i + 1).replace(
          /\d/g, digit => '०१२३४५६७८९'[Number(digit)]
        );
        const button = el('button', '', number);
        button.type = 'button';
        button.setAttribute(
          'aria-pressed', String(i === state.etymology)
        );
        button.addEventListener('click', () => {
          state.etymology = i;
          render(state);
          state.body.querySelectorAll(
            '.mi-etym-choices button'
          )[i]?.focus({ preventScroll: true });
        });
        choices.append(button);
      });

      etymHeading.append(choices);
    }
    if (etymHeading.childNodes.length) body.append(etymHeading);
    if (state.tab === 0) {
      tree(body, etymology.steps ?? etymology.tree, state);
      addProse(body, etymology.notes); citations(body, etymology.citations);
    } else tree(body, etymology.descendants, state);
  }
  function positioning() {
    const opened = Object.values(states).filter(state => state.open);
    const modal = mobilePanels.matches && opened.length > 0;
    document.body.classList.toggle('mi-both', !mobilePanels.matches && opened.length === 2);
    document.body.classList.toggle('mi-mobile-inspector', modal);
    for (const state of Object.values(states)) {
      markTrigger(state.trigger, state.open);
      if (mobilePanels.matches) state.panel.setAttribute('role', 'dialog');
      else state.panel.removeAttribute('role');
      if (modal && state.open) state.panel.setAttribute('aria-modal', 'true');
      else state.panel.removeAttribute('aria-modal');
    }
    for (const element of document.querySelectorAll('body > header, body > main')) element.inert = modal;
    const overview = document.getElementById('sidebar');
    overview.inert = modal || !overview.classList.contains('open');
  }
  function hideOtherMobilePanels(keep) {
    if (!mobilePanels.matches) return;
    for (const state of Object.values(states)) {
      if (state === keep || !state.open) continue;
      state.open = false;
      state.panel.classList.remove('mi-open');
      state.panel.classList.add('mi-superseded');
      state.panel.inert = true;
      state.panel.setAttribute('aria-hidden', 'true');
    }
  }
  function close(state) {
    state.open = false; state.panel.classList.remove('mi-open'); state.panel.inert = true;
    state.panel.setAttribute('aria-hidden','true'); positioning();
    if (state.trigger?.isConnected && !state.trigger.closest('[inert]')) state.trigger.focus({preventScroll:true});
    else document.querySelector('.sidebar-close')?.focus({preventScroll:true});
  }
  function create(type) {
    const state = {type, open:false, tab:0, etymology:0, cleanups:[]};
    const panel = el('aside', 'mi-panel'); panel.id = `mi-${type}`; panel.inert = true;
    panel.setAttribute('aria-hidden','true'); panel.setAttribute('aria-labelledby', `${panel.id}-title`);
    const top = el('div', 'mi-top');
    top.append(el('div', 'mi-kind', type === 'foreign' ? 'मूलभाषा' : 'संस्कृतम्'));
    const title = el('h2', 'mi-title'); title.id = `${panel.id}-title`; top.append(title);
    const dismiss = el('button', 'mi-close', '×'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', `Close ${type} inspector`);
    dismiss.addEventListener('click', () => close(state)); top.append(dismiss);
    const tablist = el('div', 'mi-tabs'); tablist.setAttribute('role','tablist'); tablist.setAttribute('aria-label', `${type} name details`);
    state.buttons = tabs.map((text,i) => {
      const button = el('button','',text); button.type='button'; button.id=`${panel.id}-tab-${i}`;
      button.setAttribute('role','tab'); button.setAttribute('aria-controls',`${panel.id}-content`);
      button.addEventListener('click', () => { state.tab=i; render(state); });
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (i+1)%3;
        if (event.key === 'ArrowLeft') next = (i+2)%3;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = 2;
        if (next === undefined) return;
        event.preventDefault(); state.tab=next; render(state); state.buttons[next].focus();
      });
      tablist.append(button); return button;
    });
    const indicator = el('span', 'mi-tab-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    tablist.append(indicator);
    const body = el('div','mi-content'); body.id=`${panel.id}-content`; body.setAttribute('role','tabpanel'); body.tabIndex=0;
    panel.append(top,tablist,body); document.body.append(panel);
    Object.assign(state,{panel,body,title,tablist,indicator});
    const tabObserver = new ResizeObserver(() => updateTabIndicator(state));
    tabObserver.observe(tablist);
    state.buttons.forEach(button => tabObserver.observe(button));
    return state;
  }
  window.NameInspectors = {
    closeAll() {
      const opened = Object.values(states).filter(state => state.open);

      for (const state of opened) {
        state.open = false;
        state.panel.classList.remove('mi-open');
        state.panel.inert = true;
        state.panel.setAttribute('aria-hidden', 'true');
      }

      positioning();
      return opened.length > 0;
    },
    open(type, record, trigger) {
      if (!['foreign','sanskrit'].includes(type)) throw Error('Unknown inspector type');
      const state = states[type] || (states[type] = create(type));
      hideOtherMobilePanels(state);
      state.panel.classList.remove('mi-superseded');
      state.lastOpened = ++openingOrder;
      if (state.record !== record) { state.record=record; state.etymology=0; }
      if (state.trigger !== trigger) markTrigger(state.trigger, false);
      state.trigger = trigger;

      state.panel.querySelector('.mi-kind').textContent =
        type === 'foreign'
          ? (record.language || 'मूलभाषा')
          : 'संस्कृतम्';

      state.title.replaceChildren(
        el('span', '', record.name || record.label || '')
      );

      if (type === 'foreign' && record.pronunciation) {
        state.title.append(
          el('span', 'mi-pronunciation', `· / ${record.pronunciation} /`)
        );
      }
      render(state);
      // Commit closed geometry once; later replacements never remove mi-open.
      if (!state.open) { void state.panel.offsetWidth; state.open=true; state.panel.classList.add('mi-open'); }
      state.panel.inert=false; state.panel.setAttribute('aria-hidden','false'); positioning();
      state.buttons[state.tab].focus({preventScroll:true});
    }
  };
  mobilePanels.addEventListener('change', () => {
    const opened = Object.values(states).filter(state => state.open);
    const latest = opened.sort((a, b) => b.lastOpened - a.lastOpened)[0];
    if (latest) hideOtherMobilePanels(latest);
    if (!mobilePanels.matches) Object.values(states).forEach(state => state.panel.classList.remove('mi-superseded'));
    positioning();
    if (mobilePanels.matches && latest) latest.buttons[latest.tab].focus({preventScroll:true});
  });
  document.addEventListener('keydown', event => {
    if (!mobilePanels.matches || event.key !== 'Tab') return;
    const state = Object.values(states).find(state => state.open);
    if (!state) return;
    const focusable = [...state.panel.querySelectorAll('button, a[href], select, [tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (!state.panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
})();
