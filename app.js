/**
 * ==================================================================
 * 📊 발주·입고 KPI 대시보드 (정적 웹사이트 버전)
 * ✅ GitHub Pages 배포용 — 브라우저에서 독립 실행 (No Server)
 * ✅ SheetJS(xlsx) + Chart.js 사용
 * ✅ 엑셀 필드명 유사 매핑 기능 포함
 * ==================================================================
 */

// ✅ 1. 컬럼명 매핑 오브젝트 (다양한 형식 자동 인식)
// key: 표준 컬럼명, value: 가능한 후보명 목록 (대소문자 구분 X)
const COLUMN_MAPPINGS = {
  itemCode: ['품번', '품목코드', 'Item Code', 'Part No', 'ITEM CODE'],
  itemName: ['품명', 'Item Name', '품목명'],
  supplier: ['거래처', 'Supplier', '거래선', '공급처', '공급업체'],
  orderQty: ['발주수량', '발주량', 'Order Qty', 'Order Quantity', '수량'],
  receiptQty: ['입고수량', '입고량', 'Receipt Qty', '입고', '수령량'],
  orderDate: ['발주일', '발주일자', 'Order Date', '주문일', '발주날짜'],
  dueDate: ['납기일', '納期日', 'Due Date', '.delivery date', '納期'],
  receiptDate: ['입고일', 'Receipt Date', '입고일자', '입고날짜'],
  status: ['진행상태', 'Status', '상태', '진행상태코드'],
  remarks: ['비고', 'Remark', 'Notes', '추가사항'],
  amount: ['금액', 'Amount', '가격', '단가'] // 미입고 금액 계산용
};

// ✅ 2. 샘플 데이터 (파일 없을 때 기본 데이터)
const SAMPLE_ORDER_DATA = [
  { itemCode: 'A100', itemName: '프로세서 X1', supplier: '심asiswa', orderQty: 50, receiptQty: 30, orderDate: '2024-01-05', dueDate: '2024-02-01', status: '입고COMPLETE', remarks: '부분입고' },
  { itemCode: 'A101', itemName: '메모리 DDR5', supplier: '심asiswa', orderQty: 200, receiptQty: 200, orderDate: '2024-01-08', dueDate: '2024-02-05', status: 'COMPLETE', remarks: '' },
  { itemCode: 'B200', itemName: '메인보드 M5', supplier: '스카이itech', orderQty: 30, receiptQty: 10, orderDate: '2024-01-10', dueDate: '2024-01-25', status: 'PARTIAL', remarks: '부분 입고, 납기초과' },
  { itemCode: 'C300', itemName: '_gpu RTX4070', supplier: '스카이itech', orderQty: 15, receiptQty: 0, orderDate: '2024-01-12', dueDate: '2024-01-20', status: 'PENDING', remarks: '대기 중' },
  { itemCode: 'D400', itemName: 'SSD 1TB', supplier: '데이터Next', orderQty: 100, receiptQty: 80, orderDate: '2024-01-15', dueDate: '2024-02-10', status: 'COMPLETE', remarks: '' }
];

const SAMPLE_RECEIPT_DATA = [
  { itemCode: 'A100', itemName: '프로세서 X1', supplier: '심asiswa', receiptQty: 30, receiptDate: '2024-01-25', status: 'COMPLETE' },
  { itemCode: 'A101', itemName: '메모리 DDR5', supplier: '심asiswa', receiptQty: 200, receiptDate: '2024-02-03', status: 'COMPLETE' },
  { itemCode: 'B200', itemName: '메인보드 M5', supplier: '스카이itech', receiptQty: 10, receiptDate: '2024-02-01', status: 'PARTIAL' }
];

// ✅ 3. 전역 변수
let orderData = [];
let receiptData = [];
let filteredData = [];
let detailTableData = [];
let orderChart, donutChart, top10Chart, trendChart, supplierDonutChart;

// ✅ 4. DOM 요소 초기화
document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  loadSampleData(); // 기본 데이터 로드
  setupFileUpload();
});

