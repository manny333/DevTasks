// Bootstrap: loads .env using __dirname (guaranteed to be this file's directory),
// then registers tsx as CJS loader BEFORE any TypeScript module is required.
require('dotenv').config({ path: __dirname + '/.env' });
require('tsx/cjs');
require('./src/index');
