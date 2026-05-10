// gebiedsviewer/js/tables.js — attribute table view and CSV exports

// ═══════════════════════════════════════════════════════
// ATTRIBUTE TABLE VIEW
// ═══════════════════════════════════════════════════════

let _tableState = { key: null, offset: 0, pageSize: 100, hasMore: false, fields: [] };
let _tableData = [];

async function openTableView(key) {
  const entry = activeLayers.get(key);
  if (!entry || !entry.mapServerUrl) return;
  _tableState = { key, offset: 0, pageSize: 100, hasMore: false, fields: [], totalCount: null };
  _tableData = [];

  document.getElementById('table-panel-title').textContent = entry.label;
  document.getElementById('table-panel').style.display = 'flex';
  document.getElementById('table-content').innerHTML =
    '<div class="table-loading"><i class="fa fa-circle-notch fa-spin"></i> Laden...</div>';
  document.getElementById('table-count-info').textContent = '';
  document.getElementById('table-prev').disabled = true;
  document.getElementById('table-next').disabled = true;

  // Fire count and first page in parallel
  const countUrl = `${entry.mapServerUrl}/${entry.layerId}/query?where=1%3D1&returnCountOnly=true&f=json`;
  fetch(`/api/proxy?url=${encodeURIComponent(countUrl)}`)
    .then(r => r.json())
    .then(d => {
      if (d.count != null) {
        _tableState.totalCount = d.count;
        _updateTableCountInfo();
      }
    })
    .catch(() => {});

  await _loadTablePage(entry, 0);
}

function _updateTableCountInfo() {
  const { offset, pageSize, totalCount, hasMore } = _tableState;
  const pageNum = Math.floor(offset / pageSize) + 1;
  const totalPages = totalCount != null ? Math.ceil(totalCount / pageSize) : null;
  const countStr = totalCount != null ? `${totalCount.toLocaleString('nl-NL')} rijen` : `${_tableData.length} rijen`;
  const pageStr = totalPages != null ? `Pagina ${pageNum} van ${totalPages}` : `Pagina ${pageNum}`;
  document.getElementById('table-page-info').textContent = pageStr;
  document.getElementById('table-count-info').textContent = countStr;
}

async function _loadTablePage(entry, offset) {
  const url = `${entry.mapServerUrl}/${entry.layerId}/query?where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${_tableState.pageSize}&returnGeometry=false&f=json`;
  try {
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)).json();
    _tableState.hasMore = !!data.exceededTransferLimit;
    _tableState.offset = offset;
    _tableData = data.features || [];

    if (!_tableData.length) {
      document.getElementById('table-content').innerHTML =
        '<div class="table-loading">Geen data gevonden voor deze laag.</div>';
      document.getElementById('table-count-info').textContent = '0 rijen';
      return;
    }

    const allKeys = Object.keys(_tableData[0].attributes || {}).filter(k => !SKIP_FIELDS.has(k));
    _tableState.fields = allKeys;

    const headerHtml = `<tr>${allKeys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    const rowsHtml = _tableData.map(f => {
      const a = f.attributes || {};
      return `<tr>${allKeys.map(k => `<td>${a[k] ?? ''}</td>`).join('')}</tr>`;
    }).join('');

    document.getElementById('table-content').innerHTML = `
      <table class="attr-data-table">
        <thead>${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

    _updateTableCountInfo();
    document.getElementById('table-prev').disabled = offset === 0;
    document.getElementById('table-next').disabled = !_tableState.hasMore;

  } catch (e) {
    document.getElementById('table-content').innerHTML =
      '<div class="table-loading">Fout bij laden van attributen.</div>';
  }
}

async function tablePrevPage() {
  const entry = activeLayers.get(_tableState.key);
  if (!entry || _tableState.offset === 0) return;
  await _loadTablePage(entry, Math.max(0, _tableState.offset - _tableState.pageSize));
}

async function tableNextPage() {
  const entry = activeLayers.get(_tableState.key);
  if (!entry || !_tableState.hasMore) return;
  await _loadTablePage(entry, _tableState.offset + _tableState.pageSize);
}

function closeTableView() {
  document.getElementById('table-panel').style.display = 'none';
  _tableData = [];
}

function exportTableCSV() {
  if (!_tableData.length || !_tableState.fields.length) return;
  const rows = [
    _tableState.fields,
    ..._tableData.map(f => _tableState.fields.map(k => String(f.attributes?.[k] ?? ''))),
  ];
  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeLayers.get(_tableState.key)?.label || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════
// EXPORT CSV (CATALOG)
// ═══════════════════════════════════════════════════════

function exportCatalogCSV() {
  const header = ['Thema', 'Service', 'Laag', 'GeoJSON URL'];
  const rows = [header];
  CATALOG.forEach(theme => {
    theme.services.forEach(service => {
      const mapServerUrl = service.wmsUrl.replace(/\/WMSServer$/, '');
      service.layers.forEach(layer => {
        const params = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
        rows.push([theme.label, service.label, layer.label, `${mapServerUrl}/${layer.id}/query?${params}`]);
      });
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zuidholland-geojson-catalogus.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
