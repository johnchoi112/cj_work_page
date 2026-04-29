const state = { orderRows: [], inboundRows: [], filtered: null, charts: {} };

const el = {
  orderFile: document.getElementById("orderFile"),
  inboundFile: document.getElementById("inboundFile"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  sampleDataBtn: document.getElementById("sampleDataBtn"),
  applyFilterBtn: document.getElementById("applyFilterBtn"),
  monthFilter: document.getElementById("monthFilter"),
  vendorFilter: document.getElementById("vendorFilter"),
  statusText: document.getElementById("statusText"),
  mVendor: document.getElementById("mVendor"),
  mRate: document.getElementById("mRate"),
  mOrder: document.getElementById("mOrder"),
  mInbound: document.getElementById("mInbound"),
  summaryBody: document.getElementById("summaryBody"),
};

const orderAliases = {
  vendor: ["거래처", "거래처명"],
  orderQty: ["수량", "발주수량", "발주량"],
  inboundReqQty: ["입고의뢰수량"],
  inboundDoneQty: ["입고처리수량", "입고검사수량"],
  date: ["납기일자", "입고예정일자", "일자"],
};

const inboundAliases = {
  vendor: ["거래처", "거래처명"],
  inboundQty: ["입고수량"],
  date: ["입고일자", "입고년월"],
};

function pick(row, aliases) {
  for (const key of aliases) if (row[key] !== undefined && row[key] !== "") return row[key];
  return "";
}

function num(v) {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function readWorkbook(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function normalizeOrderRows(rows) {
  return rows.map((r) => ({
    vendor: String(pick(r, orderAliases.vendor) || "미지정거래처").trim(),
    orderQty: num(pick(r, orderAliases.orderQty)),
    inboundReqQty: num(pick(r, orderAliases.inboundReqQty)),
    inboundDoneQty: num(pick(r, orderAliases.inboundDoneQty)),
    date: String(pick(r, orderAliases.date)).slice(0, 10),
  }));
}

function normalizeInboundRows(rows) {
  return rows.map((r) => ({
    vendor: String(pick(r, inboundAliases.vendor) || "미지정거래처").trim(),
    inboundQty: num(pick(r, inboundAliases.inboundQty)),
    date: String(pick(r, inboundAliases.date)).slice(0, 10),
  }));
}

function aggregate(orderRows, inboundRows) {
  const map = new Map();
  for (const r of orderRows) {
    if (!map.has(r.vendor)) map.set(r.vendor, { vendor: r.vendor, orderQty: 0, inboundQty: 0, noInboundQty: 0 });
    const it = map.get(r.vendor);
    it.orderQty += r.orderQty;
    const noInbound = Math.max(r.orderQty - (r.inboundDoneQty || r.inboundReqQty), 0);
    it.noInboundQty += noInbound;
  }
  for (const r of inboundRows) {
    if (!map.has(r.vendor)) map.set(r.vendor, { vendor: r.vendor, orderQty: 0, inboundQty: 0, noInboundQty: 0 });
    map.get(r.vendor).inboundQty += r.inboundQty;
  }
  return [...map.values()].map((x) => ({ ...x, rate: x.orderQty ? (x.noInboundQty / x.orderQty) * 100 : 0 })).sort((a, b) => b.rate - a.rate);
}

function trend(inboundRows) {
  const byDate = {};
  for (const r of inboundRows) byDate[r.date || "미지정"] = (byDate[r.date || "미지정"] || 0) + r.inboundQty;
  const labels = Object.keys(byDate).sort();
  return { labels, values: labels.map((k) => byDate[k]) };
}

function applyFilters(orderRows, inboundRows) {
  const month = el.monthFilter.value;
  const vendorWord = el.vendorFilter.value.trim();
  const monthKey = month ? month.replace("-", "") : "";

  const of = orderRows.filter((r) => (!vendorWord || r.vendor.includes(vendorWord)) && (!monthKey || String(r.date).replace(/-/g, "").startsWith(monthKey)));
  const inf = inboundRows.filter((r) => (!vendorWord || r.vendor.includes(vendorWord)) && (!monthKey || String(r.date).replace(/-/g, "").startsWith(monthKey)));
  return { of, inf };
}

function render(summary, tr) {
  el.mVendor.textContent = summary.length.toLocaleString();
  el.mOrder.textContent = summary.reduce((a, b) => a + b.orderQty, 0).toLocaleString();
  el.mInbound.textContent = summary.reduce((a, b) => a + b.inboundQty, 0).toLocaleString();
  const avg = summary.length ? summary.reduce((a, b) => a + b.rate, 0) / summary.length : 0;
  el.mRate.textContent = `${avg.toFixed(1)}%`;

  el.summaryBody.innerHTML = summary.length
    ? summary.map((s) => `<tr><td>${s.vendor}</td><td>${s.orderQty.toLocaleString()}</td><td>${s.inboundQty.toLocaleString()}</td><td>${s.noInboundQty.toLocaleString()}</td><td>${s.rate.toFixed(1)}%</td></tr>`).join("")
    : `<tr><td colspan="5">데이터 없음</td></tr>`;

  Object.values(state.charts).forEach((c) => c?.destroy?.());

  state.charts.rate = new Chart(document.getElementById("rateChart"), {
    type: "bar",
    data: { labels: summary.map((s) => s.vendor), datasets: [{ label: "미입고율(%)", data: summary.map((s) => s.rate), backgroundColor: "#4a69ff" }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: "y" },
  });

  const done = summary.filter((s) => s.noInboundQty === 0).length;
  const ing = summary.filter((s) => s.noInboundQty > 0).length;
  state.charts.progress = new Chart(document.getElementById("progressChart"), {
    type: "doughnut",
    data: { labels: ["완료", "진행"], datasets: [{ data: [done, ing], backgroundColor: ["#2fbf71", "#ff8f3d"] }] },
    options: { responsive: true, maintainAspectRatio: false },
  });

  state.charts.trend = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: { labels: tr.labels, datasets: [{ label: "입고수량", data: tr.values, borderColor: "#2f6cf6", tension: 0.25 }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function runAnalysis() {
  const { of, inf } = applyFilters(state.orderRows, state.inboundRows);
  const summary = aggregate(of, inf);
  const tr = trend(inf);
  render(summary, tr);
  el.statusText.textContent = `완료: 발주 ${of.length}건, 입고 ${inf.length}건 분석`;
}

el.orderFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  state.orderRows = normalizeOrderRows(await readWorkbook(file));
  el.statusText.textContent = `발주 파일 로드: ${state.orderRows.length}행`;
});

el.inboundFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  state.inboundRows = normalizeInboundRows(await readWorkbook(file));
  el.statusText.textContent = `입고 파일 로드: ${state.inboundRows.length}행`;
});

el.analyzeBtn.addEventListener("click", runAnalysis);
el.applyFilterBtn.addEventListener("click", runAnalysis);

el.sampleDataBtn.addEventListener("click", () => {
  state.orderRows = normalizeOrderRows([
    { 거래처: "가온상사", 수량: 1200, 입고의뢰수량: 900, 납기일자: "2026-04-01" },
    { 거래처: "누리산업", 수량: 860, 입고처리수량: 600, 납기일자: "2026-04-02" },
    { 거래처: "다온테크", 수량: 730, 입고검사수량: 730, 납기일자: "2026-04-03" },
  ]);
  state.inboundRows = normalizeInboundRows([
    { 거래처: "가온상사", 입고수량: 500, 입고일자: "2026-04-01" },
    { 거래처: "가온상사", 입고수량: 400, 입고일자: "2026-04-03" },
    { 거래처: "누리산업", 입고수량: 600, 입고일자: "2026-04-04" },
    { 거래처: "다온테크", 입고수량: 730, 입고일자: "2026-04-04" },
  ]);
  runAnalysis();
});
