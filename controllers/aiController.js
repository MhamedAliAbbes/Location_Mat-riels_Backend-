const aiService = require('../services/aiService');
const Equipment = require('../models/Equipment');
const Reservation = require('../models/Reservation');

// Enhanced AI recommendations for clients with better processing
const getRecommendations = async (req, res) => {
  try {
    console.log('🎯 Enhanced AI Recommendations Request received');
    console.log('📊 Request details:', {
      body: req.body,
      headers: {
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']?.substring(0, 50),
        authorization: req.headers.authorization ? 'Present' : 'None'
      },
      user: req.user?.email || 'Anonymous'
    });
    
    const { query, days = 1 } = req.body;

    // Enhanced input validation with detailed feedback
    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      console.log('  Invalid query provided:', { query, type: typeof query });
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 3 characters long',
        validation_errors: [
          {
            field: 'query',
            issue: !query ? 'missing' : typeof query !== 'string' ? 'invalid_type' : 'too_short',
            provided: query,
            required: 'String with minimum 3 characters'
          }
        ],
        suggestions: [
          'outdoor wedding photography equipment',
          'studio interview setup with professional lighting',
          'court métrage en extérieur avec budget moyen',
          'équipement pour documentaire nature'
        ]
      });
    }

    // Enhanced query processing
    const cleanQuery = query.trim();
    const rentalDays = Math.max(1, Math.min(365, parseInt(days) || 1));

    console.log(`🔍 Processing enhanced query: "${cleanQuery}" for ${rentalDays} days`);

    // Enhanced query analysis
    const queryAnalysis = analyzeQuery(cleanQuery);
    console.log('📈 Query analysis:', queryAnalysis);

    // Get recommendations from AI service with enhanced error handling
    const result = await aiService.getEquipmentRecommendations(cleanQuery, rentalDays);
    
    if (!result.success) {
      console.error('🔴 AI service failed with specific error:', result);
      return res.status(503).json({
        success: false,
        message: 'AI recommendation service encountered an issue',
        error: result.error || 'Service temporarily unavailable',
        fallback_available: true,
        query_analysis: queryAnalysis
      });
    }

    console.log('  Enhanced AI Recommendations Success:', {
      recommendationCount: result.data.recommendations.length,
      confidence: result.data.confidence,
      totalCost: result.data.totalEstimatedCost,
      processingQuality: result.data.processing_quality || 'standard'
    });

    // Enhanced response formatting with additional metadata
    const enhancedResponseData = {
      explanation: result.data.explanation || 'Here are your personalized equipment recommendations:',
      recommendations: enhanceRecommendationsMetadata(result.data.recommendations || [], queryAnalysis),
      confidence: result.data.confidence || 0.8,
      totalEstimatedCost: result.data.totalEstimatedCost || 0,
      query_analysis: queryAnalysis,
      processing_metadata: {
        model_version: result.data.model_version || '2.0_enhanced',
        processing_time: Date.now(),
        fallback_used: result.data.enhanced_features?.fallback_mode || false,
        enhancement_level: result.data.processing_quality || 'standard'
      },
      user_context: {
        query_language: detectLanguage(cleanQuery),
        project_complexity: assessProjectComplexity(cleanQuery),
        budget_indication: extractBudgetFromQuery(cleanQuery)
      }
    };

    // Log successful processing
    console.log('📊 Enhanced response metadata:', {
      recommendations: enhancedResponseData.recommendations.length,
      confidence: enhancedResponseData.confidence,
      analysis: enhancedResponseData.query_analysis
    });

    res.json({
      success: true,
      message: 'Enhanced recommendations generated successfully',
      data: enhancedResponseData,
      timestamp: new Date().toISOString(),
      request_id: generateRequestId()
    });

  } catch (error) {
    console.error('🔴 Enhanced getRecommendations error:', error);
    console.error('Stack trace:', error.stack);
    
    // Enhanced error response with recovery suggestions
    const errorResponse = {
      success: false,
      message: 'Enhanced recommendation service encountered an unexpected error',
      error_details: {
        type: error.name || 'UnknownError',
        message: error.message || 'An unexpected error occurred'
      },
      recovery_suggestions: [
        'Try simplifying your query',
        'Check your internet connection',
        'Wait a moment and try again'
      ],
      fallback_recommendations: generateBasicFallback(req.body.query, req.body.days)
    };

    // Provide enhanced fallback even on complete failure
    res.status(500).json(errorResponse);
  }
};

