import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan pada aplikasi CourtSync.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('[CourtSync ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h1 className="font-display font-bold text-lg text-slate-900">
              Terjadi Gangguan Koneksi Data
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-4 py-2 bg-[#0F172A] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
            >
              Muat Ulang CourtSync
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