// ✅ 5. 필터 초기화
function initFilters() {
  const supplierSelect = document.getElementById('supplier-filter');
  const statusSelect = document.getElementById('status-filter');
  const monthSelect = document.getElementById('month-filter');

  // 초기 기본 옵션
  const suppliers = [...new Set((orderData || []).map(d => d.supplier || ''))].filter(Boolean);
  suppliers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    supplierSelect.appendChild(opt);
  });

  const statuses = [...new Set((orderData || []).map(d => d.status || ''))].filter(Boolean);
  statuses.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    statusSelect.appendChild(opt);
  });

  // 전체+YYYY-MM
  const orderDates = [...new Set((orderData || []).map(d => {
    const date = parseDate(d.orderDate);
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
  })).filter(Boolean)].sort();
  orderDates.forEach(date => {
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = date;
    monthSelect.appendChild(opt);
  });

  // 이벤트 리스너
  ['supplier-filter', 'item-filter', 'status-filter', 'month-filter', 'overdue-filter'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilter);
  });
  document.getElementById('item-filter').addEventListener('input', applyFilter);
}

// ✅ 6. 날짜 파서 (SheetJS를 통한 날짜 => JS Date 변환)
function parseDate(val) {
  if (!val || val === '') return null;
  if (val instanceof Date && !isNaN(val)) return val;
  // Excel date serial number → JS Date
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000);
  }
  // 문자열 날짜 (YYYY-MM-DD, YYYY/MM/DD 등)
  if (typeof val === 'string') {
    const matches = val.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matches) {
      return new Date(matches[1], matches[2] - 1, matches[3]);
    }
  }
  return null;
}

// ✅ 7. 숫자 파서 (콤마 제거)
function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

// ✅ 8. 컬럼명 유사 매핑
function mapColumns(headers) {
  const mapped = {};
  const headersLower = headers.map(h => h.toLowerCase());

  for (const [standardKey, candidates] of Object.entries(COLUMN_MAPPINGS)) {
    for (let candidate of candidates) {
      const lowerCandidate = candidate.toLowerCase();
      const idx = headersLower.findIndex(h => h.includes(lowerCandidate));
      if (idx !== -1) {
        mapped[standardKey] = headers[idx];
        break;
      }
    }
  }
  return mapped;
}

