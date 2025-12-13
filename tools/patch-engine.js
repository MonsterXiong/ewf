function edgeEq(a, b) {
  return a.from.nodeId === b.from.nodeId && a.from.port === b.from.port &&
         a.to.nodeId === b.to.nodeId && a.to.port === b.to.port;
}

function findNode(wf, nodeId) {
  return (wf.graph.nodes ?? []).find((n) => n.id === nodeId) ?? null;
}

function removeNode(wf, nodeId) {
  wf.graph.nodes = (wf.graph.nodes ?? []).filter((n) => n.id !== nodeId);
  wf.graph.edges = (wf.graph.edges ?? []).filter((e) => e.from.nodeId !== nodeId && e.to.nodeId !== nodeId);
}

function outgoingEdges(wf, nodeId, port="out") {
  return (wf.graph.edges ?? []).filter((e) => e.from.nodeId === nodeId && e.from.port === port);
}
function incomingEdges(wf, nodeId, port="in") {
  return (wf.graph.edges ?? []).filter((e) => e.to.nodeId === nodeId && e.to.port === port);
}

function applyPatches(wf, _params, patches) {
  wf.graph.nodes = wf.graph.nodes ?? [];
  wf.graph.edges = wf.graph.edges ?? [];

  for (const p of patches) {
    if (p.op === "setNodeInputs") {
      const node = findNode(wf, p.nodeId);
      if (!node) throw new Error(`patch setNodeInputs node not found: ${p.nodeId}`);
      // path like "inputs.inputs" etc.
      const parts = p.path.split(".").filter(Boolean);
      let cur = node;
      for (let i=0;i<parts.length-1;i++){
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length-1]] = p.value;
      continue;
    }

    if (p.op === "insertNode") {
      if (findNode(wf, p.node.id)) throw new Error(`insertNode duplicate id: ${p.node.id}`);
      wf.graph.nodes.push(p.node);
      continue;
    }

    if (p.op === "insertEdge") {
      wf.graph.edges.push(p.edge);
      continue;
    }

    if (p.op === "removeEdge") {
      wf.graph.edges = wf.graph.edges.filter((e) => !edgeEq(e, p.edge));
      continue;
    }

    if (p.op === "rewireAfter") {
      const anchor = p.anchorNodeId;
      const newNode = p.newNodeId;
      const outs = outgoingEdges(wf, anchor, "out");
      if (outs.length !== 1) throw new Error(`rewireAfter expects 1 out edge on ${anchor}, got ${outs.length}`);
      const oldSucc = outs[0].to.nodeId;

      // remove old edge
      wf.graph.edges = wf.graph.edges.filter((e) => !edgeEq(e, outs[0]));

      // anchor -> newNode
      wf.graph.edges.push({ from:{nodeId:anchor, port:"out"}, to:{nodeId:newNode, port:"in"} });
      // newNode -> oldSucc
      wf.graph.edges.push({ from:{nodeId:newNode, port:"out"}, to:{nodeId:oldSucc, port:"in"} });
      continue;
    }

    if (p.op === "replaceSlot") {
      const slotId = p.slotNodeId;
      const slotIn = incomingEdges(wf, slotId, "in");
      const slotOut = outgoingEdges(wf, slotId, "out");

      if (slotIn.length !== 1 || slotOut.length !== 1) {
        throw new Error(`replaceSlot requires slot with exactly 1 in and 1 out edge (slot=${slotId})`);
      }
      const pred = slotIn[0].from.nodeId;
      const succ = slotOut[0].to.nodeId;

      // remove slot node (also removes its edges)
      removeNode(wf, slotId);

      const sub = p.withSubgraph;
      const subNodes = sub.nodes ?? [];
      const subEdges = sub.edges ?? [];

      // insert nodes
      for (const n of subNodes) {
        if (findNode(wf, n.id)) throw new Error(`replaceSlot subgraph duplicate node id: ${n.id}`);
        wf.graph.nodes.push(n);
      }
      // insert edges
      for (const e of subEdges) wf.graph.edges.push(e);

      // connect pred -> (subgraph start) -> ... -> (subgraph end) -> succ
      const startId = sub.startNodeId ?? (subNodes[0] && subNodes[0].id);
      const endId = sub.endNodeId ?? (subNodes[subNodes.length-1] && subNodes[subNodes.length-1].id);
      if (!startId || !endId) throw new Error(`replaceSlot subgraph must have nodes and inferable start/end`);

      wf.graph.edges.push({ from:{nodeId:pred, port:"out"}, to:{nodeId:startId, port:"in"} });
      wf.graph.edges.push({ from:{nodeId:endId, port:"out"}, to:{nodeId:succ, port:"in"} });

      continue;
    }

    throw new Error(`unsupported patch op: ${p.op}`);
  }
}

module.exports = { applyPatches };
