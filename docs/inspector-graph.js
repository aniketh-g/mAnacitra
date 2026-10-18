/* Pure DAG layout: long edges get invisible routing points. No linguistic inference. */
(function (root) {
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
        bands[r].push({from, to, edge, label: r === rank.get(edge.from)});
        from = to;
      }
    });
    // Input order specifies parallel branches: put foreign nodes before Sanskrit nodes.
    return {rows, bands};
  }
  root.InspectorGraph = {layout};
  if (typeof module !== 'undefined') module.exports = {layout};
})(globalThis);
