(() => {
  const STORAGE_KEY = "cups.first-cup-001";

  const fresh = () => ({
    schema: "cups/world/v0",
    worldId: "world-000",
    looked: false,
    touched: false,
    moveUnlocked: false,
    makeUnlocked: false,
    stackUnlocked: false,
    marksUnlocked: false,
    moveMode: false,
    cups: [{ id: "cup-001", x: 50, y: 53 }],
    traces: []
  });

  let state = load();

  const $ = (id) => document.getElementById(id);
  const els = {
    void: $("void"), room: $("room"), look: $("lookButton"),
    touch: $("touchButton"), move: $("moveButton"), make: $("makeButton"),
    stack: $("stackButton"), field: $("cupField"), obs: $("observationText"),
    marks: $("marks"), traceButton: $("traceButton"), traceCount: $("traceCount"),
    drawer: $("traceDrawer"), traceList: $("traceList"), closeTrace: $("closeTrace"),
    copyTrace: $("copyTrace"), resetWorld: $("resetWorld"), toast: $("toast")
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fresh();
      const parsed = JSON.parse(raw);
      return { ...fresh(), ...parsed, traces: Array.isArray(parsed.traces) ? parsed.traces : [] };
    } catch {
      return fresh();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function trace(type, data = {}) {
    const event = {
      schema: "cups/trace/v0",
      event_id: crypto.randomUUID ? crypto.randomUUID() : "e-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      type,
      world_id: state.worldId,
      at: new Date().toISOString(),
      data
    };
    state.traces.push(event);
    save();
    renderTraceCount();
    return event;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.add("hidden"), 1300);
  }

  function unlock(key, eventType, message) {
    if (state[key]) return;
    state[key] = true;
    trace(eventType, { authority: "local-world" });
    toast(message);
  }

  function renderTraceCount() {
    els.traceCount.textContent = String(state.traces.length);
  }

  function cupNode(cup) {
    const node = document.createElement("div");
    node.className = "cup";
    node.dataset.cupId = cup.id;
    node.style.left = cup.x + "%";
    node.style.top = cup.y + "%";
    node.innerHTML = '<div class="cup-handle"></div><div class="cup-body"></div><div class="cup-rim"></div>';

    node.addEventListener("pointerdown", (event) => {
      if (!state.looked) return;

      if (!state.touched) {
        state.touched = true;
        trace("cup.touched", { cup_id: cup.id });
        unlock("moveUnlocked", "affordance.unlocked", "MOVE appeared.");
        unlock("marksUnlocked", "marking.unlocked", "This moment can be marked.");
        node.classList.add("touched");
        setTimeout(() => node.classList.remove("touched"), 420);
        els.obs.textContent = "The cup moved a little under your finger.";
        save();
        render();
        return;
      }

      if (!state.moveMode) return;
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      node.classList.add("dragging");
      const rect = els.field.getBoundingClientRect();
      const start = { x: cup.x, y: cup.y };

      const onMove = (e) => {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        cup.x = Math.max(10, Math.min(90, x));
        cup.y = Math.max(18, Math.min(84, y));
        node.style.left = cup.x + "%";
        node.style.top = cup.y + "%";
      };

      const onUp = () => {
        node.classList.remove("dragging");
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        node.removeEventListener("pointercancel", onUp);

        const distance = Math.hypot(cup.x - start.x, cup.y - start.y);
        if (distance > 2) {
          trace("cup.moved", {
            cup_id: cup.id,
            from: start,
            to: { x: round(cup.x), y: round(cup.y) }
          });
          if (!state.makeUnlocked) unlock("makeUnlocked", "affordance.unlocked", "MAKE ANOTHER appeared.");
          if (state.cups.length > 1) detectNearness();
        }
        save();
        render();
      };

      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
      node.addEventListener("pointercancel", onUp);
    });

    return node;
  }

  function round(n) { return Math.round(n * 10) / 10; }

  function detectNearness() {
    if (state.cups.length < 2 || state.stackUnlocked) return;
    const a = state.cups[0];
    const b = state.cups[1];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance < 18) {
      trace("relation.observed", {
        relation: "cup.near.cup",
        subjects: [a.id, b.id],
        distance: round(distance)
      });
      unlock("stackUnlocked", "affordance.proposed", "STACK appeared.");
      els.obs.textContent = "The two cups fit into the same little patch of world.";
    }
  }

  function renderCups() {
    els.field.innerHTML = "";
    state.cups.forEach(c => els.field.appendChild(cupNode(c)));
  }

  function render() {
    els.void.classList.toggle("hidden", state.looked);
    els.room.classList.toggle("hidden", !state.looked);
    els.touch.classList.toggle("hidden", !state.looked || state.touched);
    els.move.classList.toggle("hidden", !state.moveUnlocked);
    els.make.classList.toggle("hidden", !state.makeUnlocked || state.cups.length > 1);
    els.stack.classList.toggle("hidden", !state.stackUnlocked);
    els.marks.classList.toggle("hidden", !state.marksUnlocked);
    els.move.textContent = state.moveMode ? "DONE MOVING" : "MOVE";
    renderCups();
    renderTraceCount();
  }

  els.look.addEventListener("click", () => {
    state.looked = true;
    trace("observer.looked", { observer_id: "player-001", target: "room-001" });
    trace("object.available", { object_id: "cup-001", to_observer: "player-001" });
    save();
    render();
    els.obs.textContent = "You can see a blue cup.";
  });

  els.touch.addEventListener("click", () => {
    const first = els.field.querySelector(".cup");
    if (first) first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
  });

  els.move.addEventListener("click", () => {
    state.moveMode = !state.moveMode;
    trace("mode.changed", { mode: "move", enabled: state.moveMode });
    save();
    render();
    els.obs.textContent = state.moveMode ? "Drag a cup." : "The cup stays where you left it.";
  });

  els.make.addEventListener("click", () => {
    if (state.cups.length > 1) return;
    const second = { id: "cup-002", x: 72, y: 55 };
    state.cups.push(second);
    trace("object.constructed", {
      object_id: second.id,
      kind: "cup",
      basis: ["cup-001", "affordance:make-another"],
      authority: "local-world"
    });
    save();
    render();
    els.obs.textContent = "Now there are two. Try moving them near each other.";
  });

  els.stack.addEventListener("click", () => {
    if (state.cups.length < 2) return;
    const base = state.cups[0];
    const top = state.cups[1];
    top.x = base.x + 2;
    top.y = Math.max(20, base.y - 23);
    trace("relation.admitted", {
      relation: "cup.stacked_on.cup",
      from: top.id,
      to: base.id,
      scope: state.worldId,
      authority: "local-world"
    });
    trace("world.capability_grew", {
      capability: "stack",
      basis: "witnessed cup.near.cup relation",
      scope: state.worldId
    });
    save();
    render();
    els.obs.textContent = "You built something the world could not do when it began.";
    toast("THE WORLD GREW.");
  });

  els.marks.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mark]");
    if (!button) return;
    trace("human.mark", {
      kind: button.dataset.mark,
      witness: "player-001",
      ref_event_id: state.traces.at(-1)?.event_id || null,
      authority: "attention-only"
    });
    save();
    renderTraceCount();
    toast(button.dataset.mark + " marked.");
  });

  els.traceButton.addEventListener("click", () => {
    renderTraceList();
    els.drawer.classList.remove("hidden");
  });

  els.closeTrace.addEventListener("click", () => els.drawer.classList.add("hidden"));

  function renderTraceList() {
    els.traceList.innerHTML = "";
    state.traces.slice().reverse().forEach((event) => {
      const li = document.createElement("li");
      const time = new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      li.innerHTML = '<span class="trace-type"></span> <span class="trace-time"></span><br><span class="trace-data"></span>';
      li.querySelector(".trace-type").textContent = event.type;
      li.querySelector(".trace-time").textContent = time;
      li.querySelector(".trace-data").textContent = JSON.stringify(event.data);
      els.traceList.appendChild(li);
    });
  }

  els.copyTrace.addEventListener("click", async () => {
    const payload = JSON.stringify({ schema: state.schema, world_id: state.worldId, traces: state.traces }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast("Trace copied.");
    } catch {
      toast("Clipboard unavailable.");
    }
  });

  els.resetWorld.addEventListener("click", () => {
    const ok = window.confirm("Reset WORLD 000? This clears only this browser's local cUps trace.");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = fresh();
    els.drawer.classList.add("hidden");
    render();
  });

  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Offline support is optional; play remains available online.
      });
    });
  }
})();
