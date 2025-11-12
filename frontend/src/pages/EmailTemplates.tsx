import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface EmailTemplate {
  id: string;
  name: string;
  template_type: string;
  subject: string;
  html_body: string;
  text_body?: string;
  is_default: boolean;
  variables?: Record<string, string>;
  created_at: string;
}

const TEMPLATE_TYPES = [
  { value: 'form_submission_admin', label: 'Form Submission (Admin Notification)' },
  { value: 'form_submission_user', label: 'Form Submission (User Confirmation)' },
  { value: 'password_reset', label: 'Password Reset' },
];

function EmailTemplates() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [availableVariables, setAvailableVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/');
      return;
    }
    loadTemplates();
  }, [role, navigate]);

  useEffect(() => {
    if (selectedType) {
      loadVariables(selectedType);
    }
  }, [selectedType]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await formsAPI.getEmailTemplates(selectedType || undefined);
      setTemplates(response.data);
    } catch (error: any) {
      console.error('Failed to load templates:', error);
      alert(error?.response?.data?.detail || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async (templateType: string) => {
    try {
      const response = await formsAPI.getTemplateVariables(templateType);
      setAvailableVariables(response.data.variables || {});
    } catch (error: any) {
      console.error('Failed to load variables:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await formsAPI.deleteEmailTemplate(templateId);
      loadTemplates();
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      alert(error?.response?.data?.detail || 'Failed to delete template');
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      await formsAPI.updateEmailTemplate(templateId, { is_default: true });
      loadTemplates();
    } catch (error: any) {
      console.error('Failed to set default template:', error);
      alert(error?.response?.data?.detail || 'Failed to set default template');
    }
  };

  const filteredTemplates = selectedType
    ? templates.filter(t => t.template_type === selectedType)
    : templates;

  return (
    <div className="container">
      <div className="flex-between mb-4">
        <h1>Email Templates</h1>
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowCreateModal(true);
          }}
          className="btn-primary"
        >
          + Create Template
        </button>
      </div>

      {/* Filter by Type */}
      <div className="card mb-4">
        <label htmlFor="template-filter-type" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Filter by Type
        </label>
        <select
          id="template-filter-type"
          name="template-filter-type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ width: '100%', maxWidth: '400px' }}
        >
          <option value="">All Types</option>
          {TEMPLATE_TYPES.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>

      {/* Templates List */}
      {loading ? (
        <p className="text-muted">Loading templates...</p>
      ) : filteredTemplates.length === 0 ? (
        <div className="card">
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
            No templates found. Create your first email template to customize notification emails.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredTemplates.map((template) => (
            <div key={template.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{template.name}</h3>
                    {template.is_default && (
                      <span className="badge badge-sent">Default</span>
                    )}
                    <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
                      {TEMPLATE_TYPES.find(t => t.value === template.template_type)?.label || template.template_type}
                    </span>
                  </div>
                  <p style={{ margin: '0.5rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Subject: {template.subject}
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Created: {new Date(template.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!template.is_default && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="btn-outline"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingTemplate(template);
                      setShowCreateModal(true);
                    }}
                    className="btn-primary"
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="btn-danger"
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <TemplateModal
          template={editingTemplate}
          availableVariables={availableVariables}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

interface TemplateModalProps {
  template: EmailTemplate | null;
  availableVariables: Record<string, string>;
  onClose: () => void;
  onSave: () => void;
}

function TemplateModal({ template, availableVariables, onSave, onClose }: TemplateModalProps) {
  const [name, setName] = useState(template?.name || '');
  const [templateType, setTemplateType] = useState(template?.template_type || 'form_submission_admin');
  const [subject, setSubject] = useState(template?.subject || '');
  const [htmlBody, setHtmlBody] = useState(template?.html_body || '');
  const [textBody, setTextBody] = useState(template?.text_body || '');
  const [isDefault, setIsDefault] = useState(template?.is_default || false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (templateType) {
      formsAPI.getTemplateVariables(templateType).then(() => {
        // Variables are already loaded in parent
      }).catch(console.error);
    }
  }, [templateType]);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !htmlBody.trim()) {
      alert('Name, subject, and HTML body are required');
      return;
    }

    setSaving(true);
    try {
      if (template) {
        await formsAPI.updateEmailTemplate(template.id, {
          name,
          subject,
          html_body: htmlBody,
          text_body: textBody || undefined,
          is_default: isDefault,
        });
      } else {
        await formsAPI.createEmailTemplate({
          name,
          template_type: templateType,
          subject,
          html_body: htmlBody,
          text_body: textBody || undefined,
          is_default: isDefault,
        });
      }
      onSave();
    } catch (error: any) {
      console.error('Failed to save template:', error);
      alert(error?.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem',
    }}>
      <div className="card" style={{ maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="flex-between mb-3">
          <h2 style={{ margin: 0 }}>{template ? 'Edit Template' : 'Create Template'}</h2>
          <button onClick={onClose} className="btn-outline" style={{ padding: '0.5rem' }}>×</button>
        </div>

        <div className="form-group">
          <label htmlFor="template-name">Template Name *</label>
          <input
            type="text"
            id="template-name"
            name="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Custom Form Submission Notification"
          />
        </div>

        {!template && (
          <div className="form-group">
            <label htmlFor="template-type">Template Type *</label>
            <select
              id="template-type"
              name="template-type"
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
            >
              {TEMPLATE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="template-subject">Email Subject *</label>
          <input
            type="text"
            id="template-subject"
            name="template-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., New Submission: {{form_name}}"
          />
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Use {'{{'}variable_name{'}}'} for dynamic content
          </p>
        </div>

        {Object.keys(availableVariables).length > 0 && (
          <div className="form-group">
            <label>Available Variables</label>
            <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem' }}>
              {Object.entries(availableVariables).map(([varName, description]) => (
                <div key={varName} style={{ marginBottom: '0.5rem' }}>
                  <code style={{ color: '#667eea', fontWeight: '500' }}>{'{{' + varName + '}}'}</code>
                  <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="template-html-body">HTML Body *</label>
          <textarea
            id="template-html-body"
            name="template-html-body"
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            rows={12}
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            placeholder="<html>...</html>"
          />
        </div>

        <div className="form-group">
          <label htmlFor="template-text-body">Text Body (optional)</label>
          <textarea
            id="template-text-body"
            name="template-text-body"
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            rows={6}
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            placeholder="Plain text version (auto-generated if not provided)"
          />
        </div>

        <div className="form-group">
          <label htmlFor="template-is-default" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="template-is-default"
              name="template-is-default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default template for this type
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button onClick={onClose} className="btn-outline" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmailTemplates;

