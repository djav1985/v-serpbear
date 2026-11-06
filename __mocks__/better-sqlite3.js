const normalizeParams = (params) => {
  if (!params.length) {
    return undefined;
  }
  if (params.length === 1) {
    const [firstParam] = params;
    if (firstParam !== null && typeof firstParam === 'object' && !Array.isArray(firstParam)) {
      return firstParam;
    }
    return params;
  }
  return params;
};

const createStatement = (driver, sql) => ({
  run(...params) {
    return driver.execute(sql, normalizeParams(params));
  },
  all(...params) {
    return driver.select(sql, normalizeParams(params));
  },
  get(...params) {
    const result = driver.select(sql, normalizeParams(params));
    if (Array.isArray(result)) {
      return result[0];
    }
    return result;
  },
});

class MockBetterSqlite3 {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.options = options;
    this.closed = false;
    this.tables = new Map();
  }

  prepare(sql) {
    return createStatement(this, sql);
  }

  exec(sql) {
    this.execute(sql);
  }

  close() {
    this.closed = true;
  }

  ensureTable(tableName) {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, []);
    }
    return this.tables.get(tableName);
  }

  execute(sql, params) {
    const trimmed = sql.trim();
    // ReDoS-safe regex patterns - use bounded quantifiers to prevent catastrophic backtracking
    // Limit whitespace to prevent ReDoS while allowing reasonable formatting (up to 500 chars)
    const createMatch = /^CREATE[ \t\r\n]{1,500}TABLE[ \t\r\n]{1,500}(\w+)/i.exec(trimmed);
    if (createMatch) {
      const tableName = createMatch[1];
      this.ensureTable(tableName);
      return { changes: 0 };
    }
    const insertMatch = /^INSERT[ \t\r\n]{1,500}INTO[ \t\r\n]{1,500}(\w+)/i.exec(trimmed);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const table = this.ensureTable(tableName);
      const columnsMatch = trimmed.match(/\(([^)]+)\)/);
      const columns = columnsMatch ? columnsMatch[1].split(',').map((col) => col.trim().replace(/^[$@:]/, '')) : [];

      let normalizedParams;
      if (Array.isArray(params)) {
        normalizedParams = params;
      } else if (params && typeof params === 'object') {
        normalizedParams = params;
      } else {
        normalizedParams = params;
      }

      const row = {};

      columns.forEach((col, index) => {
        const cleanName = col.replace(/[`'"\\]/g, '');

        if (Array.isArray(normalizedParams)) {
          row[cleanName] = normalizedParams[index];
        } else if (normalizedParams && typeof normalizedParams === 'object') {
          row[cleanName] = normalizedParams[cleanName];
        } else if (index === 0) {
          row[cleanName] = normalizedParams;
        } else {
          row[cleanName] = undefined;
        }
      });

      if (!columns.length) {
        row.value = params;
      }

      if (typeof row.id === 'undefined') {
        row.id = table.length + 1;
      }

      table.push(row);
      return { changes: 1, lastInsertRowid: row.id };
    }

    return { changes: 0 };
  }

  select(sql) {
    const trimmed = sql.trim();
    // ReDoS-safe regex pattern - use bounded quantifiers to prevent catastrophic backtracking
    // Limit whitespace to prevent ReDoS while allowing reasonable formatting (up to 500 chars)
    const selectMatch = /^SELECT[ \t\r\n]{1,500}(.+?)[ \t\r\n]{1,500}FROM[ \t\r\n]{1,500}(\w+)/i.exec(trimmed);
    if (!selectMatch) {
      return [];
    }

    const columns = selectMatch[1].split(',').map((col) => col.trim());
    const tableName = selectMatch[2];
    const table = this.ensureTable(tableName);

    if (columns.length === 1 && columns[0] === '*') {
      return table.map((row) => ({ ...row }));
    }

    return table.map((row) => {
      const result = {};
      columns.forEach((col) => {
        const cleanName = col.replace(/[`'"\\]/g, '');
        result[cleanName] = row[cleanName];
      });
      return result;
    });
  }
}

module.exports = MockBetterSqlite3;
module.exports.default = MockBetterSqlite3;
