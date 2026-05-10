module.exports = {
  apps: [{
    name: 'cmms-app',
    script: 'server/production.ts',
    interpreter: 'tsx',
    cwd: '/var/www/cmms-app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://workorder_admin:workorder123@localhost:5432/workorder_db',
      PORT: '3000',
      SESSION_SECRET: 'cmms-super-secret-key-2025-production'
    },
    error_file: '/var/www/cmms-app/logs/err.log',
    out_file: '/var/www/cmms-app/logs/out.log',
    log_file: '/var/www/cmms-app/logs/combined.log',
    time: true
  }]
};