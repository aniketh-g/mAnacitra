/* Pure DAG layout: long edges get invisible routing points. No linguistic inference. */
(function (root) {
  // Existing common/foreign/sanskrit chains remain valid. Named lanes or `from`
  // opt into explicit branching: omitted `from` continues only the same lane.
  function prakriyaToGraph(prakriyA) {
    const nodes = prakriyA.map((step, i) => ({...step, id: step.id || `step-${i}`}));
    const ids = new Set();
    for (const node of nodes) {
      if (typeof node.id !== 'string' || ids.has(node.id)) throw Error('Every step needs a unique string id.');
      ids.add(node.id);
    }
    const edges = [];
    const explicit = nodes.some(n => Object.hasOwn(n, 'from') ||
      (n.branch && !['common', 'foreign', 'sanskrit'].includes(n.branch)));
    function connect(from, to) {
      edges.push({from, to: to.id, kind: to.kind || 'morphology',
        rules: to.rules || [], rule: to.rule || '', sutra: to.sutra,
        // All inputs to this step share one operation and one displayed rule.
        join: to.id});
    }
    if (explicit) {
      const last = new Map();
      for (const node of nodes) {
        const lane = node.branch || 'main';
        let parents = Object.hasOwn(node, 'from') ? node.from : (last.has(lane) ? [last.get(lane)] : []);
        if (typeof parents === 'string') parents = [parents];
        if (!Array.isArray(parents) || parents.some(p => typeof p !== 'string'))
          throw Error(`Step ${node.id}: from must be an id or an array of ids.`);
        if (new Set(parents).size !== parents.length) throw Error(`Step ${node.id}: duplicate inputs.`);
        for (const parent of parents) {
          if (!ids.has(parent)) throw Error(`Step ${node.id}: unknown input ${parent}.`);
          connect(parent, node);
        }
        last.set(lane, node.id);
      }
    } else {
      function chain(items, start) {
        let previous = start;
        for (const item of items) {
          if (previous) connect(previous.id, item);
          previous = item;
        }
        return previous;
      }
      if (nodes.some(n => ['foreign', 'sanskrit'].includes(n.branch))) {
        const end = chain(nodes.filter(n => !n.branch || n.branch === 'common'));
        chain(nodes.filter(n => n.branch === 'foreign'), end);
        chain(nodes.filter(n => n.branch === 'sanskrit'), end);
      } else chain(nodes);
    }
    // Preserve component order within each language; foreign stays on the left.
    const side = n => /^foreign(?:\d|$)/.test(n.branch || '') ? 1 :
      /^sanskrit(?:\d|$)/.test(n.branch || '') ? 2 : 0;
    return {nodes: [...nodes].sort((a, b) => side(a) - side(b)), edges};
  }
  // Keep branch placement, but turn designation-only steps into annotations.
  // Consecutive annotations on an unbranched chain share a single wrapping row.
  function sanjnaRules(graph, isSanjna) {
    layout(graph);
    let nodes = graph.nodes.map(node => ({...node}));
    let edges = (graph.edges || []).map(edge => ({...edge}));
    for (const node of nodes) {
      const incoming = edges.filter(edge => edge.to === node.id);
      const refs = incoming.flatMap(edge => Array.isArray(edge.rules) ? edge.rules : edge.rules ? [edge.rules] : []);
      if (incoming.length && incoming.every(edge => !edge.rule && !edge.sutra &&
          (Array.isArray(edge.rules) ? edge.rules.length : Boolean(edge.rules))) && refs.every(isSanjna)) {
        node.sanjnaRules = [...new Set(refs)];
      }
    }
    let merged = true;
    while (merged) {
      merged = false;
      for (const node of nodes) {
        if (!node.sanjnaRules) continue;
        const incoming = edges.filter(edge => edge.to === node.id);
        if (incoming.length !== 1) continue;
        const parent = nodes.find(candidate => candidate.id === incoming[0].from);
        if (!parent?.sanjnaRules || edges.filter(edge => edge.from === parent.id).length !== 1) continue;
        parent.sanjnaRules = [...new Set([...parent.sanjnaRules, ...node.sanjnaRules])];
        edges = edges.filter(edge => edge.to !== node.id).map(edge =>
          edge.from === node.id ? {...edge, from: parent.id} : edge);
        nodes = nodes.filter(candidate => candidate.id !== node.id);
        merged = true; break;
      }
    }
    return {...graph, nodes, edges};
  }
  function mainRules(graph, hidden) {
    layout(graph); // Validate before following parent chains.
    const incoming = new Map(graph.nodes.map(n => [n.id, []]));
    const outgoing = new Map(graph.nodes.map(n => [n.id, []]));
    const sourceEdges = graph.edges || [];
    sourceEdges.forEach(e => { incoming.get(e.to).push(e); outgoing.get(e.from).push(e); });
    const hiddenEdge = e => {
      const refs = Array.isArray(e.rules) ? e.rules : e.rules ? [e.rules] : [];
      return refs.length > 0 && !e.rule && !e.sutra && refs.every(hidden);
    };
    const marked = new Set(graph.nodes.filter(n => incoming.get(n.id).length &&
      incoming.get(n.id).every(hiddenEdge)).map(n => n.id));
    // Keep final forms, but omit their marked operation labels in the compact view.
    const removed = new Set([...marked].filter(id => outgoing.get(id).length));
    const memo = new Map();
    function ancestors(id) {
      if (!removed.has(id)) return [id];
      if (!memo.has(id)) memo.set(id, [...new Set(incoming.get(id).flatMap(e => ancestors(e.from)))]);
      return memo.get(id);
    }
    const edges = [];
    for (const edge of sourceEdges) {
      if (removed.has(edge.to)) continue;
      for (const from of ancestors(edge.from)) {
        const replacement = {...edge, from};
        if (marked.has(edge.to)) { replacement.rules = []; replacement.rule = ''; replacement.sutra = ''; }
        if (!edges.some(e => e.from === from && e.to === edge.to &&
          JSON.stringify(e.rules) === JSON.stringify(replacement.rules) && e.rule === replacement.rule)) edges.push(replacement);
      }
    }
    return {...graph, nodes: graph.nodes.filter(n => !removed.has(n.id)), edges};
  }
  function layout(graph) {
    const nodes = graph.nodes || [], edges = graph.edges || [];
    const byId = new Map();
    for (const node of nodes) {
      if (!node.id || byId.has(node.id)) throw Error('Every node needs a unique id.');
      byId.set(node.id, node);
    }
    const incoming = new Map(nodes.map(n => [n.id, 0]));
    const outgoing = new Map(nodes.map(n => [n.id, []]));
    for (const edge of edges) {
      if (!byId.has(edge.from) || !byId.has(edge.to)) throw Error('An edge references a missing node.');
      if (!edge.kind) throw Error('Every edge needs an operation kind.');
      incoming.set(edge.to, incoming.get(edge.to) + 1);
      outgoing.get(edge.from).push(edge);
    }
    const queue = nodes.filter(n => !incoming.get(n.id)).map(n => n.id);
    const rank = new Map(nodes.map(n => [n.id, 0]));
    let count = 0;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; count++;
      for (const edge of outgoing.get(id)) {
        rank.set(edge.to, Math.max(rank.get(edge.to), rank.get(id) + 1));
        incoming.set(edge.to, incoming.get(edge.to) - 1);
        if (!incoming.get(edge.to)) queue.push(edge.to);
      }
    }
    if (count !== nodes.length) throw Error('Derivation trees must not contain cycles.');
    const rows = Array.from({length: nodes.length ? Math.max(...rank.values()) + 1 : 0}, () => []);
    nodes.forEach(n => rows[rank.get(n.id)].push({key: n.id, node: n}));
    const bands = rows.slice(1).map(() => []);
    edges.forEach((edge, i) => {
      let from = edge.from;
      for (let r = rank.get(edge.from); r < rank.get(edge.to); r++) {
        const last = r + 1 === rank.get(edge.to);
        const to = last ? edge.to : Symbol(`route-${i}-${r}`);
        if (!last) rows[r + 1].push({key: to});
        bands[r].push({from, to, edge, label: edge.join ? last : r === rank.get(edge.from), join: last ? edge.join : null});
        from = to;
      }
    });
    // Input order specifies parallel branches: put foreign nodes before Sanskrit nodes.
    return {rows, bands};
  }
  root.InspectorGraph = {layout, prakriyaToGraph, mainRules, sanjnaRules};
  if (typeof module !== 'undefined') module.exports = {layout, prakriyaToGraph, mainRules, sanjnaRules};
})(globalThis);
