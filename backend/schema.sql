-- THE DUMP - Database Schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255), -- nullable to support OAuth-only users
    name VARCHAR(255) NOT NULL,
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    oauth_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    storage_used BIGINT DEFAULT 0,
    storage_limit BIGINT DEFAULT 10737418240
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth_id ON users(oauth_id);

-- DOCUMENTS
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT,
    ocr_text TEXT,
    ocr_confidence DECIMAL(5,2),
    search_vector tsvector,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    folder VARCHAR(255),
    tags TEXT[],
    is_favorite BOOLEAN DEFAULT false
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_documents_folder ON documents(folder);
CREATE INDEX idx_documents_search_vector ON documents USING GIN(search_vector);

-- SHARES
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_email VARCHAR(255),
    share_token VARCHAR(100) UNIQUE NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP,
    access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_shares_document_id ON shares(document_id);
CREATE INDEX idx_shares_share_token ON shares(share_token);

-- ACTIVITY_LOGS
CREATE TABLE activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- FOLDERS
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    color VARCHAR(7),
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name, parent_folder_id)
);

CREATE INDEX idx_folders_user_id ON folders(user_id);

-- TAGS
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);

-- DOCUMENT_TAGS
CREATE TABLE document_tags (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX idx_document_tags_tag_id ON document_tags(tag_id);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_folders_updated_at 
    BEFORE UPDATE ON folders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_user_storage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET storage_used = storage_used + NEW.file_size WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET storage_used = storage_used - OLD.file_size WHERE id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_storage_on_insert AFTER INSERT ON documents FOR EACH ROW EXECUTE FUNCTION update_user_storage();
CREATE TRIGGER update_user_storage_on_delete AFTER DELETE ON documents FOR EACH ROW EXECUTE FUNCTION update_user_storage();

-- VIEW
CREATE VIEW user_stats AS
SELECT 
    u.id as user_id, u.email, u.name,
    COUNT(d.id) as total_documents,
    COUNT(CASE WHEN d.status = 'completed' THEN 1 END) as completed_documents,
    COUNT(CASE WHEN d.status = 'processing' THEN 1 END) as processing_documents,
    COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_documents,
    SUM(d.file_size) as total_size,
    u.storage_used, u.storage_limit,
    ROUND((u.storage_used::DECIMAL / u.storage_limit) * 100, 2) as storage_usage_percent
FROM users u
LEFT JOIN documents d ON u.id = d.user_id
GROUP BY u.id, u.email, u.name, u.storage_used, u.storage_limit;

-- FUNÇÃO BUSCA
CREATE OR REPLACE FUNCTION search_documents(
    p_user_id UUID,
    p_query TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID, file_name VARCHAR, file_type VARCHAR, file_size BIGINT,
    file_url TEXT, created_at TIMESTAMP, snippet TEXT, relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id, d.file_name, d.file_type, d.file_size, d.file_url, d.created_at,
        ts_headline('portuguese', COALESCE(d.ocr_text, ''), plainto_tsquery('portuguese', p_query)) as snippet,
        ts_rank(d.search_vector, plainto_tsquery('portuguese', p_query)) as relevance
    FROM documents d
    WHERE d.user_id = p_user_id AND d.status = 'completed'
      AND d.search_vector @@ plainto_tsquery('portuguese', p_query)
    ORDER BY relevance DESC, d.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- USUÁRIO TESTE (senha: test123)
INSERT INTO users (email, password, name) 
VALUES ('test@thedump.com', '$2a$10$XQw5hZ5rCOmPW.9VX3LLKO8yYCLNxLqPLW.z6yJN8oLbxXOYQE3jO', 'Test User')
ON CONFLICT (email) DO NOTHING;
