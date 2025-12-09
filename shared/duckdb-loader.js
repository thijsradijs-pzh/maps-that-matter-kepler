// duckdb-loader.js - DuckDB WASM utility for loading Parquet files

class DuckDBLoader {
  constructor() {
    this.db = null;
    this.conn = null;
  }

  async initialize() {
    if (this.db) return; // Already initialized

    try {
      console.log('🦆 Initializing DuckDB-WASM...');
      
      // Import DuckDB-WASM bundle
      const DUCKDB_BUNDLES = {
        mvp: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
        },
        eh: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
        },
      };

      // Select bundle based on browser capabilities
      const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
      
      // Create worker
      const worker = new Worker(bundle.mainWorker);
      
      // Initialize logger (minimal logging)
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      
      // Create database
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule);
      
      // Create connection
      this.conn = await this.db.connect();
      
      console.log('✅ DuckDB-WASM initialized');
    } catch (error) {
      console.error('❌ Failed to initialize DuckDB:', error);
      throw new Error(`DuckDB initialization failed: ${error.message}`);
    }
  }

  async loadParquetFile(url, tableName = 'data') {
    await this.initialize();

    try {
      console.log(`🦆 Loading Parquet file: ${url}`);
      
      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      console.log(`📦 Loaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      
      // Register file with DuckDB
      await this.db.registerFileBuffer('data.parquet', uint8Array);
      
      // Create table from Parquet
      await this.conn.query(`
        CREATE OR REPLACE TABLE ${tableName} AS 
        SELECT * FROM read_parquet('data.parquet')
      `);
      
      // Get row count
      const countResult = await this.conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.toArray()[0].count;
      
      console.log(`✅ Loaded ${rowCount.toLocaleString()} rows into table '${tableName}'`);
      
      return rowCount;
    } catch (error) {
      console.error('❌ Failed to load Parquet file:', error);
      throw new Error(`Parquet loading failed: ${error.message}`);
    }
  }

  async query(sql) {
    if (!this.conn) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    try {
      const result = await this.conn.query(sql);
      return result.toArray();
    } catch (error) {
      console.error('❌ Query failed:', error);
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  async getDataForYear(year, tableName = 'data') {
    const sql = `
      SELECT * 
      FROM ${tableName} 
      WHERE year_int = ${year}
    `;
    return await this.query(sql);
  }

  async getAllData(tableName = 'data') {
    const sql = `SELECT * FROM ${tableName}`;
    return await this.query(sql);
  }

  async close() {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    console.log('🦆 DuckDB connection closed');
  }
}

// Export for use in other scripts
window.DuckDBLoader = DuckDBLoader;