// Enhanced AI demand prediction for admins
const predictDemand = async (req, res) => {
  try {
    console.log('📊 Enhanced demand prediction request received');
    
    const { equipmentId, startDate, endDate } = req.body;

    // Enhanced validation with detailed error messages
    const validationErrors = [];
    
    if (!equipmentId) {
      validationErrors.push({
        field: 'equipmentId',
        message: 'Equipment ID is required',
        code: 'MISSING_EQUIPMENT_ID'
      });
    }
    
    if (!startDate) {
      validationErrors.push({
        field: 'startDate',
        message: 'Start date is required',
        code: 'MISSING_START_DATE'
      });
    }
    
    if (!endDate) {
      validationErrors.push({
        field: 'endDate',
        message: 'End date is required',
        code: 'MISSING_END_DATE'
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        validation_errors: validationErrors
      });
    }

    // Enhanced equipment verification
    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) {
      console.log(`  Equipment not found: ${equipmentId}`);
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
        error_code: 'EQUIPMENT_NOT_FOUND',
        provided_id: equipmentId
      });
    }

    console.log(`📋 Equipment found: ${equipment.name} (${equipment.category})`);

    // Enhanced date validation
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    const dateValidationErrors = [];

    if (isNaN(start.getTime())) {
      dateValidationErrors.push({
        field: 'startDate',
        message: 'Invalid start date format',
        provided: startDate,
        expected: 'YYYY-MM-DD'
      });
    }

    if (isNaN(end.getTime())) {
      dateValidationErrors.push({
        field: 'endDate',
        message: 'Invalid end date format',
        provided: endDate,
        expected: 'YYYY-MM-DD'
      });
    }

    if (dateValidationErrors.length === 0) {
      if (start >= end) {
        dateValidationErrors.push({
          field: 'dateRange',
          message: 'End date must be after start date',
          startDate,
          endDate
        });
      }

      if (start < now.setHours(0, 0, 0, 0)) {
        dateValidationErrors.push({
          field: 'startDate',
          message: 'Start date cannot be in the past',
          provided: startDate,
          current_date: now.toISOString().split('T')[0]
        });
      }

      // Check for reasonable date range (not more than 1 year)
      const daysDifference = (end - start) / (1000 * 60 * 60 * 24);
      if (daysDifference > 365) {
        dateValidationErrors.push({
          field: 'dateRange',
          message: 'Date range cannot exceed 365 days',
          requested_days: Math.ceil(daysDifference),
          maximum_days: 365
        });
      }
    }

    if (dateValidationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Date validation failed',
        validation_errors: dateValidationErrors
      });
    }

    // Enhanced historical data gathering
    console.log(`📈 Gathering historical data for equipment ${equipmentId}...`);
    const historicalReservations = await Reservation.find({
      'equipment.item': equipmentId,
      status: { $in: ['completed', 'active', 'confirmed'] }
    })
    .sort({ createdAt: -1 })
    .limit(200); // Increased limit for better analysis

    console.log(`📊 Found ${historicalReservations.length} historical reservations`);

    // Enhanced AI service call with additional context
    const enhancedContext = {
      equipment: {
        id: equipment._id,
        name: equipment.name,
        category: equipment.category,
        current_stock: equipment.quantity,
        daily_rate: equipment.pricePerDay || 0
      },
      historical_patterns: analyzeHistoricalPatterns(historicalReservations),
      prediction_context: {
        season: getSeason(start),
        day_of_week_start: start.getDay(),
        is_weekend_period: isWeekendPeriod(start, end),
        duration_days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      }
    };

    console.log('🔮 Enhanced prediction context:', enhancedContext.prediction_context);

    const result = await aiService.predictDemand(
      equipmentId, 
      startDate, 
      endDate,
      {
        historical_data: historicalReservations,
        context: enhancedContext
      }
    );

    if (!result.success) {
      console.error('🔴 AI prediction service failed:', result);
      return res.status(503).json({
        success: false,
        message: 'AI prediction service unavailable',
        error: result.error,
        fallback_prediction: generateFallbackPrediction(equipment, startDate, endDate, enhancedContext)
      });
    }

    // Enhanced response with additional insights
    const enhancedPrediction = {
      ...result,
      equipment_context: enhancedContext.equipment,
      historical_insights: enhancedContext.historical_patterns,
      business_recommendations: generateBusinessRecommendations(result, equipment, enhancedContext),
      confidence_factors: analyzePredictionConfidence(result, enhancedContext)
    };

    console.log('  Enhanced demand prediction completed successfully');

    res.json({
      success: true,
      message: 'Enhanced demand prediction completed',
      equipment: {
        id: equipment._id,
        name: equipment.name,
        category: equipment.category,
        currentStock: equipment.quantity,
        location: equipment.location || 'Main warehouse'
      },
      prediction: enhancedPrediction,
      timestamp: new Date().toISOString(),
      request_id: generateRequestId()
    });

  } catch (error) {
    console.error('🔴 Enhanced predictDemand error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Enhanced demand prediction service encountered an error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Enhanced AI service status check
const getAIStatus = async (req, res) => {
  try {
    console.log('🔍 Enhanced AI service status check requested by:', req.user?.email || 'Anonymous');
    
    const startTime = Date.now();
    
    // Enhanced health check with multiple endpoints
    const [health, stats, modelInfo] = await Promise.allSettled([
      aiService.healthCheck(),
      aiService.getEquipmentStats(),
      aiService.getModelInfo ? aiService.getModelInfo() : Promise.resolve({ success: false, message: 'Model info not available' })
    ]);

    const responseTime = Date.now() - startTime;

    // Enhanced status compilation
    const enhancedStatus = {
      service_health: {
        available: health.status === 'fulfilled' && health.value.success,
        response_time_ms: responseTime,
        status: health.status === 'fulfilled' ? health.value.data : null,
        error: health.status === 'rejected' ? health.reason.message : null
      },
      equipment_statistics: {
        available: stats.status === 'fulfilled' && stats.value.success,
        data: stats.status === 'fulfilled' ? stats.value.data : null,
        error: stats.status === 'rejected' ? stats.reason.message : null
      },
      model_information: {
        available: modelInfo.status === 'fulfilled' && modelInfo.value.success,
        data: modelInfo.status === 'fulfilled' ? modelInfo.value.data : null,
        error: modelInfo.status === 'rejected' ? modelInfo.reason.message : null
      },
      overall_status: determineOverallStatus(health, stats, modelInfo),
      performance_metrics: {
        response_time_ms: responseTime,
        response_quality: responseTime < 2000 ? 'excellent' : responseTime < 5000 ? 'good' : 'slow',
        uptime_status: 'operational' // This could be enhanced with actual uptime tracking
      },
      configuration: {
        ai_service_url: process.env.AI_SERVICE_URL || 'http://localhost:5002',
        working_url: aiService.workingURL || 'Not detected',
        fallback_urls: aiService.fallbackURLs || [],
        timeout_ms: aiService.timeout || 10000
      }
    };

    console.log('📊 Enhanced AI status compiled:', {
      overall: enhancedStatus.overall_status,
      responseTime: responseTime,
      healthAvailable: enhancedStatus.service_health.available,
      statsAvailable: enhancedStatus.equipment_statistics.available
    });

    const response = {
      success: true,
      aiService: enhancedStatus,
      timestamp: new Date().toISOString(),
      request_id: generateRequestId()
    };

    res.json(response);

  } catch (error) {
    console.error('🔴 Enhanced getAIStatus error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking enhanced AI service status',
      error: error.message,
      aiService: {
        overall_status: 'error',
        service_health: {
          available: false,
          error: error.message
        }
      },
      timestamp: new Date().toISOString()
    });
  }
};

// Enhanced AI service connection test
const testAIConnection = async (req, res) => {
  try {
    console.log('🔧 Enhanced AI connection test initiated by:', req.user?.email || 'Anonymous');
    
    const testResults = {
      connection_test: null,
      health_check: null,
      recommendation_test: null,
      performance_metrics: {
        start_time: Date.now(),
        tests_completed: 0,
        total_tests: 3
      }
    };

    // Test 1: Basic connection
    try {
      const connectionResult = await aiService.testConnection();
      testResults.connection_test = {
        success: true,
        result: connectionResult,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
      testResults.performance_metrics.tests_completed++;
    } catch (error) {
      testResults.connection_test = {
        success: false,
        error: error.message,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
    }

    // Test 2: Health check
    try {
      const healthResult = await aiService.healthCheck();
      testResults.health_check = {
        success: healthResult.success,
        result: healthResult.data,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
      testResults.performance_metrics.tests_completed++;
    } catch (error) {
      testResults.health_check = {
        success: false,
        error: error.message,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
    }

    // Test 3: Sample recommendation
    try {
      const sampleResult = await aiService.getEquipmentRecommendations('test camera equipment', 1);
      testResults.recommendation_test = {
        success: sampleResult.success,
        recommendations_count: sampleResult.data?.recommendations?.length || 0,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
      testResults.performance_metrics.tests_completed++;
    } catch (error) {
      testResults.recommendation_test = {
        success: false,
        error: error.message,
        response_time: Date.now() - testResults.performance_metrics.start_time
      };
    }

    testResults.performance_metrics.total_time = Date.now() - testResults.performance_metrics.start_time;
    testResults.performance_metrics.success_rate = testResults.performance_metrics.tests_completed / testResults.performance_metrics.total_tests;

    // Determine overall connectivity status
    const overallSuccess = testResults.connection_test?.success && 
                          testResults.health_check?.success && 
                          testResults.recommendation_test?.success;

    console.log('🔍 Enhanced connection test results:', {
      overall: overallSuccess,
      testsCompleted: testResults.performance_metrics.tests_completed,
      totalTime: testResults.performance_metrics.total_time
    });

    res.json({
      success: true,
      connected: overallSuccess,
      test_results: testResults,
      service_info: {
        configured_url: process.env.AI_SERVICE_URL || 'http://localhost:5002',
        working_url: aiService.workingURL || 'None found',
        fallback_urls: aiService.fallbackURLs || []
      },
      timestamp: new Date().toISOString(),
      request_id: generateRequestId()
    });

  } catch (error) {
    console.error('🔴 Enhanced testAIConnection error:', error);
    res.status(500).json({
      success: false,
      message: 'Enhanced AI connection test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper functions for enhanced processing

function analyzeQuery(query) {
  const analysis = {
    length: query.length,
    word_count: query.split(/\s+/).length,
    language: detectLanguage(query),
    contains_technical_terms: /\b(4k|full frame|f\/\d|mm|fps|iso)\b/i.test(query),
    contains_brand_names: /\b(canon|sony|nikon|arri|red|blackmagic)\b/i.test(query),
    project_indicators: extractProjectIndicators(query),
    budget_indicators: extractBudgetFromQuery(query),
    location_indicators: extractLocationFromQuery(query),
    urgency_indicators: /\b(urgent|asap|immediate|quickly|vite)\b/i.test(query),
    specificity_score: calculateQuerySpecificity(query)
  };

  return analysis;
}

function detectLanguage(query) {
  const frenchWords = ['et', 'le', 'la', 'de', 'en', 'avec', 'pour', 'métrage', 'extérieur', 'intérieur', 'matériel', 'équipement'];
  const englishWords = ['and', 'the', 'with', 'for', 'outdoor', 'indoor', 'equipment', 'gear', 'camera', 'lens'];
  
  const queryLower = query.toLowerCase();
  const frenchCount = frenchWords.filter(word => queryLower.includes(word)).length;
  const englishCount = englishWords.filter(word => queryLower.includes(word)).length;
  
  if (frenchCount > englishCount) return 'french';
  if (englishCount > frenchCount) return 'english';
  return 'mixed';
}

function extractProjectIndicators(query) {
  const indicators = [];
  const queryLower = query.toLowerCase();
  
  const projectTypes = {
    wedding: ['mariage', 'wedding', 'bride', 'mariée'],
    interview: ['interview', 'entretien', 'podcast'],
    film: ['film', 'movie', 'court métrage', 'cinéma'],
    documentary: ['documentaire', 'documentary', 'docu'],
    commercial: ['pub', 'publicité', 'commercial', 'marketing'],
    music_video: ['clip', 'musical', 'music video'],
    event: ['événement', 'event', 'conference', 'spectacle']
  };

  for (const [type, keywords] of Object.entries(projectTypes)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      indicators.push(type);
    }
  }

  return indicators;
}

function extractBudgetFromQuery(query) {
  const queryLower = query.toLowerCase();
  
  if (/\b(faible|petit|économique|pas cher|low|cheap|budget serré)\b/i.test(query)) return 'low';
  if (/\b(élevé|grand|luxe|premium|high|expensive|haut de gamme)\b/i.test(query)) return 'high';
  if (/\b(moyen|normal|standard|medium|correct)\b/i.test(query)) return 'medium';
  
  return 'unspecified';
}

function extractLocationFromQuery(query) {
  const queryLower = query.toLowerCase();
  
  if (/\b(extérieur|dehors|outdoor|outside|plein air)\b/i.test(query)) return 'outdoor';
  if (/\b(intérieur|dedans|indoor|inside)\b/i.test(query)) return 'indoor';
  if (/\b(studio)\b/i.test(query)) return 'studio';
  
  return 'unspecified';
}

function calculateQuerySpecificity(query) {
  let score = 0;
  
  // Length bonus
  score += Math.min(query.length / 50, 1) * 20;
  
  // Technical terms bonus
  if (/\b(4k|full frame|f\/\d|mm|fps|iso)\b/i.test(query)) score += 20;
  
  // Brand mentions bonus
  if (/\b(canon|sony|nikon|arri|red|blackmagic)\b/i.test(query)) score += 15;
  
  // Project type specificity
  if (/\b(wedding|interview|documentary|commercial)\b/i.test(query)) score += 15;
  
  // Budget specificity
  if (/\b(budget|price|cost|expensive|cheap)\b/i.test(query)) score += 10;
  
  // Location specificity
  if (/\b(outdoor|indoor|studio|location)\b/i.test(query)) score += 10;
  
  return Math.min(score, 100);
}

function assessProjectComplexity(query) {
  const complexityIndicators = {
    simple: ['simple', 'basic', 'easy', 'beginner', 'facile', 'débutant'],
    medium: ['professional', 'standard', 'normal', 'professionnel'],
    complex: ['advanced', 'complex', 'high-end', 'premium', 'cinematic', 'complexe', 'avancé']
  };

  const queryLower = query.toLowerCase();
  
  for (const [level, keywords] of Object.entries(complexityIndicators)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      return level;
    }
  }
  
  // Analyze based on technical terms and project type
  if (/\b(arri|red|cinema|4k|raw)\b/i.test(query)) return 'complex';
  if (/\b(professional|pro|broadcast)\b/i.test(query)) return 'medium';
  
  return 'medium'; // Default
}

function enhanceRecommendationsMetadata(recommendations, queryAnalysis) {
  return recommendations.map((rec, index) => ({
    ...rec,
    metadata: {
      recommendation_rank: index + 1,
      query_relevance_score: calculateRelevanceScore(rec, queryAnalysis),
      equipment_tier: determineEquipmentTier(rec),
      cost_category: categorizeCost(rec.pricePerDay),
      suitability_factors: identifySuitabilityFactors(rec, queryAnalysis),
      professional_grade: assessProfessionalGrade(rec)
    }
  }));
}

function calculateRelevanceScore(recommendation, queryAnalysis) {
  let score = recommendation.matchScore || 75;
  
  // Adjust based on query analysis
  if (queryAnalysis.specificity_score > 70) score += 5;
  if (queryAnalysis.contains_technical_terms) score += 3;
  if (queryAnalysis.contains_brand_names) score += 2;
  
  return Math.min(score, 100);
}

function determineEquipmentTier(recommendation) {
  const name = recommendation.name?.toLowerCase() || '';
  
  if (name.includes('arri') || name.includes('red') || name.includes('alexa')) return 'cinema';
  if (name.includes('fx6') || name.includes('r6') || name.includes('a7s')) return 'professional';
  if (name.includes('a6') || name.includes('gh5')) return 'prosumer';
  return 'standard';
}

function categorizeCost(pricePerDay) {
  if (pricePerDay < 200) return 'budget';
  if (pricePerDay < 400) return 'mid-range';
  if (pricePerDay < 600) return 'high-end';
  return 'premium';
}

function identifySuitabilityFactors(recommendation, queryAnalysis) {
  const factors = [];
  
  if (queryAnalysis.project_indicators.includes('wedding')) {
    factors.push('excellent_for_weddings');
  }
  if (queryAnalysis.budget_indicators === 'low' && recommendation.pricePerDay < 300) {
    factors.push('budget_friendly');
  }
  if (queryAnalysis.contains_technical_terms) {
    factors.push('meets_technical_requirements');
  }
  
  return factors;
}

function assessProfessionalGrade(recommendation) {
  const price = recommendation.pricePerDay || 0;
  const name = recommendation.name?.toLowerCase() || '';
  
  if (name.includes('cinema') || name.includes('arri') || price > 600) return 'cinema_grade';
  if (name.includes('professional') || name.includes('pro') || price > 400) return 'professional';
  if (price > 200) return 'prosumer';
  return 'consumer';
}

function analyzeHistoricalPatterns(reservations) {
  if (!reservations || reservations.length === 0) {
    return {
      total_reservations: 0,
      average_duration: 0,
      seasonal_patterns: {},
      monthly_trends: {},
      utilization_rate: 0
    };
  }

  const patterns = {
    total_reservations: reservations.length,
    average_duration: calculateAverageDuration(reservations),
    seasonal_patterns: analyzeSeasonalPatterns(reservations),
    monthly_trends: analyzeMonthlyTrends(reservations),
    utilization_rate: calculateUtilizationRate(reservations)
  };

  return patterns;
}

function calculateAverageDuration(reservations) {
  if (reservations.length === 0) return 0;
  
  const totalDays = reservations.reduce((sum, reservation) => {
    const start = new Date(reservation.startDate || reservation.createdAt);
    const end = new Date(reservation.endDate || reservation.createdAt);
    const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    return sum + days;
  }, 0);
  
  return Math.round(totalDays / reservations.length);
}

function analyzeSeasonalPatterns(reservations) {
  const seasons = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  
  reservations.forEach(reservation => {
    const month = new Date(reservation.startDate || reservation.createdAt).getMonth() + 1;
    const season = getSeason(new Date(reservation.startDate || reservation.createdAt));
    seasons[season]++;
  });
  
  return seasons;
}

function analyzeMonthlyTrends(reservations) {
  const months = {};
  
  reservations.forEach(reservation => {
    const month = new Date(reservation.startDate || reservation.createdAt).getMonth() + 1;
    months[month] = (months[month] || 0) + 1;
  });
  
  return months;
}

function calculateUtilizationRate(reservations) {
  // Simplified calculation - in reality this would be more complex
  const totalPossibleDays = 365; // Assuming yearly analysis
  const totalReservedDays = reservations.reduce((sum, reservation) => {
    const start = new Date(reservation.startDate || reservation.createdAt);
    const end = new Date(reservation.endDate || reservation.createdAt);
    const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    return sum + days;
  }, 0);
  
  return Math.min(1, totalReservedDays / totalPossibleDays);
}

function getSeason(date) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function isWeekendPeriod(startDate, endDate) {
  const start = startDate.getDay();
  const end = endDate.getDay();
  
  // Check if period includes weekend days (0 = Sunday, 6 = Saturday)
  return start === 0 || start === 6 || end === 0 || end === 6;
}

function generateBusinessRecommendations(prediction, equipment, context) {
  const recommendations = [];
  
  const avgDemand = prediction.summary?.average_demand || 0;
  const maxDemand = prediction.summary?.maximum_demand || 0;
  const currentStock = equipment.quantity || 0;
  
  // Stock optimization recommendations
  if (maxDemand > currentStock) {
    recommendations.push({
      type: 'inventory_optimization',
      priority: 'high',
      title: 'Stock Shortage Alert',
      description: `Predicted peak demand (${maxDemand}) exceeds current stock (${currentStock})`,
      action: 'Consider acquiring additional units or partnering with suppliers',
      impact: 'revenue_protection',
      estimated_revenue_at_risk: (maxDemand - currentStock) * (equipment.pricePerDay || 0) * 7
    });
  }
  
  // Pricing optimization
  if (avgDemand > currentStock * 0.8) {
    recommendations.push({
      type: 'pricing_optimization',
      priority: 'medium',
      title: 'High Demand Period',
      description: 'Consider implementing dynamic pricing during high-demand periods',
      action: 'Increase daily rates by 15-25% during peak periods',
      impact: 'revenue_optimization',
      estimated_revenue_increase: avgDemand * (equipment.pricePerDay || 0) * 0.2 * 30
    });
  }
  
  // Maintenance scheduling
  const lowDemandDays = prediction.daily_predictions?.filter(d => d.predicted_demand <= 1).length || 0;
  if (lowDemandDays > 0) {
    recommendations.push({
      type: 'maintenance_scheduling',
      priority: 'low',
      title: 'Maintenance Opportunity',
      description: `${lowDemandDays} low-demand days identified for potential maintenance`,
      action: 'Schedule equipment maintenance during predicted low-demand periods',
      impact: 'operational_efficiency'
    });
  }
  
  return recommendations;
}

function analyzePredictionConfidence(prediction, context) {
  const factors = {
    historical_data_quality: context.historical_patterns.total_reservations > 10 ? 'high' : 'low',
    seasonal_consistency: Object.keys(context.historical_patterns.seasonal_patterns).length > 0 ? 'good' : 'limited',
    model_accuracy: prediction.model_performance?.accuracy || 0,
    prediction_horizon: 'medium', // Based on date range
    external_factors: 'not_considered' // Could be enhanced with external data
  };
  
  const overallConfidence = prediction.summary?.overall_confidence || 0.7;
  
  return {
    overall_score: overallConfidence,
    contributing_factors: factors,
    reliability_level: overallConfidence > 0.8 ? 'high' : overallConfidence > 0.6 ? 'medium' : 'low'
  };
}

function generateFallbackPrediction(equipment, startDate, endDate, context) {
  const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  const baseDemand = Math.min(equipment.quantity || 5, 3); // Conservative estimate
  
  return {
    summary: {
      average_demand: baseDemand,
      maximum_demand: baseDemand + 1,
      total_predicted_demand: baseDemand * days,
      overall_confidence: 0.6
    },
    message: 'Fallback prediction based on equipment capacity and conservative estimates',
    recommendations: [
      {
        type: 'fallback_advice',
        message: 'Monitor actual demand patterns to improve future predictions',
        priority: 'medium'
      }
    ]
  };
}

function generateBasicFallback(query, days = 1) {
  const recommendations = [
    {
      id: 'fallback_basic_1',
      name: 'Basic Equipment Package',
      category: 'General',
      description: 'Standard equipment suitable for various projects',
      pricePerDay: 250,
      quantity: 1,
      reason: 'Reliable equipment for general use',
      matchScore: 60
    }
  ];
  
  return {
    explanation: 'Basic recommendations provided due to service limitations',
    recommendations,
    confidence: 0.6,
    totalEstimatedCost: 250 * days,
    fallback_mode: true
  };
}

function determineOverallStatus(health, stats, modelInfo) {
  const healthOk = health.status === 'fulfilled' && health.value.success;
  const statsOk = stats.status === 'fulfilled' && stats.value.success;
  
  if (healthOk && statsOk) return 'optimal';
  if (healthOk) return 'functional';
  return 'degraded';
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  getRecommendations,
  predictDemand,
  getAIStatus,
  testAIConnection
};