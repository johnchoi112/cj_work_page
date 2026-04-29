const state = { orderRows: [], inboundRows: [], charts: {} };

const el = {
  orderFile: document.getElementById("orderFile"),
  inboundFile: document.getElementById("inboundFile"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  sampleDataBtn: document.getElementById("sampleDataBtn"),
  statusText: document.getElementById("statusText"),
  mVendor: document.getElementById("mVendor"),
  mRate: document.getElementById("mRate"),
  mOrderQty: document.getElementById("mOrderQty"),
  mInQty: document.getElementById("mInQty"),
  summaryBody: document.getElementById("summaryBody"),
};

function number(v) {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function readWorkbook(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function buildSummary(orderRows, inboundRows) {
  const map = new Map();

  orderRows.forEach((r) => {
    const vendor = (r["거래처"] || "기타").toString().trim();
    if (!map.has(vendor)) map.set(vendor, { vendor, orderQty: 0, noInQty: 0, inQty: 0 });
    const item = map.get(vendor);
    item.orderQty += number(r["발주수량"]);
    item.noInQty += number(r["미입고수량"]);
  });

  inboundRows.forEach((r) => {
    const vendor = (r["거래처"] || "기타").toString().trim();
    if (!map.has(vendor)) map.set(vendor, { vendor, orderQty: 0, noInQty: 0, inQty: 0 });
    map.get(vendor).inQty += number(r["입고수량"]);
  });

  return [...map.values()].map((x) => ({
    ...x,
    rate: x.orderQty ? (x.noInQty / x.orderQty) * 100 : 0,
  })).sort((a, b) => b.rate - a.rate);
}

function buildInboundTrend(inboundRows) {
  const byDate = {};
  inboundRows.forEach((r) => {
    const d = (r["입고일"] || "미지정").toString().slice(0, 10);
    byDate[d] = (byDate[d] || 0) + number(r["입고수량"]);
  });
  const labels = Object.keys(byDate).sort();
  return { labels, values: labels.map((d) => byDate[d]) };
}

function renderTable(summary) {
  if (!summary.length) {
    el.summaryBody.innerHTML = `<tr><td colspan="5">데이터가 없습니다.</td></tr>`;
    return;
  }

  el.summaryBody.innerHTML = summary.map((s) => `
    <tr>
      <td>${s.vendor}</td>
      <td>${s.orderQty.toLocaleString()}</td>
      <td>${s.noInQty.toLocaleString()}</td>
      <td>${s.inQty.toLocaleString()}</td>
      <td>${s.rate.toFixed(1)}%</td>
    </tr>`).join("");
}

function destroyCharts() {
  Object.values(state.charts).forEach((c) => c?.destroy?.());
}

function renderCharts(summary, trend) {
  destroyCharts();

  state.charts.rate = new Chart(document.getElementById("rateChart"), {
    type: "bar",
    data: {
      labels: summary.map((x) => x.vendor),
      datasets: [{ label: "미입고율(%)", data: summary.map((x) => x.rate), backgroundColor: "#2f6cf6" }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const done = summary.filter((x) => x.noInQty <= 0).length;
  const progress = summary.filter((x) => x.noInQty > 0).length;
  state.charts.progress = new Chart(document.getElementById("progressChart"), {
    type: "doughnut",
    data: {
      labels: ["완료", "진행중"],
      datasets: [{ data: [done, progress], backgroundColor: ["#36b37e", "#ff8b00"] }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  state.charts.trend = new Chart(document.getElementById("inboundTrendChart"), {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [{ label: "입고수량", data: trend.values, borderColor: "#2f6cf6", fill: false, tension: 0.3 }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderKpis(summary) {
  const vendorCount = summary.length;
  const avgRate = vendorCount ? summary.reduce((a, b) => a + b.rate, 0) / vendorCount : 0;
  const orderQty = summary.reduce((a, b) => a + b.orderQty, 0);
  const inQty = summary.reduce((a, b) => a + b.inQty, 0);

  el.mVendor.textContent = vendorCount.toLocaleString();
  el.mRate.textContent = `${avgRate.toFixed(1)}%`;
  el.mOrderQty.textContent = orderQty.toLocaleString();
  el.mInQty.textContent = inQty.toLocaleString();
}

function analyze() {
  const summary = buildSummary(state.orderRows, state.inboundRows);
  const trend = buildInboundTrend(state.inboundRows);

  renderKpis(summary);
  renderTable(summary);
  renderCharts(summary, trend);
  el.statusText.textContent = `완료: 거래처 ${summary.length}개 기준으로 KPI를 계산했습니다.`;
}

el.analyzeBtn?.addEventListener("click", analyze);

el.sampleDataBtn?.addEventListener("click", () => {
  state.orderRows = [
    { 거래처: "A상사", 발주수량: 1200, 미입고수량: 220, 발주일: "2026-04-01" },
    { 거래처: "B물산", 발주수량: 800, 미입고수량: 40, 발주일: "2026-04-03" }
  ];
  state.inboundRows = [
    { 거래처: "A상사", 입고수량: 980, 입고일: "2026-04-05" },
    { 거래처: "B물산", 입고수량: 760, 입고일: "2026-04-07" }
  ];
  analyze();
});

el.orderFile?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.orderRows = await readWorkbook(file);
  el.statusText.textContent = `발주 파일 로드 완료: ${state.orderRows.length}행`;
});

el.inboundFile?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.inboundRows = await readWorkbook(file);
  el.statusText.textContent = `입고 파일 로드 완료: ${state.inboundRows.length}행`;
});