// ✅ 9. 엑셀 파싱 및 정제
function parseExcel(file, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (!jsonData || !jsonData.length) {
          throw new Error('시트에 데이터가 없습니다.');
        }

        const headers = Object.keys(jsonData[0]);
        const columnMap = mapColumns(headers);
        const missingColumns = [];

        const requiredKeys = ['itemCode', 'itemName', 'supplier'];
        for (const key of requiredKeys) {
          if (!columnMap[key]) missingColumns.push(key);
        }

        const rows = jsonData.map(row => {
          const mappedRow = {};
          for (const [key, colName] of Object.entries(columnMap)) {
            mappedRow[key] = row[colName];
          }

          // 항목 채워넣기
          if (!mappedRow.itemName && mappedRow.itemCode) {
            mappedRow.itemName = mappedRow.itemCode + ' 품목'; // ello
          }
          if (!mappedRow.supplier) {
            mappedRow.supplier = '미정';
          }
          if (!mappedRow.status) {
            const receiptQty = parseNumber(mappedRow.receiptQty || 0);
            const orderQty = parseNumber(mappedRow.orderQty || 0);
            if (orderQty === 0) mappedRow.status = '발주 없음';
            else if (receiptQty === 0) mappedRow.status = '미입고';
            else if (receiptQty < orderQty) mappedRow.status = '부분입고';
            else mappedRow.status = '완료';
          }

          // 날짜 인식
          mappedRow.orderDateParsed = parseDate(mappedRow.orderDate);
          mappedRow.dueDateParsed = parseDate(mappedRow.dueDate || mappedRow.orderDate); // 발주일이 없으면 납기일로
          mappedRow.receiptDateParsed = parseDate(mappedRow.receiptDate);

          // 미입고 및 입고율 계산
          const orderQty = parseNumber(mappedRow.orderQty || 0);
          const receiptQty = parseNumber(mappedRow.receiptQty || 0);
          mappedRow.orderQtyNum = orderQty;
          mappedRow.receiptQtyNum = receiptQty;
          mappedRow.unreceiptQtyNum = Math.max(0, orderQty - receiptQty);
          mappedRow.arrivalRate = orderQty > 0 ? (receiptQty / orderQty) * 100 : 0;

          // 납기 초과 여부
          const dueDate = mappedRow.dueDateParsed;
          const receiptDate = mappedRow.receiptDateParsed;
          if (dueDate && receiptDate) {
            mappedRow.overdue = receiptDate > dueDate;
          } else if (dueDate && !mappedRow.receiptQtyNum) {
            mappedRow.overdue = new Date() > dueDate; // 미입고이고 납기 지남 → 초과
          } else {
            mappedRow.overdue = false;
          }

          return mappedRow;
        });

        if (missingColumns.length) {
          console.warn(`⚠️ 인식하지 못한 필수 컬럼: ${missingColumns.join(', ')}`);
        }

        resolve({ rows, type, columns: columnMap, missingColumns });
      } catch (err) {
        reject(err.message || '파일 파싱 중 오류 발생');
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ✅ 10. 파일 업로드 설정
function setupFileUpload() {
  const orderInput = document.getElementById('order-file');
  const receiptInput = document.getElementById('receipt-file');
  const errorMsg = document.getElementById('error-message');
  const processBtn = document.getElementById('process-btn');

  function updateStatus(input, text) {
    const label = input.parentElement.querySelector('.status-text');
    label.textContent = text;
  }

  orderInput.addEventListener('change', e => {
    updateStatus(orderInput, e.target.files.length ? `${e.target.files[0].name} 선택됨` : '파일 미선택');
  });
  receiptInput.addEventListener('change', e => {
    updateStatus(receiptInput, e.target.files.length ? `${e.target.files[0].name} 선택됨` : '파일 미선택');
  });

  processBtn.addEventListener('click', async () => {
    const orderFile = orderInput.files[0];
    const receiptFile = receiptInput.files[0];

    errorMsg.textContent = '';

    if (!orderFile && !receiptFile) {
      errorMsg.textContent = '⚠️ 최소 1개 이상의 엑셀 파일을 선택해주세요.';
      return;
    }

    try {
      if (orderFile) {
        const result = await parseExcel(orderFile, 'order');
        orderData = result.rows;
      }
      if (receiptFile) {
        const result = await parseExcel(receiptFile, 'receipt');
        receiptData = result.rows;
      }

      // 미입고 및 KPI 재계산 (매칭은 '품번' + '거래처'로 통합)
      mergeAndRefineData();
      updateDashboard();
      updateStatus(orderInput, orderFile ? '✅ 로드됨' : '파일 미선택');
      updateStatus(receiptInput, receiptFile ? '✅ 로드됨' : '파일 미선택');
    } catch (err) {
      console.error(err);
      errorMsg.textContent = `❌ 오류: ${err}`;
    }
  });

  // 샘플 데이터 로드 버튼
  document.getElementById('load-sample-btn').addEventListener('click', () => {
    orderData = SAMPLE_ORDER_DATA;
    receiptData = SAMPLE_RECEIPT_DATA;
    mergeAndRefineData();
    updateDashboard();
    document.getElementById('order-file').value = '';
    document.getElementById('receipt-file').value = '';
    updateStatus(document.getElementById('order-file'), '📝 샘플 데이터 사용');
    updateStatus(document.getElementById('receipt-file'), '📝 샘플 데이터 사용');
  });
}

// ✅ 11. 데이터 결합 및 미입고 재계산
function mergeAndRefineData() {
  const merged = {};

  // 1) 발주 데이터 등록
  for (const row of orderData) {
    const key = `${row.itemCode || ''}|${row.supplier || ''}`;
    if (!merged[key]) {
      merged[key] = {
        itemCode: row.itemCode || '',
        itemName: row.itemName || '',
        supplier: row.supplier || '',
        orderQtyNum: 0,
        orderQtyRaw: '',
        receiptQtyNum: 0,
        unreceiptQtyNum: 0,
        arrivalRate: 0,
        orderDateRaw: row.orderDate || '',
        orderDateParsed: row.orderDateParsed,
        dueDateRaw: row.dueDate || '',
        dueDateParsed: row.dueDateParsed,
        receiptDateRaw: '',
        receiptDateParsed: null,
        status: '미입고',
        overdue: row.overdue || false,
        remarks: row.remarks || ''
      };
    }
    merged[key].orderQtyNum += row.orderQtyNum;
    merged[key].orderQtyRaw = row.orderQtyRaw; // 마지막 값 유지
  }

  // 2) 입고 데이터 업데이트
  for (const row of receiptData) {
    const key = `${row.itemCode || ''}|${row.supplier || ''}`;
    if (!merged[key]) {
      merged[key] = {
        itemCode: row.itemCode || '',
        itemName: row.itemName || '',
        supplier: row.supplier || '',
        orderQtyNum: 0,
        orderQtyRaw: '',
        receiptQtyNum: 0,
        unreceiptQtyNum: 0,
        arrivalRate: 0,
        orderDateRaw: '',
        orderDateParsed: null,
        dueDateRaw: '',
        dueDateParsed: null,
        receiptDateRaw: row.receiptDate || '',
        receiptDateParsed: row.receiptDateParsed,
        status: '입고 Complete',
        overdue: false,
        remarks: ''
      };
    }
    merged[key].receiptQtyNum += row.receiptQtyNum;
    merged[key].receiptDateRaw = row.receiptDate || '';
    merged[key].receiptDateParsed = row.receiptDateParsed;

    // 오버라이드 (예: 발주가 없던 품목도 입고만 있으면 표시)
    if (!merged[key].orderQtyNum) {
      merged[key].orderQtyNum = row.receiptQtyNum; // взять 입고수량을 어今后 발주로 간주? (" 그냥 입고만 있으면 발주 수량 만큼 기록") → No, 더 정확하진 않음. 발주 없으면 0 유지.
    }
  }

  detailTableData = Object.values(merged).map(item => {
    const order = item.orderQtyNum;
    const receipt = item.receiptQtyNum;
    const unreceipt = Math.max(0, order - receipt);
    const rate = order > 0 ? (receipt / order) * 100 : 0;

    let status = '';
    if (item.status === 'COMPLETE') status = '완료';
    else if (item.status === 'PARTIAL') status = '부분입고';
    else if (receipt === 0 && order > 0) status = '미입고';
    else status = '기타';
    item.status = status;

    item.unreceiptQtyNum = unreceipt;
    item.arrivalRate = rate;
    return item;
  });
}

// ✅ 12. KPI 계산
function calculateKPI() {
  const items = filteredData || detailTableData;
  if (!items.length) return {};

  const totalOrders = items.length;
  const totalOrderQty = items.reduce((acc, i) => acc + i.orderQtyNum, 0);
  const totalReceiptQty = items.reduce((acc, i) => acc + i.receiptQtyNum, 0);
  const totalUnreceiptQty = items.reduce((acc, i) => acc + i.unreceiptQtyNum, 0);
  const arrivalRate = totalOrderQty > 0 ? (totalReceiptQty / totalOrderQty) * 100 : 0;
  const unarrivalRate = totalOrderQty > 0 ? (totalUnreceiptQty / totalOrderQty) * 100 : 0;
  const overdueCount = items.filter(i => i.overdue).length;
  const supplierCount = new Set(items.map(i => i.supplier)).size;

  return {
    totalOrders,
    totalOrderQty,
    totalReceiptQty,
    totalUnreceiptQty,
    arrivalRate,
    unarrivalRate,
    overdueCount,
    supplierCount
  };
}

// ✅ 13. 필터 적용 로직
function applyFilter() {
  const supplierFilter = document.getElementById('supplier-filter').value;
  const itemFilter = document.getElementById('item-filter').value.toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const monthFilter = document.getElementById('month-filter').value;
  const overdueFilter = document.getElementById('overdue-filter').value;

  filteredData = detailTableData.filter(item => {
    // 거래처 필터
    if (supplierFilter && item.supplier !== supplierFilter) return false;

    // 품번/품명 검색
    if (itemFilter && !(`${item.itemCode || ''}${item.itemName || ''}`.toLowerCase().includes(itemFilter))) return false;

    // 진행 상태
    if (statusFilter && item.status !== statusFilter) return false;

    // 발주월 필터
    if (monthFilter) {
      const monthStr = item.orderDateParsed ? `${item.orderDateParsed.getFullYear()}-${String(item.orderDateParsed.getMonth() + 1).padStart(2, '0')}` : '';
      if (monthStr !== monthFilter) return false;
    }

    // 납기 초과 필터
    if (overdueFilter === 'overdue' && !item.overdue) return false;
    if (overdueFilter === 'on-time' && item.overdue) return false;

    return true;
  });

  updateDashboard();
}

// ✅ 14. 대시보드 전체 업데이트
function updateDashboard() {
  const kpi = calculateKPI();

  // KPI 카드 업데이트
  document.getElementById('kpi-total-orders').textContent = toComma(kpi.totalOrders);
  document.getElementById('kpi-total-qty').textContent = toComma(kpi.totalOrderQty);
  document.getElementById('kpi-total-receipt').textContent = toComma(kpi.totalReceiptQty);
  document.getElementById('kpi-total-unreceipt').textContent = toComma(kpi.totalUnreceiptQty);
  document.getElementById('kpi-arrival-rate').textContent = kpi.arrivalRate.toFixed(1) + '%';
  document.getElementById('kpi-unarrival-rate').textContent = kpi.unarrivalRate.toFixed(1) + '%';
  document.getElementById('kpi-overdue-count').textContent = kpi.overdueCount;
  document.getElementById('kpi-supplier-count').textContent = kpi.supplierCount;

  // 상세 테이블 생성
  renderTable();

  // 차트 업데이트
  updateCharts();
}

// ✅ 15. 숫자 콤마 포맷
function toComma(num) {
  if (!isFinite(num)) return '-';
  return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ✅ 16. 상세 테이블 렌더링
function renderTable() {
  const tbody = document.getElementById('detail-table-body');
  tbody.innerHTML = '';

  if (!filteredData.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:16px;">조회 결과가 없습니다.</td></tr>';
    return;
  }

  // 정렬: 납기초과 → 미입고 → 발주일 내림차순
  const sortedData = [...filteredData].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.unreceiptQtyNum !== b.unreceiptQtyNum) return b.unreceiptQtyNum - a.unreceiptQtyNum;
    return new Date(b.orderDateParsed || 0) - new Date(a.orderDateParsed || 0);
  });

  for (const item of sortedData) {
    const tr = document.createElement('tr');
    const dateOrNA = (d) => (d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '-');
  
    tr.innerHTML = `
      <td>${item.itemCode || ''}</td>
      <td>${item.itemName || ''}</td>
      <td>${item.supplier || ''}</td>
      <td>${toComma(item.orderQtyNum)}</td>
      <td>${toComma(item.receiptQtyNum)}</td>
      <td>${toComma(item.unreceiptQtyNum)}</td>
      <td>${item.arrivalRate.toFixed(1)}%</td>
      <td>${dateOrNA(item.orderDateParsed)}</td>
      <td>${dateOrNA(item.dueDateParsed)}</td>
      <td>${dateOrNA(item.receiptDateParsed)}</td>
      <td>${item.status}</td>
      <td>${item.remarks || ''}</td>
    `;
    tbody.appendChild(tr);
  }

  // 필터에 대한 동적 옵션 업데이트 (거래처/진행상태/월)
  const supplierSet = new Set(filteredData.map(i => i.supplier).filter(Boolean));
  const statusSet = new Set(filteredData.map(i => i.status).filter(Boolean));
  const monthSet = new Set(filteredData.map(i => {
    const d = i.orderDateParsed;
    if (!d) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  }).filter(Boolean)).sort();

  // 기존 옵션 지우고 재생성 (고정 => 드롭다운 igual)
  const supplierSelect = document.getElementById('supplier-filter');
  while (supplierSelect.options.length > 1) supplierSelect.remove(1);
  supplierSet.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    supplierSelect.appendChild(opt);
  });

  const statusSelect = document.getElementById('status-filter');
  while (statusSelect.options.length > 1) statusSelect.remove(1);
  statusSet.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    statusSelect.appendChild(opt);
  });

  const monthSelect = document.getElementById('month-filter');
  while (monthSelect.options.length > 1) monthSelect.remove(1);
  monthSet.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    monthSelect.appendChild(opt);
  });
}

