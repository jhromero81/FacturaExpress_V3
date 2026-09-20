/**
 * routes/auth.routes.js
 * Definicion de las rutas del modulo de autenticacion.
 * El login aplica un limite de intentos para prevenir fuerza bruta.
 */

const { Router } = require('express');
const { login, logout, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/security');
const { loginValidator } = require('../validators');

const router = Router();

// POST /api/auth/login - Inicio de sesion (publica, con limite de intentos)
router.post('/login', loginLimiter, loginValidator, validate, login);

// POST /api/auth/logout - Cierre de sesion (revoca el JWT y limpia la cookie)
router.post('/logout', logout);

// GET /api/auth/me - Usuario autenticado (protegida)
router.get('/me', authenticate, getMe);

module.exports = router;
