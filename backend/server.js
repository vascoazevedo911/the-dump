// THE DUMP - Backend Cloud Version
// Node.js + Express + PostgreSQL + Cloudinary + Tesseract.js

const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// ✅ Cloudinary
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// Configuração Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configurado:', process.env.CLOUDINARY_CLOUD_NAME);

// CORS Configuration - FIXED
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['https://the-dump-gamma.vercel.app', 'http://localhost:3000'];

app.use(cors({ 
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport (Google OAuth)
app.use(passport.initialize());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    const name = profile.displayName || (profile.name && `${profile.name.givenName} ${profile.name.familyName}`) || 'Google User';

    if (!email) return done(new Error('No email found in Google profile'));

    const result = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      return done(null, user);
    }

    // Create user with a random password (schema requires password NOT NULL)
    const randomPass = crypto.randomBytes(16).toString('hex');
    const hashed = await bcrypt.hash(randomPass, 10);
    const insert = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, hashed, name]
    );
    return done(null, insert.rows[0]);
  } catch (err) {
    return done(err);
  }
}));

// PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'the_dump',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  ssl: process.env.DB_SSL === 'true' ? { 
    rejectUnauthorized: false,
    require: true
  } : false,
  family: 4
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ Erro PostgreSQL:', err);
  else console.log('✅ PostgreSQL conectado');
});

// ✅ Cloudinary Storage - IMPROVED ERROR HANDLING
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let resourceType = 'auto';
    if (file.mimetype === 'application/pdf') {
      resourceType = 'raw';
    } else if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    }

    return {
      folder: `the-dump/${req.user.id}`,
      resource_type: resourceType,
      allowed_formats: ['jpg', 'png', 'pdf', 'tiff', 'jpeg'],
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`
    };
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`));
    }
  }
});

// Middleware Autenticação
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token necessário' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
    }
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
  }
};

// ROTAS - Autenticação
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL || 'https://the-dump-gamma.vercel.app'}/login` }), 
  (req, res) => {
    const user = req.user;
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '7d' });
    const redirectUrl = `${process.env.FRONTEND_URL || 'https://the-dump-gamma.vercel.app'}/auth-success?token=${token}`;
    res.redirect(redirectUrl);
  }
);

app.post('/api/auth/register', async (req, res) => {
  res.status(403).json({ success: false, error: 'Registro local desabilitado. Use o login com Google.' });
});

app.post('/api/auth/login', async (req, res) => {
  res.status(403).json({ success: false, error: 'Login local desabilitado. Use o login com Google.' });
});

// ROTAS - Upload - IMPROVED ERROR HANDLING
app.post('/api/documents/upload', authenticateToken, (req, res, next) => {
  upload.array('files', 10)(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          error: 'Arquivo muito grande. Tamanho máximo: 50MB' 
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          success: false, 
          error: 'Muitos arquivos. Máximo: 10 arquivos por vez' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        error: `Erro no upload: ${err.message}` 
      });
    } else if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ 
        success: false, 
        error: err.message || 'Erro no upload do arquivo' 
      });
    }
    
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nenhum arquivo foi enviado' 
      });
    }
    
    next();
  });
}, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const uploadedDocs = [];

    for (const file of req.files) {
      const documentId = crypto.randomUUID();
      
      // ✅ Cloudinary retorna URL em file.path
      const fileUrl = file.path;
      const filePath = file.path;

      const docResult = await client.query(
        'INSERT INTO documents (id, user_id, file_name, file_type, file_size, file_path, file_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [documentId, req.user.id, file.originalname, file.mimetype, file.size, filePath, fileUrl, 'pending']
      );

      uploadedDocs.push(docResult.rows[0]);
      processDocumentAsync(documentId, fileUrl, file.mimetype);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      documents: uploadedDocs.map(doc => ({
        id: doc.id, 
        fileName: doc.file_name, 
        fileType: doc.file_type,
        fileSize: doc.file_size, 
        status: doc.status, 
        uploadDate: doc.created_at, 
        url: doc.file_url
      }))
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error during upload:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao salvar no banco de dados' 
    });
  } finally {
    client.release();
  }
});

// Processamento OCR (✅ Modificado para aceitar URLs)
async function processDocumentAsync(documentId, fileUrl, mimeType) {
  const client = await pool.connect();
  try {
    await client.query('UPDATE documents SET status = $1, processing_started_at = NOW() WHERE id = $2', ['processing', documentId]);

    let ocrText = '';
    let confidence = 0;

    if (mimeType === 'application/pdf') {
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const pdfBuffer = Buffer.from(response.data);
      const pdfData = await pdfParse(pdfBuffer);
      ocrText = pdfData.text;
      confidence = 95;
    } else if (mimeType.startsWith('image/')) {
      const result = await Tesseract.recognize(fileUrl, 'por', { logger: m => console.log(m) });
      ocrText = result.data.text;
      confidence = result.data.confidence;
    }

    await client.query(
      'UPDATE documents SET status = $1, ocr_text = $2, ocr_confidence = $3, processing_completed_at = NOW() WHERE id = $4',
      ['completed', ocrText, confidence, documentId]
    );
    console.log(`✅ Documento ${documentId} processado com sucesso`);
  } catch (error) {
    console.error(`❌ Erro ao processar documento ${documentId}:`, error);
    await client.query(
      'UPDATE documents SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', error.message, documentId]
    );
  } finally {
    client.release();
  }
}

// ROTAS - Busca
app.get('/api/documents/search', authenticateToken, async (req, res) => {
  try {
    const { query, dateFrom, dateTo, fileType, page = 1, size = 10 } = req.query;

    let sqlQuery = `
      SELECT id, file_name, file_type, file_size, file_url, created_at, ocr_text,
             ts_rank(search_vector, plainto_tsquery('portuguese', $1)) as relevance
      FROM documents
      WHERE user_id = $2 AND status = 'completed'
    `;

    const params = [query || '', req.user.id];
    let paramCount = 2;

    if (query) sqlQuery += ` AND search_vector @@ plainto_tsquery('portuguese', $1)`;
    if (dateFrom) { paramCount++; sqlQuery += ` AND created_at >= $${paramCount}`; params.push(dateFrom); }
    if (dateTo) { paramCount++; sqlQuery += ` AND created_at <= $${paramCount}`; params.push(dateTo); }
    if (fileType) { paramCount++; sqlQuery += ` AND file_type LIKE $${paramCount}`; params.push(`%${fileType}%`); }

    sqlQuery += ` ORDER BY relevance DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(size), (parseInt(page) - 1) * parseInt(size));

    const result = await pool.query(sqlQuery, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM documents WHERE user_id = $1 AND status = \'completed\'', [req.user.id]);

    const results = result.rows.map(doc => ({
      id: doc.id, 
      fileName: doc.file_name, 
      fileType: doc.file_type, 
      fileSize: doc.file_size,
      uploadDate: doc.created_at, 
      score: doc.relevance || 0,
      snippet: doc.ocr_text ? doc.ocr_text.substring(0, 150) + '...' : 'Sem conteúdo',
      url: doc.file_url
    }));

    res.json({
      success: true, 
      total: parseInt(countResult.rows[0].count), 
      page: parseInt(page),
      size: parseInt(size), 
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(size)), 
      results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Erro na pesquisa' });
  }
});