// ✅ 17. 차트 업데이트 (Chart.js)
let charts = {};
function updateCharts() {
  // 차트 초기화
  destroyCharts();
  initCharts();

  // 1️⃣ 거래처별 발주/입고 누적 막대 차트
  const supplierMap = {};
  filteredData.forEach(d => {
    if (!d.supplier) return;
    if (!supplierMap[d.supplier]) supplierMap[d.supplier] = { orderQty: 0, receiptQty: 0 };
    supplierMap[d.supplier].orderQty += d.orderQtyNum;
    supplierMap[d.supplier].receiptQty += d.receiptQtyNum;
  });

  const supplierData = Object.entries(supplierMap).map(([name, v]) => ({ name, ...v }));
  if (supplierData.length) {
    const ctx = document.getElementById('barChart').getContext('2d');
    charts.bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: supplierData.map(s => s.name),
        datasets: [
          { label: '발주수량', data: supplierData.map(s => s.orderQty), backgroundColor: '#3b82f6' },
          { label: '입고수량', data: supplierData.map(s => s.receiptQty), backgroundColor: '#10b981' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => toComma(v) } } }
      }
    });
  }

  // 2️⃣ 진행상태별 도넛 차트
  const statusMap = {};
  filteredData.forEach(d => {
    if (!d.status) return;
    statusMap[d.status] = (statusMap[d.status] || 0) + 1;
  });

  if (Object.keys(statusMap).length) {
    const ctx = document.getElementById('donutChart').getContext('2d');
    charts.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusMap),
        datasets: [{
          data: Object.values(statusMap),
          backgroundColor: ['#3b82f6', '#facc15', '#ef4444', '#10b981', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // 3️⃣ 미입고 TOP10 (가로 Bar)
  const unreceiptSorted = [...filteredData]
    .filter(d => d.unreceiptQtyNum > 0)
    .sort((a, b) => b.unreceiptQtyNum - a.unreceiptQtyNum)
    .slice(0, 10);

  if (unreceiptSorted.length) {
    const ctx = document.getElementById('top10Chart').getContext('2d');
    charts.top10 = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: unreceiptSorted.map(d => `${d.itemCode} (${d.itemName})`),
        datasets: [{
          label: '미입고 수량',
          data: unreceiptSorted.map(d => d.unreceiptQtyNum),
          backgroundColor: '#ef4444',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => toComma(v) } } }
      }
    });
  }

  // 4️⃣ 월별 추이 (라인 차트)
  const monthMap = {};
  for (const d of filteredData) {
    const date = d.orderDateParsed;
    if (!date) continue;
    const mm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[mm]) monthMap[mm] = { order: 0, receipt: 0 };
    monthMap[mm].order += d.orderQtyNum;
    monthMap[mm].receipt += d.receiptQtyNum;
  }

  const monthData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));

  if (monthData.length) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: monthData.map(([k]) => k),
        datasets: [
          { label: '발주수량', data: monthData.map(([_, v]) => v.order), borderColor: '#3b82f6', fill: false },
          { label: '입고수량', data: monthData.map(([_, v]) => v.receipt), borderColor: '#10b981', fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => toComma(v) } } }
      }
    });
  }

  // 5️⃣거래처별 미입고 건수 도넛
  const supplierUnreceipt = {};
  for (const d of filteredData) {
    if (!d.supplier || d.unreceiptQtyNum <= 0) continue;
    supplierUnreceipt[d.supplier] = (supplierUnreceipt[d.supplier] || 0) + 1;
  }

  if (Object.keys(supplierUnreceipt).length) {
    const ctx = document.getElementById('supplierDonutChart').getContext('2d');
    charts.supplierDonut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(supplierUnreceipt),
        datasets: [{
          data: Object.values(supplierUnreceipt),
          backgroundColor: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

function destroyCharts() {
  for (const key in charts) {
    if (charts[key]) charts[key].destroy();
  }
}

function initCharts() {
  destroyCharts();
  // 빈 객체 초기화 (실제 Chart.js는 렌더 시점 생성됨)
  charts = {};
}

// ✅ 18. 샘플 데이터 로드
function loadSampleData() {
  orderData = SAMPLE_ORDER_DATA;
  receiptData = SAMPLE_RECEIPT_DATA;
  mergeAndRefineData();
  applyFilter(); // 상품 필터 초기화 후 적용
}

// ✅ 19. 방어 처리용: 날짜 null => 1900-01-01 대체
function safeDate(date) {
  if (!date || isNaN(date)) {
    return new Date(1900, 0, 1);
  }
  return date;
}