module.exports = {
  apps: [{
    name: 'ai-agent-v4',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    env: { NODE_ENV: 'production' },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    kill_timeout: 10000
  }]
};
