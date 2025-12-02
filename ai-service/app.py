from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
import traceback
import socket
import sys
import numpy as np
from pathlib import Path

def sanitize_for_json(obj):
    """Convert numpy types to native Python types for JSON serialization"""
    if isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: sanitize_for_json(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_json(item) for item in obj]
    return obj

# Fix Windows Unicode logging issues
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

# Enhanced configuration - Windows compatible logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ai_service.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Enhanced CORS configuration
CORS(app, 
     origins=["*"], 
     methods=["GET", "POST", "OPTIONS"], 
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     supports_credentials=True)

# Global model instances
recommendation_model = None
planning_model = None

def initialize_models():
    """Enhanced model initialization with better error handling"""
    global recommendation_model, planning_model
    
    try:
        logger.info("Starting Enhanced AI Service Initialization...")
        
        # Initialize enhanced recommendation model
        try:
            from models.recommendation_model import RecommendationModel
            recommendation_model = RecommendationModel()
            
            if recommendation_model.initialize():
                logger.info("Enhanced recommendation model loaded successfully")
                logger.info(f"Model info: {recommendation_model.get_model_info()}")
            else:
                raise Exception("Enhanced recommendation model initialization failed")
                
        except Exception as e:
            logger.error(f"Enhanced recommendation model failed: {e}")
            logger.info("Falling back to basic recommendation model")
            recommendation_model = FallbackRecommendationModel()
        
        # Initialize enhanced planning model
        try:
            from models.planning_model import PlanningModel
            planning_model = PlanningModel()
            
            if planning_model.load_and_train():
                logger.info("Enhanced planning model loaded and trained successfully")
                logger.info(f"Model performance: Accuracy={planning_model.accuracy:.3f}, MAE={planning_model.mae:.3f}")
            else:
                logger.warning("Enhanced planning model training failed")
                planning_model = None
                
        except Exception as e:
            logger.error(f"Enhanced planning model failed: {e}")
            logger.error(traceback.format_exc())
            planning_model = None
        
        logger.info("Enhanced AI Service initialization complete")
        return True
        
    except Exception as e:
        logger.error(f"Critical error during model initialization: {e}")
        logger.error(traceback.format_exc())
        return False

class FallbackRecommendationModel:
    def __init__(self):
        self.is_initialized = True
        logger.info("Fallback recommendation model initialized")
        
    def get_recommendations(self, query, days=1):
        logger.info(f"Using fallback recommendations for: '{query}'")
        
        query_lower = query.lower()
        recommendations = []
        
        if any(word in query_lower for word in ['mariage', 'wedding', 'outdoor', 'extérieur', 'photo']):
            recommendations = [
                {
                    'type': 'wedding',
                    'budget': 'high',
                    'lieu': 'extérieur',
                    'camera': 'Canon R6',
                    'objectif': 'Canon 24-70mm f/2.8',
                    'lumieres': 'Aputure 300x',
                    'prix_jour': 450,
                    'prix_total': 450 * days,
                    'duree': days,
                    'score': 0.85,
                    'confidence': 'very_good'
                }
            ]
        else:
            recommendations = [
                {
                    'type': 'general',
                    'budget': 'medium',
                    'lieu': 'intérieur',
                    'camera': 'Canon EOS R',
                    'objectif': 'Canon 50mm f/1.8',
                    'lumieres': 'Aputure Amaran 100x',
                    'prix_jour': 320,
                    'prix_total': 320 * days,
                    'duree': days,
                    'score': 0.70,
                    'confidence': 'relevant'
                }
            ]
        
        return {
            'success': True,
            'message': f'Found {len(recommendations)} recommendations',
            'query': query,
            'duration_days': days,
            'recommendations': recommendations
        }
    
    def get_equipment_stats(self):
        return {
            'total_configurations': 50,
            'categories': {'photography': 20, 'video': 15},
            'average_price': 350
        }
    
    def get_model_info(self):
        return {
            'is_initialized': True,
            'model_type': 'Fallback',
            'version': '1.0_fallback'
        }

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify({'status': 'OK'})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'service': 'Enhanced AI Equipment Recommendation Service',
        'status': 'running',
        'version': '2.0.0',
        'endpoints': {
            'health': '/health',
            'model_info': '/api/ai/model-info',
            'recommendations': '/api/ai/recommend-equipment',
            'predictions': '/api/ai/predict-demand',
            'stats': '/api/ai/equipment-stats'
        }
    })

