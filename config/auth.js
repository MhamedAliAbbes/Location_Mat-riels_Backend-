const jwt = require('jsonwebtoken');

const authConfig = {
  // Configuration JWT
  jwtSecret: process.env.JWT_SECRET || 'your-fallback-secret-key',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  
  // Options pour les tokens
  tokenOptions: {
    expiresIn: process.env.JWT_EXPIRE || '7d',
    issuer: 'GearRent Pro',
    audience: 'gearrent-users'
  },

  // Génération de token
  generateToken: (payload) => {
    return jwt.sign(payload, authConfig.jwtSecret, authConfig.tokenOptions);
  },

  // Vérification de token
  verifyToken: (token) => {
    try {
      return jwt.verify(token, authConfig.jwtSecret);
    } catch (error) {
      throw new Error('Token invalide');
    }
  },

  // Décodage sans vérification (pour debug)
  decodeToken: (token) => {
    return jwt.decode(token, { complete: true });
  }
};

module.exports = authConfig;