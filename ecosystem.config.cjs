module.exports = {
    apps: [
      {
        name: 'Pulpy',
        script: 'src/server.js',
        instances: 'max',
        exec_mode: 'cluster',
  
        env: {
          NODE_ENV: 'production',
          PORT: 5001
        },
        env_development: {
          NODE_ENV: 'development',
          PORT: 5001
        },
  
        // PM2 stability controls
        max_memory_restart: '1G',
        max_restarts: 10,
        min_uptime: '10s',
  
        // Logging
        out_file: 'logs/api-server-out.log',
        error_file: 'logs/api-server-error.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
      },
  
      {
        name: 'click-worker',
        script: 'click-worker.js',
        instances: 1,
        exec_mode: 'fork',
  
        env: {
          NODE_ENV: 'production'
        },
        env_development: {
          NODE_ENV: 'development'
        },
  
        max_memory_restart: '500M',
        max_restarts: 5,
        min_uptime: '30s',
  
        out_file: 'logs/click-worker-out.log',
        error_file: 'logs/click-worker-error.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
      },
  
      {
        name: 'stats-worker',
        script: 'stats-worker.js',
        instances: 1,
        exec_mode: 'fork',
  
        env: {
          NODE_ENV: 'production'
        },
        env_development: {
          NODE_ENV: 'development'
        },
  
        max_memory_restart: '300M',
        max_restarts: 5,
        min_uptime: '30s',
  
        out_file: 'logs/stats-worker-out.log',
        error_file: 'logs/stats-worker-error.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
      }
    ]
  };
  