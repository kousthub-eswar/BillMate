import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <AlertOctagon size={32} />
            </div>
            
            <h3 className="error-boundary-title">
              Something went wrong.
            </h3>
            
            <p className="error-boundary-text">
              Something went wrong. Try refreshing.
            </p>
            
            {this.state.error && (
              <pre className="error-boundary-pre">
                {this.state.error.toString()}
              </pre>
            )}

            <button
              onClick={this.handleReset}
              className="error-boundary-btn"
              id="error-boundary-refresh-btn"
            >
              <RefreshCw size={16} />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
