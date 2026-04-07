// shared/duckdb-loader.js — DuckDB WASM utility for loading Parquet files
//
// Usage:
//   1. Load DuckDB via esm.sh module (sets window.duckdb):
//      <script type="module">
//        import * as duckdb from 'https://esm.sh/@duckdb/duckdb-wasm@1.28.0';
//        window.duckdb = duckdb;
//      </script>
//   2. Load this script: <script src="/shared/duckdb-loader.js"></script>
//   3. Use: const loader = new DuckDBLoader();
//
// loadParquetFile(url, tableName, onProgress) — onProgress(pct) called at 30/60/80/100

class DuckDBLoader {
  constructor() {
    this.db   = null;
    this.conn = null;
  }

  async waitForDuckDB(maxMs = 12000) {
    const t0 = Date.now();
    while (typeof window.duckdb === 'undefined') {
      if (Date.now() - t0 > maxMs) throw new Error('DuckDB library load timeout');
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async initialize() {
    if (this.db) return;
    try {
      await this.waitForDuckDB();
      const UNPKG = 'https://unpkg.com/@duckdb/duckdb-wasm@1.28.0/dist/';
      const bundles = {
        mvp: { mainModule: `${UNPKG}duckdb-mvp.wasm`, mainWorker: `${UNPKG}duckdb-browser-mvp.worker.js` },
        eh:  { mainModule: `${UNPKG}duckdb-eh.wasm`,  mainWorker: `${UNPKG}duckdb-browser-eh.worker.js`  },
      };
      const bundle = await window.duckdb.selectBundle(bundles);
      // Workers must be same-origin — fetch cross-origin script and wrap in a blob URL
      const workerCode = await fetch(bundle.mainWorker).then(r => r.text());
      const workerUrl  = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
      const worker     = new Worker(workerUrl);
      const logger     = new window.duckdb.ConsoleLogger();
      this.db = new window.duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl); // free blob URL after worker is loaded
      this.conn = await this.db.connect();
    } catch (error) {
      console.error('DuckDB init failed:', error);
      throw new Error(`DuckDB initialization failed: ${error.message}`);
    }
  }

  // onProgress(pct) is optional — called at 30 / 60 / 80 / 100 during loading
  async loadParquetFile(url, tableName = 'data', onProgress) {
    await this.initialize();
    onProgress?.(30);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    onProgress?.(60);
    const uint8Array = new Uint8Array(await response.arrayBuffer());
    onProgress?.(80);
    const filename = `${tableName}.parquet`;
    await this.db.registerFileBuffer(filename, uint8Array);
    await this.conn.query(
      `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${filename}')`
    );
    const rowCount = (await this.conn.query(`SELECT COUNT(*) as count FROM ${tableName}`))
      .toArray()[0].count;
    onProgress?.(100);
    return rowCount;
  }

  async query(sql) {
    if (!this.conn) throw new Error('DuckDB not initialized. Call initialize() first.');
    const result = await this.conn.query(sql);
    // DuckDB WASM returns BigInt for BIGINT columns — convert to Number for JSON compatibility
    return result.toArray().map(row => {
      const obj = {};
      for (const [k, v] of Object.entries(row)) {
        obj[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      return obj;
    });
  }

  async getAllData(tableName = 'data') {
    return this.query(`SELECT * FROM ${tableName}`);
  }

  async close() {
    if (this.conn) { await this.conn.close(); this.conn = null; }
    if (this.db)   { await this.db.terminate(); this.db = null; }
  }
}

window.DuckDBLoader = DuckDBLoader;
