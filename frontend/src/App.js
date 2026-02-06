import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Search, FileText, File, Eye, Download, Trash2, Grid, List, CheckCircle, AlertCircle, Loader, X, Database, Zap, Image as ImageIcon, LogOut, User, TrendingUp, Clock, FileCheck, Sparkles } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export default function TheDump() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  
  const [documents, setDocuments] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [stats, setStats] = useState({ total: 0, processing: 0, completed: 0, failed: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return { 
      'Authorization': `Bearer ${token}`
    };
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`, { 
        headers: getAuthHeaders() 
      });
      const result = await response.json();
      
      if (result.success) {
        setDocuments(result.documents);
      } else {
        console.error('Failed to load documents:', result.error);
      }
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
    }
  }, [getAuthHeaders]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`, { 
        headers: getAuthHeaders() 
      });
      const result = await response.json();
      
      if (result.success) {
        setStats(result.stats);
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token) {
      if (savedUser) {
        setIsAuthenticated(true);
        setUser(JSON.parse(savedUser));
        loadDocuments();
        loadStats();
      } else {
        (async () => {
          try {
            const resp = await fetch(`${API_URL}/api/auth/me`, { 
              headers: { 'Authorization': `Bearer ${token}` } 
            });
            const json = await resp.json();
            
            if (json && json.success && json.user) {
              localStorage.setItem('user', JSON.stringify(json.user));
              setUser(json.user);
              setIsAuthenticated(true);
              loadDocuments();
              loadStats();
              return;
            }
          } catch (err) {
            console.error('Failed to fetch user:', err);
          }

          // Fallback: decode JWT payload
          try {
            const parts = token.split('.');
            if (parts.length >= 2) {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              const minimalUser = { 
                id: payload.userId || payload.sub || null, 
                email: payload.email || null, 
                name: payload.name || payload.email || 'Google User' 
              };
              localStorage.setItem('user', JSON.stringify(minimalUser));
              setUser(minimalUser);
              setIsAuthenticated(true);
              loadDocuments();
              loadStats();
            }
          } catch (e) {
            console.error('Failed to decode token:', e);
          }
        })();
      }
    }
  }, [loadDocuments, loadStats]);

  useEffect(() => {
    let currentObjectUrl = null;
    let cancelled = false;
    
    if (selectedDoc?.fileType && selectedDoc.fileType.includes('pdf') && selectedDoc.url) {
      (async () => {
        try {
          const res = await fetch(selectedDoc.url, { headers: getAuthHeaders() });
          const blob = await res.blob();
          if (cancelled) return;
          currentObjectUrl = URL.createObjectURL(blob);
          setPreviewUrl(currentObjectUrl);
        } catch (err) {
          console.error('Erro ao carregar preview do PDF:', err);
          setPreviewUrl(null);
        }
      })();
    } else {
      setPreviewUrl(null);
    }

    return () => {
      cancelled = true;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
      setPreviewUrl(null);
    };
  }, [selectedDoc, getAuthHeaders]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setDocuments([]);
  };

  const handleFileUpload = async (files) => {
    const filesArray = Array.from(files);
    
    // Validate file types
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff'];
    const invalidFiles = filesArray.filter(f => !allowedTypes.includes(f.type));
    
    if (invalidFiles.length > 0) {
      setError(`Arquivos não suportados: ${invalidFiles.map(f => f.name).join(', ')}`);
      setTimeout(() => setError(null), 5000);
      return;
    }
    
    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    const oversizedFiles = filesArray.filter(f => f.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      setError(`Arquivos muito grandes (máx 50MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      setTimeout(() => setError(null), 5000);
      return;
    }

    setUploadQueue(filesArray.map(f => ({ 
      name: f.name, 
      progress: 0, 
      status: 'uploading' 
    })));

    const formData = new FormData();
    filesArray.forEach(file => formData.append('files', file));

    try {
      console.log('Starting upload to:', `${API_URL}/api/documents/upload`);
      console.log('Files:', filesArray.map(f => ({ name: f.name, type: f.type, size: f.size })));
      
      const response = await fetch(`${API_URL}/api/documents/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      console.log('Upload response status:', response.status);
      const result = await response.json();
      console.log('Upload response:', result);

      if (result.success) {
        setUploadQueue(filesArray.map(f => ({ 
          name: f.name, 
          progress: 100, 
          status: 'completed' 
        })));
        
        setTimeout(() => {
          setUploadQueue([]);
          setShowUploadZone(false);
        }, 2000);
        
        loadDocuments();
        loadStats();
        setError(null);
      } else {
        throw new Error(result.error || 'Upload falhou');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadQueue(filesArray.map(f => ({ 
        name: f.name, 
        progress: 0, 
        status: 'failed' 
      })));
      
      setError(err.message || 'Erro no upload. Verifique sua conexão e tente novamente.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/documents/search?query=${encodeURIComponent(searchQuery)}`,
        { headers: getAuthHeaders() }
      );
      const result = await response.json();
      
      if (result.success) {
        setSearchResults(result.results);
      }
    } catch (err) {
      console.error('Erro na busca:', err);
      setError('Erro ao buscar documentos');
      setTimeout(() => setError(null), 3000);
    }
  };

  const viewDocument = async (docId) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setSelectedDoc(result.document);
      }
    } catch (err) {
      console.error('Erro ao visualizar:', err);
      setError('Erro ao carregar documento');
      setTimeout(() => setError(null), 3000);
    }
  };

  const deleteDocument = async (docId) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;

    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        loadDocuments();
        loadStats();
        if (selectedDoc?.id === docId) {
          setSelectedDoc(null);
        }
      }
    } catch (err) {
      console.error('Erro ao deletar:', err);
      setError('Erro ao deletar documento');
      setTimeout(() => setError(null), 3000);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return <File className="w-8 h-8 text-purple-600" />;
    
    if (fileType.includes('pdf')) {
      return <FileText className="w-8 h-8 text-red-600" />;
    }
    if (fileType.includes('image')) {
      return <ImageIcon className="w-8 h-8 text-blue-600" />;
    }
    return <File className="w-8 h-8 text-purple-600" />;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '1.5rem', padding: '3rem', maxWidth: '28rem', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', textAlign: 'center' }}>
          <div style={{ marginBottom: '2rem' }}>
            <Database className="w-20 h-20 mx-auto text-purple-600 mb-4" />
            <h1 style={{ fontSize: '2rem', fontWeight: '800', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>
              THE DUMP
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>Sistema Inteligente de Busca de Documentos</p>
          </div>
          
          <button
            onClick={() => window.location.href = `${API_URL}/auth/google`}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#1f2937',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(102, 126, 234, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar com Google
          </button>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)', borderRadius: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>Upload Inteligente</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>PDFs e imagens com OCR automático</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Search className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>Busca Avançada</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Encontre qualquer documento rapidamente</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayedDocs = isSearching && searchResults.length > 0 ? searchResults : documents;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f9fafb, #f3f4f6)' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Database className="w-10 h-10 text-white" />
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white' }}>THE DUMP</h1>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}>Sistema de Busca Inteligente</p>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.2)', borderRadius: '0.75rem', backdropFilter: 'blur(10px)' }}>
                  <User className="w-5 h-5 text-white" />
                  <span style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>{user.name || user.email}</span>
                </div>
              )}
              <button 
                onClick={handleLogout}
                style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: '600', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                <LogOut className="w-4 h-4" /> Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ maxWidth: '80rem', margin: '1rem auto', padding: '0 1.5rem' }}>
          <div style={{ background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '0.75rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p style={{ color: '#dc2626', fontWeight: '600' }}>{error}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ maxWidth: '80rem', margin: '2rem auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>Total</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: '#1f2937' }}>{stats.total}</p>
              </div>
              <FileCheck className="w-12 h-12 text-purple-600 opacity-20" />
            </div>
          </div>
          
          <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>Processando</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: '#3b82f6' }}>{stats.processing}</p>
              </div>
              <Loader className="w-12 h-12 text-blue-600 opacity-20 animate-spin" />
            </div>
          </div>
          
          <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>Completos</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981' }}>{stats.completed}</p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-600 opacity-20" />
            </div>
          </div>
          
          <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>Armazenamento</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: '#8b5cf6' }}>{formatSize(stats.totalSize)}</p>
              </div>
              <Database className="w-12 h-12 text-purple-600 opacity-20" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.5rem 3rem' }}>
        <div style={{ background: 'white', borderRadius: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '2rem', border: '1px solid #e5e7eb' }}>
          {/* Upload & Search */}
          <div style={{ display: 'grid', gridTemplateColumns: showUploadZone ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {!showUploadZone && (
              <>
                <button
                  onClick={() => setShowUploadZone(true)}
                  style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '700', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1rem', boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.5)' }}
                >
                  <Upload className="w-5 h-5" /> Upload de Documentos
                </button>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Buscar em todos os documentos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    style={{ flex: 1, padding: '1rem 1.25rem', border: '2px solid #e5e7eb', borderRadius: '1rem', fontSize: '0.95rem' }}
                  />
                  <button
                    onClick={handleSearch}
                    style={{ padding: '1rem 1.5rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: '700', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Search className="w-5 h-5" /> Buscar
                  </button>
                </div>
              </>
            )}
            
            {showUploadZone && (
              <div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileUpload(e.dataTransfer.files);
                  }}
                  style={{ border: '3px dashed #d1d5db', borderRadius: '1rem', padding: '3rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)', position: 'relative' }}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.tiff"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
                    <Upload className="w-16 h-16 mx-auto text-purple-600 mb-4" />
                    <p style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.5rem' }}>
                      Arraste arquivos ou clique para selecionar
                    </p>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      Suporta PDF, PNG, JPG, TIFF (máx. 50MB por arquivo)
                    </p>
                  </label>
                </div>
                
                {uploadQueue.length > 0 && (
                  <div style={{ marginTop: '1.5rem', space: '0.75rem' }}>
                    {uploadQueue.map((item, idx) => (
                      <div key={idx} style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>{item.name}</span>
                          {getStatusIcon(item.status)}
                        </div>
                        <div style={{ width: '100%', height: '0.5rem', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${item.progress}%`, height: '100%', background: 'linear-gradient(to right, #667eea, #764ba2)', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={() => setShowUploadZone(false)}
                  style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', background: '#f3f4f6', color: '#6b7280', fontWeight: '600', borderRadius: '0.75rem' }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #f3f4f6' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1f2937' }}>
              {isSearching && searchResults.length > 0 ? `Resultados da Busca (${searchResults.length})` : `Meus Documentos (${documents.length})`}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setViewMode('grid')}
                style={{ padding: '0.5rem', background: viewMode === 'grid' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6', color: viewMode === 'grid' ? 'white' : '#6b7280', borderRadius: '0.5rem' }}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{ padding: '0.5rem', background: viewMode === 'list' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6', color: viewMode === 'list' ? 'white' : '#6b7280', borderRadius: '0.5rem' }}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Documents Grid/List */}
          {displayedDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <Database className="w-20 h-20 mx-auto text-gray-300 mb-4" />
              <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#9ca3af', marginBottom: '0.5rem' }}>
                {isSearching ? 'Nenhum resultado encontrado' : 'Nenhum documento ainda'}
              </p>
              <p style={{ color: '#d1d5db', fontSize: '0.875rem' }}>
                {isSearching ? 'Tente outra busca' : 'Faça upload do seu primeiro documento'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr', gap: '1rem' }}>
              {displayedDocs.map(doc => (
                <div key={doc.id} style={{ background: viewMode === 'grid' ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)' : 'white', border: '2px solid #f3f4f6', borderRadius: '1rem', padding: '1.5rem', transition: 'all 0.2s', cursor: 'pointer' }}>
                  {viewMode === 'grid' ? (
                    <>
                      <div style={{ width: '4rem', height: '4rem', background: 'linear-gradient(135deg, #dbeafe 0%, #e9d5ff 100%)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
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

      {/* Modal */}
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
              {selectedDoc.ocrText ? (
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)', border: '2px solid #6ee7b7', borderRadius: '1rem', padding: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ fontWeight: '700', color: '#065f46', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.125rem' }}>
                    <Zap className="w-5 h-5 text-emerald-600" /> Texto Extraído por OCR
                  </h3>
                  <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', maxHeight: '60vh', overflow: 'auto' }}>
                    <p style={{ color: '#374151', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedDoc.ocrText}</p>
                  </div>
                  {(selectedDoc.ocrConfidence !== undefined && selectedDoc.ocrConfidence !== null && !Number.isNaN(Number(selectedDoc.ocrConfidence))) && (
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#059669' }}>
                      <TrendingUp className="w-4 h-4" />
                      <span>Confiança: {Number(selectedDoc.ocrConfidence).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: '2rem' }}>
                  {selectedDoc?.url ? (
                    selectedDoc.fileType && selectedDoc.fileType.includes('image') ? (
                      <img src={selectedDoc.url} alt={selectedDoc.fileName} style={{ width: '100%', borderRadius: '0.75rem', maxHeight: '60vh', objectFit: 'contain' }} />
                    ) : selectedDoc.fileType && selectedDoc.fileType.includes('pdf') ? (
                      <iframe src={previewUrl || selectedDoc.url} title={selectedDoc.fileName} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '0.5rem' }} />
                    ) : (
                      <object data={selectedDoc.url} type={selectedDoc.fileType} width="100%" height="70vh">
                        <div style={{ padding: '1rem', background: '#f3f4f6', borderRadius: '0.75rem' }}>
                          <p>Pré-visualização não disponível para este tipo de arquivo.</p>
                          <a href={selectedDoc.url} download style={{ color: '#667eea', fontWeight: '600' }}>Baixar {selectedDoc.fileName}</a>
                        </div>
                      </object>
                    )
                  ) : (
                    <div style={{ padding: '1rem', background: '#f3f4f6', borderRadius: '0.75rem' }}>Pré-visualização não disponível.</div>
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