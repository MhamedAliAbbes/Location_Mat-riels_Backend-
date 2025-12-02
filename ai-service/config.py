import os
from pathlib import Path

class Config:
    # Flask Configuration
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'ai-service-secret-key-change-in-production'
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # Service Configuration
    PORT = int(os.environ.get('AI_SERVICE_PORT', 5001))
    HOST = os.environ.get('AI_SERVICE_HOST', '0.0.0.0')
    
    # Model Configuration
    DATA_PATH = os.environ.get('MODEL_DATA_PATH', 'models/data/')
    ENABLE_CACHING = os.environ.get('ENABLE_MODEL_CACHING', 'True').lower() == 'true'
    CACHE_TTL = int(os.environ.get('MODEL_CACHE_TTL', 3600))
    
    # Logging Configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE = os.environ.get('LOG_FILE', 'ai_service.log')
    
    # CORS Configuration
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5000').split(',')
    
    @staticmethod
    def init_app(app):
        pass

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False
    
    @classmethod
    def init_app(cls, app):
        Config.init_app(app)
        
        # Log to syslog in production
        import logging
        from logging.handlers import SysLogHandler
        syslog_handler = SysLogHandler()
        syslog_handler.setLevel(logging.WARNING)
        app.logger.addHandler(syslog_handler)

# This is the important part that was missing
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}