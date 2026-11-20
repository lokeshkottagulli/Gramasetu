import { existsSync } from 'node:fs';

try {
  if (existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  } else if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch (error) {
  console.warn('Could not load .env file:', error.message);
}