@app.route('/health', methods=['GET'])
def health_check():
    model_status = {
        'recommendation_model': {
            'loaded': recommendation_model is not None,
            'initialized': getattr(recommendation_model, 'is_initialized', False)
        },
        'planning_model': {
            'loaded': planning_model is not None,
            'trained': getattr(planning_model, 'is_trained', False)
        }
    }
    
    return jsonify({
        'status': 'OK',
        'service': 'Enhanced AI Service',
        'port': int(os.environ.get('AI_SERVICE_PORT', 5001)),
        'models': model_status,
        'version': '2.0.0'
    })

@app.route('/api/ai/model-info', methods=['GET'])
def model_info():
    """FIXED: Added missing model-info endpoint"""
    try:
        logger.info("Model info request received")
        
        from datetime import datetime  # Add this import
        
        info = {
            'service_version': '2.0_enhanced',
            'recommendation_model': None,
            'planning_model': None,
            'timestamp': datetime.now().isoformat()  # FIXED: Use datetime instead of pd
        }
        
        # Get recommendation model info
        if recommendation_model and hasattr(recommendation_model, 'get_model_info'):
            info['recommendation_model'] = sanitize_for_json(recommendation_model.get_model_info())
        
        # Get planning model info
        if planning_model and hasattr(planning_model, 'get_model_info'):
            info['planning_model'] = sanitize_for_json(planning_model.get_model_info())
        
        return jsonify({
            'success': True,
            'data': info
        })
        
    except Exception as e:
        logger.error(f"Error in model_info: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/ai/predict-demand', methods=['POST', 'OPTIONS'])
def predict_demand():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        logger.info("Enhanced demand prediction request received")
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'Request body is required'
            }), 400
        
        material_id = data.get('material_id') or data.get('equipmentId')
        start_date = data.get('start_date') or data.get('startDate')
        end_date = data.get('end_date') or data.get('endDate')
        
        logger.info(f"Prediction request - Material: {material_id}, Start: {start_date}, End: {end_date}")
        
        if not all([material_id, start_date, end_date]):
            return jsonify({
                'success': False,
                'message': 'Material ID, start date, and end date are required'
            }), 400
        
        if not planning_model or not planning_model.is_trained:
            logger.info("Planning model not available, using fallback")
            
            from datetime import datetime, timedelta
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            days = (end_dt - start_dt).days + 1
            
            base_demand = 2.5
            if start_dt.month in [5, 6, 7, 8, 9]:
                base_demand = 3.2
            
            prediction = {
                'material_id': material_id,
                'period': {
                    'start_date': start_date,
                    'end_date': end_date,
                    'days': days
                },
                'summary': {
                    'average_demand': round(base_demand, 2),
                    'maximum_demand': int(base_demand * 1.5),
                    'minimum_demand': int(base_demand * 0.5),
                    'total_predicted_demand': int(base_demand * days),
                    'overall_confidence': 0.75
                },
                'daily_predictions': [],
                'recommendations': [
                    {
                        'type': 'fallback',
                        'message': 'Using simplified prediction model',
                        'priority': 'medium'
                    }
                ]
            }
            
            # Generate daily predictions
            current_date = start_dt
            while current_date <= end_dt:
                prediction['daily_predictions'].append({
                    'date': current_date.strftime('%Y-%m-%d'),
                    'predicted_demand': int(base_demand),
                    'confidence': 0.75
                })
                current_date += timedelta(days=1)
            
            return jsonify({
                'success': True,
                'data': prediction
            })
        
        # Use planning model
        result = planning_model.predict_demand(
            material_id,
            start_date,
            end_date
        )
        
        logger.info(f"Prediction completed for material {material_id}")
        
        return jsonify({
            'success': True,
            'data': sanitize_for_json(result)
        })
        
    except Exception as e:
        logger.error(f"Error in predict_demand: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'message': f'Prediction service error: {str(e)}'
        }), 500

