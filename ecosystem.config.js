module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'src/server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      // Health check for PM2 monitoring
      health_check: {
        enabled: true,
        max_memory_restart: '1G',
        max_restarts: 10,
        min_uptime: '10s'
      },
      // Logging
      log_file: 'logs/api-server.log',
      out_file: 'logs/api-server-out.log',
      error_file: 'logs/api-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'click-worker',
      script: 'click-worker.js',
      instances: 1, // Single instance for Redis stream consumer
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      // Health check
      health_check: {
        enabled: true,
        max_memory_restart: '500M',
        max_restarts: 5,
        min_uptime: '30s'
      },
      // Logging
      log_file: 'logs/click-worker.log',
      out_file: 'logs/click-worker-out.log',
      error_file: 'logs/click-worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'stats-worker',
      script: 'stats-worker.js',
      instances: 1, // Single instance for stats aggregation
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      // Health check
      health_check: {
        enabled: true,
        max_memory_restart: '300M',
        max_restarts: 5,
        min_uptime: '30s'
      },
      // Logging
      log_file: 'logs/stats-worker.log',
      out_file: 'logs/stats-worker-out.log',
      error_file: 'logs/stats-worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};