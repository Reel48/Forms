import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { foldersAPI, clientsAPI } from '../api';
import type { Quote, Form, Folder, Client, FolderSummary } from '../api';
import CustomerChatWidget from '../components/CustomerChatWidget';
import './CustomerDashboard.css';

interface TimelineItem {
  id: string;
  type: 'folder' | 'quote' | 'form';
  title: string;
  description?: string;
  status: string;
  priority?: string;
  created_at: string;
  data: Folder | Quote | Form;
}

function CustomerDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<Client | null>(null);
  const [folderSummaries, setFolderSummaries] = useState<Record<string, FolderSummary>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    completed: false,
    archived: false,
    cancelled: false,
  });
  const searchTerm = searchParams.get('search') || '';

  useEffect(() => {
    if (role === 'customer') {
      loadData();
      loadCustomerProfile();
    }
  }, [role]);

  // Refresh data when page becomes visible (user switches back to tab/window)
  useEffect(() => {
    if (role === 'customer') {
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          // Page became visible, refresh data
          loadData();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [role]);

  const loadCustomerProfile = async () => {
    try {
      const response = await clientsAPI.getMyProfile();
      if (response.data) {
        setCustomerProfile(response.data);
      }
    } catch (error) {
      console.error('Failed to load customer profile:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      // Load folders (main organizing structure)
      const foldersResponse = await foldersAPI.getAll();
      const foldersData = foldersResponse.data || [];
      setFolders(foldersData);
      
      // Load folder summaries in parallel
      if (foldersData.length > 0) {
        loadFolderSummaries(foldersData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFolderSummaries = async (folders: Folder[]) => {
    try {
      const results = await Promise.allSettled(
        folders.map(async (folder) => {
          try {
            const response = await foldersAPI.getContent(folder.id);
            return { id: folder.id, summary: response.data.summary };
          } catch (error) {
            console.error(`Failed to load summary for folder ${folder.id}:`, error);
            return { id: folder.id, summary: undefined };
          }
        })
      );

      const summaries: Record<string, FolderSummary> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.summary) {
          summaries[result.value.id] = result.value.summary;
        }
      });
      setFolderSummaries(summaries);
    } catch (error) {
      console.error('Failed to load folder summaries:', error);
    }
  };

  // Convert folders to timeline items and group by status
  const foldersByStatus = useMemo(() => {
    const items: TimelineItem[] = folders.map(folder => ({
      id: folder.id,
      type: 'folder' as const,
      title: folder.name,
      description: folder.description || `Order folder${folder.quote_id ? ' with quote' : ''}`,
      status: folder.status,
      priority: 'normal',
      created_at: folder.created_at,
      data: folder,
    }));

    // Sort items by date (newest first)
    const sortedItems = items.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Group by status
    const grouped: Record<string, TimelineItem[]> = {
      active: [],
      completed: [],
      archived: [],
      cancelled: [],
    };

    sortedItems.forEach(item => {
      const status = item.status.toLowerCase();
      if (grouped[status]) {
        grouped[status].push(item);
      } else {
        grouped.active.push(item); // Default to active if status unknown
      }
    });

    return grouped;
  }, [folders]);

  // Filter folders by search term
  const filteredFoldersByStatus = useMemo(() => {
    if (!searchTerm.trim()) {
      return foldersByStatus;
    }

    const searchLower = searchTerm.toLowerCase();
    const filterItems = (items: TimelineItem[]) => {
      return items.filter(item => 
      item.title.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      (item.type === 'quote' && (item.data as Quote).quote_number?.toLowerCase().includes(searchLower))
    );
    };

    return {
      active: filterItems(foldersByStatus.active),
      completed: filterItems(foldersByStatus.completed),
      archived: filterItems(foldersByStatus.archived),
      cancelled: filterItems(foldersByStatus.cancelled),
    };
  }, [foldersByStatus, searchTerm]);


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Compute quick stats
  const quickStats = useMemo(() => {
    const activeCount = filteredFoldersByStatus.active.length;
    const completedCount = filteredFoldersByStatus.completed.length;
    
    // Count pending actions (folders with next_step_owner === 'customer')
    let pendingActions = 0;
    filteredFoldersByStatus.active.forEach((folder) => {
      const summary = folderSummaries[folder.id];
      if (summary?.next_step_owner === 'customer' || summary?.computed_next_step_owner === 'customer') {
        pendingActions++;
      }
    });

    return {
      active: activeCount,
      completed: completedCount,
      pendingActions,
    };
  }, [filteredFoldersByStatus, folderSummaries]);

  // Get folders that need customer action
  const actionableFolders = useMemo(() => {
    return filteredFoldersByStatus.active.filter((folder) => {
      const summary = folderSummaries[folder.id];
      return summary?.next_step_owner === 'customer' || summary?.computed_next_step_owner === 'customer';
    });
  }, [filteredFoldersByStatus.active, folderSummaries]);

  const getStatusBadge = (status: string, type: 'quote' | 'form' | 'folder') => {
    const statusLower = status.toLowerCase();
    let badgeClass = 'status-badge-customer status-badge-active';
    let label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');

    if (type === 'folder') {
      switch (statusLower) {
        case 'active':
          badgeClass = 'status-badge-customer status-badge-active';
          break;
        case 'completed':
          badgeClass = 'status-badge-customer status-badge-completed';
          break;
        case 'archived':
          badgeClass = 'status-badge-customer status-badge-archived';
          break;
        case 'cancelled':
          badgeClass = 'status-badge-customer status-badge-cancelled';
          break;
        default:
          badgeClass = 'status-badge-customer status-badge-active';
      }
    } else if (type === 'quote') {
      switch (statusLower) {
        case 'accepted':
          badgeClass = 'status-badge-customer status-badge-completed';
          break;
        case 'declined':
          badgeClass = 'status-badge-customer status-badge-cancelled';
          break;
        case 'sent':
        case 'viewed':
          badgeClass = 'status-badge-customer status-badge-active';
          break;
        default:
          badgeClass = 'status-badge-customer status-badge-active';
      }
    } else {
      switch (statusLower) {
        case 'published':
          badgeClass = 'status-badge-customer status-badge-active';
          break;
        case 'archived':
          badgeClass = 'status-badge-customer status-badge-archived';
          break;
        default:
          badgeClass = 'status-badge-customer status-badge-active';
      }
    }

    return <span className={badgeClass}>{label}</span>;
  };

  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'folder') {
      navigate(`/folders/${item.id}`);
    } else if (item.type === 'quote') {
      navigate(`/quotes/${item.id}`);
    } else {
      navigate(`/forms/${item.id}`);
    }
  };


  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const renderFolderCard = (item: TimelineItem) => {
    const summary = folderSummaries[item.id];
    const progress = summary?.progress;
    const progressPercent = progress && progress.tasks_total && progress.tasks_total > 0
      ? Math.round((progress.tasks_completed || 0) / progress.tasks_total * 100)
      : 0;
    const nextStep = summary?.computed_next_step || summary?.next_step;
    const nextStepOwner = summary?.computed_next_step_owner || summary?.next_step_owner;
    const stageLabel = summary?.computed_stage_label || summary?.stage_label;

    return (
      <div
        key={`${item.type}-${item.id}`}
        className={`folder-card ${item.priority === 'high' ? 'priority-high' : ''}`}
        onClick={() => handleItemClick(item)}
      >
        <div className="folder-card-header">
          <h3 className="folder-card-name">{item.title}</h3>
          {getStatusBadge(item.status, item.type)}
        </div>
        
        {item.description && (
          <p className="folder-card-description">{item.description}</p>
        )}

        {stageLabel && (
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="folder-stat-badge">{stageLabel}</span>
          </div>
        )}

        {progress && progress.tasks_total !== undefined && progress.tasks_total > 0 && (
          <div className="folder-card-progress">
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="progress-text">
              {progress.tasks_completed || 0} of {progress.tasks_total} tasks completed
            </p>
          </div>
        )}

        {nextStep && nextStepOwner === 'customer' && (
          <div className="folder-card-next-step">
            <div className="folder-card-next-step-label">Action Required</div>
            <p className="folder-card-next-step-text">{nextStep}</p>
          </div>
        )}

        {summary && (
          <div className="folder-card-stats">
            {summary.progress?.forms_total !== undefined && summary.progress.forms_total > 0 && (
              <span className="folder-stat-badge">
                {summary.progress.forms_completed || 0}/{summary.progress.forms_total} Forms
              </span>
            )}
            {summary.progress?.esignatures_total !== undefined && summary.progress.esignatures_total > 0 && (
              <span className="folder-stat-badge">
                {summary.progress.esignatures_completed || 0}/{summary.progress.esignatures_total} Signatures
              </span>
            )}
            {summary.shipping?.has_shipment && (
              <span className="folder-stat-badge">
                Shipping: {summary.shipping.status || 'In Transit'}
              </span>
            )}
          </div>
        )}

        <div className="folder-card-footer">
          <span className="folder-card-date">{formatDate(item.created_at)}</span>
          <div className="folder-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleItemClick(item)}
              className="btn-primary btn-sm"
            >
              View
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <CustomerChatWidget />
      
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p>Loading...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Welcome Header */}
          {customerProfile && (
            <div className="welcome-header">
              <div className="welcome-header-content">
                <div className="welcome-greeting-section">
                  {customerProfile.profile_picture_url ? (
                    <img
                      src={customerProfile.profile_picture_url}
                      alt={customerProfile.name || 'Profile'}
                      className="welcome-profile-picture"
                    />
                  ) : (
                    <div className="welcome-profile-placeholder">
                      {getInitials(customerProfile.name || customerProfile.company || 'U')}
                    </div>
                  )}
                  <div className="welcome-text">
                    <h2 className="welcome-greeting">
                      {getTimeBasedGreeting()}, {customerProfile.name?.split(' ')[0] || 'there'}!
                    </h2>
                    {customerProfile.company && (
                      <p className="welcome-company">{customerProfile.company}</p>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="quick-stats">
                  <div className="stat-card">
                    <p className="stat-value">{quickStats.active}</p>
                    <p className="stat-label">Active Orders</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-value">{quickStats.pendingActions}</p>
                    <p className="stat-label">Pending Actions</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-value">{quickStats.completed}</p>
                    <p className="stat-label">Completed</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* What's Next Section */}
          {actionableFolders.length > 0 && (
            <div className="whats-next-section">
              <div className="whats-next-header">
                <h2 className="whats-next-title">What's Next</h2>
              </div>
              <div className="folders-grid">
                {actionableFolders.map((item) => renderFolderCard(item))}
              </div>
            </div>
          )}

          {/* Folders Grouped by Status */}
          {filteredFoldersByStatus.active.length === 0 && 
           filteredFoldersByStatus.completed.length === 0 && 
           filteredFoldersByStatus.archived.length === 0 && 
           filteredFoldersByStatus.cancelled.length === 0 ? (
            <div className="empty-state-enhanced">
              <div className="empty-state-icon">📋</div>
              <h2 className="empty-state-title">
                {searchTerm ? 'No results found' : "You're all set!"}
              </h2>
              <p className="empty-state-description">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : "No active orders at the moment. When you have orders, they'll appear here."}
              </p>
            </div>
          ) : (
            <>
              {/* Active Orders */}
              {filteredFoldersByStatus.active.length > 0 && (
                <div className="dashboard-section">
                  <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Active Orders</h2>
                  </div>
                  <div className="folders-grid">
                    {filteredFoldersByStatus.active
                      .filter((item) => !actionableFolders.find((af) => af.id === item.id))
                      .map((item) => renderFolderCard(item))}
                  </div>
                </div>
              )}

              {/* Completed Orders */}
              {filteredFoldersByStatus.completed.length > 0 && (
                <div className="dashboard-section">
                  <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Completed Orders</h2>
                    <button
                      className="section-toggle"
                      onClick={() => toggleSection('completed')}
                    >
                      {collapsedSections.completed ? 'Show' : 'Hide'}
                    </button>
                  </div>
                  {!collapsedSections.completed && (
                    <div className="folders-grid">
                      {filteredFoldersByStatus.completed.map((item) => renderFolderCard(item))}
                    </div>
                  )}
                </div>
              )}

              {/* Archived Orders */}
              {filteredFoldersByStatus.archived.length > 0 && (
                <div className="dashboard-section">
                  <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Archived Orders</h2>
                    <button
                      className="section-toggle"
                      onClick={() => toggleSection('archived')}
                    >
                      {collapsedSections.archived ? 'Show' : 'Hide'}
                    </button>
                  </div>
                  {!collapsedSections.archived && (
                    <div className="folders-grid">
                      {filteredFoldersByStatus.archived.map((item) => renderFolderCard(item))}
                    </div>
                  )}
                </div>
              )}

              {/* Cancelled Orders */}
              {filteredFoldersByStatus.cancelled.length > 0 && (
                <div className="dashboard-section">
                  <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Cancelled Orders</h2>
                    <button
                      className="section-toggle"
                      onClick={() => toggleSection('cancelled')}
                    >
                      {collapsedSections.cancelled ? 'Show' : 'Hide'}
                    </button>
                  </div>
                  {!collapsedSections.cancelled && (
                    <div className="folders-grid">
                      {filteredFoldersByStatus.cancelled.map((item) => renderFolderCard(item))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default CustomerDashboard;