@app.route('/api/ai/recommend-equipment', methods=['POST', 'OPTIONS'])
def recommend_equipment():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        logger.info("Enhanced equipment recommendation request received")
        
        data = request.get_json()
        if not data or not data.get('query'):
            return jsonify({
                'success': False,
                'message': 'Query is required'
            }), 400
            
        query = data.get('query', '').strip()
        days = data.get('days', 1)
        
        logger.info(f"Processing query: '{query}' for {days} days")
        
        if len(query) < 3:
            return jsonify({
                'success': False,
                'message': 'Query must be at least 3 characters long'
            }), 400
        
        if not recommendation_model:
            return jsonify({
                'success': False,
                'message': 'Recommendation model not available'
            }), 503
        
        recommendations = recommendation_model.get_recommendations(query, days)
        
        if not recommendations.get('success', False):
            return jsonify({
                'success': False,
                'message': recommendations.get('message', 'No recommendations found')
            }), 400
        
        response_data = {
            'explanation': recommendations.get('message', 'Here are my recommendations:'),
            'recommendations': [],
            'confidence': recommendations.get('model_confidence', 0.8),
            'totalEstimatedCost': 0
        }
        
        for rec in recommendations.get('recommendations', []):
            formatted_rec = {
                'id': f"rec_{abs(hash(rec.get('camera', '')))}",
                'name': f"{rec.get('camera', 'Camera')} + {rec.get('objectif', 'Lens')}",
                'category': rec.get('type', 'Equipment').title(),
                'description': f"{rec.get('type', 'equipment')} setup",
                'pricePerDay': rec.get('prix_jour', 300),
                'quantity': 1,
                'reason': f"Match for {rec.get('type', 'your project')}",
                'matchScore': int(rec.get('score', 0.7) * 100),
                'confidence': rec.get('confidence', 'good')
            }
            response_data['recommendations'].append(formatted_rec)
            response_data['totalEstimatedCost'] += formatted_rec['pricePerDay'] * days
        
        logger.info(f"Recommendations generated: {len(response_data['recommendations'])} items")
        
        return jsonify({
            'success': True,
            'data': response_data
        })
        
    except Exception as e:
        logger.error(f"Error in recommend_equipment: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'message': 'Recommendation service error',
            'error': str(e)
        }), 500

@app.route('/api/ai/equipment-stats', methods=['GET'])
def equipment_stats():
    try:
        if not recommendation_model:
            return jsonify({
                'success': False,
                'message': 'Recommendation model not available'
            }), 503
            
        stats = recommendation_model.get_equipment_stats()
        stats = sanitize_for_json(stats)
        
        if planning_model and planning_model.is_trained:
            stats['planning_model'] = {
                'accuracy': round(float(planning_model.accuracy), 3),
                'mae': round(float(planning_model.mae), 3)
            }
        
        return jsonify({
            'success': True,
            'data': stats
        })
        
    except Exception as e:
        logger.error(f"Error in equipment_stats: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'message': 'Endpoint not found',
        'available_endpoints': [
            '/health',
            '/api/ai/model-info',
            '/api/ai/recommend-equipment',
            '/api/ai/predict-demand',
            '/api/ai/equipment-stats'
        ]
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({
        'success': False,
        'message': 'AI service internal error',
        'error': str(error)
    }), 500

def check_port(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()
    return result != 0

if __name__ == '__main__':
    logger.info("Starting Enhanced AI Service...")
    
    if not initialize_models():
        logger.error("Failed to initialize models properly")
    
    port = int(os.environ.get('AI_SERVICE_PORT', 5001))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    if not check_port(port):
        logger.error(f"Port {port} is already in use!")
        exit(1)
    
    logger.info(f"Enhanced AI Service Configuration:")
    logger.info(f"   Port: {port}")
    logger.info(f"   Local URL: http://127.0.0.1:{port}")
    logger.info(f"   Health: http://127.0.0.1:{port}/health")
    logger.info(f"   Model Info: http://127.0.0.1:{port}/api/ai/model-info")
    
    try:
        app.run(
            host='0.0.0.0',
            port=port,
            debug=debug,
            threaded=True,
            use_reloader=False
        )
    except Exception as e:
        logger.error(f"Failed to start AI service: {e}")
        exit(1)