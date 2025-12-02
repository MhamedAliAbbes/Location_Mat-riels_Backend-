#!/usr/bin/env python3
"""
Startup script for AI Service
"""
import os
import sys
import logging
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from app import app, initialize_models
from config import config

def setup_logging():
    """Setup logging configuration"""
    log_level = os.environ.get('LOG_LEVEL', 'INFO')
    log_file = os.environ.get('LOG_FILE', 'ai_service.log')
    
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )

def main():
    """Main startup function"""
    try:
        # Setup logging
        setup_logging()
        logger = logging.getLogger(__name__)
        
        # Get configuration
        config_name = os.environ.get('FLASK_ENV', 'development')
        app_config = config.get(config_name, config['default'])
        
        logger.info(f"🚀 Starting AI Service in {config_name} mode")
        
        # Initialize models
        logger.info("🤖 Initializing AI models...")
        if not initialize_models():
            logger.error("  Failed to initialize models")
            sys.exit(1)
        
        # Start the Flask app
        logger.info(f"🌐 Starting Flask app on {app_config.HOST}:{app_config.PORT}")
        app.run(
            host=app_config.HOST,
            port=app_config.PORT,
            debug=app_config.DEBUG
        )
        
    except KeyboardInterrupt:
        logger.info("🛑 Service stopped by user")
    except Exception as e:
        logger.error(f"  Failed to start AI service: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()