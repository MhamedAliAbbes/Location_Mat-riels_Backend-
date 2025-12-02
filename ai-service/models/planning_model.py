import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, mean_absolute_error
from sklearn.preprocessing import StandardScaler, LabelEncoder
from datetime import datetime, timedelta
import logging
import os
import joblib
import re

logger = logging.getLogger(__name__)

def convert_to_json_serializable(obj):
    """Convert numpy types to native Python types for JSON serialization"""
    if isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_to_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_to_json_serializable(item) for item in obj]
    return obj

class PlanningModel:
    def __init__(self, data_path='models/data/'):
        self.data_path = data_path
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.data = None
        self.accuracy = 0
        self.mae = 0
        self.is_trained = False
        self.feature_names = []
        
    def load_data(self):
        """Load and prepare the training data with enhanced processing"""
        try:
            # Load CSV files
            reservations_path = os.path.join(self.data_path, 'reservations_3000.csv')
            materiel_path = os.path.join(self.data_path, 'materiel_corrige_final.csv')
            
            if not os.path.exists(reservations_path) or not os.path.exists(materiel_path):
                logger.warning("CSV files not found, creating enhanced sample data")
                self._create_enhanced_sample_data()
                return True
                
            logger.info(f"Loading data from {reservations_path} and {materiel_path}")
            
            reservations = pd.read_csv(reservations_path)
            materiel = pd.read_csv(materiel_path)
            
            logger.info(f"Loaded {len(reservations)} reservations and {len(materiel)} materials")
            
            # Enhanced data cleaning
            reservations = self._enhanced_clean_reservations(reservations)
            materiel = self._enhanced_clean_materiel(materiel)
            
            # Merge datasets with enhanced logic
            self.data = self._enhanced_merge_data(reservations, materiel)
            
            # Enhanced data preprocessing
            self.data = self._enhanced_preprocessing(self.data)
            
            logger.info(f"Data preparation complete: {len(self.data)} records ready")
            return True
            
        except Exception as e:
            logger.error(f"Error loading data: {e}")
            return False
    
    def _create_enhanced_sample_data(self):
        """Create enhanced sample data that mimics your actual data structure"""
        logger.info("Creating enhanced sample data...")
        
        # Create more realistic reservations data
        np.random.seed(42)
        n_reservations = 3000
        
        # Generate dates over 2 years for better temporal patterns
        start_date = datetime(2023, 1, 1)
        end_date = datetime(2024, 12, 31)
        
        reservations_data = {
            'reservation_id': range(1, n_reservations + 1),
            'materiel_id': np.random.randint(1, 56, n_reservations),
            'client_id': np.random.randint(1, 501, n_reservations),
            'date_debut': [],
            'date_fin': [],
            'demande': [],
            'statut': np.random.choice(['confirme', 'en_attente', 'annule'], n_reservations, p=[0.7, 0.2, 0.1]),
            'id': range(1, n_reservations + 1)
        }
        
        # Generate realistic dates and demands
        for i in range(n_reservations):
            # Random start date
            random_days = np.random.randint(0, (end_date - start_date).days)
            date_debut = start_date + timedelta(days=random_days)
            
            # Duration based on realistic patterns
            duration = np.random.choice([1, 2, 3, 4, 5, 7, 14], p=[0.4, 0.25, 0.15, 0.1, 0.05, 0.03, 0.02])
            date_fin = date_debut + timedelta(days=duration)
            
            reservations_data['date_debut'].append(date_debut.strftime('%Y-%m-%d'))
            reservations_data['date_fin'].append(date_fin.strftime('%Y-%m-%d'))
            
            # Demand based on seasonal and equipment patterns
            month = date_debut.month
            
            # Higher demand in wedding season (May-Sept) and holidays
            if month in [5, 6, 7, 8, 9]:
                base_demand = np.random.choice([2, 3, 4, 5], p=[0.2, 0.3, 0.3, 0.2])
            elif month in [12, 1]:
                base_demand = np.random.choice([1, 2, 3, 4], p=[0.3, 0.3, 0.3, 0.1])
            else:
                base_demand = np.random.choice([1, 2, 3, 4, 5], p=[0.25, 0.35, 0.25, 0.1, 0.05])
            
            reservations_data['demande'].append(base_demand)
        
        reservations = pd.DataFrame(reservations_data)
        
        # Create realistic material data
        equipment_types = [
            'Camera Sony A7III', 'Camera Canon R6', 'Camera Sony FX6', 'Camera Canon C70',
            'Objectif Canon 50mm', 'Objectif Sigma 24-70mm', 'Objectif Sony 85mm',
            'Lumières Aputure 300x', 'Lumières Neewer LED', 'Lumières Godox SL-60W',
            'Micro Shure SM7B', 'Micro Rode VideoMic', 'Stabilisateur DJI Ronin',
            'Trépied Manfrotto', 'Moniteur Atomos Ninja'
        ] * 4
        
        materiel_data = {
            'materiel_id': range(1, 56),
            'materiel': equipment_types[:55],
            'quantite': np.random.randint(2, 15, 55),
            'disponible': [True] * 55,
            'quantite_reservee': np.random.randint(0, 5, 55),
            'quantite_en_attente': np.random.randint(0, 3, 55),
            'quantite_disponible': []
        }
        
        # Calculate available quantity
        for i in range(55):
            total = materiel_data['quantite'][i]
            reserved = materiel_data['quantite_reservee'][i]
            pending = materiel_data['quantite_en_attente'][i]
            available = max(0, total - reserved - pending)
            materiel_data['quantite_disponible'].append(available)
        
        materiel = pd.DataFrame(materiel_data)
        
        # Process and merge
        reservations = self._enhanced_clean_reservations(reservations)
        materiel = self._enhanced_clean_materiel(materiel)
        self.data = self._enhanced_merge_data(reservations, materiel)
        self.data = self._enhanced_preprocessing(self.data)
        
        logger.info(f"Enhanced sample data created: {len(self.data)} records")
    
    def _enhanced_clean_reservations(self, df):
        """Enhanced cleaning for reservations data"""
        logger.info("Enhanced cleaning of reservations data...")
        
        # Clean material IDs
        def clean_material_id(value):
            if isinstance(value, str):
                numbers = re.findall(r'\d+', value)
                return int(numbers[0]) if numbers else 1
            return int(value) if pd.notna(value) else 1
        
        df['materiel_id'] = df['materiel_id'].apply(clean_material_id)
        
        # Clean demand values
        if 'quantite' in df.columns:
            df = df.rename(columns={'quantite': 'demande'})
        
        # Ensure demand is in valid range
        df['demande'] = df['demande'].clip(1, 5)
        
        # Remove invalid records
        df = df.dropna(subset=['materiel_id', 'demande'])
        
        return df
    
    def _enhanced_clean_materiel(self, df):
        """Enhanced cleaning for material data"""
        logger.info("Enhanced cleaning of material data...")
        
        def clean_material_id(value):
            if isinstance(value, str):
                numbers = re.findall(r'\d+', value)
                return int(numbers[0]) if numbers else 1
            return int(value) if pd.notna(value) else 1
        
        df['materiel_id'] = df['materiel_id'].apply(clean_material_id)
        
        # Clean quantity fields
        quantity_fields = ['quantite', 'quantite_reservee', 'quantite_en_attente', 'quantite_disponible']
        for field in quantity_fields:
            if field in df.columns:
                df[field] = pd.to_numeric(df[field], errors='coerce').fillna(0).astype(int)
        
        return df
    
    def _enhanced_merge_data(self, reservations, materiel):
        """Enhanced data merging with better handling"""
        logger.info("Enhanced merging of datasets...")
        
        # Rename columns for clarity
        if 'quantite' in reservations.columns:
            reservations = reservations.rename(columns={'quantite': 'demande'})
        if 'quantite' in materiel.columns:
            materiel = materiel.rename(columns={'quantite': 'stock'})
        
        # Merge with enhanced logic
        data = pd.merge(reservations, materiel, on='materiel_id', how='left', suffixes=('', '_material'))
        
        # Fill missing values intelligently
        data['stock'] = data['stock'].fillna(data['stock'].median())
        data['quantite_disponible'] = data['quantite_disponible'].fillna(data['stock'])
        
        return data
    
    def _enhanced_preprocessing(self, data):
        """Enhanced preprocessing with better feature engineering"""
        logger.info("Enhanced preprocessing and feature engineering...")
        
        # Remove duplicate ID columns
        if 'id' in data.columns:
            data = data.drop(columns=['id'])
        
        # Convert dates with better handling
        data = self._enhanced_convert_dates(data)
        
        # Enhanced temporal feature engineering
        data = self._create_enhanced_temporal_features(data)
        
        # Enhanced material features
        data = self._create_material_features(data)
        
        # Handle missing values more intelligently
        data = self._enhanced_handle_missing_values(data)
        
        return data
    
    def _enhanced_convert_dates(self, data):
        """Enhanced date conversion with better error handling"""
        date_columns = ['date_debut', 'date_fin', 'date_reservation']
        
        for col in date_columns:
            if col in data.columns:
                try:
                    data[col] = pd.to_datetime(data[col], errors='coerce')
                    logger.info(f"{col} converted to datetime")
                except Exception as e:
                    logger.warning(f"Failed to convert {col}: {e}")
                    base_date = datetime(2024, 1, 1)
                    data[col] = [base_date + timedelta(days=i % 365) for i in range(len(data))]
        
        return data
    
    def _create_enhanced_temporal_features(self, data):
        """Create enhanced temporal features"""
        if 'date_debut' not in data.columns:
            return data
        
        # Basic temporal features
        data['mois'] = data['date_debut'].dt.month
        data['semaine'] = data['date_debut'].dt.isocalendar().week
        data['jour_semaine'] = data['date_debut'].dt.dayofweek
        data['jour_annee'] = data['date_debut'].dt.dayofyear
        data['trimestre'] = data['date_debut'].dt.quarter
        
        # Enhanced features
        data['est_weekend'] = (data['jour_semaine'] >= 5).astype(int)
        data['est_vacances'] = data['mois'].isin([7, 8, 12, 1]).astype(int)
        data['saison'] = data['mois'].apply(self._get_season)
        
        # Wedding season (high demand period)
        data['saison_mariage'] = data['mois'].isin([5, 6, 7, 8, 9]).astype(int)
        
        # Business season
        data['saison_affaires'] = data['mois'].isin([3, 4, 5, 9, 10, 11]).astype(int)
        
        # Holiday periods
        data['periode_fetes'] = data['mois'].isin([12, 1]).astype(int)
        
        # Cyclical encoding for better ML performance
        data['mois_sin'] = np.sin(2 * np.pi * data['mois'] / 12)
        data['mois_cos'] = np.cos(2 * np.pi * data['mois'] / 12)
        data['semaine_sin'] = np.sin(2 * np.pi * data['semaine'] / 52)
        data['semaine_cos'] = np.cos(2 * np.pi * data['semaine'] / 52)
        
        return data
    
    def _get_season(self, month):
        """Get season from month"""
        if month in [12, 1, 2]:
            return 1  # Winter
        elif month in [3, 4, 5]:
            return 2  # Spring
        elif month in [6, 7, 8]:
            return 3  # Summer
        else:
            return 4  # Autumn
    
    def _create_material_features(self, data):
        """Create enhanced material-based features"""
        # Material encoding
        if 'materiel_id' in data.columns:
            data['materiel_encoded'] = data['materiel_id'].astype('category').cat.codes
        
        # Stock-based features
        if 'stock' in data.columns:
            data['stock_log'] = np.log1p(data['stock'])
            
            # Stock utilization
            if 'quantite_reservee' in data.columns:
                data['taux_utilisation'] = data['quantite_reservee'] / (data['stock'] + 1)
            
            # Stock pressure
            if 'quantite_disponible' in data.columns:
                data['pression_stock'] = (data['stock'] - data['quantite_disponible']) / (data['stock'] + 1)
        
        # Material category inference from name
        if 'materiel' in data.columns:
            data['categorie_materiel'] = data['materiel'].apply(self._infer_category)
            
            # Encode categories
            le_cat = LabelEncoder()
            data['categorie_encoded'] = le_cat.fit_transform(data['categorie_materiel'])
            self.label_encoders['categorie_materiel'] = le_cat
        
        return data
    
    def _infer_category(self, materiel_name):
        """Infer material category from name"""
        if pd.isna(materiel_name):
            return 'autre'
        
        name_lower = str(materiel_name).lower()
        
        if any(word in name_lower for word in ['camera', 'caméra', 'appareil', 'boitier']):
            return 'camera'
        elif any(word in name_lower for word in ['objectif', 'lens', 'optique']):
            return 'objectif'
        elif any(word in name_lower for word in ['lumière', 'light', 'éclairage', 'led', 'flash']):
            return 'lumiere'
        elif any(word in name_lower for word in ['micro', 'audio', 'son', 'microphone']):
            return 'audio'
        elif any(word in name_lower for word in ['stabilisateur', 'gimbal', 'steadicam']):
            return 'stabilisation'
        elif any(word in name_lower for word in ['trépied', 'tripod', 'support']):
            return 'support'
        else:
            return 'autre'
    
    def _enhanced_handle_missing_values(self, data):
        """Enhanced missing value handling"""
        for col in data.columns:
            if data[col].isnull().sum() > 0:
                if data[col].dtype == 'object':
                    data[col] = data[col].fillna('inconnu')
                elif col in ['stock', 'quantite_disponible']:
                    data[col] = data[col].fillna(data[col].median())
                else:
                    data[col] = data[col].fillna(0)
        
        return data
    
    def load_and_train(self):
        """Load data and train the enhanced model"""
        try:
            logger.info("Starting enhanced model training...")
            
            # Load data
            if not self.load_data():
                raise Exception("Failed to load data")
            
            # Define enhanced feature set
            base_features = [
                'materiel_encoded', 'stock', 'mois', 'semaine', 'jour_semaine',
                'est_weekend', 'est_vacances', 'trimestre', 'saison'
            ]
            
            # Add advanced features if available
            advanced_features = [
                'saison_mariage', 'saison_affaires', 'periode_fetes',
                'mois_sin', 'mois_cos', 'semaine_sin', 'semaine_cos',
                'stock_log', 'taux_utilisation', 'pression_stock'
            ]
            
            # Select available features
            self.feature_names = [f for f in base_features + advanced_features if f in self.data.columns]
            
            logger.info(f"Using {len(self.feature_names)} features: {self.feature_names}")
            
            X = self.data[self.feature_names]
            y = self.data['demande']
            
            # Enhanced train/test split with temporal awareness
            if 'date_debut' in self.data.columns:
                # Temporal split (80% train, 20% test)
                data_sorted = self.data.sort_values('date_debut').reset_index(drop=True)
                split_idx = int(0.8 * len(data_sorted))
                
                X_train = X.iloc[:split_idx]
                X_test = X.iloc[split_idx:]
                y_train = y.iloc[:split_idx]
                y_test = y.iloc[split_idx:]
            else:
                # Random split if no dates
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=0.2, random_state=42, stratify=y
                )
            
            # Scale features
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            # Enhanced model with optimized hyperparameters
            self.model = RandomForestClassifier(
                n_estimators=300,
                max_depth=8,
                min_samples_split=8,
                min_samples_leaf=3,
                max_features='sqrt',
                class_weight='balanced',
                random_state=42,
                n_jobs=-1
            )
            
            # Train the model
            self.model.fit(X_train_scaled, y_train)
            
            # Enhanced evaluation
            y_pred = self.model.predict(X_test_scaled)
            self.accuracy = float(accuracy_score(y_test, y_pred))
            self.mae = float(mean_absolute_error(y_test, y_pred))
            
            # Calculate feature importance
            feature_importance = dict(zip(self.feature_names, self.model.feature_importances_))
            sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            
            # Convert to JSON-serializable format
            sorted_features_clean = [(name, float(importance)) for name, importance in sorted_features]
            
            self.is_trained = True
            
            logger.info(f"Enhanced model trained successfully")
            logger.info(f"Accuracy: {self.accuracy:.3f} ({self.accuracy*100:.1f}%)")
            logger.info(f"MAE: {self.mae:.3f}")
            logger.info(f"Top 5 features: {sorted_features_clean[:5]}")
            
            # Detailed classification report
            logger.info("\nClassification Report:")
            logger.info(f"\n{classification_report(y_test, y_pred)}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error training enhanced model: {e}")
            return False
    
    def predict_demand(self, material_id, start_date, end_date, historical_data=None):
        """Enhanced demand prediction with better accuracy"""
        try:
            if not self.is_trained:
                raise Exception("Enhanced model not trained yet")
            
            logger.info(f"Enhanced prediction for material {material_id} from {start_date} to {end_date}")
            
            # Parse dates
            start_dt = pd.to_datetime(start_date)
            end_dt = pd.to_datetime(end_date)
            
            # Generate prediction features for each day
            prediction_data = []
            current_date = start_dt
            
            while current_date <= end_dt:
                features = self._create_prediction_features(material_id, current_date)
                prediction_data.append(features)
                current_date += timedelta(days=1)
            
            # Convert to DataFrame and ensure all features are present
            pred_df = pd.DataFrame(prediction_data)
            
            # Add missing features with default values
            for feature in self.feature_names:
                if feature not in pred_df.columns:
                    pred_df[feature] = 0
            
            # Reorder columns to match training
            pred_df = pred_df[self.feature_names]
            
            # Scale features
            pred_scaled = self.scaler.transform(pred_df)
            
            # Make predictions
            predictions = self.model.predict(pred_scaled)
            probabilities = self.model.predict_proba(pred_scaled)
            
            # Enhanced statistics
            avg_demand = float(np.mean(predictions))
            max_demand = int(np.max(predictions))
            min_demand = int(np.min(predictions))
            std_demand = float(np.std(predictions))
            total_demand = int(np.sum(predictions))
            
            # Enhanced confidence calculation
            confidences = np.max(probabilities, axis=1)
            overall_confidence = float(np.mean(confidences))
            
            # Generate enhanced daily predictions
            daily_predictions = []
            current_date = start_dt
            
            for i, pred in enumerate(predictions):
                daily_pred = {
                    'date': current_date.strftime('%Y-%m-%d'),
                    'predicted_demand': int(pred),
                    'confidence': float(confidences[i]),
                    'day_of_week': current_date.strftime('%A'),
                    'is_weekend': bool(current_date.weekday() >= 5),
                    'month': current_date.strftime('%B'),
                    'season': self._get_season_name(current_date.month)
                }
                daily_predictions.append(daily_pred)
                current_date += timedelta(days=1)
            
            # Enhanced recommendations
            recommendations = self._generate_enhanced_recommendations(
                material_id, avg_demand, max_demand, min_demand, std_demand, daily_predictions
            )
            
            # Risk assessment
            risk_level = self._assess_risk_level(material_id, max_demand, avg_demand)
            
            result = {
                'material_id': material_id,
                'period': {
                    'start_date': start_date,
                    'end_date': end_date,
                    'days': len(predictions)
                },
                'summary': {
                    'average_demand': round(avg_demand, 2),
                    'maximum_demand': max_demand,
                    'minimum_demand': min_demand,
                    'standard_deviation': round(std_demand, 2),
                    'total_predicted_demand': total_demand,
                    'overall_confidence': round(overall_confidence, 3)
                },
                'daily_predictions': daily_predictions,
                'risk_assessment': {
                    'level': risk_level,
                    'score': round((max_demand - avg_demand) / (avg_demand + 1), 2),
                    'description': self._get_risk_description(risk_level)
                },
                'model_performance': {
                    'accuracy': round(self.accuracy, 3),
                    'mae': round(self.mae, 3),
                    'features_used': len(self.feature_names)
                },
                'recommendations': recommendations,
                'insights': self._generate_insights(daily_predictions, avg_demand, max_demand)
            }
            
            return convert_to_json_serializable(result)
            
        except Exception as e:
            logger.error(f"Error in enhanced prediction: {e}")
            raise
    
    def _create_prediction_features(self, material_id, date):
        """Create enhanced features for prediction"""
        features = {
            'materiel_encoded': self._encode_material_id(material_id),
            'stock': self._get_material_stock(material_id),
            'mois': date.month,
            'semaine': date.isocalendar().week,
            'jour_semaine': date.weekday(),
            'est_weekend': 1 if date.weekday() >= 5 else 0,
            'trimestre': (date.month - 1) // 3 + 1,
            'est_vacances': 1 if date.month in [7, 8, 12, 1] else 0,
            'saison': self._get_season(date.month)
        }
        
        # Add advanced temporal features
        features.update({
            'saison_mariage': 1 if date.month in [5, 6, 7, 8, 9] else 0,
            'saison_affaires': 1 if date.month in [3, 4, 5, 9, 10, 11] else 0,
            'periode_fetes': 1 if date.month in [12, 1] else 0,
            'mois_sin': np.sin(2 * np.pi * date.month / 12),
            'mois_cos': np.cos(2 * np.pi * date.month / 12),
            'semaine_sin': np.sin(2 * np.pi * date.isocalendar().week / 52),
            'semaine_cos': np.cos(2 * np.pi * date.isocalendar().week / 52)
        })
        
        # Add stock-based features
        stock = features['stock']
        features.update({
            'stock_log': np.log1p(stock),
            'taux_utilisation': 0.5,
            'pression_stock': 0.3
        })
        
        return features
    
    def _encode_material_id(self, material_id):
        """FIXED: Enhanced material ID encoding that handles string ObjectIds"""
        try:
            # If material_id is a string (MongoDB ObjectId), convert it to a numeric value
            if isinstance(material_id, str):
                # Convert string to hash, then take modulo
                import hashlib
                # Create a hash of the string and convert to integer
                hash_object = hashlib.md5(material_id.encode())
                hex_dig = hash_object.hexdigest()
                # Convert first 8 characters of hex to int, then modulo
                numeric_id = int(hex_dig[:8], 16) % 1000
                return numeric_id
            else:
                # If it's already numeric, use modulo directly
                return int(material_id) % 100
        except Exception as e:
            logger.warning(f"Error encoding material_id {material_id}: {e}")
            # Fallback to a default value
            return 1
    
    def _get_material_stock(self, material_id):
        """Get enhanced stock information"""
        if self.data is not None:
            # Try to find stock data by matching the material_id
            # Since material_id might be a string ObjectId, we need to handle this carefully
            try:
                # First try direct matching if possible
                if isinstance(material_id, str):
                    # For string IDs, we can't directly match, so use a fallback
                    pass
                else:
                    stock_data = self.data[self.data['materiel_id'] == material_id]['stock']
                    if len(stock_data) > 0:
                        return int(stock_data.iloc[0])
            except Exception as e:
                logger.warning(f"Error getting stock for material_id {material_id}: {e}")
        
        # Default stock based on hash of material ID to be consistent
        try:
            if isinstance(material_id, str):
                import hashlib
                hash_object = hashlib.md5(material_id.encode())
                hex_dig = hash_object.hexdigest()
                # Use hash to determine stock level consistently
                stock_level = (int(hex_dig[:4], 16) % 4) + 1
                if stock_level == 1:
                    return 8
                elif stock_level == 2:
                    return 12
                elif stock_level == 3:
                    return 15
                else:
                    return 10
            else:
                material_id_int = int(material_id)
                if material_id_int <= 20:
                    return 8
                elif material_id_int <= 40:
                    return 12
                else:
                    return 15
        except Exception:
            return 10  # Default fallback
    
    def _generate_enhanced_recommendations(self, material_id, avg_demand, max_demand, min_demand, std_demand, daily_predictions):
        """Generate enhanced recommendations"""
        recommendations = []
        current_stock = self._get_material_stock(material_id)
        
        # Stock shortage warning
        if max_demand > current_stock:
            recommendations.append({
                'type': 'stock_shortage',
                'priority': 'high',
                'message': f"Peak demand ({int(max_demand)}) exceeds current stock ({current_stock}). Consider increasing inventory.",
                'action': 'Increase stock or limit bookings during peak periods',
                'impact': 'High risk of lost revenue'
            })
        
        # High utilization warning
        if avg_demand > current_stock * 0.7:
            recommendations.append({
                'type': 'high_utilization',
                'priority': 'medium',
                'message': f"High utilization expected (avg: {avg_demand:.1f}/{current_stock})",
                'action': 'Monitor availability closely and consider dynamic pricing',
                'impact': 'Potential booking conflicts'
            })
        
        # Demand variability
        if std_demand > avg_demand * 0.5:
            recommendations.append({
                'type': 'variable_demand',
                'priority': 'medium',
                'message': f"High demand variability detected (std: {std_demand:.1f})",
                'action': 'Implement flexible booking policies',
                'impact': 'Unpredictable revenue streams'
            })
        
        # Low demand periods
        low_demand_days = [d for d in daily_predictions if d['predicted_demand'] <= 1]
        if len(low_demand_days) > len(daily_predictions) * 0.3:
            recommendations.append({
                'type': 'low_demand',
                'priority': 'low',
                'message': f"Low demand expected for {len(low_demand_days)} days",
                'action': 'Consider maintenance, promotions, or alternative revenue streams',
                'impact': 'Opportunity for equipment maintenance'
            })
        
        return recommendations
    
    def _assess_risk_level(self, material_id, max_demand, avg_demand):
        """Enhanced risk assessment"""
        current_stock = self._get_material_stock(material_id)
        
        if max_demand > current_stock:
            return 'high'
        elif max_demand > current_stock * 0.8:
            return 'medium'
        elif avg_demand > current_stock * 0.6:
            return 'medium'
        else:
            return 'low'
    
    def _get_risk_description(self, risk_level):
        """Get risk description"""
        descriptions = {
            'low': 'Demand is well within capacity. Low risk of stockouts.',
            'medium': 'Demand approaches capacity limits. Monitor closely.',
            'high': 'High risk of stockouts. Immediate action required.'
        }
        return descriptions.get(risk_level, 'Unknown risk level')
    
    def _get_season_name(self, month):
        """Get season name from month"""
        seasons = {1: 'Winter', 2: 'Spring', 3: 'Summer', 4: 'Autumn'}
        return seasons[self._get_season(month)]
    
    def _generate_insights(self, daily_predictions, avg_demand, max_demand):
        """Generate actionable insights"""
        insights = []
        
        # Peak demand days
        peak_days = [d for d in daily_predictions if d['predicted_demand'] == max_demand]
        if peak_days:
            peak_day = peak_days[0]
            insights.append(f"Peak demand expected on {peak_day['date']} ({peak_day['day_of_week']})")
        
        # Seasonal patterns
        monthly_avg = {}
        for pred in daily_predictions:
            month = pred['month']
            if month not in monthly_avg:
                monthly_avg[month] = []
            monthly_avg[month].append(pred['predicted_demand'])
        
        for month, demands in monthly_avg.items():
            month_avg = np.mean(demands)
            if month_avg > avg_demand * 1.2:
                insights.append(f"Higher than average demand expected in {month}")
        
        # Weekend vs weekday analysis
        weekend_demands = [d['predicted_demand'] for d in daily_predictions if d['is_weekend']]
        weekday_demands = [d['predicted_demand'] for d in daily_predictions if not d['is_weekend']]
        
        if weekend_demands and weekday_demands:
            if np.mean(weekend_demands) > np.mean(weekday_demands) * 1.2:
                insights.append("Significantly higher demand expected on weekends")
            elif np.mean(weekday_demands) > np.mean(weekend_demands) * 1.2:
                insights.append("Business/weekday bookings dominate this period")
        
        return insights
    
    def get_model_info(self):
        """Get enhanced model information"""
        info = {
            'is_trained': self.is_trained,
            'accuracy': round(float(self.accuracy), 3) if self.accuracy else 0,
            'mae': round(float(self.mae), 3) if self.mae else 0,
            'data_records': int(len(self.data)) if self.data is not None else 0,
            'features_count': len(self.feature_names),
            'feature_names': self.feature_names,
            'model_type': 'Enhanced RandomForestClassifier',
            'hyperparameters': {
                'n_estimators': 300,
                'max_depth': 8,
                'min_samples_split': 8,
                'min_samples_leaf': 3,
                'class_weight': 'balanced'
            },
            'enhancements': [
                'temporal_feature_engineering',
                'cyclical_encoding', 
                'material_categorization',
                'stock_pressure_analysis',
                'seasonal_pattern_detection',
                'risk_assessment',
                'enhanced_recommendations',
                'mongodb_objectid_support'
            ],
            'version': '2.0_enhanced'
        }
        
        return convert_to_json_serializable(info)