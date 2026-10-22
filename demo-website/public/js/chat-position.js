/* Lina's launcher position only. No messages or account details are stored. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LangNationChatPosition = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function viewport(win) {
    const view = win.visualViewport;
    const left = view ? view.offsetLeft : 0, top = view ? view.offsetTop : 0;
    const width = view ? view.width : win.innerWidth, height = view ? view.height : win.innerHeight;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }

  function clamp(point, size, area, edge = 10) {
    return {
      x: Math.round(Math.max(area.left + edge, Math.min(point.x, area.right - size.width - edge))),
      y: Math.round(Math.max(area.top + edge, Math.min(point.y, area.bottom - size.height - edge)))
    };
  }

  function overlaps(point, size, field, gap = 8) {
    return point.x < field.right + gap && point.x + size.width > field.left - gap &&
      point.y < field.bottom + gap && point.y + size.height > field.top - gap;
  }

  function avoidField(point, size, field, area) {
    const origin = clamp(point, size, area);
    if (!overlaps(origin, size, field)) return origin;
    const candidates = [
      { x: origin.x, y: field.top - size.height - 10 },
      { x: origin.x, y: field.bottom + 10 },
      { x: field.left - size.width - 10, y: origin.y },
      { x: field.right + 10, y: origin.y },
      { x: area.left + 10, y: area.top + 10 },
      { x: area.right - size.width - 10, y: area.top + 10 },
      { x: area.left + 10, y: area.bottom - size.height - 10 },
      { x: area.right - size.width - 10, y: area.bottom - size.height - 10 }
    ].map(p => clamp(p, size, area)).filter(p => !overlaps(p, size, field));
    candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
    return candidates[0] || null;
  }

  function isPageField(element, widget) {
    if (!element || widget.contains(element)) return false;
    if (element.isContentEditable || element.tagName === "TEXTAREA") return true;
    return element.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|range|color|hidden|image)$/i.test(element.type || "text");
  }

  function create({ widget, launcher, panel, minimise, win = window, doc = document }) {
    const KEY = "ln.ai.launcher-position.v1";
    let spot = null, drag = null, frame = null, suppressUntil = 0;
    let lastWidth = "", lastHeight = "";
    try {
      const saved = JSON.parse(win.localStorage.getItem(KEY) || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) spot = saved;
    } catch (_) { /* Private mode still gets a working launcher. */ }

    function save() {
      try { win.localStorage.setItem(KEY, JSON.stringify(spot)); } catch (_) {}
    }

    function apply(point) {
      widget.style.left = point.x + "px";
      widget.style.top = point.y + "px";
      widget.style.right = "auto";
      widget.style.bottom = "auto";
    }

    function bounds() {
      const area = viewport(win), css = win.getComputedStyle(widget);
      const inset = side => Math.max(0, parseFloat(css.getPropertyValue("--ai-safe-" + side)) || 0);
      area.left += inset("left"); area.right -= inset("right");
      area.top += inset("top"); area.bottom -= inset("bottom");
      return area;
    }

    function sync() {
      if (drag) return;
      const view = viewport(win);
      const width = Math.round(view.width) + "px", height = Math.round(view.height) + "px";
      if (width !== lastWidth) widget.style.setProperty("--ai-viewport-width", lastWidth = width);
      if (height !== lastHeight) widget.style.setProperty("--ai-viewport-height", lastHeight = height);
      const field = isPageField(doc.activeElement, widget) ? doc.activeElement : null;
      widget.classList.toggle("is-compact", !!field && panel.hidden);
      widget.classList.remove("is-field-covered");
      const area = bounds(), size = (panel.hidden ? launcher : panel).getBoundingClientRect();
      const resting = { x: area.right - size.width - 10, y: area.bottom - size.height - 10 };
      // Opening always uses the safe lower corner, even after a drag to the top.
      let point = clamp(panel.hidden && spot ? spot : resting, size, area);
      if (field && panel.hidden) {
        point = avoidField(point, size, field.getBoundingClientRect(), area);
        // A full-screen editor may leave no free corner. Stay hidden until blur.
        widget.classList.toggle("is-field-covered", !point);
      }
      if (point) apply(point);
    }

    function queue() {
      if (frame !== null) return;
      frame = win.requestAnimationFrame(() => { frame = null; sync(); });
    }

    doc.addEventListener("focusin", event => {
      if (!isPageField(event.target, widget)) return;
      if (!panel.hidden) minimise(true);
      sync();
    });
    doc.addEventListener("focusout", queue);
    // Page scrolling changes the field's rectangle even when the keyboard stays up.
    doc.addEventListener("scroll", queue, { capture: true, passive: true });
    win.addEventListener("resize", queue);
    win.visualViewport?.addEventListener("resize", queue);
    win.visualViewport?.addEventListener("scroll", queue);

    launcher.addEventListener("pointerdown", event => {
      if (!panel.hidden || drag || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      widget.classList.add("is-armed");
      const rect = launcher.getBoundingClientRect();
      drag = { id: event.pointerId, fromX: event.clientX, fromY: event.clientY,
        start: { x: rect.left, y: rect.top }, point: { x: rect.left, y: rect.top },
        size: { width: rect.width, height: rect.height }, area: bounds(), moved: false };
      try { launcher.setPointerCapture(event.pointerId); } catch (_) {}
    });

    launcher.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.fromX, dy = event.clientY - drag.fromY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      widget.classList.add("is-dragging");
      drag.point = clamp({ x: drag.start.x + dx, y: drag.start.y + dy }, drag.size, drag.area);
      // Transform during travel: no layout read or right/bottom update per move.
      widget.style.transform = "translate3d(" + (drag.point.x - drag.start.x) + "px," + (drag.point.y - drag.start.y) + "px,0)";
    });

    function finish(event, cancelled) {
      if (!drag || (event && event.pointerId != null && event.pointerId !== drag.id)) return;
      const done = drag; drag = null;
      if (done.moved) {
        spot = done.point;
        apply(spot); save();
        if (!cancelled) suppressUntil = Date.now() + 400;
      }
      widget.style.transform = "";
      widget.classList.remove("is-armed", "is-dragging");
      try { if (launcher.hasPointerCapture(done.id)) launcher.releasePointerCapture(done.id); } catch (_) {}
      queue();
    }

    // Registered before app.js's opener. A drag release must not also open chat.
    launcher.addEventListener("click", event => {
      if (event.detail !== 0 && Date.now() < suppressUntil) {
        suppressUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    launcher.addEventListener("pointerup", event => finish(event, false));
    launcher.addEventListener("pointercancel", event => finish(event, true));
    launcher.addEventListener("lostpointercapture", event => finish(event, true));
    win.addEventListener("blur", () => finish(null, true));
    launcher.addEventListener("keydown", event => {
      if (!event.altKey || !panel.hidden || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
      event.preventDefault();
      const rect = launcher.getBoundingClientRect();
      const dx = event.key === "ArrowLeft" ? -10 : event.key === "ArrowRight" ? 10 : 0;
      const dy = event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0;
      spot = clamp({ x: rect.left + dx, y: rect.top + dy }, rect, bounds());
      save(); sync();
    });
    // Images, fonts and text-size settings may change the launcher's width.
    if (win.ResizeObserver) {
      const observer = new win.ResizeObserver(queue);
      observer.observe(launcher); observer.observe(panel);
    }
    doc.fonts?.ready.then(queue);
    sync();
    return { sync };
  }

  return { viewport, clamp, overlaps, avoidField, isPageField, create };
});
