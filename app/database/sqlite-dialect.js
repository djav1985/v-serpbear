const path = require('path');
const { EventEmitter } = require('events');
const BetterSqlite3 = require('better-sqlite3');  

const OPEN_READONLY = 0x01;
const OPEN_READWRITE = 0x02;
const OPEN_CREATE = 0x04;
const DEFAULT_FLAGS = OPEN_READWRITE + OPEN_CREATE;

function normalizeCallback(fn) {
  if (typeof fn === 'function') {
    return fn;
  }
  return () => {};
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function coerceBooleanBindings(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.map((item) => coerceBooleanBindings(item));
  }
  if (isPlainObject(value)) {
    const coerced = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      coerced[key] = coerceBooleanBindings(nestedValue);
    }
    return coerced;
  }
  return value;
}

function normalizeParams(params) {
  if (typeof params === 'undefined') {
    return undefined;
  }
  return coerceBooleanBindings(params);
}

function hasFlag(value, flag) {
  if (typeof value !== 'number') {
    return false;
  }
  return Math.floor(value / flag) % 2 === 1;
}

function normalizeNamedBindings(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof key === 'string' && key.length > 0 && ['$', '@', ':'].includes(key[0])) {
      normalized[key.slice(1)] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function applyStatement(stmt, method, params) {
  const normalized = normalizeParams(params);
  if (normalized === undefined) {
    return stmt[method]();
  }
  if (Array.isArray(normalized)) {
    return stmt[method](...normalized);
  }
  return stmt[method](normalized);
}

function shouldFallbackToRun(err) {
  return Boolean(err && typeof err.message === 'string' && err.message.includes('Use run() instead'));
}

function applyStatementWithFallback(statement, method, bindings, context) {
  const fallbackToRun = () => {
    const info = applyStatement(statement, 'run', bindings);
    if (info && typeof info.lastInsertRowid !== 'undefined') {
      const rowId = info.lastInsertRowid;
      context.lastID = Number(rowId);
    }
    context.changes = info ? info.changes || 0 : 0;
    return info;
  };

  if (method === 'run') {
    return fallbackToRun();
  }

  // For 'all' and 'get' methods, try the original method first, then fallback if needed
  try {
    const result = applyStatement(statement, method, bindings);
    
    if (method === 'all') {
      context.changes = Array.isArray(result) ? result.length : 0;
    } else if (method === 'get') {
      context.changes = result ? 1 : 0;
    }
    
    return result;
  } catch (err) {
    if (shouldFallbackToRun(err)) {
      fallbackToRun();
      return method === 'all' ? [] : undefined;
    }
    throw err;
  }
}

class Database extends EventEmitter {
  constructor(filename, mode, callback) {
    super();
    const flags = typeof mode === 'number' ? mode : DEFAULT_FLAGS;
    this.filename = filename;
    this.open = false;
    this.modeFlags = flags;
    this.driver = null;
    const cb = normalizeCallback(typeof mode === 'function' ? mode : callback);
    try {
      const options = {
        readonly: hasFlag(flags, OPEN_READONLY) && !hasFlag(flags, OPEN_READWRITE),
        fileMustExist: !hasFlag(flags, OPEN_CREATE)
      };
      this.driver = new BetterSqlite3(filename, options);
      this.open = true;
      setImmediate(() => {
        this.emit('open');
        cb.call(this, null);
      });
    } catch (error) {
      setImmediate(() => cb.call(this, error));
    }
  }

  serialize(callback) {
    if (typeof callback === 'function') {
      try {
        const result = callback();
        if (result && typeof result.then === 'function') {
          result.catch((err) => {
            setImmediate(() => {
              throw err;
            });
          });
        }
      } catch (error) {
        setImmediate(() => {
          throw error;
        });
      }
    }
    return this;
  }

  parallelize(callback) {
    return this.serialize(callback);
  }

  configure() {
    return this;
  }

  run(sql, ...params) {
    return this.executeInternal('run', sql, ...params);
  }

  all(sql, ...params) {
    return this.executeInternal('all', sql, ...params);
  }

  get(sql, ...params) {
    return this.executeInternal('get', sql, ...params);
  }

  exec(sql, callback) {
    const cb = normalizeCallback(callback);
    try {
      this.driver.exec(sql);
      setImmediate(() => cb.call(this, null));
    } catch (error) {
      setImmediate(() => cb.call(this, error));
    }
    return this;
  }

  close(callback) {
    const cb = normalizeCallback(callback);
    try {
      if (this.driver) {
        this.driver.close();
      }
      this.open = false;
      setImmediate(() => cb.call(this, null));
    } catch (error) {
      setImmediate(() => cb.call(this, error));
    }
    return this;
  }

  executeInternal(method, sql, ...args) {
    let cb;
    if (args.length > 0 && typeof args[args.length - 1] === 'function') {
      cb = args.pop();
    }
    while (args.length > 0 && args[args.length - 1] === undefined) {
      args.pop();
    }
    let bindings;
    if (args.length === 1) {
      [bindings] = args;
    } else if (args.length > 1) {
      bindings = args;
    }

    const finalCallback = normalizeCallback(cb);
    const preparedBindings = normalizeNamedBindings(bindings);
    const context = {
      database: this,
      sql,
      lastID: undefined,
      changes: 0
    };

    try {
      const statement = this.driver.prepare(sql);
      let result;
      if (method === 'run' || method === 'all' || method === 'get') {
        result = applyStatementWithFallback(statement, method, preparedBindings, context);
      } else {
        result = applyStatement(statement, method, preparedBindings);
      }
      
      setImmediate(() => finalCallback.call(context, null, result));
    } catch (error) {
      setImmediate(() => finalCallback.call(context, error));
    }

    return this;
  }
}

const cached = {
  objects: Object.create(null),
  Database(file, a, b) {
    if (!file || file === ':memory:') {
      return new Database(file, a, b);
    }
    const resolved = path.resolve(file);
    if (!this.objects[resolved]) {
      this.objects[resolved] = new Database(resolved, a, b);
    } else {
      const db = this.objects[resolved];
      let callback = null;
      if (typeof a === 'function') {
        callback = a;
      } else if (typeof b === 'function') {
        callback = b;
      }
      if (callback) {
        const wrapped = callback.bind(db, null);
        if (db.open) {
          setImmediate(wrapped);
        } else {
          db.once('open', wrapped);
        }
      }
    }
    return this.objects[resolved];
  }
};

const sqlite = {
  Database,
  OPEN_READONLY,
  OPEN_READWRITE,
  OPEN_CREATE,
  cached,
  verbose() {
    return sqlite;
  }
};

module.exports = sqlite;
module.exports.default = sqlite;
module.exports.Database = Database;
module.exports.OPEN_READONLY = OPEN_READONLY;
module.exports.OPEN_READWRITE = OPEN_READWRITE;
module.exports.OPEN_CREATE = OPEN_CREATE;
module.exports.cached = cached;
module.exports.verbose = sqlite.verbose;
