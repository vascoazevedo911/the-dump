import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Search, FileText, File, Eye, Download, Trash2, Grid, List, CheckCircle, AlertCircle, Loader, X, Database, Zap, Image as ImageIcon, LogIn, LogOut, User, TrendingUp, Clock, FileCheck, Sparkles } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export default function TheDump() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [documents, setDocuments] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [stats, setStats] = useState({ total: 0, processing: 0, completed: 0, failed: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const logo = '/logo.png'; // Logo do The Dump

  const getAuthHeaders = useCallback(() => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}` }), []);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) setDocuments(result.documents);
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
    }
  }, [getAuthHeaders]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) setStats(result.stats);
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
      loadDocuments();
      loadStats();
    }
  }, [loadDocuments, loadStats]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.target);
    const data = {
      email: formData.get('email'),
      password: formData.get('password'),
      ...(authMode === 'register' && { name: formData.get('name') })
    };

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setIsAuthenticated(true);
      setUser(result.user);
      loadDocuments();
      loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setDocuments([]);
  };

  const handleFileUpload = async (files) => {
    const filesArray = Array.from(files);
    setUploadQueue(filesArray.map(f => ({ name: f.name, progress: 0, status: 'uploading' })));

    const formData = new FormData();
    filesArray.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(`${API_URL}/api/documents/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        setUploadQueue([]);
        setShowUploadZone(false);
        loadDocuments();
        loadStats();
        result.documents.forEach(doc => pollDocumentStatus(doc.id));
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err.message);
      setUploadQueue([]);
    }
  };

  const pollDocumentStatus = async (docId) => {
    let attempts = 0;
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/documents/${docId}/status`, { headers: getAuthHeaders() });
        const result = await response.json();
        if (result.status === 'completed' || result.status === 'failed' || attempts >= 60) {
          clearInterval(poll);
          loadDocuments();
          loadStats();
        }
        attempts++;
      } catch (err) {
        clearInterval(poll);
      }
    }, 5000);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ query: searchQuery });
      const response = await fetch(`${API_URL}/api/documents/search?${params}`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) setSearchResults(result.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const deleteDocument = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      const response = await fetch(`${API_URL}/api/documents/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        loadDocuments();
        loadStats();
        setSearchResults(prev => prev.filter(d => d.id !== id));
        if (selectedDoc?.id === id) setSelectedDoc(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const viewDocument = async (docId) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) setSelectedDoc(result.document);
    } catch (err) {
      setError(err.message);
    }
  };

  const getFileIcon = (type) => {
    if (!type) return <File className="w-6 h-6" />;
    if (type.includes('image')) return <ImageIcon className="w-6 h-6" />;
    if (type.includes('pdf')) return <FileText className="w-6 h-6" />;
    return <File className="w-6 h-6" />;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'processing': return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Loader className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', position: 'relative', overflow: 'hidden' }}>
        {/* Animated Background */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(162, 155, 254, 0.3), transparent 50%)', animation: 'pulse 4s ease-in-out infinite' }} />
        
        <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '3rem', maxWidth: '28rem', width: '100%', position: 'relative', zIndex: 10 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '8rem', height: '8rem', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={logo} alt="The Dump Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 10px 25px rgba(102, 126, 234, 0.3))' }} />
            </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '900', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>THE DUMP</h1>
            <p style={{ color: '#6b7280', fontWeight: '500', fontSize: '1rem' }}>Smart Document Repository</p>
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', border: '2px solid #fca5a5', color: '#991b1b', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {authMode === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Nome Completo</label>
                <input type="text" name="name" required style={{ width: '100%', padding: '0.875rem 1rem', border: '2px solid #e5e7eb', borderRadius: '0.75rem', fontSize: '1rem', transition: 'all 0.2s' }} onFocus={(e) => e.target.style.borderColor = '#667eea'} onBlur={(e) => e.target.style.borderColor = '#e5e7eb'} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Email</label>
              <input type="email" name="email" required style={{ width: '100%', padding: '0.875rem 1rem', border: '2px solid #e5e7eb', borderRadius: '0.75rem', fontSize: '1rem', transition: 'all 0.2s' }} onFocus={(e) => e.target.style.borderColor = '#667eea'} onBlur={(e) => e.target.style.borderColor = '#e5e7eb'} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Senha</label>
              <input type="password" name="password" required style={{ width: '100%', padding: '0.875rem 1rem', border: '2px solid #e5e7eb', borderRadius: '0.75rem', fontSize: '1rem', transition: 'all 0.2s' }} onFocus={(e) => e.target.style.borderColor = '#667eea'} onBlur={(e) => e.target.style.borderColor = '#e5e7eb'} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '700', padding: '1rem', borderRadius: '0.75rem', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 10px 25px -5px rgba(102, 126, 234, 0.5)', transition: 'transform 0.2s', cursor: 'pointer' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              {loading ? <><Loader className="w-5 h-5 animate-spin" /> Processando...</> : <><LogIn className="w-5 h-5" /> {authMode === 'login' ? 'Entrar' : 'Criar Conta'}</>}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(null); }} style={{ color: '#6b7280', fontWeight: '500', transition: 'color 0.2s' }} onMouseOver={(e) => e.target.style.color = '#667eea'} onMouseOut={(e) => e.target.style.color = '#6b7280'}>
              {authMode === 'login' ? 'Não tem conta? Registre-se' : 'Já tem conta? Faça login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8fafc, #f1f5f9)' }}>
      {/* Header com gradiente */}
      <header style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 10px 25px -5px rgba(102, 126, 234, 0.3)' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '3rem', height: '3rem', background: 'white', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <img src={logo} alt="The Dump" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'white', letterSpacing: '-0.025em' }}>THE DUMP</h1>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>Smart Repository</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                <User className="w-4 h-4 text-white" />
                <span style={{ fontWeight: '600', color: 'white', fontSize: '0.875rem' }}>{user?.name}</span>
              </div>
              <button onClick={() => setShowUploadZone(!showUploadZone)} style={{ padding: '0.625rem 1.25rem', background: 'white', color: '#667eea', fontWeight: '700', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <Upload className="w-4 h-4" /> UPLOAD
              </button>
              <button onClick={handleLogout} style={{ padding: '0.625rem', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                <LogOut className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1rem 1.5rem' }}>
          <div style={{ backgroundColor: '#fee2e2', border: '2px solid #fca5a5', color: '#991b1b', padding: '1rem 1.5rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: '500' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Stats Cards com gradientes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total', value: stats.total, icon: Database, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', iconBg: 'rgba(102, 126, 234, 0.1)' },
            { label: 'Processando', value: stats.processing, icon: Loader, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', iconBg: 'rgba(245, 87, 108, 0.1)' },
            { label: 'Concluídos', value: stats.completed, icon: CheckCircle, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', iconBg: 'rgba(0, 242, 254, 0.1)' },
            { label: 'Falhas', value: stats.failed, icon: AlertCircle, gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', iconBg: 'rgba(250, 112, 154, 0.1)' }
          ].map((stat, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '1.25rem', padding: '1.75rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0,0,0,0.05)', transition: 'all 0.3s', position: 'relative', overflow: 'hidden' }} onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1)'; }} onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'; }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', background: stat.gradient, opacity: 0.05, borderRadius: '50%', transform: 'translate(30%, -30%)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', position: 'relative' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</span>
                <div style={{ width: '3rem', height: '3rem', background: stat.iconBg, borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.gradient.match(/#[0-9a-f]{6}/i)[0] }} />
                </div>
              </div>
              <p style={{ fontSize: '2.5rem', fontWeight: '800', background: stat.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, position: 'relative' }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Upload Zone melhorado */}
        {showUploadZone && (
          <div style={{ background: 'white', borderRadius: '1.25rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', cursor: 'pointer' }}>
              <div style={{ border: '3px dashed #e0e7ff', borderRadius: '1rem', padding: '3rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)', transition: 'all 0.3s' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)'; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)'; }}>
                <div style={{ width: '5rem', height: '5rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 10px 25px -5px rgba(102, 126, 234, 0.4)' }}>
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.5rem' }}>Arraste seus documentos aqui</h3>
                <p style={{ color: '#6b7280', fontSize: '1rem' }}>ou clique para selecionar arquivos</p>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.5rem' }}>PDF, PNG, JPG, TIFF • Máx 50MB</p>
              </div>
              <input type="file" multiple onChange={(e) => handleFileUpload(e.target.files)} style={{ display: 'none' }} accept="image/*,.pdf" />
            </label>
            {uploadQueue.length > 0 && (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {uploadQueue.map((file, i) => (
                  <div key={i} style={{ background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)', borderRadius: '0.75rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(102, 126, 234, 0.2)' }}>
                    <Loader className="w-5 h-5 text-blue-500 animate-spin" />
                    <span style={{ fontWeight: '600', color: '#1f2937', flex: 1 }}>{file.name}</span>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Enviando...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search com visual melhorado */}
        <div style={{ background: 'white', borderRadius: '1.25rem', padding: '1.75rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', width: '1.25rem', height: '1.25rem' }} />
              <input type="text" placeholder="Pesquisar documentos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} style={{ width: '100%', paddingLeft: '3rem', paddingRight: '1rem', paddingTop: '0.875rem', paddingBottom: '0.875rem', background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: '0.75rem', fontSize: '1rem', transition: 'all 0.2s' }} onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.background = 'white'; }} onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }} />
            </div>
            <button onClick={handleSearch} disabled={isSearching} style={{ padding: '0.875rem 1.75rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '700', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.4)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              {isSearching ? <Loader className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {!isSearching && 'Pesquisar'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Sparkles className="w-4 h-4 text-purple-500" />
                <h3 style={{ fontWeight: '700', color: '#1f2937', fontSize: '1rem' }}>Resultados da Pesquisa ({searchResults.length})</h3>
              </div>
              {searchResults.map((doc) => (
                <div key={doc.id} style={{ background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%)', borderRadius: '0.75rem', padding: '1.25rem', display: 'flex', alignItems: 'start', justifyContent: 'space-between', border: '1px solid rgba(102, 126, 234, 0.1)', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: '1rem', flex: 1 }}>
                    <div style={{ width: '3.5rem', height: '3.5rem', background: 'linear-gradient(135deg, #dbeafe 0%, #e9d5ff 100%)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getFileIcon(doc.fileType)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.375rem', fontSize: '1rem' }}>{doc.fileName}</h4>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', lineHeight: 1.5 }}>{doc.snippet}</p>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                        <span>{formatSize(doc.fileSize)}</span>
                        <span>•</span>
                        <span>{formatDate(doc.uploadDate)}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => viewDocument(doc.id)} style={{ padding: '0.625rem 1.25rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '600', borderRadius: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <Eye className="w-4 h-4" /> Ver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents grid melhorado */}
        <div style={{ background: 'white', borderRadius: '1.25rem', padding: '1.75rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileCheck className="w-5 h-5 text-purple-500" />
              <h2 style={{ fontSize: '1.375rem', fontWeight: '800', color: '#1f2937' }}>Meus Documentos</h2>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setViewMode('grid')} style={{ padding: '0.5rem', borderRadius: '0.5rem', background: viewMode === 'grid' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6', transition: 'all 0.2s' }}>
                <Grid className="w-5 h-5" style={{ color: viewMode === 'grid' ? 'white' : '#6b7280' }} />
              </button>
              <button onClick={() => setViewMode('list')} style={{ padding: '0.5rem', borderRadius: '0.5rem', background: viewMode === 'list' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6', transition: 'all 0.2s' }}>
                <List className="w-5 h-5" style={{ color: viewMode === 'list' ? 'white' : '#6b7280' }} />
              </button>
            </div>
          </div>

          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
              <div style={{ width: '6rem', height: '6rem', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <Database className="w-10 h-10 text-gray-300" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.5rem' }}>Nenhum documento ainda</h3>
              <p style={{ color: '#9ca3af' }}>Faça upload de seus primeiros documentos</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr', gap: '1.25rem' }}>
              {documents.map((doc) => (
                <div key={doc.id} style={{ background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.02) 0%, rgba(118, 75, 162, 0.02) 100%)', borderRadius: '1rem', padding: '1.25rem', border: '1px solid rgba(0,0,0,0.05)', transition: 'all 0.3s' }} onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(102, 126, 234, 0.2)'; e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)'; }} onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.05)'; }}>
                  {viewMode === 'grid' ? (
                    <>
                      <div style={{ width: '100%', height: '10rem', background: 'linear-gradient(135deg, #dbeafe 0%, #e9d5ff 100%)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent 70%)', pointerEvents: 'none' }} />
                        {getFileIcon(doc.fileType)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <h3 style={{ fontWeight: '700', color: '#1f2937', fontSize: '0.95rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fileName}</h3>
                        {getStatusIcon(doc.status)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Database className="w-3.5 h-3.5" />
                          <span>{formatSize(doc.fileSize)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDate(doc.uploadDate)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => viewDocument(doc.id)} style={{ flex: 1, padding: '0.625rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '600', borderRadius: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
                          <Eye className="w-4 h-4" /> Ver
                        </button>
                        <button onClick={() => deleteDocument(doc.id)} style={{ padding: '0.625rem', background: '#fef2f2', color: '#dc2626', borderRadius: '0.5rem' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '4rem', height: '4rem', background: 'linear-gradient(135deg, #dbeafe 0%, #e9d5ff 100%)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {getFileIcon(doc.fileType)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <h3 style={{ fontWeight: '700', color: '#1f2937', fontSize: '1rem' }}>{doc.fileName}</h3>
                          {getStatusIcon(doc.status)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', gap: '1rem' }}>
                          <span>{formatSize(doc.fileSize)}</span>
                          <span>•</span>
                          <span>{formatDate(doc.uploadDate)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => viewDocument(doc.id)} style={{ padding: '0.625rem 1.25rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '600', borderRadius: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Eye className="w-4 h-4" /> Ver
                        </button>
                        <button onClick={() => deleteDocument(doc.id)} style={{ padding: '0.625rem', background: '#fef2f2', color: '#dc2626', borderRadius: '0.5rem' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal melhorado */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', maxWidth: '56rem', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ position: 'sticky', top: 0, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{selectedDoc.fileName}</h2>
              <button onClick={() => setSelectedDoc(null)} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.3)' }}>
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            <div style={{ padding: '2rem' }}>
              {selectedDoc.ocrText && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)', border: '2px solid #6ee7b7', borderRadius: '1rem', padding: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontWeight: '700', color: '#065f46', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem' }}>
                    <Zap className="w-5 h-5 text-emerald-600" /> Texto Extraído por OCR
                  </h3>
                  <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', maxHeight: '20rem', overflow: 'auto' }}>
                    <p style={{ color: '#374151', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedDoc.ocrText}</p>
                  </div>
                  {selectedDoc.ocrConfidence && (
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#059669' }}>
                      <TrendingUp className="w-4 h-4" />
                      <span>Confiança: {selectedDoc.ocrConfidence.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)', borderRadius: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Tamanho</div>
                  <div style={{ fontWeight: '700', color: '#1f2937' }}>{formatSize(selectedDoc.fileSize)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Tipo</div>
                  <div style={{ fontWeight: '700', color: '#1f2937' }}>{selectedDoc.fileType}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Upload</div>
                  <div style={{ fontWeight: '700', color: '#1f2937' }}>{formatDate(selectedDoc.uploadDate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Status</div>
                  <div style={{ fontWeight: '700', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getStatusIcon(selectedDoc.status)}
                    <span>{selectedDoc.status}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <a href={selectedDoc.url} download style={{ flex: 1, padding: '1rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '700', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textDecoration: 'none', boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.4)' }}>
                  <Download className="w-5 h-5" /> Baixar Documento
                </a>
                <button onClick={() => { deleteDocument(selectedDoc.id); setSelectedDoc(null); }} style={{ padding: '1rem 1.5rem', background: '#fef2f2', color: '#dc2626', fontWeight: '700', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '2px solid #fecaca' }}>
                  <Trash2 className="w-5 h-5" /> Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}