// ROTAS - Gestão
app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT id, file_name, file_type, file_size, file_url, status, created_at, processing_completed_at, ocr_text FROM documents WHERE user_id = $1';
    const params = [req.user.id];

    if (status) { query += ' AND status = $2'; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM documents WHERE user_id = $1', [req.user.id]);

    res.json({
      success: true, 
      total: parseInt(countResult.rows[0].count),
      documents: result.rows.map(doc => ({
        id: doc.id, 
        fileName: doc.file_name, 
        fileType: doc.file_type, 
        fileSize: doc.file_size,
        url: doc.file_url, 
        status: doc.status, 
        uploadDate: doc.created_at,
        processedDate: doc.processing_completed_at, 
        hasOcr: !!doc.ocr_text
      }))
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar documentos' });
  }
});

app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }

    const doc = result.rows[0];
    res.json({
      success: true, 
      document: {
        id: doc.id, 
        fileName: doc.file_name, 
        fileType: doc.file_type, 
        fileSize: doc.file_size,
        url: doc.file_url, 
        status: doc.status, 
        ocrText: doc.ocr_text, 
        ocrConfidence: doc.ocr_confidence,
        uploadDate: doc.created_at, 
        processingStarted: doc.processing_started_at,
        processingCompleted: doc.processing_completed_at, 
        error: doc.error_message
      }
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter documento' });
  }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const docResult = await client.query('SELECT file_path, file_url FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }

    const fileUrl = docResult.rows[0].file_url;

    // ✅ Deletar do Cloudinary
    if (fileUrl && fileUrl.includes('cloudinary')) {
      try {
        const urlParts = fileUrl.split('/');
        const versionIndex = urlParts.findIndex(part => part.startsWith('v'));
        const pathAfterVersion = urlParts.slice(versionIndex + 1);
        const filenameWithExt = pathAfterVersion[pathAfterVersion.length - 1];
        const folder = pathAfterVersion.slice(0, -1).join('/');
        const filename = filenameWithExt.split('.')[0];
        const publicId = folder ? `${folder}/${filename}` : filename;
        
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        console.log('✅ Arquivo deletado do Cloudinary:', publicId);
      } catch (err) {
        console.error('⚠️ Erro ao deletar do Cloudinary:', err.message);
      }
    }

    await client.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Documento deletado' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete error:', error);
    res.status(500).json({ success: false, error: 'Erro ao deletar' });
  } finally {
    client.release();
  }
});

app.get('/api/documents/:id/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT status, processing_started_at, processing_completed_at, error_message, retry_count FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
    
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter status' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'processing') as processing,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'failed') as failed,
              SUM(file_size) as total_size
       FROM documents WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true, 
      stats: {
        total: parseInt(result.rows[0].total), 
        processing: parseInt(result.rows[0].processing),
        completed: parseInt(result.rows[0].completed), 
        failed: parseInt(result.rows[0].failed),
        totalSize: parseInt(result.rows[0].total_size || 0)
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter estatísticas' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    res.json({ success: true, user: req.user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, error: 'Erro ao obter usuário' });
  }
});

app.get('/health', async (req, res) => {
  const health = { uptime: process.uptime(), timestamp: Date.now(), services: {} };
  
  try {
    await pool.query('SELECT 1');
    health.services.postgresql = 'ok';
  } catch (error) {
    health.services.postgresql = 'error';
  }
  
  try {
    await cloudinary.api.ping();
    health.services.cloudinary = 'ok';
  } catch (error) {
    health.services.cloudinary = 'error';
  }
  
  const allOk = Object.values(health.services).every(s => s === 'ok');
  res.status(allOk ? 200 : 503).json(health);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Erro interno do servidor' 
  });
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║     THE DUMP API - CLOUD VERSION      ║
╚═══════════════════════════════════════╝
🚀 http://localhost:${PORT}
☁️  Storage: Cloudinary
🔍 OCR: Tesseract.js
💾 Search: PostgreSQL FTS
📡 Database: ${process.env.DB_HOST}
  `);
});

module.exports = app;