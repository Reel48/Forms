import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Check if this is a chunk load error
    const isChunkError =
      error.message?.includes("Unexpected token '<'") ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('ChunkLoadError') ||
      error.message?.includes('importing a module script failed');

    if (isChunkError) {
      // Try to reload the page to get fresh chunks
      // Use the same key as main.tsx for consistency
      const KEY = 'forms:chunk_recovery_reload_v2';
      const reloadCount = parseInt(sessionStorage.getItem(KEY) || '0', 10);
      const MAX_RELOADS = 2;
      
      if (reloadCount < MAX_RELOADS) {
        sessionStorage.setItem(KEY, (reloadCount + 1).toString());
        console.warn(`[ErrorBoundary] Chunk load error detected, reloading page... (${reloadCount + 1}/${MAX_RELOADS})`);
        
        // Clear cache before reload
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }
        
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        console.warn('[ErrorBoundary] Max reloads reached. Showing error UI.');
      }
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: 'rgb(59 130 246)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

