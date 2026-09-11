/* Decorative actions follow observed work state; they never publish activity. */
((scope) => {
  "use strict";
  const roles = {
    CHATGPT_WORK: {
      work: [55, 65],
      rest: [60, 42],
      room: "導演桌",
      place: "扶手椅",
      actions: ["翻企劃", "整理筆記", "想一想"],
      restActions: ["喝茶", "翻書", "伸懶腰"],
      props: ["▤", "✎", "···"],
      bounds: [385, 333, 101, 76, 284, 325],
    },
    CLAUDE: {
      work: [24, 66],
      rest: [78, 78],
      room: "剪輯桌",
      place: "休息角",
      actions: ["看剪輯", "記重點", "檢查畫面"],
      restActions: ["聽音樂", "伸懶腰", "喝茶"],
      props: ["▣", "✎", "⌕"],
      bounds: [515, 484, 4, 9, 499, 471],
    },
    BIONIC: {
      work: [11, 36],
      rest: [43, 79],
      room: "研究桌",
      place: "庭院",
      actions: ["看資料", "查線索", "整理卡片"],
      restActions: ["看雪景", "翻書", "打盹"],
      props: ["▤", "⌕", "▱"],
      bounds: [344, 387, 18, 2, 306, 368],
    },
    ASTRA: {
      work: [80, 40],
      rest: [91, 80],
      room: "工程桌",
      place: "床邊",
      actions: ["敲鍵盤", "檢查程式", "想一想"],
      restActions: ["喝茶", "伸懶腰", "打盹"],
      props: ["⌨", "✓", "···"],
      bounds: [500, 500, 124, 49, 385, 428],
    },
  };
  const states = new WeakMap();
  function destination(key, view) {
    const role = roles[key];
    if (!view.running)
      return { point: role.rest, place: role.place, mode: "rest" };
    const repo = view.contexts?.some((c) => c.kind === "REPO");
    return {
      point: repo ? [76 + Object.keys(roles).indexOf(key) * 3, 39] : role.work,
      place: repo ? "工程桌" : role.room,
      mode: "work",
    };
  }
  function sync(el, key, view, name) {
    const role = roles[key],
      target = destination(key, view);
    let state = states.get(el);
    if (!state) {
      const img = el.querySelector("img"),
        portrait = document.createElement("div");
      portrait.className = "co-scene-portrait";
      img.before(portrait);
      portrait.append(img);
      const [w, h, x, y, right, bottom] = role.bounds,
        bh = bottom - y,
        bw = right - x;
      portrait.style.aspectRatio = `${bw}/${bh}`;
      Object.assign(img.style, {
        width: `${(w / bw) * 100}%`,
        height: `${(h / bh) * 100}%`,
        left: `${(-x / bw) * 100}%`,
        top: `${(-y / bh) * 100}%`,
      });
      const prop = document.createElement("span");
      prop.className = "co-scene-prop";
      prop.setAttribute("aria-hidden", "true");
      el.append(prop);
      state = { point: role.rest, token: 0 };
      states.set(el, state);
      el.style.left = role.rest[0] + "%";
      el.style.top = role.rest[1] + "%";
    }
    const hash = target.mode + target.point.join(",");
    if (state.hash === hash) return;
    state.hash = hash;
    const token = ++state.token;
    state.animation?.cancel();
    clearTimeout(state.timer);
    const label = el.querySelector(".rsc-label"),
      prop = el.querySelector(".co-scene-prop");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cycle = (i = 0) => {
      if (token !== state.token || !el.isConnected) return;
      const actions = target.mode === "work" ? role.actions : role.restActions;
      const action = actions[i % actions.length];
      el.dataset.action =
        target.mode === "work"
          ? ["typing", "reading", "thinking"][i % 3]
          : action === "伸懶腰"
            ? "stretch"
            : action === "打盹"
              ? "sleep"
              : "rest";
      prop.textContent =
        target.mode === "work"
          ? role.props[i % 3]
          : action === "喝茶"
            ? "☕"
            : action === "打盹"
              ? "Z z"
              : action === "聽音樂"
                ? "♫"
                : action === "看雪景"
                  ? "❄"
                  : "▤";
      label.textContent = `${name}｜${target.place} · ${action}`;
      if (!reduced)
        state.timer = setTimeout(
          () => cycle(i + 1),
          6000 + Object.keys(roles).indexOf(key) * 850,
        );
    };
    const arrive = () => {
      if (token !== state.token) return;
      state.point = target.point;
      el.style.left = target.point[0] + "%";
      el.style.top = target.point[1] + "%";
      state.animation?.cancel();
      cycle();
    };
    if (reduced || state.point.every((n, i) => n === target.point[i])) {
      arrive();
      return;
    }
    el.dataset.action = "walking";
    prop.textContent = "";
    label.textContent = `${name}｜走向${target.place}`;
    const points = [
      state.point,
      [state.point[0], 68],
      [target.point[0], 68],
      target.point,
    ];
    state.animation = el.animate(
      points.map(([x, y]) => ({ left: x + "%", top: y + "%" })),
      { duration: 4600, easing: "linear", fill: "forwards" },
    );
    state.animation.finished.then(arrive).catch(() => {});
  }
  scope.CreatorScene = { sync, destination, bounds: (key) => roles[key]?.bounds };
  if (typeof module !== "undefined") module.exports = { destination };
})(typeof window === "undefined" ? globalThis : window);
